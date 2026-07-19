import { useEffect, useMemo, useRef, useState } from "react";

import {
  ACTIONS,
  type ActionId,
  type ServerActionId,
} from "../../backend/src/game-rules/index.ts";
import {
  beginPlayer2Turn,
  continueLocalMatch,
  createLocalMatch,
  revealLocalRound,
  submitLocalAction,
  type LocalMatchState,
  type LocalRoundRecord,
} from "../../backend/src/local-game/index.ts";
import { getSkillIcon } from "./assets/skillIcons.ts";
import { playRoundSounds } from "./audio/gameAudio.ts";
import { ActionGrid, PlayerPanel } from "./components/BattleUi.tsx";
import { OnlineGame } from "./online/OnlineGame.tsx";

const INTERACTION_TEXT: Readonly<Record<LocalRoundRecord["interaction"], string>> = {
  "no-effect": "双方试探，风平浪静",
  "attacks-cancelled": "同级交锋，招式抵消",
  "player1-blocked": "玩家二精准防住攻击",
  "player2-blocked": "玩家一精准防住攻击",
  "player1-hit": "玩家一受到 1 点伤害",
  "player2-hit": "玩家二受到 1 点伤害",
};

export function App() {
  const [screen, setScreen] = useState<"home" | "battle" | "online">("home");
  const [match, setMatch] = useState<LocalMatchState>(() => createLocalMatch());
  const [showRules, setShowRules] = useState(false);
  const [clapStep, setClapStep] = useState(0);
  const soundedRound = useRef<number | null>(null);

  useEffect(() => {
    if (match.phase !== "ready-to-reveal") return;

    setClapStep(0);
    const first = window.setTimeout(() => setClapStep(1), 180);
    const second = window.setTimeout(() => setClapStep(2), 620);
    const reveal = window.setTimeout(() => {
      setMatch((current) => revealLocalRound(current));
      setClapStep(0);
    }, 1080);

    return () => {
      window.clearTimeout(first);
      window.clearTimeout(second);
      window.clearTimeout(reveal);
    };
  }, [match.phase]);

  useEffect(() => {
    if (match.lastRound === null) {
      soundedRound.current = null;
      return;
    }
    if (soundedRound.current === match.lastRound.round) return;
    soundedRound.current = match.lastRound.round;
    playRoundSounds(match.lastRound);
  }, [match.lastRound]);

  const startMatch = () => {
    setMatch(createLocalMatch());
    setScreen("battle");
  };

  if (screen === "online") {
    return <OnlineGame onExit={() => setScreen("home")} />;
  }

  if (screen === "home") {
    return (
      <main className="home-shell">
        <div className="ambient ambient-one" />
        <div className="ambient ambient-two" />
        <section className="hero-card">
          <div className="brand-mark" aria-hidden="true">诀</div>
          <p className="eyebrow">双人 · 同屏 · 心理博弈</p>
          <h1>三诀</h1>
          <p className="hero-copy">藏住你的招式，看穿对手的选择。三点生命，一念胜负。</p>
          <button className="primary-button" onClick={() => setScreen("online")}>开始在线对战</button>
          <button className="secondary-button" onClick={startMatch}>同屏双人试炼</button>
          <button className="text-button" onClick={() => setShowRules(true)}>先看玩法</button>
          <div className="feature-row" aria-label="游戏特点">
            <span>同屏双人</span><i />
            <span>同时揭晓</span><i />
            <span>每局约 3 分钟</span>
          </div>
        </section>
        {showRules && <RulesDialog onClose={() => setShowRules(false)} />}
      </main>
    );
  }

  return (
    <main className={`battle-shell ${match.lastRound?.interaction === "player1-hit" || match.lastRound?.interaction === "player2-hit" ? "has-hit" : ""}`}>
      <header className="battle-header">
        <button className="icon-button" onClick={() => setScreen("home")} aria-label="返回首页">←</button>
        <div className="round-label"><span>回合</span><strong>{match.round}</strong></div>
        <button className="icon-button rules-button" onClick={() => setShowRules(true)} aria-label="查看规则">?</button>
      </header>

      <BattleContent match={match} onSelect={(action) => {
        const player = match.phase === "player1-selecting" ? "player1" : "player2";
        setMatch((current) => submitLocalAction(current, player, action));
      }} />

      {match.phase === "handoff" && (
        <HandoffOverlay onReady={() => setMatch((current) => beginPlayer2Turn(current))} />
      )}
      {match.phase === "ready-to-reveal" && <ClapOverlay step={clapStep} />}
      {(match.phase === "round-result" || match.phase === "finished") && match.lastRound && (
        <RoundResultOverlay
          result={match.lastRound}
          finished={match.phase === "finished"}
          onContinue={() => setMatch((current) => continueLocalMatch(current))}
          onRestart={startMatch}
        />
      )}
      {showRules && <RulesDialog onClose={() => setShowRules(false)} />}
    </main>
  );
}

