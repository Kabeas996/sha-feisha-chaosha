import { ACTIONS } from "./actions.ts";
import { ATTACK_DAMAGE, MAX_ENERGY } from "./constants.ts";
import { InvalidActionError, InvalidCombatStateError } from "./errors.ts";
import type {
  ActionDefinition,
  ActionId,
  ActionValidationResult,
  GameOutcome,
  InteractionOutcome,
  PlayerCombatState,
  RoundInput,
  RoundResult,
  ServerActionId,
} from "./types.ts";

const IDLE_ACTION: ActionDefinition = {
  id: "idle",
  label: "无动作",
  kind: "resource",
  energyCost: 0,
  level: 0,
};

export function validateAction(
  state: PlayerCombatState,
  actionId: ActionId,
): ActionValidationResult {
  assertValidState(state);
  const action = ACTIONS[actionId];

  if (state.energy < action.energyCost) {
    return {
      valid: false,
      reason: "insufficient-energy",
      requiredEnergy: action.energyCost,
      availableEnergy: state.energy,
    };
  }

  return { valid: true };
}

/**
 * Resolves one simultaneous round. This function is deterministic and contains
 * no timers, networking, or UI state, so the server remains the sole authority.
 */
export function resolveRound(input: RoundInput): RoundResult {
  assertValidState(input.player1);
  assertValidState(input.player2);

  if (input.player1.hp === 0 || input.player2.hp === 0) {
    throw new InvalidCombatStateError("Cannot resolve a round after the game has ended");
  }

  assertActionAffordable("player1", input.player1, input.player1Action);
  assertActionAffordable("player2", input.player2, input.player2Action);

  const action1 = getActionDefinition(input.player1Action);
  const action2 = getActionDefinition(input.player2Action);
  const interaction = resolveInteraction(action1, action2);
  const player1Damage = interaction === "player1-hit" ? ATTACK_DAMAGE : 0;
  const player2Damage = interaction === "player2-hit" ? ATTACK_DAMAGE : 0;

  const player1 = applyRoundState(input.player1, action1, player1Damage);
  const player2 = applyRoundState(input.player2, action2, player2Damage);

  return {
    player1,
    player2,
    player1Action: input.player1Action,
    player2Action: input.player2Action,
    player1Damage,
    player2Damage,
    interaction,
    outcome: determineOutcome(player1.hp, player2.hp),
  };
}

function resolveInteraction(
  action1: ActionDefinition,
  action2: ActionDefinition,
): InteractionOutcome {
  if (action1.kind === "attack" && action2.kind === "attack") {
    if (action1.level === action2.level) {
      return "attacks-cancelled";
    }
    return action1.level > action2.level ? "player2-hit" : "player1-hit";
  }

  if (action1.kind === "attack") {
    if (action2.kind === "defense" && action1.level === action2.level) {
      return "player1-blocked";
    }
    return "player2-hit";
  }

  if (action2.kind === "attack") {
    if (action1.kind === "defense" && action2.level === action1.level) {
      return "player2-blocked";
    }
    return "player1-hit";
  }

  return "no-effect";
}

function applyRoundState(
  state: PlayerCombatState,
  action: ActionDefinition,
  damage: number,
): PlayerCombatState {
  const energyAfterCost = state.energy - action.energyCost;
  const energyGain = action.id === "stone" ? 1 : 0;

  return {
    hp: Math.max(0, state.hp - damage),
    energy: Math.min(MAX_ENERGY, energyAfterCost + energyGain),
  };
}

function getActionDefinition(actionId: ServerActionId): ActionDefinition {
  return actionId === "idle" ? IDLE_ACTION : ACTIONS[actionId];
}

function determineOutcome(player1Hp: number, player2Hp: number): GameOutcome {
  if (player1Hp === 0 && player2Hp === 0) return "draw";
  if (player1Hp === 0) return "player2-wins";
  if (player2Hp === 0) return "player1-wins";
  return "ongoing";
}

function assertActionAffordable(
  player: "player1" | "player2",
  state: PlayerCombatState,
  actionId: ServerActionId,
): void {
  const action = getActionDefinition(actionId);
  if (state.energy < action.energyCost) {
    throw new InvalidActionError(player, action.energyCost, state.energy);
  }
}

function assertValidState(state: PlayerCombatState): void {
  if (!Number.isInteger(state.hp) || state.hp < 0) {
    throw new InvalidCombatStateError("HP must be a non-negative integer");
  }
  if (!Number.isInteger(state.energy) || state.energy < 0 || state.energy > MAX_ENERGY) {
    throw new InvalidCombatStateError(`Energy must be an integer between 0 and ${MAX_ENERGY}`);
  }
}
