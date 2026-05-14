import { io } from "socket.io-client";

export const socket = io(window.location.origin, {
  path: "/api/socket.io",
  autoConnect: false,
});

export const connectSocket = (token: string) => {
  socket.auth = { token };
  socket.connect();
};

export const disconnectSocket = () => {
  socket.disconnect();
};
