import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  InvalidActionError,
  InvalidCombatStateError,
  MAX_ENERGY,
  resolveRound,
  validateAction,
  type ActionId,
  type PlayerCombatState,
} from "../src/game-rules/index.ts";

const full: PlayerCombatState = { hp: 3, energy: 5 };

function play(player1Action: ActionId, player2Action: ActionId) {
  return resolveRound({
    player1: full,
    player2: full,
    player1Action,
    player2Action,
  });
}

describe("attack versus defense", () => {
  const attacks = [
    ["kill", "guard"],
    ["flying-kill", "low-guard"],
    ["super-kill", "high-guard"],
  ] as const;

  for (const [attack, matchingDefense] of attacks) {
    test(`${attack} is stopped only by ${matchingDefense}`, () => {
      const blocked = play(attack, matchingDefense);
      assert.equal(blocked.player2Damage, 0);
      assert.equal(blocked.interaction, "player1-blocked");

      for (const wrongDefense of ["guard", "low-guard", "high-guard"] as const) {
        if (wrongDefense === matchingDefense) continue;
        const hit = play(attack, wrongDefense);
        assert.equal(hit.player2Damage, 1);
        assert.equal(hit.interaction, "player2-hit");

        const reverseHit = play(wrongDefense, attack);
        assert.equal(reverseHit.player1Damage, 1);
        assert.equal(reverseHit.interaction, "player1-hit");
      }
    });

    test(`${matchingDefense} also works when it is player 1`, () => {
      const blocked = play(matchingDefense, attack);
      assert.equal(blocked.player1Damage, 0);
      assert.equal(blocked.interaction, "player2-blocked");
    });
  }
});

describe("attack versus attack", () => {
  const attacks = ["kill", "flying-kill", "super-kill"] as const;

  for (const player1Action of attacks) {
    for (const player2Action of attacks) {
      test(`${player1Action} versus ${player2Action}`, () => {
        const result = play(player1Action, player2Action);
        const level1 = attacks.indexOf(player1Action);
        const level2 = attacks.indexOf(player2Action);

        if (level1 === level2) {
          assert.equal(result.interaction, "attacks-cancelled");
          assert.equal(result.player1Damage, 0);
          assert.equal(result.player2Damage, 0);
        } else if (level1 > level2) {
          assert.equal(result.player2Damage, 1);
          assert.equal(result.player1Damage, 0);
        } else {
          assert.equal(result.player1Damage, 1);
          assert.equal(result.player2Damage, 0);
        }
      });
    }
  }
});

describe("stone and passive interactions", () => {
  for (const attack of ["kill", "flying-kill", "super-kill"] as const) {
    test(`stone still gains energy when hit by ${attack}`, () => {
      const result = resolveRound({
        player1: { hp: 3, energy: 0 },
        player2: full,
        player1Action: "stone",
        player2Action: attack,
      });
      assert.deepEqual(result.player1, { hp: 2, energy: 1 });
      assert.equal(result.player1Damage, 1);
    });
  }

  test("stone energy is capped at five", () => {
    const result = play("stone", "stone");
    assert.equal(result.player1.energy, MAX_ENERGY);
    assert.equal(result.player2.energy, MAX_ENERGY);
  });

  test("defense versus defense has no effect", () => {
    const result = play("guard", "high-guard");
    assert.equal(result.interaction, "no-effect");
    assert.equal(result.player1Damage, 0);
    assert.equal(result.player2Damage, 0);
  });

  test("stone versus defense only grants stone energy", () => {
    const result = resolveRound({
      player1: { hp: 3, energy: 0 },
      player2: { hp: 3, energy: 0 },
      player1Action: "stone",
      player2Action: "guard",
    });
    assert.deepEqual(result.player1, { hp: 3, energy: 1 });
    assert.deepEqual(result.player2, { hp: 3, energy: 0 });
  });
});

describe("server-only idle action", () => {
  test("idle grants no energy and has no defensive effect", () => {
    const result = resolveRound({
      player1: { hp: 3, energy: 0 },
      player2: { hp: 3, energy: 1 },
      player1Action: "idle",
      player2Action: "kill",
    });

    assert.deepEqual(result.player1, { hp: 2, energy: 0 });
    assert.deepEqual(result.player2, { hp: 3, energy: 0 });
  });

  test("two idle players do nothing", () => {
    const result = resolveRound({
      player1: { hp: 3, energy: 2 },
      player2: { hp: 3, energy: 2 },
      player1Action: "idle",
      player2Action: "idle",
    });
    assert.deepEqual(result.player1, { hp: 3, energy: 2 });
    assert.deepEqual(result.player2, { hp: 3, energy: 2 });
  });
});

describe("energy validation and spending", () => {
  const costs = [
    ["kill", 1],
    ["flying-kill", 2],
    ["super-kill", 3],
  ] as const;

  for (const [action, cost] of costs) {
    test(`${action} requires and spends ${cost} energy`, () => {
      const insufficient = validateAction({ hp: 3, energy: cost - 1 }, action);
      assert.deepEqual(insufficient, {
        valid: false,
        reason: "insufficient-energy",
        requiredEnergy: cost,
        availableEnergy: cost - 1,
      });

      const result = resolveRound({
        player1: { hp: 3, energy: cost },
        player2: { hp: 3, energy: 0 },
        player1Action: action,
        player2Action: "stone",
      });
      assert.equal(result.player1.energy, 0);
    });
  }

  test("resolveRound rejects an unaffordable action", () => {
    assert.throws(
      () =>
        resolveRound({
          player1: { hp: 3, energy: 0 },
          player2: { hp: 3, energy: 0 },
          player1Action: "super-kill",
          player2Action: "stone",
        }),
      (error: unknown) =>
        error instanceof InvalidActionError &&
        error.player === "player1" &&
        error.requiredEnergy === 3,
    );
  });
});

describe("win detection and state protection", () => {
  test("a lethal hit declares player 1 the winner", () => {
    const result = resolveRound({
      player1: { hp: 3, energy: 1 },
      player2: { hp: 1, energy: 0 },
      player1Action: "kill",
      player2Action: "stone",
    });
    assert.equal(result.player2.hp, 0);
    assert.equal(result.outcome, "player1-wins");
  });

  test("a lethal hit declares player 2 the winner", () => {
    const result = resolveRound({
      player1: { hp: 1, energy: 0 },
      player2: { hp: 3, energy: 1 },
      player1Action: "stone",
      player2Action: "kill",
    });
    assert.equal(result.outcome, "player2-wins");
  });

  test("non-lethal rounds remain ongoing", () => {
    assert.equal(play("kill", "stone").outcome, "ongoing");
  });

  test("a round cannot start after either player reaches zero HP", () => {
    assert.throws(
      () =>
        resolveRound({
          player1: { hp: 0, energy: 0 },
          player2: { hp: 3, energy: 0 },
          player1Action: "stone",
          player2Action: "stone",
        }),
      InvalidCombatStateError,
    );
  });

  test("invalid energy state is rejected", () => {
    assert.throws(
      () => validateAction({ hp: 3, energy: 6 }, "stone"),
      InvalidCombatStateError,
    );
  });
});
