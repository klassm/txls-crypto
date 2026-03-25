import type { Server as HttpServer } from "node:http";
import { Server, Socket } from "socket.io";
import { logger } from "./common/logger.js";
import { getUserIdFromCookieExpress } from "./utils/session.js";
import { getDataSource } from "./database.js";
import { AccountsRepository } from "./modules/accounts/accounts.repository.js";

let io: Server | null = null;

export function setupWebSocket(httpServer: HttpServer): void {
  io = new Server(httpServer, {
    cors: {
      origin: process.env.NODE_ENV === "production" ? false : "http://localhost:3000",
      credentials: true,
    },
  });

  io.use(async (socket: Socket, next) => {
    try {
      const userId = getUserIdFromCookieExpress(socket.request);
      if (!userId) {
        return next(new Error("Unauthorized"));
      }
      socket.data.userId = userId;
      next();
    } catch (error) {
      logger.error({ error }, "[WebSocket] Auth middleware error");
      next(new Error("Authentication failed"));
    }
  });

  io.on("connection", (socket) => {
    logger.info({ socketId: socket.id, userId: socket.data.userId }, "[WebSocket] Client connected");

    socket.on("join", async (room: string) => {
      if (!room.startsWith("account:")) {
        logger.warn({ socketId: socket.id, room }, "[WebSocket] Invalid room format");
        return;
      }

      const accountId = parseInt(room.split(":")[1], 10);
      if (isNaN(accountId)) {
        logger.warn({ socketId: socket.id, room }, "[WebSocket] Invalid account ID in room");
        return;
      }

      try {
        const dataSource = await getDataSource();
        const accountsRepo = new AccountsRepository(dataSource);
        const account = await accountsRepo.findById(socket.data.userId, accountId);

        if (!account) {
          logger.warn({ socketId: socket.id, userId: socket.data.userId, accountId }, "[WebSocket] User does not own this account");
          return;
        }

        socket.join(room);
        logger.debug({ socketId: socket.id, room, userId: socket.data.userId }, "[WebSocket] Client joined room");
      } catch (error) {
        logger.error({ error, socketId: socket.id, room }, "[WebSocket] Error joining room");
      }
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
