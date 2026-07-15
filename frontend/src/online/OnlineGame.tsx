import { useEffect, useState, type CSSProperties } from "react";

import {
  ACTIONS,
  type ActionId,
  type ServerActionId,
} from "../../../backend/src/game-rules/index.ts";
import type {
  BasicAck,
  OnlineRoomSnapshot,
  PublicOnlinePlayer,
  PublicOnlineRoundResult,
  RoomAck,
} from "../../../backend/src/online/protocol.ts";
import { getSkillIcon } from "../assets/skillIcons.ts";
import { ActionGrid, PlayerPanel } from "../components/BattleUi.tsx";
import { gameSocket } from "./socket.ts";

const SESSION_KEY = "sha-feisha-online-session";

interface StoredSession {
  readonly roomId: string;
  readonly playerToken: string;
}

export function OnlineGame({ onExit }: { onExit: () => void }) {
  const [snapshot, setSnapshot] = useState<OnlineRoomSnapshot | null>(null);
  const [connected, setConnected] = useState(gameSocket.connected);
  const [error, setError] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);

  useEffect(() => {
    const onConnect = () => {
      setConnected(true);
      const session = readSession();
      if (session === null || snapshot !== null) return;
      gameSocket.emit("room:rejoin", session, (response) => {
        if (!response.ok) window.sessionStorage.removeItem(SESSION_KEY);
      });
    };
    const onDisconnect = () => setConnected(false);
    const onRoomState = (next: OnlineRoomSnapshot) => {
      setSnapshot(next);
      setJoining(false);
      setError(null);
    };
    const onGameError = (message: string) => setError(message);

    gameSocket.on("connect", onConnect);
    gameSocket.on("disconnect", onDisconnect);
    gameSocket.on("room:state", onRoomState);
    gameSocket.on("game:error", onGameError);
    if (!gameSocket.connected) gameSocket.connect();
    else onConnect();

    return () => {
      gameSocket.off("connect", onConnect);
      gameSocket.off("disconnect", onDisconnect);
      gameSocket.off("room:state", onRoomState);
      gameSocket.off("game:error", onGameError);
    };
  }, []);

  const handleRoomAck = (response: RoomAck) => {
    setJoining(false);
    if (!response.ok) {
      setError(response.message);
      return;
    }
    window.sessionStorage.setItem(SESSION_KEY, JSON.stringify({
      roomId: response.roomId,
      playerToken: response.playerToken,
    } satisfies StoredSession));
  };

  const leave = () => {
    if (snapshot === null) {
      onExit();
      return;
    }
    gameSocket.emit("room:leave", () => {
      window.sessionStorage.removeItem(SESSION_KEY);
      setSnapshot(null);
      onExit();
    });
  };

  if (snapshot === null) {
    return (
      <OnlineEntry
        connected={connected}
        joining={joining}
        error={error}
        onBack={onExit}
        onCreate={(nickname) => {
          setJoining(true);
          setError(null);
          gameSocket.emit("room:create", { nickname }, handleRoomAck);
        }}
        onJoin={(roomId, nickname) => {
          setJoining(true);
          setError(null);
          gameSocket.emit("room:join", { roomId, nickname }, handleRoomAck);
        }}
      />
    );
  }

  if (snapshot.phase === "lobby") {
    return <OnlineLobby snapshot={snapshot} connected={connected} error={error} onLeave={leave} />;
  }

  return <OnlineBattle snapshot={snapshot} connected={connected} error={error} onLeave={leave} />;
}

