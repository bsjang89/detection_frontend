import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import axios from "axios";
import { projectsApi } from "../api/projects";
import { trainingApi } from "../api/training";
import type { ProjectWithStats } from "../api/projects";
import type { TrainingSession, TrainingConfig } from "../api/training";

const MODEL_OPTIONS = [
  { value: "yolov8n", label: "YOLOv8 Nano" },
  { value: "yolov8s", label: "YOLOv8 Small" },
  { value: "yolov8m", label: "YOLOv8 Medium" },
  { value: "yolov8l", label: "YOLOv8 Large" },
  { value: "yolov8x", label: "YOLOv8 XLarge" },
  { value: "yolov3", label: "YOLOv3" },
];

const DEFAULT_CONFIG: TrainingConfig = {
  epochs: 50,
  batch: 16,
  imgsz: 640,
  lr0: 0.01,
  patience: 50,
  cache: true,
  workers: 0,
  optimizer: "auto",
  pretrained: true,
  mosaic: 0.5,
  mixup: 0.0,
  close_mosaic: 0,
};

export default function TrainingPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const pid = Number(projectId);

  const [project, setProject] = useState<ProjectWithStats | null>(null);
  const [sessions, setSessions] = useState<TrainingSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedSessionIds, setSelectedSessionIds] = useState<number[]>([]);
  const [deleting, setDeleting] = useState(false);

  // Form state
  const [sessionName, setSessionName] = useState("");
  const [modelType, setModelType] = useState("yolov8n");
  const [config, setConfig] = useState<TrainingConfig>({ ...DEFAULT_CONFIG });

  // Dataset split
  const [trainR, setTrainR] = useState(0.7);
  const [valR, setValR] = useState(0.2);
  const [testR, setTestR] = useState(0.1);
  const [splitting, setSplitting] = useState(false);

  useEffect(() => {
    loadData();
  }, [pid]);

  async function loadData() {
    setLoading(true);
    try {
      const [pRes, sRes] = await Promise.all([
        projectsApi.get(pid),
        trainingApi.listProjectSessions(pid),
      ]);
      setProject(pRes.data);
      setSessions(sRes.data);
      setSelectedSessionIds([]);

      // Adjust defaults for OBB
      if (pRes.data.task_type === "obb") {
        const isSmallDataset = (pRes.data.total_images ?? 0) <= 200;
        setConfig((c) => ({
          ...c,
          imgsz: isSmallDataset ? 640 : 768,
          lr0: 0.005,
          epochs: 50,
          close_mosaic: 10,
          batch: isSmallDataset ? 16 : 32,
          patience: isSmallDataset ? 20 : 50,
        }));
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  async function handleSplit() {
    setSplitting(true);
    try {
      const res = await trainingApi.splitDataset(pid, trainR, valR, testR);
      alert(`Split complete: Train ${res.data.train}, Val ${res.data.val}, Test ${res.data.test}`);
      const pRes = await projectsApi.get(pid);
      setProject(pRes.data);
    } catch (e) {
      alert("Split failed");
    } finally {
      setSplitting(false);
    }
  }

  async function handleCreateAndStart() {
    if (!sessionName.trim()) {
      alert("Enter a session name");
      return;
    }
    try {
      const session = await trainingApi.createSession({
        project_id: pid,
        name: sessionName.trim(),
        model_type: modelType,
        config,
      });

      await trainingApi.startTraining(session.data.id);

      // Navigate to monitoring page
      navigate(`/projects/${pid}/monitoring/${session.data.id}`);
    } catch (e: unknown) {
      const detail = axios.isAxiosError(e) ? e.response?.data?.detail : undefined;
      const msg = detail ?? (e instanceof Error ? e.message : "Failed to start training");
      alert(msg);
    }
  }

  function updateConfig<K extends keyof TrainingConfig>(key: K, value: TrainingConfig[K]) {
    setConfig((c) => ({ ...c, [key]: value }));
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

  async function stopIfRunning(session: TrainingSession) {
    if (session.status !== "running") return true;
    await trainingApi.stopTraining(session.id);
    return waitUntilSessionInactive(session.id);
  }

  async function handleDeleteSession(session: TrainingSession) {
    const title = session.name ?? `Session ${session.id}`;
    const ask = session.status === "running"
      ? `\"${title}\" 은(는) 현재 진행중입니다.\n중지 후 삭제할까요?`
      : `\"${title}\" 을(를) 삭제할까요?`;

    if (!confirm(ask)) return;

    setDeleting(true);
    try {
      const inactive = await stopIfRunning(session);
      if (!inactive) {
        alert(`\"${title}\" 중지 대기 시간이 초과되었습니다. 잠시 후 다시 시도해주세요.`);
        return;
      }

      await trainingApi.deleteSession(session.id);
      await loadData();
    } catch (e: unknown) {
      const detail = axios.isAxiosError(e) ? e.response?.data?.detail : undefined;
      alert(detail ?? `\"${title}\" 삭제 실패`);
    } finally {
      setDeleting(false);
    }
  }

  async function handleDeleteSelected() {
    if (selectedSessionIds.length === 0) {
      alert("삭제할 항목을 선택해주세요.");
      return;
    }

    const selected = sessions.filter((s) => selectedSessionIds.includes(s.id));
    const runningCount = selected.filter((s) => s.status === "running").length;
    const ask = runningCount > 0
      ? `선택한 ${selected.length}개 중 ${runningCount}개는 진행중입니다.\n중지 후 삭제할까요?`
      : `선택한 ${selected.length}개를 삭제할까요?`;

    if (!confirm(ask)) return;

    setDeleting(true);
    try {
      const failed: string[] = [];

      for (const session of selected) {
        const title = session.name ?? `Session ${session.id}`;
        try {
          const inactive = await stopIfRunning(session);
          if (!inactive) {
            failed.push(`${title} (중지 대기 시간 초과)`);
            continue;
          }
          await trainingApi.deleteSession(session.id);
        } catch {
          failed.push(title);
        }
      }

      await loadData();

      if (failed.length > 0) {
        alert(`일부 삭제 실패:\n${failed.join("\n")}`);
      }
    } finally {
      setDeleting(false);
    }
  }

  function toggleSessionSelection(sessionId: number, checked: boolean) {
    setSelectedSessionIds((prev) => {
      if (checked) return [...prev, sessionId];
      return prev.filter((id) => id !== sessionId);
    });
  }

  function toggleSelectAll(checked: boolean) {
    if (checked) {
      setSelectedSessionIds(sessions.map((s) => s.id));
    } else {
      setSelectedSessionIds([]);
    }
  }

  if (loading) return <div style={{ padding: 24 }}>Loading...</div>;
  if (!project) return <div style={{ padding: 24 }}>Project not found</div>;

  return (
    <div style={{ maxWidth: 1000, margin: "0 auto", padding: 24 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
        <button onClick={() => navigate("/")} style={btnStyle}>Projects</button>
        <h1 style={{ margin: 0, flex: 1 }}>{project.name} - Training</h1>
        <span style={badgeStyle}>{project.task_type.toUpperCase()}</span>
      </div>

      {/* Dataset Stats & Split */}
      <section style={cardStyle}>
        <h3 style={{ marginTop: 0 }}>Dataset</h3>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: 12, marginBottom: 16 }}>
          <StatBox label="Total Images" value={project.total_images} />
          <StatBox label="Labeled" value={project.labeled_images} />
          <StatBox label="Train" value={project.train_images} />
          <StatBox label="Val" value={project.val_images} />
          <StatBox label="Test" value={project.test_images} />
        </div>

        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <label style={labelStyle}>
            Train
            <input type="number" step={0.1} min={0} max={1} value={trainR}
              onChange={(e) => setTrainR(Number(e.target.value))} style={{ ...inputStyle, width: 70 }} />
          </label>
          <label style={labelStyle}>
            Val
            <input type="number" step={0.1} min={0} max={1} value={valR}
              onChange={(e) => setValR(Number(e.target.value))} style={{ ...inputStyle, width: 70 }} />
          </label>
          <label style={labelStyle}>
            Test
            <input type="number" step={0.1} min={0} max={1} value={testR}
              onChange={(e) => setTestR(Number(e.target.value))} style={{ ...inputStyle, width: 70 }} />
          </label>
          <button onClick={handleSplit} disabled={splitting} style={{ ...btnStyle, background: "#2563eb" }}>
            {splitting ? "Splitting..." : "Split Dataset"}
          </button>
        </div>
      </section>

      {/* Training Configuration */}
      <section style={{ ...cardStyle, marginTop: 16 }}>
        <h3 style={{ marginTop: 0 }}>New Training Session</h3>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <label style={labelStyle}>
            Session Name
            <input value={sessionName} onChange={(e) => setSessionName(e.target.value)}
              placeholder="e.g., baseline_v1" style={inputStyle} />
          </label>

          <label style={labelStyle}>
            Model
            <select value={modelType} onChange={(e) => setModelType(e.target.value)} style={inputStyle}>
              {MODEL_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </label>

          <label style={labelStyle}>
            Epochs
            <input type="number" value={config.epochs} min={1} max={1000}
              onChange={(e) => updateConfig("epochs", Number(e.target.value))} style={inputStyle} />
          </label>

          <label style={labelStyle}>
            Batch Size
            <input type="number" value={config.batch} min={1} max={128}
              onChange={(e) => updateConfig("batch", Number(e.target.value))} style={inputStyle} />
          </label>

          <label style={labelStyle}>
            Image Size
            <input type="number" value={config.imgsz} min={320} max={1280} step={32}
              onChange={(e) => updateConfig("imgsz", Number(e.target.value))} style={inputStyle} />
          </label>

          <label style={labelStyle}>
            Learning Rate
            <input type="number" value={config.lr0} min={0.0001} max={0.1} step={0.001}
              onChange={(e) => updateConfig("lr0", Number(e.target.value))} style={inputStyle} />
          </label>

          <label style={labelStyle}>
            Patience (Early Stop)
            <input type="number" value={config.patience} min={0} max={500}
              onChange={(e) => updateConfig("patience", Number(e.target.value))} style={inputStyle} />
          </label>

          <label style={labelStyle}>
            Workers
            <input type="number" value={config.workers} min={0} max={16}
              onChange={(e) => updateConfig("workers", Number(e.target.value))} style={inputStyle} />
          </label>

          <label style={labelStyle}>
            Mosaic
            <input type="number" value={config.mosaic ?? 0.5} min={0} max={1} step={0.1}
              onChange={(e) => updateConfig("mosaic", Number(e.target.value))} style={inputStyle} />
          </label>

          <label style={labelStyle}>
            Close Mosaic (last N epochs)
            <input type="number" value={config.close_mosaic ?? 0} min={0} max={100}
              onChange={(e) => updateConfig("close_mosaic", Number(e.target.value))} style={inputStyle} />
          </label>
        </div>

        <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
          <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <input type="checkbox" checked={config.cache} onChange={(e) => updateConfig("cache", e.target.checked)} />
            Cache (RAM)
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <input type="checkbox" checked={config.pretrained} onChange={(e) => updateConfig("pretrained", e.target.checked)} />
            Pretrained
          </label>
        </div>

        <button onClick={handleCreateAndStart} style={{ ...btnStyle, background: "#16a34a", marginTop: 16, padding: "10px 24px", fontSize: 15 }}>
          Start Training
        </button>
      </section>

      {/* Previous Sessions */}
      <section style={{ ...cardStyle, marginTop: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <h3 style={{ marginTop: 0, marginBottom: 0 }}>Previous Sessions</h3>
          <button
            onClick={handleDeleteSelected}
            disabled={deleting || selectedSessionIds.length === 0}
            style={{ ...btnStyle, background: "#b91c1c", opacity: deleting || selectedSessionIds.length === 0 ? 0.6 : 1 }}
          >
            Delete Selected ({selectedSessionIds.length})
          </button>
        </div>
        {sessions.length === 0 ? (
          <p style={{ color: "#888" }}>No training sessions yet.</p>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ textAlign: "left", borderBottom: "1px solid #444" }}>
                <th style={thStyle}>
                  <input
                    type="checkbox"
                    checked={sessions.length > 0 && selectedSessionIds.length === sessions.length}
                    onChange={(e) => toggleSelectAll(e.target.checked)}
                  />
                </th>
                <th style={thStyle}>Name</th>
                <th style={thStyle}>Model</th>
                <th style={thStyle}>Status</th>
                <th style={thStyle}>mAP50</th>
                <th style={thStyle}>Progress</th>
                <th style={thStyle}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {sessions.map((s) => (
                <tr key={s.id} style={{ borderBottom: "1px solid #333" }}>
                  <td style={tdStyle}>
                    <input
                      type="checkbox"
                      checked={selectedSessionIds.includes(s.id)}
                      onChange={(e) => toggleSessionSelection(s.id, e.target.checked)}
                    />
                  </td>
                  <td style={tdStyle}>{s.name ?? `Session ${s.id}`}</td>
                  <td style={tdStyle}>{s.model_type}</td>
                  <td style={tdStyle}>
                    <StatusBadge status={s.status} />
                  </td>
                  <td style={tdStyle}>{s.final_map50 != null ? (s.final_map50 * 100).toFixed(1) + "%" : "-"}</td>
                  <td style={tdStyle}>{s.progress.toFixed(0)}%</td>
                  <td style={{ ...tdStyle, display: "flex", gap: 8 }}>
                    <button onClick={() => navigate(`/projects/${pid}/monitoring/${s.id}`)} style={{ ...btnStyle, padding: "4px 8px", fontSize: 12 }}>
                      Monitor
                    </button>
                    <button
                      onClick={() => handleDeleteSession(s)}
                      disabled={deleting}
                      style={{ ...btnStyle, padding: "4px 8px", fontSize: 12, background: "#b91c1c", opacity: deleting ? 0.6 : 1 }}
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}

function StatBox({ label, value }: { label: string; value: number }) {
  return (
    <div style={{ textAlign: "center", padding: 12, background: "#222", borderRadius: 8 }}>
      <div style={{ fontSize: 22, fontWeight: 700, color: "#fff" }}>{value}</div>
      <div style={{ fontSize: 12, color: "#999" }}>{label}</div>
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
    <span style={{ padding: "3px 10px", borderRadius: 6, fontSize: 12, fontWeight: 600, background: colors[status] ?? "#666", color: "#fff" }}>
      {status.toUpperCase()}
    </span>
  );
}

const btnStyle: React.CSSProperties = { padding: "8px 16px", borderRadius: 8, border: "none", background: "#333", color: "#fff", cursor: "pointer", fontSize: 14, fontWeight: 500 };
const inputStyle: React.CSSProperties = { padding: "8px 12px", borderRadius: 8, border: "1px solid #444", background: "#1a1a1a", color: "#fff", fontSize: 15, width: "100%" };
const labelStyle: React.CSSProperties = { display: "flex", flexDirection: "column", gap: 5, fontSize: 14, color: "#ccc" };
const cardStyle: React.CSSProperties = { background: "#1a1a1a", borderRadius: 12, padding: 24, border: "1px solid #2a2a2a" };
const badgeStyle: React.CSSProperties = { padding: "3px 10px", borderRadius: 6, fontSize: 12, fontWeight: 700, background: "#7c3aed", color: "#fff" };
const thStyle: React.CSSProperties = { padding: "10px 8px", color: "#999" };
const tdStyle: React.CSSProperties = { padding: "10px 8px", color: "#e5e5e5" };
