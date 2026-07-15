import type {
  ActionId,
  GameOutcome,
  InteractionOutcome,
  ServerActionId,
} from "../game-rules/index.ts";

export type OnlineRoomPhase = "lobby" | "selecting" | "revealing" | "finished";
export type GameEndReason = "hp" | "timeout" | "disconnect" | null;

export interface PublicOnlinePlayer {
  readonly id: string;
  readonly nickname: string;
  readonly seat: 1 | 2;
  readonly hp: number;
  readonly energy: number;
  readonly ready: boolean;
  readonly connected: boolean;
  readonly actionLocked: boolean;
  readonly idleStrikes: number;
}

export interface PublicOnlineRoundResult {
  readonly round: number;
  readonly player1Id: string;
  readonly player2Id: string;
  readonly player1Action: ServerActionId;
  readonly player2Action: ServerActionId;
  readonly player1Damage: number;
  readonly player2Damage: number;
  readonly interaction: InteractionOutcome;
  readonly outcome: GameOutcome;
  readonly winnerId: string | null;
  readonly endReason: GameEndReason;
}

export interface OnlineRoomSnapshot {
  readonly roomId: string;
  readonly selfId: string;
  readonly phase: OnlineRoomPhase;
  readonly round: number;
  readonly deadline: number | null;
  readonly players: readonly PublicOnlinePlayer[];
  readonly winnerId: string | null;
  readonly endReason: GameEndReason;
  readonly lastResult: PublicOnlineRoundResult | null;
}

export type RoomAck =
  | {
      readonly ok: true;
      readonly roomId: string;
      readonly playerId: string;
      readonly playerToken: string;
    }
  | { readonly ok: false; readonly message: string };

export type BasicAck = { readonly ok: true } | { readonly ok: false; readonly message: string };

export interface ClientToServerEvents {
  "room:create": (
    payload: { readonly nickname: string },
    acknowledge: (response: RoomAck) => void,
  ) => void;
  "room:join": (
    payload: { readonly roomId: string; readonly nickname: string },
    acknowledge: (response: RoomAck) => void,
  ) => void;
  "room:rejoin": (
    payload: { readonly roomId: string; readonly playerToken: string },
    acknowledge: (response: RoomAck) => void,
  ) => void;
  "room:ready": (acknowledge: (response: BasicAck) => void) => void;
  "room:leave": (acknowledge: (response: BasicAck) => void) => void;
  "game:action": (
    payload: { readonly action: ActionId },
    acknowledge: (response: BasicAck) => void,
  ) => void;
  "game:rematch": (acknowledge: (response: BasicAck) => void) => void;
}

export interface ServerToClientEvents {
  "room:state": (snapshot: OnlineRoomSnapshot) => void;
  "game:round-result": (result: PublicOnlineRoundResult) => void;
  "game:error": (message: string) => void;
}