function OnlineEntry({
  connected,
  joining,
  error,
  onBack,
  onCreate,
  onJoin,
}: {
  connected: boolean;
  joining: boolean;
  error: string | null;
  onBack: () => void;
  onCreate: (nickname: string) => void;
  onJoin: (roomId: string, nickname: string) => void;
}) {
  const [mode, setMode] = useState<"create" | "join">("create");
  const [nickname, setNickname] = useState("");
  const [roomId, setRoomId] = useState("");
  const validNickname = nickname.trim().length >= 1 && nickname.trim().length <= 12;
  const validRoom = roomId.trim().length === 6;

  return (
    <main className="online-entry-shell">
      <header className="simple-header">
        <button className="icon-button" onClick={onBack} aria-label="返回首页">←</button>
        <ConnectionBadge connected={connected} />
      </header>
      <section className="online-entry-card">
        <p className="eyebrow">ONLINE DUEL</p>
        <h1>江湖对局</h1>
        <p className="online-intro">创建六位房间码，邀请另一位玩家实时对战。</p>
        <div className="mode-tabs" role="tablist" aria-label="房间操作">
          <button className={mode === "create" ? "active" : ""} onClick={() => setMode("create")} role="tab" aria-selected={mode === "create"}>创建房间</button>
          <button className={mode === "join" ? "active" : ""} onClick={() => setMode("join")} role="tab" aria-selected={mode === "join"}>加入房间</button>
        </div>
        <label className="field-label">
          <span>你的称号</span>
          <input value={nickname} onChange={(event) => setNickname(event.target.value)} maxLength={12} placeholder="输入 1—12 个字符" autoComplete="nickname" />
        </label>
        {mode === "join" && (
          <label className="field-label">
            <span>房间编号</span>
            <input className="room-code-input" value={roomId} onChange={(event) => setRoomId(event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6))} maxLength={6} placeholder="例如 A7K9Q2" autoCapitalize="characters" />
          </label>
        )}
        {error && <p className="form-error" role="alert">{error}</p>}
        <button
          className="primary-button"
          disabled={!connected || joining || !validNickname || (mode === "join" && !validRoom)}
          onClick={() => mode === "create" ? onCreate(nickname.trim()) : onJoin(roomId.trim(), nickname.trim())}
        >
          {joining ? "正在进入江湖…" : mode === "create" ? "创建对局" : "进入对局"}
        </button>
      </section>
    </main>
  );
}

function OnlineLobby({
  snapshot,
  connected,
  error,
  onLeave,
}: {
  snapshot: OnlineRoomSnapshot;
  connected: boolean;
  error: string | null;
  onLeave: () => void;
}) {
  const self = snapshot.players.find((player) => player.id === snapshot.selfId);
  const opponent = snapshot.players.find((player) => player.id !== snapshot.selfId);

  return (
    <main className="online-entry-shell">
      <header className="simple-header">
        <button className="icon-button" onClick={onLeave} aria-label="离开房间">←</button>
        <ConnectionBadge connected={connected} />
      </header>
      <section className="room-card">
        <p className="eyebrow">等待侠客入场</p>
        <h2>房间 <button className="room-code" onClick={() => void navigator.clipboard.writeText(snapshot.roomId)} aria-label={`复制房间编号 ${snapshot.roomId}`}>{snapshot.roomId}</button></h2>
        <p className="room-hint">点击房间码复制并发给朋友</p>
        <div className="lobby-seats">
          <LobbySeat player={snapshot.players.find((player) => player.seat === 1)} />
          <span className="lobby-vs">VS</span>
          <LobbySeat player={snapshot.players.find((player) => player.seat === 2)} />
        </div>
        {error && <p className="form-error" role="alert">{error}</p>}
        <button
          className="primary-button"
          disabled={!connected || opponent === undefined || self?.ready === true}
          onClick={() => gameSocket.emit("room:ready", consumeBasicAck)}
        >
          {self?.ready ? "已准备，等待对手" : opponent === undefined ? "等待另一位玩家" : "准备迎战"}
        </button>
      </section>
    </main>
  );
}

function LobbySeat({ player }: { player: PublicOnlinePlayer | undefined }) {
  return (
    <div className={`lobby-seat ${player?.ready ? "ready" : ""}`}>
      <div className="lobby-avatar">{player?.nickname.at(-1) ?? "?"}</div>
      <strong>{player?.nickname ?? "等待加入"}</strong>
      <span>{player?.ready ? "已准备" : player ? "未准备" : "空位"}</span>
    </div>
  );
}

