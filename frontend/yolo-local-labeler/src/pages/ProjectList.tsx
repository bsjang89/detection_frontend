import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { projectsApi } from "../api/projects";
import type { ProjectWithStats, TaskType } from "../api/projects";
import RoundedSelect from "../components/RoundedSelect";

export default function ProjectList() {
  const navigate = useNavigate();
  const [projects, setProjects] = useState<ProjectWithStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newType, setNewType] = useState<TaskType>("bbox");

  useEffect(() => {
    loadProjects();
  }, []);

  async function loadProjects() {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await projectsApi.list();
      setProjects(res.data);
    } catch (e) {
      console.error("Failed to load projects", e);
      const detail = axios.isAxiosError(e) ? e.response?.data?.detail : undefined;
      setLoadError(detail ?? "Failed to load projects");
    } finally {
      setLoading(false);
    }
  }

  async function handleCreate() {
    if (!newName.trim()) return;
    try {
      const res = await projectsApi.create({
        name: newName.trim(),
        description: newDesc.trim() || undefined,
        task_type: newType,
      });
      setProjects((prev) => [...prev, res.data]);
      setShowCreate(false);
      setNewName("");
      setNewDesc("");
    } catch (e) {
      const detail = axios.isAxiosError(e) ? e.response?.data?.detail : undefined;
      alert(detail ? `Failed to create project: ${detail}` : "Failed to create project");
    }
  }

  async function handleDelete(id: number) {
    if (!confirm("Delete this project? This cannot be undone.")) return;
    try {
      await projectsApi.delete(id);
      setProjects((prev) => prev.filter((p) => p.id !== id));
    } catch (e) {
      alert("Failed to delete project");
    }
  }

  return (
    <div className="page-shell" style={{ maxWidth: 1240 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <h1 style={{ margin: 0 }}>Detection</h1>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={() => setShowCreate(true)} style={{ ...btnStyle, background: "linear-gradient(135deg, #0ea5e9, #22d3ee)" }}>
            + New Project
          </button>
        </div>
      </div>

      {showCreate && (
        <div style={cardStyle}>
          <h3 style={{ marginTop: 0 }}>Create Project</h3>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <input
              placeholder="Project name"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              style={inputStyle}
            />
            <input
              placeholder="Description (optional)"
              value={newDesc}
              onChange={(e) => setNewDesc(e.target.value)}
              style={inputStyle}
            />
            <RoundedSelect
              value={newType}
              onChange={(value) => setNewType(value as TaskType)}
              options={[
                { value: "bbox", label: "BBox (Standard Detection)" },
                { value: "obb", label: "OBB (Oriented Bounding Box)" },
              ]}
              style={inputStyle}
            />
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={handleCreate} style={{ ...btnStyle, background: "linear-gradient(135deg, #10b981, #34d399)" }}>
                Create
              </button>
              <button onClick={() => setShowCreate(false)} style={btnStyle}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {loading ? (
        <p>Loading...</p>
      ) : loadError ? (
        <p style={{ color: "#ef4444" }}>{loadError}</p>
      ) : projects.length === 0 ? (
        <p style={{ color: "#888" }}>No projects yet. Create one to get started.</p>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(340, 1fr))", gap: 16 }}>
          {projects.map((p) => (
            <div key={p.id} style={cardStyle}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div>
                  <h3 style={{ margin: "0 0 4px" }}>{p.name}</h3>
                  {p.description && <p style={{ margin: "0 0 8px", color: "#aaa", fontSize: 14 }}>{p.description}</p>}
                </div>
                <span style={badgeStyle(p.task_type)}>{p.task_type.toUpperCase()}</span>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6, margin: "12px 0" }}>
                <Stat label="Images" value={p.total_images} />
                <Stat label="Labeled" value={p.labeled_images} />
                <Stat label="Classes" value={p.total_classes} />
                <Stat label="Train" value={p.train_images} />
                <Stat label="Val" value={p.val_images} />
                <Stat label="Test" value={p.test_images} />
              </div>

              <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                <button onClick={() => navigate(`/projects/${p.id}`)} style={{ ...btnStyle, flex: 1 }}>
                  Open
                </button>
                <button
                  onClick={() => navigate(`/projects/${p.id}/training`)}
                  style={{
                    ...btnStyle,
                    flex: 1,
                    borderColor: "rgba(56, 189, 248, 0.55)",
                    background: "linear-gradient(135deg, #38bdf8 0%, #0ea5e9 45%, #0369a1 100%)",
                    boxShadow: "none",
                  }}
                >
                  Train
                </button>
                <button
                  onClick={() => handleDelete(p.id)}
                  style={{
                    ...btnStyle,
                    borderColor: "rgba(248, 113, 113, 0.65)",
                    background: "linear-gradient(135deg, #ef4444 0%, #dc2626 45%, #991b1b 100%)",
                    boxShadow: "none",
                  }}
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div style={{ color: "#cbd5e1", fontSize: 14 }}>{label}</div>
      <div style={{ fontWeight: 700, fontSize: 20, color: "#fff" }}>{value}</div>
    </div>
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
  boxShadow: "none",
};

const inputStyle: React.CSSProperties = {
  padding: "12px 14px",
  borderRadius: 10,
  border: "1px solid var(--line)",
  background: "rgba(15, 23, 42, 0.88)",
  color: "var(--text-0)",
  fontSize: 16,
};

const cardStyle: React.CSSProperties = {
  background: "linear-gradient(165deg, rgba(20, 30, 56, 0.86), rgba(12, 20, 38, 0.86))",
  borderRadius: 16,
  padding: 24,
  border: "1px solid var(--line)",
  boxShadow: "var(--shadow-1)",
  backdropFilter: "blur(6px)",
  marginBottom: 16,
};

function badgeStyle(type: string): React.CSSProperties {
  return {
    padding: "3px 10px",
    borderRadius: 6,
    fontSize: 12,
    fontWeight: 700,
    background: type === "obb" ? "#0ea5e9" : "#2563eb",
    color: "#fff",
  };
}
