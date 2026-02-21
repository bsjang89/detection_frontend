import { useEffect, useRef, useState, useCallback } from "react";
import { API_SERVER_URL } from "../api/client";

export interface WSMessage {
  type: "epoch_update" | "status_update" | "connected" | "pong" | "error";
  training_session_id?: number;
  epoch?: number;
  metrics?: Record<string, number | null>;
  status?: string;
  message?: string;
}

interface UseWebSocketOptions {
  onMessage?: (data: WSMessage) => void;
  onOpen?: () => void;
  onClose?: () => void;
  autoReconnect?: boolean;
  reconnectInterval?: number;
}

export function useWebSocket(
  trainingSessionId: number | null,
  options: UseWebSocketOptions = {}
) {
  const {
    onMessage,
    onOpen,
    onClose,
    autoReconnect = true,
    reconnectInterval = 3000,
  } = options;

  const wsRef = useRef<WebSocket | null>(null);
  const [connected, setConnected] = useState(false);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const connect = useCallback(() => {
    if (!trainingSessionId) return;

    // Convert http to ws
    const wsBase = API_SERVER_URL.replace(/^http/, "ws");
    const url = `${wsBase}/api/v1/ws/training/${trainingSessionId}`;

    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      setConnected(true);
      onOpen?.();
    };

    ws.onmessage = (event) => {
      try {
        const data: WSMessage = JSON.parse(event.data);
        onMessage?.(data);
      } catch {
        console.error("Failed to parse WS message:", event.data);
      }
    };

    ws.onclose = () => {
      setConnected(false);
      onClose?.();
      wsRef.current = null;

      if (autoReconnect && trainingSessionId) {
        reconnectTimer.current = setTimeout(connect, reconnectInterval);
      }
    };

    ws.onerror = () => {
      ws.close();
    };
  }, [trainingSessionId, onMessage, onOpen, onClose, autoReconnect, reconnectInterval]);

  useEffect(() => {
    connect();
    return () => {
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      wsRef.current?.close();
    };
  }, [connect]);

  const sendMessage = useCallback((data: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(data);
    }
  }, []);

  return { connected, sendMessage };
}
