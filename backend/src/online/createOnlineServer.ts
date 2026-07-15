import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer, type Server as HttpServer } from "node:http";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

import { Server } from "socket.io";

import type { ClientToServerEvents, ServerToClientEvents } from "./protocol.ts";
import { OnlineGameServer, type OnlineGameTiming } from "./onlineGameServer.ts";

const frontendDist = fileURLToPath(new URL("../../../frontend/dist/", import.meta.url));

const mimeTypes: Record<string, string> = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
};

function serveFrontend(requestUrl: string, response: import("node:http").ServerResponse): void {
  const pathname = decodeURIComponent(new URL(requestUrl, "http://localhost").pathname);
  const requestedPath = pathname === "/" ? "index.html" : pathname.slice(1);
  const normalizedPath = normalize(requestedPath).replace(/^(\.\.[/\\])+/, "");
  let filePath = join(frontendDist, normalizedPath);

  if (!existsSync(filePath) || !statSync(filePath).isFile()) {
    filePath = join(frontendDist, "index.html");
  }

  if (!existsSync(filePath)) {
    response.writeHead(404);
    response.end("Frontend has not been built.");
    return;
  }

  response.writeHead(200, {
    "cache-control": filePath.endsWith("index.html") ? "no-cache" : "public, max-age=31536000, immutable",
    "content-type": mimeTypes[extname(filePath)] ?? "application/octet-stream",
  });
  createReadStream(filePath).pipe(response);
}

export interface OnlineServerApp {
  readonly httpServer: HttpServer;
  readonly io: Server<ClientToServerEvents, ServerToClientEvents>;
}

export function createOnlineServer(timing?: OnlineGameTiming): OnlineServerApp {
  const httpServer = createServer((request, response) => {
    if (request.url === "/health") {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ ok: true }));
      return;
    }
    serveFrontend(request.url ?? "/", response);
  });
  const io = new Server<ClientToServerEvents, ServerToClientEvents>(httpServer, {
    cors: { origin: true, credentials: false },
  });
  const gameServer = new OnlineGameServer(io, timing);
  io.on("connection", (socket) => gameServer.register(socket));
  return { httpServer, io };
}
