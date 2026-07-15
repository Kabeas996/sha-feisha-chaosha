import { randomUUID } from "node:crypto";

import type { Server, Socket } from "socket.io";

import {
  ACTION_IDS,
  INITIAL_ENERGY,
  INITIAL_HP,
  resolveRound,
  validateAction,
  type ActionId,
} from "../game-rules/index.ts";
import type {
  BasicAck,
  ClientToServerEvents,
  GameEndReason,
  OnlineRoomSnapshot,
  PublicOnlinePlayer,
  PublicOnlineRoundResult,
  RoomAck,
  ServerToClientEvents,
} from "./protocol.ts";

const MAX_IDLE_STRIKES = 3;

export interface OnlineGameTiming {
  readonly roundDurationMs: number;
  readonly revealDurationMs: number;
  readonly disconnectGraceMs: number;
}

const DEFAULT_TIMING: OnlineGameTiming = {
  roundDurationMs: 3_000,
  revealDurationMs: 1_650,
  disconnectGraceMs: 15_000,
};

type GameIo = Server<ClientToServerEvents, ServerToClientEvents>;
type GameSocket = Socket<ClientToServerEvents, ServerToClientEvents>;

interface InternalPlayer {
  readonly id: string;
  readonly token: string;
  readonly nickname: string;
  seat: 1 | 2;
  hp: number;
  energy: number;
  socketId: string | null;
  ready: boolean;
  selectedAction: ActionId | null;
  idleStrikes: number;
}

interface InternalRoom {
  readonly roomId: string;
  readonly players: InternalPlayer[];
  round: number;
  phase: "lobby" | "selecting" | "revealing" | "finished";
  deadline: number | null;
  winnerId: string | null;
  endReason: GameEndReason;
  lastResult: PublicOnlineRoundResult | null;
  roundTimer: ReturnType<typeof setTimeout> | null;
  advanceTimer: ReturnType<typeof setTimeout> | null;
}

interface SocketMembership {
  readonly roomId: string;
  readonly playerId: string;
}

export class OnlineGameServer {
  private readonly io: GameIo;
  private readonly timing: OnlineGameTiming;
  private readonly rooms = new Map<string, InternalRoom>();
  private readonly memberships = new Map<string, SocketMembership>();
  private readonly disconnectTimers = new Map<string, ReturnType<typeof setTimeout>>();

  public constructor(io: GameIo, timing: OnlineGameTiming = DEFAULT_TIMING) {
    this.io = io;
    this.timing = timing;
  }

  public register(socket: GameSocket): void {
    socket.on("room:create", (payload, acknowledge) => this.createRoom(socket, payload.nickname, acknowledge));
    socket.on("room:join", (payload, acknowledge) => this.joinRoom(socket, payload.roomId, payload.nickname, acknowledge));
    socket.on("room:rejoin", (payload, acknowledge) => this.rejoinRoom(socket, payload.roomId, payload.playerToken, acknowledge));
    socket.on("room:ready", (acknowledge) => this.markReady(socket, acknowledge));
    socket.on("game:action", (payload, acknowledge) => this.submitAction(socket, payload.action, acknowledge));
    socket.on("game:rematch", (acknowledge) => this.requestRematch(socket, acknowledge));
    socket.on("room:leave", (acknowledge) => {
      this.leaveRoom(socket, true);
      acknowledge({ ok: true });
    });
    socket.on("disconnect", () => this.leaveRoom(socket, false));
  }

  private createRoom(socket: GameSocket, rawNickname: string, acknowledge: (response: RoomAck) => void): void {
    if (this.memberships.has(socket.id)) {
      acknowledge({ ok: false, message: "你已经在一个房间中" });
      return;
    }

    const nickname = normalizeNickname(rawNickname);
    if (nickname === null) {
      acknowledge({ ok: false, message: "昵称需要 1 至 12 个字符" });
      return;
    }

    const roomId = this.createRoomId();
    const player = createPlayer(nickname, 1, socket.id);
    const room: InternalRoom = {
      roomId,
      players: [player],
      round: 1,
      phase: "lobby",
      deadline: null,
      winnerId: null,
      endReason: null,
      lastResult: null,
      roundTimer: null,
      advanceTimer: null,
    };
    this.rooms.set(roomId, room);
    this.attachSocket(socket, room, player);
    acknowledge(successAck(room, player));
    this.broadcastRoom(room);
  }

