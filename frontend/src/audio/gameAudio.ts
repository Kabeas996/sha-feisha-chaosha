import type {
  ActionId,
  InteractionOutcome,
  ServerActionId,
} from "../../../backend/src/game-rules/index.ts";

export type GameSound =
  | "select"
  | "charge"
  | "attack-kill"
  | "attack-flying"
  | "attack-super"
  | "defend"
  | "block"
  | "hit"
  | "victory";

export interface RoundSoundResult {
  readonly player1Action: ServerActionId;
  readonly player2Action: ServerActionId;
  readonly interaction: InteractionOutcome;
  readonly outcome: "ongoing" | "player1-wins" | "player2-wins" | "draw";
}

const SOUND_VERSION = "20260719";
const SOUND_URLS: Readonly<Record<GameSound, string>> = {
  select: soundUrl("select"),
  charge: soundUrl("charge"),
  "attack-kill": soundUrl("attack-kill"),
  "attack-flying": soundUrl("attack-flying"),
  "attack-super": soundUrl("attack-super"),
  defend: soundUrl("defend"),
  block: soundUrl("block"),
  hit: soundUrl("hit"),
  victory: soundUrl("victory"),
};

const SOUND_VOLUMES: Readonly<Record<GameSound, number>> = {
  select: 0.28,
  charge: 0.42,
  "attack-kill": 0.5,
  "attack-flying": 0.54,
  "attack-super": 0.62,
  defend: 0.42,
  block: 0.58,
  hit: 0.62,
  victory: 0.5,
};

let soundEnabled = true;
let audioPrimed = false;
const audioPreloads: HTMLAudioElement[] = [];

function soundUrl(name: string): string {
  return `/audio/${name}.ogg?v=${SOUND_VERSION}`;
}

export function isGameSoundEnabled(): boolean {
  return soundEnabled;
}

export function setGameSoundEnabled(enabled: boolean): void {
  soundEnabled = enabled;
}

export function primeGameAudio(): void {
  if (audioPrimed || typeof Audio === "undefined") return;
  audioPrimed = true;
  for (const url of Object.values(SOUND_URLS)) {
    const audio = new Audio(url);
    audio.preload = "auto";
    audioPreloads.push(audio);
  }
}

export function playGameSound(
  sound: GameSound,
  options: { readonly delayMs?: number; readonly playbackRate?: number; readonly volumeScale?: number } = {},
): void {
  if (!soundEnabled || typeof Audio === "undefined") return;
  const play = () => {
    const audio = new Audio(SOUND_URLS[sound]);
    audio.preload = "auto";
    audio.volume = Math.min(1, SOUND_VOLUMES[sound] * (options.volumeScale ?? 1));
    audio.playbackRate = options.playbackRate ?? 1;
    void audio.play().catch(() => {
      // Browsers may block audio until the first user gesture. Selection clicks
      // prime playback, and a rejected optional effect must not interrupt play.
    });
  };
  if ((options.delayMs ?? 0) > 0) {
    window.setTimeout(play, options.delayMs);
  } else {
    play();
  }
}

export function playSelectionSound(): void {
  primeGameAudio();
  playGameSound("select");
}

export function playRoundSounds(result: RoundSoundResult): void {
  const attacker = getResolvingAttack(result);
  if (attacker !== null) playActionSound(attacker);

  if (result.interaction === "player1-hit" || result.interaction === "player2-hit") {
    playGameSound("hit", { delayMs: attacker === null ? 0 : 135 });
  } else if (
    result.interaction === "player1-blocked"
    || result.interaction === "player2-blocked"
    || result.interaction === "attacks-cancelled"
  ) {
    playGameSound("block", { delayMs: attacker === null ? 0 : 120 });
  } else if (attacker === null) {
    playPassiveActions(result.player1Action, result.player2Action);
  }

  if (result.outcome !== "ongoing") {
    playGameSound("victory", { delayMs: 420, volumeScale: 0.8 });
  }
}

function getResolvingAttack(result: RoundSoundResult): ActionId | null {
  if (result.interaction === "player1-hit" || result.interaction === "player1-blocked") {
    return isAction(result.player2Action) ? result.player2Action : null;
  }
  if (result.interaction === "player2-hit" || result.interaction === "player2-blocked") {
    return isAction(result.player1Action) ? result.player1Action : null;
  }
  if (result.interaction === "attacks-cancelled") {
    return isAction(result.player1Action) ? result.player1Action : null;
  }
  return null;
}

function playActionSound(action: ActionId): void {
  if (action === "kill") playGameSound("attack-kill");
  else if (action === "flying-kill") playGameSound("attack-flying", { playbackRate: 1.08 });
  else if (action === "super-kill") playGameSound("attack-super");
}

function playPassiveActions(player1Action: ServerActionId, player2Action: ServerActionId): void {
  if (player1Action === "stone" || player2Action === "stone") {
    playGameSound("charge");
  }
  if (isDefense(player1Action) || isDefense(player2Action)) {
    playGameSound("defend", { delayMs: player1Action === "stone" || player2Action === "stone" ? 100 : 0 });
  }
}

function isAction(action: ServerActionId): action is ActionId {
  return action !== "idle";
}

function isDefense(action: ServerActionId): boolean {
  return action === "guard" || action === "low-guard" || action === "high-guard";
}
