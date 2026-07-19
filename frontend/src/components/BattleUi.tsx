import { useState, type PointerEvent } from "react";

import {
  ACTIONS,
  type ActionId,
  type PlayerCombatState,
} from "../../../backend/src/game-rules/index.ts";
import { getSkillIcon, type SkillIconState } from "../assets/skillIcons.ts";
import { playSelectionSound } from "../audio/gameAudio.ts";

const ACTION_ORDER: readonly ActionId[] = [
  "stone",
  "kill",
  "flying-kill",
  "super-kill",
  "guard",
  "low-guard",
  "high-guard",
];

const ACTION_HINTS: Readonly<Record<ActionId, string>> = {
  stone: "聚气 +1",
  kill: "一级攻击",
  "flying-kill": "二级攻击",
  "super-kill": "三级攻击",
  guard: "防住「杀」",
  "low-guard": "防住「飞杀」",
  "high-guard": "防住「超杀」",
};

export function PlayerPanel({
  name,
  state,
  position,
  statusLabel,
  idleStrikes = 0,
  damage = 0,
  feedback = null,
}: {
  name: string;
  state: PlayerCombatState;
  position: "opponent" | "self";
  statusLabel?: string;
  idleStrikes?: number;
  damage?: number;
  feedback?: "hit" | "blocked" | null;
}) {
  return (
    <section className={`player-panel ${position} ${feedback === "hit" ? "taking-hit" : ""} ${feedback === "blocked" ? "guard-success" : ""}`}>
      <div className="avatar" aria-hidden="true">{name.at(-1)}</div>
      <div className="player-info">
        <div className="player-name-row">
          <strong>{name}</strong>
          <span>{statusLabel ?? (position === "self" ? "当前出招" : "对手")}</span>
        </div>
        <div className="stat-row" aria-label={`生命 ${state.hp}`}>
          <span className="stat-label">命</span>
          <div className="hearts">{[0, 1, 2].map((heart) => <i key={heart} className={heart < state.hp ? "active" : ""}>♥</i>)}</div>
        </div>
        <div className="stat-row" aria-label={`能量 ${state.energy}`}>
          <span className="stat-label">气</span>
          <div className="energy-pips">{[0, 1, 2, 3, 4].map((pip) => <i key={pip} className={pip < state.energy ? "active" : ""} />)}</div>
          <b>{state.energy}/5</b>
        </div>
        {idleStrikes > 0 && <div className="idle-warning">未操作警告 {idleStrikes}/3</div>}
      </div>
      {damage > 0 && <strong className="damage-float" aria-label={`受到 ${damage} 点伤害`}>-{damage}</strong>}
      {feedback === "blocked" && <strong className="guard-float" aria-label="防御成功">挡</strong>}
    </section>
  );
}

export function ActionGrid({
  energy,
  disabled,
  locked = false,
  playerLabel,
  onSelect,
}: {
  energy: number;
  disabled: boolean;
  locked?: boolean;
  playerLabel: string;
  onSelect: (action: ActionId) => void;
}) {
  return (
    <div className="action-grid" aria-label={`${playerLabel}的行动`}>
      {ACTION_ORDER.map((action) => (
        <ActionButton
          key={action}
          action={action}
          energy={energy}
          disabled={disabled}
          locked={locked}
          onSelect={onSelect}
        />
      ))}
    </div>
  );
}

function ActionButton({
  action,
  energy,
  disabled,
  locked,
  onSelect,
}: {
  action: ActionId;
  energy: number;
  disabled: boolean;
  locked: boolean;
  onSelect: (action: ActionId) => void;
}) {
  const [pressed, setPressed] = useState(false);
  const definition = ACTIONS[action];
  const insufficient = energy < definition.energyCost;
  const iconState: SkillIconState = insufficient ? "insufficient" : locked ? "cooldown" : pressed ? "pressed" : "default";
  const isDisabled = disabled || insufficient;
  const release = (_event: PointerEvent<HTMLButtonElement>) => setPressed(false);

  return (
    <button
      className={`action-button kind-${definition.kind}`}
      disabled={isDisabled}
      onClick={() => {
        playSelectionSound();
        onSelect(action);
      }}
      onPointerDown={() => !isDisabled && setPressed(true)}
      onPointerUp={release}
      onPointerCancel={release}
      onPointerLeave={release}
      aria-label={`${definition.label}，${ACTION_HINTS[action]}${insufficient ? "，能量不足" : ""}`}
    >
      <span className="action-art"><img src={getSkillIcon(action, iconState)} alt="" /></span>
      <span className="action-copy"><strong>{definition.label}</strong><small>{ACTION_HINTS[action]}</small></span>
      {definition.energyCost > 0 && <span className="energy-cost">{definition.energyCost}</span>}
    </button>
  );
}
