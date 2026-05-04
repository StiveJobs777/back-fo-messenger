import { useEffect, useRef, useCallback } from "react";

const WS_URL = "ws://localhost:3001";

type IncomingMessage = {
  type: "message" | "auth_ok" | "error";
  senderId?: string;
  text?: string;
  createdAt?: string;
  userId?: string;
  message?: string;
};

type UseWebSocketOptions = {
  userId: string;
  onMessage: (msg: IncomingMessage) => void;
};

export const useWebSocket = ({ userId, onMessage }: UseWebSocketOptions) => {
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    if (!userId) return;

    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;

    ws.onopen = () => {
      // Регистрируем пользователя после открытия соединения
      ws.send(JSON.stringify({ type: "auth", userId }));
    };

    ws.onmessage = (event) => {
      try {
        const msg: IncomingMessage = JSON.parse(event.data);
        onMessage(msg);
      } catch {
        console.error("WS: failed to parse message");
      }
    };

    ws.onerror = (err) => {
      console.error("WS error:", err);
    };

    ws.onclose = () => {
      console.log("WS: connection closed");
    };

    return () => {
      ws.close();
    };
    // onMessage специально не в зависимостях 
  }, [userId]);

  // Отправить сообщение конкретному пользователю
  const sendMessage = useCallback((receiverId: string, text: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "message", receiverId, text }));
    } else {
      console.warn("WS: socket is not open");
    }
  }, []);

  return { sendMessage };
};