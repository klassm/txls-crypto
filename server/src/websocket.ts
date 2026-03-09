import type { Server as HttpServer } from "node:http";
import { Server } from "socket.io";
import { logger } from "./common/logger.js";

let io: Server | null = null;

export function setupWebSocket(httpServer: HttpServer): void {
  io = new Server(httpServer, {
    cors: {
      origin: process.env.NODE_ENV === "production" ? false : "http://localhost:3000",
      credentials: true,
    },
  });

  io.on("connection", (socket) => {
    logger.info({ socketId: socket.id }, "[WebSocket] Client connected");

    socket.on("join", (room: string) => {
      socket.join(room);
      logger.debug({ socketId: socket.id, room }, "[WebSocket] Client joined room");
    });

    socket.on("disconnect", () => {
      logger.info({ socketId: socket.id }, "[WebSocket] Client disconnected");
    });
  });

  logger.info("[WebSocket] Server initialized");
}

export function broadcastSyncEvent(
  userId: number,
  accountId: number,
  event: "sync-started" | "sync-complete" | "sync-error",
  data: Record<string, unknown>
): void {
  if (!io) {
    logger.warn("[WebSocket] Server not initialized, cannot broadcast");
    return;
  }

  const room = `account:${accountId}`;
  io.to(room).emit(event, { accountId, ...data });

  logger.debug({ userId, accountId, event }, "[WebSocket] Broadcasted event");
}

export function getSocketServer(): Server | null {
  return io;
}
