export const ACTION_IDS = [
  "stone",
  "kill",
  "flying-kill",
  "super-kill",
  "guard",
  "low-guard",
  "high-guard",
] as const;

export type ActionId = (typeof ACTION_IDS)[number];
export type ServerActionId = ActionId | "idle";

export type ActionKind = "resource" | "attack" | "defense";

export interface ActionDefinition {
  readonly id: ServerActionId;
  readonly label: string;
  readonly kind: ActionKind;
  readonly energyCost: number;
  readonly level: 0 | 1 | 2 | 3;
}

export interface PlayerCombatState {
  readonly hp: number;
  readonly energy: number;
}

export interface RoundInput {
  readonly player1: PlayerCombatState;
  readonly player2: PlayerCombatState;
  readonly player1Action: ServerActionId;
  readonly player2Action: ServerActionId;
}

export type GameOutcome = "ongoing" | "player1-wins" | "player2-wins" | "draw";

export type InteractionOutcome =
  | "no-effect"
  | "attacks-cancelled"
  | "player1-blocked"
  | "player2-blocked"
  | "player1-hit"
  | "player2-hit";

export interface RoundResult {
  readonly player1: PlayerCombatState;
  readonly player2: PlayerCombatState;
  readonly player1Action: ServerActionId;
  readonly player2Action: ServerActionId;
  readonly player1Damage: number;
  readonly player2Damage: number;
  readonly interaction: InteractionOutcome;
  readonly outcome: GameOutcome;
}

export type ActionValidationResult =
  | { readonly valid: true }
  | {
      readonly valid: false;
      readonly reason: "insufficient-energy";
      readonly requiredEnergy: number;
      readonly availableEnergy: number;
    };