  private joinRoom(
    socket: GameSocket,
    rawRoomId: string,
    rawNickname: string,
    acknowledge: (response: RoomAck) => void,
  ): void {
    const roomId = rawRoomId.trim().toUpperCase();
    const room = this.rooms.get(roomId);
    if (room === undefined) {
      acknowledge({ ok: false, message: "没有找到这个房间" });
      return;
    }
    if (room.players.length >= 2) {
      acknowledge({ ok: false, message: "房间已满" });
      return;
    }
    if (room.phase !== "lobby") {
      acknowledge({ ok: false, message: "对局已经开始" });
      return;
    }
    const nickname = normalizeNickname(rawNickname);
    if (nickname === null) {
      acknowledge({ ok: false, message: "昵称需要 1 至 12 个字符" });
      return;
    }

    const player = createPlayer(nickname, 2, socket.id);
    room.players.push(player);
    this.attachSocket(socket, room, player);
    acknowledge(successAck(room, player));
    this.broadcastRoom(room);
  }

  private rejoinRoom(
    socket: GameSocket,
    rawRoomId: string,
    playerToken: string,
    acknowledge: (response: RoomAck) => void,
  ): void {
    const room = this.rooms.get(rawRoomId.trim().toUpperCase());
    const player = room?.players.find((candidate) => candidate.token === playerToken);
    if (room === undefined || player === undefined) {
      acknowledge({ ok: false, message: "重连信息已失效" });
      return;
    }

    if (player.socketId !== null) this.memberships.delete(player.socketId);
    const disconnectTimer = this.disconnectTimers.get(player.id);
    if (disconnectTimer !== undefined) {
      clearTimeout(disconnectTimer);
      this.disconnectTimers.delete(player.id);
    }
    this.attachSocket(socket, room, player);
    acknowledge(successAck(room, player));
    this.broadcastRoom(room);
  }

  private markReady(socket: GameSocket, acknowledge: (response: BasicAck) => void): void {
    const context = this.getContext(socket);
    if (context === null || context.room.phase !== "lobby") {
      acknowledge({ ok: false, message: "当前不能准备" });
      return;
    }
    context.player.ready = true;
    acknowledge({ ok: true });
    this.broadcastRoom(context.room);
    if (context.room.players.length === 2 && context.room.players.every((player) => player.ready && player.socketId !== null)) {
      this.resetAndStart(context.room);
    }
  }

  private submitAction(socket: GameSocket, action: ActionId, acknowledge: (response: BasicAck) => void): void {
    const context = this.getContext(socket);
    if (context === null || context.room.phase !== "selecting" || context.room.deadline === null) {
      acknowledge({ ok: false, message: "当前不在选择阶段" });
      return;
    }
    if (Date.now() > context.room.deadline) {
      acknowledge({ ok: false, message: "本回合选择时间已结束" });
      return;
    }
    if (!ACTION_IDS.includes(action)) {
      acknowledge({ ok: false, message: "未知行动" });
      return;
    }
    if (context.player.selectedAction !== null) {
      acknowledge({ ok: false, message: "本回合行动已经锁定" });
      return;
    }
    if (!validateAction(context.player, action).valid) {
      acknowledge({ ok: false, message: "能量不足" });
      return;
    }

    context.player.selectedAction = action;
    acknowledge({ ok: true });
    this.broadcastRoom(context.room);
  }

  private requestRematch(socket: GameSocket, acknowledge: (response: BasicAck) => void): void {
    const context = this.getContext(socket);
    if (context === null || context.room.phase !== "finished") {
      acknowledge({ ok: false, message: "当前不能发起再战" });
      return;
    }
    context.player.ready = true;
    acknowledge({ ok: true });
    this.broadcastRoom(context.room);
    if (context.room.players.length === 2 && context.room.players.every((player) => player.ready && player.socketId !== null)) {
      this.resetAndStart(context.room);
    }
  }

