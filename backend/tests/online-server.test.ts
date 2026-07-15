import assert from "node:assert/strict";
import { afterEach, describe, test } from "node:test";
import type { AddressInfo } from "node:net";

import { io as createClient, type Socket as ClientSocket } from "socket.io-client";

import { createOnlineServer, type OnlineServerApp } from "../src/online/createOnlineServer.ts";
import type {
  BasicAck,
  ClientToServerEvents,
  OnlineRoomSnapshot,
  PublicOnlineRoundResult,
  RoomAck,
  ServerToClientEvents,
} from "../src/online/protocol.ts";

type TestClient = ClientSocket<ServerToClientEvents, ClientToServerEvents>;

const clients: TestClient[] = [];
let app: OnlineServerApp | null = null;

afterEach(async () => {
  for (const client of clients.splice(0)) client.disconnect();
  if (app !== null) {
    const current = app;
    app = null;
    await new Promise<void>((resolve) => current.io.close(() => resolve()));
  }
});

describe("Socket.IO online game", () => {
  test("creates a room, hides selections, and resolves both actions together", async () => {
    const { player1, player2 } = await createStartedRoom();
    const result1Promise = waitForResult(player1);
    const result2Promise = waitForResult(player2);
    const revealStatePromise = waitForState(player1, (state) => state.phase === "revealing");

    assert.deepEqual(await submitAction(player1, "stone"), { ok: true });
    assert.deepEqual(await submitAction(player2, "stone"), { ok: true });

    const [result1, result2, revealState] = await Promise.all([
      result1Promise,
      result2Promise,
      revealStatePromise,
    ]);
    assert.deepEqual(result1, result2);
    assert.equal(result1.player1Action, "stone");
    assert.equal(result1.player2Action, "stone");
    assert.deepEqual(revealState.players.map((player) => player.energy), [1, 1]);
    assert.equal(revealState.deadline, null);
  });

  test("declares a draw when both players miss three consecutive rounds", async () => {
    const { player1 } = await createStartedRoom();
    const finished = await waitForState(player1, (state) => state.phase === "finished", 3_000);

    assert.equal(finished.endReason, "timeout");
    assert.equal(finished.winnerId, null);
    assert.deepEqual(finished.players.map((player) => player.idleStrikes), [3, 3]);
    assert.deepEqual(finished.players.map((player) => player.energy), [0, 0]);
  });
});

async function createStartedRoom(): Promise<{ player1: TestClient; player2: TestClient }> {
  app = createOnlineServer({
    roundDurationMs: 80,
    revealDurationMs: 30,
    disconnectGraceMs: 100,
  });
  await new Promise<void>((resolve) => app?.httpServer.listen(0, "127.0.0.1", resolve));
  const address = app.httpServer.address() as AddressInfo;
  const url = `http://127.0.0.1:${address.port}`;
  const player1 = await connectClient(url);
  const player2 = await connectClient(url);

  const created = await createRoom(player1, "青锋");
  if (!created.ok) throw new Error(created.message);
  const joined = await joinRoom(player2, created.roomId, "流云");
  assert.equal(joined.ok, true);

  const selecting1 = waitForState(player1, (state) => state.phase === "selecting");
  const selecting2 = waitForState(player2, (state) => state.phase === "selecting");
  assert.deepEqual(await markReady(player1), { ok: true });
  assert.deepEqual(await markReady(player2), { ok: true });
  await Promise.all([selecting1, selecting2]);
  return { player1, player2 };
}

async function connectClient(url: string): Promise<TestClient> {
  const client: TestClient = createClient(url, { transports: ["websocket"], forceNew: true });
  clients.push(client);
  await new Promise<void>((resolve, reject) => {
    client.once("connect", () => resolve());
    client.once("connect_error", reject);
  });
  return client;
}

function createRoom(client: TestClient, nickname: string): Promise<RoomAck> {
  return new Promise((resolve) => client.emit("room:create", { nickname }, resolve));
}

function joinRoom(client: TestClient, roomId: string, nickname: string): Promise<RoomAck> {
  return new Promise((resolve) => client.emit("room:join", { roomId, nickname }, resolve));
}

function markReady(client: TestClient): Promise<BasicAck> {
  return new Promise((resolve) => client.emit("room:ready", resolve));
}

function submitAction(client: TestClient, action: "stone"): Promise<BasicAck> {
  return new Promise((resolve) => client.emit("game:action", { action }, resolve));
}

function waitForResult(client: TestClient): Promise<PublicOnlineRoundResult> {
  return new Promise((resolve) => client.once("game:round-result", resolve));
}

function waitForState(
  client: TestClient,
  predicate: (snapshot: OnlineRoomSnapshot) => boolean,
  timeoutMs = 2_000,
): Promise<OnlineRoomSnapshot> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      client.off("room:state", handler);
      reject(new Error("Timed out waiting for room state"));
    }, timeoutMs);
    const handler = (snapshot: OnlineRoomSnapshot) => {
      if (!predicate(snapshot)) return;
      clearTimeout(timeout);
      client.off("room:state", handler);
      resolve(snapshot);
    };
    client.on("room:state", handler);
  });
}
