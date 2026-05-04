import "dotenv/config";
import http from "http";
import { WebSocketServer, WebSocket } from "ws";
import express, { Request, Response, NextFunction } from "express";
import cors from "cors";

import authRouter from "./api/auth";
import messageRouter from "./api/message";
import { PORT, CORS_ORIGIN } from "./config";

const app = express();

//Глобальные middleware
app.use(express.json());
app.use(cors({ origin: CORS_ORIGIN, credentials: true }));

app.use("/api/auth", authRouter);
app.use("/api/messages", messageRouter);

app.get("/", (_req: Request, res: Response) => {
  res.status(200).json({
    status: "ok",
    message: "Chat API is running",
    timestamp: new Date().toISOString(),
  });
});

app.use((_req: Request, res: Response) => {
  res.status(404).json({ error: "Route not found" });
});

app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error("Unhandled error:", err);
  res.status(500).json({ error: "Internal server error" });
});

//WebSocket 
const clients = new Map<string, WebSocket>();

const server = http.createServer(app);
const wss = new WebSocketServer({ server });

wss.on("connection", (ws) => {
  let userId: string | null = null;

  ws.on("message", (raw) => {
    try {
      const msg = JSON.parse(raw.toString());

      // Первое сообщение от клиента
      if (msg.type === "auth") {
        userId = String(msg.userId);
        clients.set(userId, ws);
        ws.send(JSON.stringify({ type: "auth_ok", userId }));
        console.log(`WS: user ${userId} connected`);
        return;
      }

      // Отправка сообщения
      if (msg.type === "message" && userId) {
        const payload = JSON.stringify({
          type: "message",
          senderId: userId,
          text: msg.text,
          createdAt: new Date().toISOString(),
        });

        const receiverWs = clients.get(String(msg.receiverId));
        if (receiverWs?.readyState === WebSocket.OPEN) {
          receiverWs.send(payload);
        }
        ws.send(payload);
      }
    } catch {
      ws.send(JSON.stringify({ type: "error", message: "Invalid JSON" }));
    }
  });

  ws.on("close", () => {
    if (userId) {
      clients.delete(userId);
      console.log(`WS: user ${userId} disconnected`);
    }
  });
});

server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`WebSocket running on ws://localhost:${PORT}`);
});