  private resetAndStart(room: InternalRoom): void {
    room.round = 1;
    room.winnerId = null;
    room.endReason = null;
    room.lastResult = null;
    room.phase = "lobby";
    for (const player of room.players) {
      player.hp = INITIAL_HP;
      player.energy = INITIAL_ENERGY;
      player.idleStrikes = 0;
      player.ready = false;
      player.selectedAction = null;
    }
    this.startRound(room);
  }

  private startRound(room: InternalRoom): void {
    if (room.players.length !== 2 || room.phase === "finished") return;
    room.phase = "selecting";
    room.deadline = Date.now() + this.timing.roundDurationMs;
    room.lastResult = null;
    for (const player of room.players) player.selectedAction = null;
    this.broadcastRoom(room);
    room.roundTimer = setTimeout(() => this.resolveRoom(room), this.timing.roundDurationMs + 25);
  }

  private resolveRoom(room: InternalRoom): void {
    if (room.phase !== "selecting" || room.players.length !== 2) return;
    const [player1, player2] = room.players;
    if (player1 === undefined || player2 === undefined) return;

    const player1Action = player1.selectedAction ?? "idle";
    const player2Action = player2.selectedAction ?? "idle";
    player1.idleStrikes = player1Action === "idle" ? player1.idleStrikes + 1 : 0;
    player2.idleStrikes = player2Action === "idle" ? player2.idleStrikes + 1 : 0;

    const result = resolveRound({
      player1,
      player2,
      player1Action,
      player2Action,
    });
    player1.hp = result.player1.hp;
    player1.energy = result.player1.energy;
    player2.hp = result.player2.hp;
    player2.energy = result.player2.energy;

    const timedOut1 = player1.idleStrikes >= MAX_IDLE_STRIKES;
    const timedOut2 = player2.idleStrikes >= MAX_IDLE_STRIKES;
    let winnerId: string | null = null;
    let endReason: GameEndReason = null;
    if (timedOut1 || timedOut2) {
      winnerId = timedOut1 === timedOut2 ? null : timedOut1 ? player2.id : player1.id;
      endReason = "timeout";
    } else if (result.outcome !== "ongoing") {
      winnerId = result.outcome === "player1-wins" ? player1.id : result.outcome === "player2-wins" ? player2.id : null;
      endReason = "hp";
    }

    room.lastResult = {
      round: room.round,
      player1Id: player1.id,
      player2Id: player2.id,
      player1Action,
      player2Action,
      player1Damage: result.player1Damage,
      player2Damage: result.player2Damage,
      interaction: result.interaction,
      outcome: result.outcome,
      winnerId,
      endReason,
    };
    room.deadline = null;
    room.winnerId = winnerId;
    room.endReason = endReason;
    room.phase = endReason === null ? "revealing" : "finished";
    this.broadcastRoom(room);
    this.io.to(room.roomId).emit("game:round-result", room.lastResult);

    if (room.phase === "revealing") {
      room.advanceTimer = setTimeout(() => {
        room.round += 1;
        this.startRound(room);
      }, this.timing.revealDurationMs);
    }
  }

  private leaveRoom(socket: GameSocket, explicit: boolean): void {
    const membership = this.memberships.get(socket.id);
    if (membership === undefined) return;
    this.memberships.delete(socket.id);
    const room = this.rooms.get(membership.roomId);
    const player = room?.players.find((candidate) => candidate.id === membership.playerId);
    if (room === undefined || player === undefined) return;
    player.socketId = null;
    if (explicit) void socket.leave(room.roomId);

    if (room.phase === "lobby") {
      room.players.splice(room.players.indexOf(player), 1);
      if (room.players.length === 0) this.deleteRoom(room);
      else {
        const remaining = room.players[0];
        if (remaining !== undefined) remaining.seat = 1;
        this.broadcastRoom(room);
      }
      return;
    }

    this.broadcastRoom(room);
    if (room.phase === "finished") return;
    if (explicit) {
      this.finishForDisconnect(room, player);
      return;
    }

    const timer = setTimeout(() => {
      this.disconnectTimers.delete(player.id);
      if (player.socketId === null) this.finishForDisconnect(room, player);
    }, this.timing.disconnectGraceMs);
    this.disconnectTimers.set(player.id, timer);
  }