function BattleContent({
  match,
  onSelect,
}: {
  match: LocalMatchState;
  onSelect: (action: ActionId) => void;
}) {
  const isPlayer2 = match.phase === "player2-selecting";
  const currentName = isPlayer2 ? "玩家二" : "玩家一";
  const current = isPlayer2 ? match.player2 : match.player1;
  const opponent = isPlayer2 ? match.player1 : match.player2;
  const opponentName = isPlayer2 ? "玩家一" : "玩家二";
  const canSelect = match.phase === "player1-selecting" || match.phase === "player2-selecting";

  return (
    <div className="battle-layout">
      <PlayerPanel name={opponentName} state={opponent} position="opponent" />

      <section className="arena" aria-live="polite">
        <div className="turn-prompt">
          <span className="turn-dot" />
          <p><strong>{currentName}</strong>，选择你的招式</p>
          <small>选择后将立即锁定，请别让对手看见</small>
        </div>
        <div className="versus-mark" aria-hidden="true"><span>藏</span><b>VS</b><span>猜</span></div>
      </section>

      <section className="control-deck">
        <PlayerPanel name={currentName} state={current} position="self" />
        <ActionGrid
          energy={current.energy}
          disabled={!canSelect}
          playerLabel={currentName}
          onSelect={onSelect}
        />
      </section>
    </div>
  );
}

function HandoffOverlay({ onReady }: { onReady: () => void }) {
  return (
    <div className="modal-backdrop privacy-backdrop" role="dialog" aria-modal="true" aria-labelledby="handoff-title">
      <section className="handoff-card">
        <div className="privacy-seal">密</div>
        <p className="eyebrow">招式已封存</p>
        <h2 id="handoff-title">请把设备交给玩家二</h2>
        <p>玩家一的选择已经隐藏。确认对方看不到刚才的操作后继续。</p>
        <button className="primary-button" onClick={onReady}>我是玩家二，准备好了</button>
      </section>
    </div>
  );
}

function ClapOverlay({ step }: { step: number }) {
  return (
    <div className="modal-backdrop clap-backdrop" aria-live="assertive">
      <div className="clap-stage">
        <div className={`clap-ring ${step >= 1 ? "burst" : ""}`} />
        <strong key={step}>{step === 0 ? "屏息" : "啪"}</strong>
        <p>{step < 2 ? "招式即将揭晓" : "同时揭晓"}</p>
      </div>
    </div>
  );
}

function RoundResultOverlay({
  result,
  finished,
  onContinue,
  onRestart,
}: {
  result: LocalRoundRecord;
  finished: boolean;
  onContinue: () => void;
  onRestart: () => void;
}) {
  const winner = result.outcome === "player1-wins" ? "玩家一胜" : result.outcome === "player2-wins" ? "玩家二胜" : "胜负未分";
  const dramatic = result.player1Action === "super-kill" || result.player2Action === "super-kill";

  return (
    <div className={`modal-backdrop result-backdrop ${dramatic ? "super-impact" : ""}`} role="dialog" aria-modal="true" aria-labelledby="result-title">
      <section className="result-card">
        <p className="eyebrow">第 {result.round} 回合 · 同时揭晓</p>
        <h2 id="result-title">{finished ? winner : INTERACTION_TEXT[result.interaction]}</h2>
        <div className="reveal-row">
          <RevealAction player="玩家一" action={result.player1Action} damaged={result.player1Damage > 0} />
          <div className="impact-mark">对</div>
          <RevealAction player="玩家二" action={result.player2Action} damaged={result.player2Damage > 0} />
        </div>
        {!finished && <p className="result-summary">{INTERACTION_TEXT[result.interaction]}</p>}
        <button className="primary-button" onClick={finished ? onRestart : onContinue}>{finished ? "再来一局" : "进入下一回合"}</button>
      </section>
    </div>
  );
}

function RevealAction({ player, action, damaged }: { player: string; action: ServerActionId; damaged: boolean }) {
  return (
    <div className={`reveal-action ${damaged ? "damaged" : ""}`}>
      <span>{player}</span>
      {action === "idle" ? <div className="idle-action-icon">空</div> : <img src={getSkillIcon(action)} alt={ACTIONS[action].label} />}
      <strong>{action === "idle" ? "无动作" : ACTIONS[action].label}</strong>
    </div>
  );
}

function RulesDialog({ onClose }: { onClose: () => void }) {
  const rows = useMemo(() => [
    ["石头", "获得 1 点能量，即使受击仍生效"],
    ["杀 / 飞杀 / 超杀", "消耗 1 / 2 / 3 能量，高级攻击压制低级攻击"],
    ["防 / 下防 / 上防", "分别只能防住杀 / 飞杀 / 超杀"],
  ] as const, []);

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="rules-title" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="rules-card">
        <button className="close-button" onClick={onClose} aria-label="关闭规则">×</button>
        <p className="eyebrow">三十秒上手</p>
        <h2 id="rules-title">藏招、猜招、破招</h2>
        <p className="rules-lead">双方依次秘密选择，随后同时揭晓。先让对方三点生命归零即获胜。</p>
        <div className="rule-list">{rows.map(([name, description]) => <div key={name}><strong>{name}</strong><p>{description}</p></div>)}</div>
        <div className="rule-tip"><span>诀窍</span><p>能量越高，威胁越大；但对手也更容易猜到你的杀招。</p></div>
        <button className="primary-button" onClick={onClose}>明白了</button>
      </section>
    </div>
  );
}
