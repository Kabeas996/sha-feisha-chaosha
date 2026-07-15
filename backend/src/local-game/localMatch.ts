import {
  INITIAL_ENERGY,
  INITIAL_HP,
  resolveRound,
  validateAction,
  type ActionId,
  type PlayerCombatState,
  type RoundResult,
} from "../game-rules/index.ts";

export type LocalPlayer = "player1" | "player2";
export type LocalMatchPhase =
  | "player1-selecting"
  | "handoff"
  | "player2-selecting"
  | "ready-to-reveal"
  | "round-result"
  | "finished";

export interface LocalRoundRecord extends RoundResult {
  readonly round: number;
}

export interface LocalMatchState {
  readonly round: number;
  readonly phase: LocalMatchPhase;
  readonly player1: PlayerCombatState;
  readonly player2: PlayerCombatState;
  readonly player1Action: ActionId | null;
  readonly player2Action: ActionId | null;
  readonly lastRound: LocalRoundRecord | null;
  readonly history: readonly LocalRoundRecord[];
}

export class LocalMatchError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "LocalMatchError";
  }
}

export function createLocalMatch(): LocalMatchState {
  return {
    round: 1,
    phase: "player1-selecting",
    player1: { hp: INITIAL_HP, energy: INITIAL_ENERGY },
    player2: { hp: INITIAL_HP, energy: INITIAL_ENERGY },
    player1Action: null,
    player2Action: null,
    lastRound: null,
    history: [],
  };
}

export function submitLocalAction(
  state: LocalMatchState,
  player: LocalPlayer,
  action: ActionId,
): LocalMatchState {
  const expectedPhase = player === "player1" ? "player1-selecting" : "player2-selecting";
  if (state.phase !== expectedPhase) {
    throw new LocalMatchError(`It is not ${player}'s selection turn`);
  }

  const playerState = player === "player1" ? state.player1 : state.player2;
  if (!validateAction(playerState, action).valid) {
    throw new LocalMatchError(`${player} does not have enough energy for ${action}`);
  }

  if (player === "player1") {
    return { ...state, player1Action: action, phase: "handoff" };
  }

  return { ...state, player2Action: action, phase: "ready-to-reveal" };
}

export function beginPlayer2Turn(state: LocalMatchState): LocalMatchState {
  if (state.phase !== "handoff") {
    throw new LocalMatchError("The match is not waiting for player handoff");
  }
  return { ...state, phase: "player2-selecting" };
}

export function revealLocalRound(state: LocalMatchState): LocalMatchState {
  if (
    state.phase !== "ready-to-reveal" ||
    state.player1Action === null ||
    state.player2Action === null
  ) {
    throw new LocalMatchError("Both players must lock an action before reveal");
  }

  const result = resolveRound({
    player1: state.player1,
    player2: state.player2,
    player1Action: state.player1Action,
    player2Action: state.player2Action,
  });
  const record: LocalRoundRecord = { ...result, round: state.round };

  return {
    ...state,
    phase: result.outcome === "ongoing" ? "round-result" : "finished",
    player1: result.player1,
    player2: result.player2,
    lastRound: record,
    history: [...state.history, record],
  };
}

export function continueLocalMatch(state: LocalMatchState): LocalMatchState {
  if (state.phase !== "round-result") {
    throw new LocalMatchError("The current round is not ready to continue");
  }

  return {
    ...state,
    round: state.round + 1,
    phase: "player1-selecting",
    player1Action: null,
    player2Action: null,
  };
}