  private finishForDisconnect(room: InternalRoom, disconnectedPlayer: InternalPlayer): void {
    if (room.phase === "finished") return;
    this.clearRoomTimers(room);
    room.phase = "finished";
    room.deadline = null;
    room.winnerId = room.players.find((player) => player.id !== disconnectedPlayer.id)?.id ?? null;
    room.endReason = "disconnect";
    for (const player of room.players) player.ready = false;
    this.broadcastRoom(room);
  }

  private attachSocket(socket: GameSocket, room: InternalRoom, player: InternalPlayer): void {
    player.socketId = socket.id;
    this.memberships.set(socket.id, { roomId: room.roomId, playerId: player.id });
    void socket.join(room.roomId);
  }

  private getContext(socket: GameSocket): { room: InternalRoom; player: InternalPlayer } | null {
    const membership = this.memberships.get(socket.id);
    if (membership === undefined) return null;
    const room = this.rooms.get(membership.roomId);
    const player = room?.players.find((candidate) => candidate.id === membership.playerId);
    return room !== undefined && player !== undefined ? { room, player } : null;
  }

  private broadcastRoom(room: InternalRoom): void {
    for (const player of room.players) {
      if (player.socketId === null) continue;
      this.io.sockets.sockets.get(player.socketId)?.emit("room:state", this.toSnapshot(room, player));
    }
  }

  private toSnapshot(room: InternalRoom, self: InternalPlayer): OnlineRoomSnapshot {
    return {
      roomId: room.roomId,
      selfId: self.id,
      phase: room.phase,
      round: room.round,
      deadline: room.deadline,
      players: room.players.map(toPublicPlayer),
      winnerId: room.winnerId,
      endReason: room.endReason,
      lastResult: room.lastResult,
    };
  }

  private createRoomId(): string {
    const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    do {
      let roomId = "";
      for (let index = 0; index < 6; index += 1) {
        roomId += alphabet[Math.floor(Math.random() * alphabet.length)];
      }
      if (!this.rooms.has(roomId)) return roomId;
    } while (true);
  }

  private deleteRoom(room: InternalRoom): void {
    this.clearRoomTimers(room);
    this.rooms.delete(room.roomId);
  }

  private clearRoomTimers(room: InternalRoom): void {
    if (room.roundTimer !== null) clearTimeout(room.roundTimer);
    if (room.advanceTimer !== null) clearTimeout(room.advanceTimer);
    room.roundTimer = null;
    room.advanceTimer = null;
  }
}

function normalizeNickname(value: string): string | null {
  const nickname = value.trim().replace(/\s+/g, " ");
  return nickname.length >= 1 && nickname.length <= 12 ? nickname : null;
}

function createPlayer(nickname: string, seat: 1 | 2, socketId: string): InternalPlayer {
  return {
    id: randomUUID(),
    token: randomUUID(),
    nickname,
    seat,
    socketId,
    hp: INITIAL_HP,
    energy: INITIAL_ENERGY,
    ready: false,
    selectedAction: null,
    idleStrikes: 0,
  };
}

function successAck(room: InternalRoom, player: InternalPlayer): RoomAck {
  return {
    ok: true,
    roomId: room.roomId,
    playerId: player.id,
    playerToken: player.token,
  };
}

function toPublicPlayer(player: InternalPlayer): PublicOnlinePlayer {
  return {
    id: player.id,
    nickname: player.nickname,
    seat: player.seat,
    hp: player.hp,
    energy: player.energy,
    ready: player.ready,
    connected: player.socketId !== null,
    actionLocked: player.selectedAction !== null,
    idleStrikes: player.idleStrikes,
  };
}
