import { Server as SocketIOServer } from "socket.io";
import { Server as HttpServer } from "http";
import { verifyJwt } from "./jwt.js";

let io: SocketIOServer | null = null;

export function initSocketIO(httpServer: HttpServer): SocketIOServer {
  io = new SocketIOServer(httpServer, {
    cors: { origin: "*" },
    path: "/api/socket.io",
  });

  io.on("connection", (socket) => {
    // 1. Try to authenticate via JWT token from auth (used by React frontend)
    const token = socket.handshake.auth?.token;
    if (token) {
      const payload = verifyJwt(token);
      if (payload) {
        if (payload.role === "merchant") {
          socket.join(`merchant:${payload.id}`);
        } else if (payload.role === "user") {
          socket.join(`user:${payload.id}`);
        }
      }
    }

    // 2. Fallback to query parameters (useful for tests and backward compatibility)
    const merchantId = socket.handshake.query.merchantId as string;
    const userId = socket.handshake.query.userId as string;

    if (merchantId) {
      socket.join(`merchant:${merchantId}`);
    }
    if (userId) {
      socket.join(`user:${userId}`);
    }

    socket.on("disconnect", () => {});
  });

  return io;
}

export function getIO(): SocketIOServer {
  if (!io) throw new Error("Socket.IO not initialized");
  return io;
}

export function emitToMerchant(merchantId: number, event: string, data: unknown): void {
  if (!io) return;
  io.to(`merchant:${merchantId}`).emit(event, data);
}

export function emitToUser(userId: number, event: string, data: unknown): void {
  if (!io) return;
  io.to(`user:${userId}`).emit(event, data);
}
