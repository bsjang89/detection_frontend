import { useState, useCallback } from "react";
import axios from "axios";
import { trainingApi } from "../api/training";
import type { TrainingSession, MetricsLog, TrainingConfig } from "../api/training";
import { useWebSocket } from "./useWebSocket";
import type { WSMessage } from "./useWebSocket";

export function useTraining(projectId: number | null) {
  const [sessions, setSessions] = useState<TrainingSession[]>([]);
  const [activeSession, setActiveSession] = useState<TrainingSession | null>(null);
  const [metrics, setMetrics] = useState<MetricsLog[]>([]);
  const [liveMetrics, setLiveMetrics] = useState<Record<string, number | null>[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // WebSocket for live monitoring
  const handleWsMessage = useCallback((msg: WSMessage) => {
    if (msg.type === "epoch_update" && msg.metrics) {
      setLiveMetrics((prev) => [...prev, { epoch: msg.epoch ?? 0, ...msg.metrics! }]);

      // Update progress on active session
      setActiveSession((prev) => {
        if (!prev) return null;
        const total = (prev.config as Record<string, number>).epochs ?? 100;
        const progress = ((msg.epoch ?? 0) / total) * 100;
        return { ...prev, progress };
      });
    } else if (msg.type === "status_update") {
      setActiveSession((prev) =>
        prev ? { ...prev, status: msg.status as TrainingSession["status"] } : null
      );
    }
  }, []);

  const { connected: wsConnected } = useWebSocket(activeSession?.id ?? null, {
    onMessage: handleWsMessage,
  });

  const loadSessions = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    try {
      const res = await trainingApi.listProjectSessions(projectId);
      setSessions(res.data);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load sessions");
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  const createSession = useCallback(
    async (modelType: string, name: string, config: TrainingConfig) => {
      if (!projectId) return;
      setError(null);
      try {
        const res = await trainingApi.createSession({
          project_id: projectId,
          name,
          model_type: modelType,
          config,
        });
        setSessions((prev) => [res.data, ...prev]);
        return res.data;
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : "Failed to create session";
        setError(msg);
        throw e;
      }
    },
    [projectId]
  );

  const startTraining = useCallback(async (sessionId: number) => {
    setError(null);
    try {
      await trainingApi.startTraining(sessionId);
      setLiveMetrics([]);
      // Reload session to get updated status
      const res = await trainingApi.getSession(sessionId);
      setActiveSession(res.data);
    } catch (e: unknown) {
      const detail = axios.isAxiosError(e) ? e.response?.data?.detail : undefined;
      const msg = detail ?? (e instanceof Error ? e.message : "Failed to start training");
      setError(msg);
      throw e;
    }
  }, []);

  const stopTraining = useCallback(async (sessionId: number) => {
    try {
      await trainingApi.stopTraining(sessionId);
      const res = await trainingApi.getSession(sessionId);
      setActiveSession(res.data);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to stop training");
    }
  }, []);

  const loadMetrics = useCallback(async (sessionId: number) => {
    try {
      const res = await trainingApi.getMetrics(sessionId);
      setMetrics(res.data);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load metrics");
    }
  }, []);

  const selectSession = useCallback(
    async (session: TrainingSession) => {
      setActiveSession(session);
      setLiveMetrics([]);
      if (session.status === "completed" || session.status === "stopped") {
        await loadMetrics(session.id);
      }
    },
    [loadMetrics]
  );

  return {
    sessions,
    activeSession,
    metrics,
    liveMetrics,
    loading,
    error,
    wsConnected,
    loadSessions,
    createSession,
    startTraining,
    stopTraining,
    loadMetrics,
    selectSession,
  };
}
