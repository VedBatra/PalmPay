import { Server as SocketIOServer } from "socket.io";
import { Server as HttpServer } from "http";

let io: SocketIOServer | null = null;

export function initSocketIO(httpServer: HttpServer): SocketIOServer {
  io = new SocketIOServer(httpServer, {
    cors: { origin: "*" },
    path: "/api/socket.io",
  });

  io.on("connection", (socket) => {
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
