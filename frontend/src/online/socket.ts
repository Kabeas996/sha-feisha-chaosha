import { io, type Socket } from "socket.io-client";

import type {
  ClientToServerEvents,
  ServerToClientEvents,
} from "../../../backend/src/online/protocol.ts";

const backendUrl =
  import.meta.env.VITE_BACKEND_URL ??
  (import.meta.env.DEV ? "http://127.0.0.1:3001" : window.location.origin);

export const gameSocket: Socket<ServerToClientEvents, ClientToServerEvents> = io(backendUrl, {
  autoConnect: false,
  reconnection: true,
  reconnectionDelay: 500,
  reconnectionDelayMax: 2_000,
});