function OnlineBattle({
  snapshot,
  connected,
  error,
  onLeave,
}: {
  snapshot: OnlineRoomSnapshot;
  connected: boolean;
  error: string | null;
  onLeave: () => void;
}) {
  const self = snapshot.players.find((player) => player.id === snapshot.selfId);
  const opponent = snapshot.players.find((player) => player.id !== snapshot.selfId);
  const [actionError, setActionError] = useState<string | null>(null);
  if (self === undefined || opponent === undefined) return null;

  const submit = (action: ActionId) => {
    setActionError(null);
    gameSocket.emit("game:action", { action }, (response) => {
      if (!response.ok) setActionError(response.message);
    });
  };

  const canAct = connected && snapshot.phase === "selecting" && !self.actionLocked;

  return (
    <main className="battle-shell online-battle-shell">
      <header className="battle-header">
        <button className="icon-button" onClick={onLeave} aria-label="离开对局">←</button>
        <div className="round-label"><span>回合</span><strong>{snapshot.round}</strong></div>
        <ConnectionBadge connected={connected} compact />
      </header>
      <div className="online-battle-layout">
        <PlayerPanel name={opponent.nickname} state={opponent} position="opponent" statusLabel={opponent.actionLocked ? "已锁定" : "思考中"} idleStrikes={opponent.idleStrikes} />
        <section className="online-arena" aria-live="polite">
          {snapshot.phase === "selecting" && (
            <SelectionTimer deadline={snapshot.deadline} locked={self.actionLocked} opponentLocked={opponent.actionLocked} />
          )}
          {snapshot.phase === "revealing" && snapshot.lastResult && (
            <CleanRoundResult result={snapshot.lastResult} players={snapshot.players} />
          )}
        </section>
        <section className="control-deck online-control-deck">
          <PlayerPanel name={self.nickname} state={self} position="self" statusLabel={self.actionLocked ? "行动已锁定" : "选择招式"} idleStrikes={self.idleStrikes} />
          <ActionGrid energy={self.energy} disabled={!canAct} locked={self.actionLocked} playerLabel={self.nickname} onSelect={submit} />
          {(actionError ?? error) && <p className="action-error" role="alert">{actionError ?? error}</p>}
        </section>
      </div>
      {snapshot.phase === "finished" && (
        <OnlineFinished snapshot={snapshot} self={self} onLeave={onLeave} />
      )}
    </main>
  );
}

function SelectionTimer({ deadline, locked, opponentLocked }: { deadline: number | null; locked: boolean; opponentLocked: boolean }) {
  const remaining = useRemainingTime(deadline);
  const seconds = Math.max(0, Math.ceil(remaining / 1000));
  const progress = deadline === null ? 0 : Math.max(0, Math.min(1, remaining / 3000));

  return (
    <div className="selection-status">
      <div className="timer-ring" style={{ "--timer-progress": `${progress * 360}deg` } as CSSProperties}>
        <div><strong>{seconds}</strong><span>秒</span></div>
      </div>
      <h2>{locked ? "招式已锁定" : "选择你的招式"}</h2>
      <p>{locked ? (opponentLocked ? "双方已锁定，等待统一揭晓" : "等待对手出招") : "倒计时结束前只能提交一次"}</p>
    </div>
  );
}

function CleanRoundResult({ result, players }: { result: PublicOnlineRoundResult; players: readonly PublicOnlinePlayer[] }) {
  const player1 = players.find((player) => player.id === result.player1Id);
  const player2 = players.find((player) => player.id === result.player2Id);
  return (
    <div className="clean-result">
      <p className="eyebrow">第 {result.round} 回合</p>
      <div className="clean-reveal-row">
        <OnlineAction action={result.player1Action} name={player1?.nickname ?? "玩家一"} damaged={result.player1Damage > 0} />
        <span>对</span>
        <OnlineAction action={result.player2Action} name={player2?.nickname ?? "玩家二"} damaged={result.player2Damage > 0} />
      </div>
      <strong>{onlineResultText(result, player1, player2)}</strong>
    </div>
  );
}

function OnlineAction({ action, name, damaged }: { action: ServerActionId; name: string; damaged: boolean }) {
  return (
    <div className={`online-action ${damaged ? "damaged" : ""}`}>
      {action === "idle" ? <div className="idle-action-icon">空</div> : <img src={getSkillIcon(action)} alt={ACTIONS[action].label} />}
      <span>{name}</span>
      <b>{action === "idle" ? "无动作" : ACTIONS[action].label}</b>
    </div>
  );
}

