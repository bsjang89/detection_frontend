import { useEffect, useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import axios from "axios";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { trainingApi } from "../api/training";
import type { TrainingSession, MetricsLog } from "../api/training";
import { useWebSocket } from "../hooks/useWebSocket";
import type { WSMessage } from "../hooks/useWebSocket";

interface LivePoint {
  epoch: number;
  train_box_loss?: number | null;
  train_cls_loss?: number | null;
  train_dfl_loss?: number | null;
  val_box_loss?: number | null;
  val_cls_loss?: number | null;
  val_dfl_loss?: number | null;
  map50?: number | null;
  map50_95?: number | null;
  precision?: number | null;
  recall?: number | null;
  learning_rate?: number | null;
}

export default function MonitoringPage() {
  const { projectId, sessionId } = useParams<{ projectId: string; sessionId: string }>();
  const navigate = useNavigate();
  const pid = Number(projectId);
  const sid = Number(sessionId);

  const [session, setSession] = useState<TrainingSession | null>(null);
  const [metricsData, setMetricsData] = useState<LivePoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);

  // Load session and historical metrics
  useEffect(() => {
    loadSession();
  }, [sid]);

  async function loadSession() {
    setLoading(true);
    try {
      const sRes = await trainingApi.getSession(sid);
      setSession(sRes.data);

      // Load historical metrics if training is done
      if (sRes.data.status !== "pending") {
        const mRes = await trainingApi.getMetrics(sid);
        const points: LivePoint[] = mRes.data.map((m: MetricsLog) => ({
          epoch: m.epoch,
          train_box_loss: m.train_box_loss,
          train_cls_loss: m.train_cls_loss,
          train_dfl_loss: m.train_dfl_loss,
          val_box_loss: m.val_box_loss,
          val_cls_loss: m.val_cls_loss,
          val_dfl_loss: m.val_dfl_loss,
          map50: m.map50,
          map50_95: m.map50_95,
          precision: m.precision,
          recall: m.recall,
          learning_rate: m.learning_rate,
        }));
        setMetricsData(points);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  // WebSocket for live updates
  const handleWsMessage = useCallback((msg: WSMessage) => {
    if (msg.type === "epoch_update" && msg.metrics) {
      const point: LivePoint = {
        epoch: msg.epoch ?? 0,
        ...msg.metrics,
      };
      setMetricsData((prev) => [...prev, point]);

      // Update progress
      setSession((prev) => {
        if (!prev) return null;
        const total = (prev.config as Record<string, number>).epochs ?? 100;
        const progress = ((msg.epoch ?? 0) / total) * 100;
        return { ...prev, progress, status: "running" };
      });
    } else if (msg.type === "status_update") {
      setSession((prev) =>
        prev ? { ...prev, status: msg.status as TrainingSession["status"] } : null
      );
    }
  }, []);

  const isRunning = session?.status === "running";

  const { connected } = useWebSocket(isRunning ? sid : null, {
    onMessage: handleWsMessage,
  });

  // Polling safeguard: keep UI progressing even if WS messages are delayed/missed.
  useEffect(() => {
    if (!isRunning) return;
    const interval = setInterval(async () => {
      try {
        const sRes = await trainingApi.getSession(sid);
        setSession(sRes.data);
        const mRes = await trainingApi.getMetrics(sid);
        setMetricsData(
          mRes.data.map((m: MetricsLog) => ({
            epoch: m.epoch,
            train_box_loss: m.train_box_loss,
            train_cls_loss: m.train_cls_loss,
            train_dfl_loss: m.train_dfl_loss,
            val_box_loss: m.val_box_loss,
            val_cls_loss: m.val_cls_loss,
            val_dfl_loss: m.val_dfl_loss,
            map50: m.map50,
            map50_95: m.map50_95,
            precision: m.precision,
            recall: m.recall,
            learning_rate: m.learning_rate,
          }))
        );
      } catch { /* ignore */ }
    }, 5000);
    return () => clearInterval(interval);
  }, [isRunning, sid]);

  async function handleStop() {
    if (!confirm("Stop training?")) return;
    try {
      await trainingApi.stopTraining(sid);
      const res = await trainingApi.getSession(sid);
      setSession(res.data);
    } catch (e) {
      alert("Failed to stop training");
    }
  }

  function sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async function waitUntilSessionInactive(sessionId: number, timeoutMs = 60000) {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
      const status = await trainingApi.getStatus(sessionId);
      if (!status.data.is_active) return true;
      await sleep(1000);
    }
    return false;
  }

  async function handleDelete() {
    if (!session) return;

    const title = session.name ?? `Session ${session.id}`;
    const ask = session.status === "running"
      ? `\"${title}\" 은(는) 현재 진행중입니다.\n중지 후 삭제할까요?`
      : `\"${title}\" 을(를) 삭제할까요?`;

    if (!confirm(ask)) return;

    setDeleting(true);
    try {
      if (session.status === "running") {
        await trainingApi.stopTraining(sid);
        const inactive = await waitUntilSessionInactive(sid);
        if (!inactive) {
          alert("중지 대기 시간이 초과되었습니다. 잠시 후 다시 시도해주세요.");
          return;
        }
      }

      await trainingApi.deleteSession(sid);
      alert("삭제되었습니다.");
      navigate(`/projects/${pid}/training`);
    } catch (e: unknown) {
      const detail = axios.isAxiosError(e) ? e.response?.data?.detail : undefined;
      alert(detail ?? "삭제 실패");
    } finally {
      setDeleting(false);
    }
  }

  if (loading) return <div style={{ padding: 24 }}>Loading...</div>;
  if (!session) return <div style={{ padding: 24 }}>Session not found</div>;

  return (
    <div className="page-shell" style={{ maxWidth: 1260 }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
        <button onClick={() => navigate(`/projects/${pid}/training`)} style={btnStyle}>Back</button>
        <h1 style={{ margin: 0, flex: 1 }}>
          {session.name ?? `Session ${session.id}`}
        </h1>
        <StatusBadge status={session.status} />
        {connected && <span style={{ color: "#34d399", fontSize: 14, fontWeight: 700 }}>WS Connected</span>}
      </div>

      {/* Info bar */}
      <div style={{ ...cardStyle, display: "flex", gap: 24, marginBottom: 16, flexWrap: "wrap" }}>
        <Info label="Model" value={session.model_type} />
        <Info label="Progress" value={`${session.progress.toFixed(1)}%`} />
        <Info label="mAP50" value={session.final_map50 != null ? `${(session.final_map50 * 100).toFixed(1)}%` : "-"} />
        <Info label="mAP50-95" value={session.final_map50_95 != null ? `${(session.final_map50_95 * 100).toFixed(1)}%` : "-"} />
        <Info label="Precision" value={session.final_precision != null ? `${(session.final_precision * 100).toFixed(1)}%` : "-"} />
        <Info label="Recall" value={session.final_recall != null ? `${(session.final_recall * 100).toFixed(1)}%` : "-"} />
        {isRunning && (
          <button onClick={handleStop} disabled={deleting} style={{ ...btnStyle, background: "linear-gradient(135deg, #dc2626, #ef4444)", alignSelf: "center", opacity: deleting ? 0.6 : 1 }}>
            Stop Training
          </button>
        )}
        <button onClick={handleDelete} disabled={deleting} style={{ ...btnStyle, background: "linear-gradient(135deg, #b91c1c, #dc2626)", alignSelf: "center", opacity: deleting ? 0.6 : 1 }}>
          Delete Session
        </button>
      </div>

      {session.error_message && (
        <div style={{ ...cardStyle, marginBottom: 16, background: "linear-gradient(165deg, rgba(80, 23, 32, 0.9), rgba(45, 18, 27, 0.9))", borderColor: "rgba(248, 113, 113, 0.55)" }}>
          <strong>Error:</strong> {session.error_message}
        </div>
      )}

      {/* Progress Bar */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ height: 8, background: "rgba(30, 41, 59, 0.7)", borderRadius: 6, overflow: "hidden", border: "1px solid var(--line)" }}>
          <div style={{ height: "100%", width: `${session.progress}%`, background: isRunning ? "linear-gradient(90deg, #0ea5e9, #22d3ee)" : "linear-gradient(90deg, #10b981, #34d399)", transition: "width 0.3s" }} />
        </div>
      </div>

      {/* Charts */}
      {metricsData.length > 0 && (
        <>
          {/* Loss Chart */}
          <section style={{ ...cardStyle, marginBottom: 16 }}>
            <h3 style={{ marginTop: 0 }}>Loss</h3>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={metricsData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                <XAxis dataKey="epoch" stroke="#888" />
                <YAxis stroke="#888" />
                <Tooltip contentStyle={{ background: "#1e1e1e", border: "1px solid #444" }} />
                <Legend />
                <Line type="monotone" dataKey="train_box_loss" stroke="#ef4444" dot={false} name="Train Box" />
                <Line type="monotone" dataKey="train_cls_loss" stroke="#f97316" dot={false} name="Train Cls" />
                <Line type="monotone" dataKey="val_box_loss" stroke="#3b82f6" dot={false} name="Val Box" />
                <Line type="monotone" dataKey="val_cls_loss" stroke="#8b5cf6" dot={false} name="Val Cls" />
              </LineChart>
            </ResponsiveContainer>
          </section>

          {/* mAP Chart */}
          <section style={{ ...cardStyle, marginBottom: 16 }}>
            <h3 style={{ marginTop: 0 }}>mAP / Precision / Recall</h3>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={metricsData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                <XAxis dataKey="epoch" stroke="#888" />
                <YAxis stroke="#888" domain={[0, 1]} />
                <Tooltip contentStyle={{ background: "#1e1e1e", border: "1px solid #444" }} />
                <Legend />
                <Line type="monotone" dataKey="map50" stroke="#16a34a" dot={false} name="mAP50" />
                <Line type="monotone" dataKey="map50_95" stroke="#059669" dot={false} name="mAP50-95" />
                <Line type="monotone" dataKey="precision" stroke="#eab308" dot={false} name="Precision" />
                <Line type="monotone" dataKey="recall" stroke="#06b6d4" dot={false} name="Recall" />
              </LineChart>
            </ResponsiveContainer>
          </section>

          {/* Learning Rate Chart */}
          <section style={cardStyle}>
            <h3 style={{ marginTop: 0 }}>Learning Rate</h3>
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={metricsData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                <XAxis dataKey="epoch" stroke="#888" />
                <YAxis stroke="#888" />
                <Tooltip contentStyle={{ background: "#1e1e1e", border: "1px solid #444" }} />
                <Line type="monotone" dataKey="learning_rate" stroke="#a855f7" dot={false} name="LR" />
              </LineChart>
            </ResponsiveContainer>
          </section>
        </>
      )}

      {metricsData.length === 0 && session.status === "running" && (
        <div style={{ ...cardStyle, textAlign: "center", padding: 40 }}>
          <p>Waiting for first epoch...</p>
        </div>
      )}
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ fontSize: 14, color: "#cbd5e1" }}>{label}</div>
      <div style={{ fontWeight: 600, fontSize: 16, color: "#e5e5e5" }}>{value}</div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    pending: "#666",
    running: "#2563eb",
    completed: "#16a34a",
    failed: "#dc2626",
    stopped: "#ca8a04",
  };
  return (
    <span style={{ padding: "5px 12px", borderRadius: 8, fontSize: 13, fontWeight: 800, background: colors[status] ?? "#666", color: "#fff" }}>
      {status.toUpperCase()}
    </span>
  );
}

const btnStyle: React.CSSProperties = {
  padding: "10px 18px",
  borderRadius: 10,
  border: "1px solid var(--line)",
  background: "linear-gradient(180deg, rgba(30, 41, 59, 0.9), rgba(15, 23, 42, 0.95))",
  color: "var(--text-0)",
  cursor: "pointer",
  fontSize: 15,
  fontWeight: 700,
  boxShadow: "var(--shadow-1)",
};
const cardStyle: React.CSSProperties = {
  background: "linear-gradient(165deg, rgba(20, 30, 56, 0.86), rgba(12, 20, 38, 0.86))",
  borderRadius: 16,
  padding: 24,
  border: "1px solid var(--line)",
  boxShadow: "var(--shadow-1)",
  backdropFilter: "blur(6px)",
};
