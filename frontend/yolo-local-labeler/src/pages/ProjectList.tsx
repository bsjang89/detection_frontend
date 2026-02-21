import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { projectsApi } from "../api/projects";
import type { ProjectWithStats, TaskType } from "../api/projects";

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
    <div style={{ maxWidth: 1200, margin: "0 auto", padding: 24 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <h1 style={{ margin: 0 }}>Projects</h1>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={() => navigate("/labeling")} style={btnStyle}>
            Labeler (Local)
          </button>
          <button onClick={() => setShowCreate(true)} style={{ ...btnStyle, background: "#2563eb" }}>
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
            <select value={newType} onChange={(e) => setNewType(e.target.value as TaskType)} style={inputStyle}>
              <option value="bbox">BBox (Standard Detection)</option>
              <option value="obb">OBB (Oriented Bounding Box)</option>
            </select>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={handleCreate} style={{ ...btnStyle, background: "#16a34a" }}>
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
                <button onClick={() => navigate(`/projects/${p.id}/training`)} style={{ ...btnStyle, flex: 1, background: "#7c3aed" }}>
                  Train
                </button>
                <button onClick={() => handleDelete(p.id)} style={{ ...btnStyle, background: "#dc2626" }}>
                  Del
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
      <div style={{ color: "#999", fontSize: 12 }}>{label}</div>
      <div style={{ fontWeight: 600, fontSize: 16, color: "#fff" }}>{value}</div>
    </div>
  );
}

const btnStyle: React.CSSProperties = {
  padding: "8px 16px",
  borderRadius: 8,
  border: "none",
  background: "#333",
  color: "#fff",
  cursor: "pointer",
  fontSize: 14,
  fontWeight: 500,
};

const inputStyle: React.CSSProperties = {
  padding: "10px 14px",
  borderRadius: 8,
  border: "1px solid #444",
  background: "#1a1a1a",
  color: "#fff",
  fontSize: 15,
};

const cardStyle: React.CSSProperties = {
  background: "#1a1a1a",
  borderRadius: 12,
  padding: 24,
  border: "1px solid #2a2a2a",
  marginBottom: 16,
};

function badgeStyle(type: string): React.CSSProperties {
  return {
    padding: "3px 10px",
    borderRadius: 6,
    fontSize: 12,
    fontWeight: 700,
    background: type === "obb" ? "#7c3aed" : "#2563eb",
    color: "#fff",
  };
}