function OnlineFinished({ snapshot, self, onLeave }: { snapshot: OnlineRoomSnapshot; self: PublicOnlinePlayer; onLeave: () => void }) {
  const winner = snapshot.players.find((player) => player.id === snapshot.winnerId);
  const isWinner = snapshot.winnerId === self.id;
  const title = snapshot.winnerId === null ? "平局" : isWinner ? "你赢了" : "胜负已分";
  const reason = snapshot.endReason === "timeout"
    ? snapshot.winnerId === null ? "双方连续三回合未操作，本局平局" : "一方连续三回合未操作，判负"
    : snapshot.endReason === "disconnect" ? "对手离开或重连超时" : "生命归零，对局结束";
  return (
    <div className="modal-backdrop result-backdrop" role="dialog" aria-modal="true" aria-labelledby="online-finished-title">
      <section className="result-card compact-finish-card">
        <p className="eyebrow">对局结束</p>
        <h2 id="online-finished-title">{title}</h2>
        <div className={`finish-seal ${isWinner ? "winner" : ""}`}>{snapshot.winnerId === null ? "和" : isWinner ? "胜" : "负"}</div>
        <p className="result-summary">{winner ? `${winner.nickname} 获胜 · ` : ""}{reason}</p>
        <button className="primary-button" disabled={self.ready} onClick={() => gameSocket.emit("game:rematch", consumeBasicAck)}>{self.ready ? "已申请再战" : "再战一局"}</button>
        <button className="text-button" onClick={onLeave}>离开房间</button>
      </section>
    </div>
  );
}

function ConnectionBadge({ connected, compact = false }: { connected: boolean; compact?: boolean }) {
  return <div className={`connection-badge ${connected ? "online" : "offline"} ${compact ? "compact" : ""}`}><i />{compact ? "" : connected ? "服务器已连接" : "正在重连"}</div>;
}

function useRemainingTime(deadline: number | null): number {
  const [remaining, setRemaining] = useState(() => deadline === null ? 0 : Math.max(0, deadline - Date.now()));
  useEffect(() => {
    if (deadline === null) {
      setRemaining(0);
      return;
    }
    const update = () => setRemaining(Math.max(0, deadline - Date.now()));
    update();
    const timer = window.setInterval(update, 50);
    return () => window.clearInterval(timer);
  }, [deadline]);
  return remaining;
}

function onlineResultText(
  result: PublicOnlineRoundResult,
  player1: PublicOnlinePlayer | undefined,
  player2: PublicOnlinePlayer | undefined,
): string {
  if (result.player1Action === "idle" && result.player2Action === "idle") return "双方均未出招";
  if (result.player1Action === "idle") return `${player1?.nickname ?? "玩家一"} 本回合未操作`;
  if (result.player2Action === "idle") return `${player2?.nickname ?? "玩家二"} 本回合未操作`;
  if (result.interaction === "attacks-cancelled") return "同级交锋，招式抵消";
  if (result.interaction === "player1-blocked") return `${player2?.nickname ?? "玩家二"} 防御成功`;
  if (result.interaction === "player2-blocked") return `${player1?.nickname ?? "玩家一"} 防御成功`;
  if (result.player1Damage > 0) return `${player1?.nickname ?? "玩家一"} 受到 1 点伤害`;
  if (result.player2Damage > 0) return `${player2?.nickname ?? "玩家二"} 受到 1 点伤害`;
  return "双方试探，无事发生";
}

function consumeBasicAck(response: BasicAck): void {
  if (!response.ok) console.warn(response.message);
}

function readSession(): StoredSession | null {
  const raw = window.sessionStorage.getItem(SESSION_KEY);
  if (raw === null) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<StoredSession>;
    return typeof parsed.roomId === "string" && typeof parsed.playerToken === "string"
      ? { roomId: parsed.roomId, playerToken: parsed.playerToken }
      : null;
  } catch {
    return null;
  }
}
