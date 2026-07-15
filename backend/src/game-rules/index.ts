export { ACTIONS } from "./actions.ts";
export { ATTACK_DAMAGE, INITIAL_ENERGY, INITIAL_HP, MAX_ENERGY } from "./constants.ts";
export { InvalidActionError, InvalidCombatStateError } from "./errors.ts";
export { resolveRound, validateAction } from "./rules.ts";
export { ACTION_IDS } from "./types.ts";
export type {
  ActionDefinition,
  ActionId,
  ActionKind,
  ActionValidationResult,
  GameOutcome,
  InteractionOutcome,
  PlayerCombatState,
  RoundInput,
  RoundResult,
  ServerActionId,
} from "./types.ts";
