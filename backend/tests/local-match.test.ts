import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  LocalMatchError,
  beginPlayer2Turn,
  continueLocalMatch,
  createLocalMatch,
  revealLocalRound,
  submitLocalAction,
} from "../src/local-game/index.ts";

describe("local two-player match", () => {
  test("starts with player 1 and hides their locked action during handoff", () => {
    const start = createLocalMatch();
    const handoff = submitLocalAction(start, "player1", "stone");

    assert.equal(start.phase, "player1-selecting");
    assert.equal(handoff.phase, "handoff");
    assert.equal(handoff.player1Action, "stone");
    assert.equal(handoff.player2Action, null);
  });

  test("requires the privacy handoff before player 2 can act", () => {
    const start = createLocalMatch();
    assert.throws(
      () => submitLocalAction(start, "player2", "stone"),
      LocalMatchError,
    );
  });

  test("locks both actions and resolves through the authoritative rules", () => {
    let match = createLocalMatch();
    match = submitLocalAction(match, "player1", "stone");
    match = beginPlayer2Turn(match);
    match = submitLocalAction(match, "player2", "stone");
    match = revealLocalRound(match);

    assert.equal(match.phase, "round-result");
    assert.deepEqual(match.player1, { hp: 3, energy: 1 });
    assert.deepEqual(match.player2, { hp: 3, energy: 1 });
    assert.equal(match.history.length, 1);
  });

  test("rejects an action without enough energy", () => {
    assert.throws(
      () => submitLocalAction(createLocalMatch(), "player1", "super-kill"),
      LocalMatchError,
    );
  });

  test("continues to the next round with actions cleared", () => {
    let match = createLocalMatch();
    match = submitLocalAction(match, "player1", "stone");
    match = beginPlayer2Turn(match);
    match = submitLocalAction(match, "player2", "stone");
    match = revealLocalRound(match);
    match = continueLocalMatch(match);

    assert.equal(match.round, 2);
    assert.equal(match.phase, "player1-selecting");
    assert.equal(match.player1Action, null);
    assert.equal(match.player2Action, null);
  });

  test("ends the match after a lethal server-authoritative result", () => {
    let match = {
      ...createLocalMatch(),
      player1: { hp: 3, energy: 1 },
      player2: { hp: 1, energy: 0 },
    };
    match = submitLocalAction(match, "player1", "kill");
    match = beginPlayer2Turn(match);
    match = submitLocalAction(match, "player2", "stone");
    match = revealLocalRound(match);

    assert.equal(match.phase, "finished");
    assert.equal(match.lastRound?.outcome, "player1-wins");
    assert.throws(() => continueLocalMatch(match), LocalMatchError);
  });
});

