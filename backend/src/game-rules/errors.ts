export class InvalidCombatStateError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "InvalidCombatStateError";
  }
}

export class InvalidActionError extends Error {
  public readonly player: "player1" | "player2";
  public readonly requiredEnergy: number;
  public readonly availableEnergy: number;

  public constructor(
    player: "player1" | "player2",
    requiredEnergy: number,
    availableEnergy: number,
  ) {
    super(`${player} does not have enough energy`);
    this.name = "InvalidActionError";
    this.player = player;
    this.requiredEnergy = requiredEnergy;
    this.availableEnergy = availableEnergy;
  }
}

