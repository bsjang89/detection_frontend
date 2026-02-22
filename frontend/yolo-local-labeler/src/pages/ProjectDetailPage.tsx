import { useEffect, useState, useRef, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { projectsApi } from "../api/projects";
import { API_SERVER_URL } from "../api/client";
import type { ProjectWithStats, ImageInfo, ClassDef, DuplicateMode } from "../api/projects";

export default function ProjectDetailPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const pid = Number(projectId);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [project, setProject] = useState<ProjectWithStats | null>(null);
  const [images, setImages] = useState<ImageInfo[]>([]);
  const [classes, setClasses] = useState<ClassDef[]>([]);
  const [loading, setLoading] = useState(true);

  // Upload state
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadTotal, setUploadTotal] = useState(0);

  // New class form
  const [newClassName, setNewClassName] = useState("");
  const [newClassColor, setNewClassColor] = useState("#FF0000");

  useEffect(() => {
    loadData();
  }, [pid]);

  async function loadData() {
    setLoading(true);
    try {
      const [pRes, iRes, cRes] = await Promise.all([
        projectsApi.get(pid),
        projectsApi.listImages(pid),
        projectsApi.listClasses(pid),
      ]);
      setProject(pRes.data);
      setImages(iRes.data);
      setClasses(cRes.data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    const selectedFiles = Array.from(files);

    const existingNames = new Set(images.map((img) => img.filename.toLowerCase()));
    const duplicateCount = selectedFiles.filter((f) => existingNames.has(f.name.toLowerCase())).length;
    let duplicateMode: DuplicateMode = "rename";

    if (duplicateCount > 0) {
      const choice = window.prompt(`Same filename detected (${duplicateCount} files).\n1: Skip duplicates\n2: Rename and upload (name(1).ext)\nEnter 1 or 2`, "2");
      if (choice === null) {
        if (fileInputRef.current) fileInputRef.current.value = "";
        return;
      }
      duplicateMode = choice.trim() === "1" ? "skip" : "rename";
    }

    setUploading(true);
    setUploadProgress(0);
    setUploadTotal(selectedFiles.length);

    try {
      const uploadRes = await projectsApi.uploadImages(pid, selectedFiles, (progress) => {
        setUploadProgress(progress);
      }, duplicateMode);

      const uploadedCount = uploadRes.data.filter((r) => (r.status ?? "uploaded") === "uploaded").length;
      const skippedCount = uploadRes.data.filter((r) => r.status === "skipped").length;
      const renamedCount = uploadRes.data.filter((r) => !!r.renamed_from).length;

      await loadData();
      if (duplicateCount > 0 || skippedCount > 0 || renamedCount > 0) {
        alert(`Upload complete\nUploaded: ${uploadedCount}\nRenamed: ${renamedCount}\nSkipped: ${skippedCount}`);
      }
    } catch (err) {
      alert("Upload failed");
      console.error(err);
    } finally {
      setUploading(false);
      setUploadProgress(0);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function handleAddClass() {
    if (!newClassName.trim()) return;
    const nextId = classes.length > 0 ? Math.max(...classes.map((c) => c.class_id)) + 1 : 0;
    try {
      await projectsApi.createClass(pid, {
        class_id: nextId,
        class_name: newClassName.trim(),
        color: newClassColor,
      });
      setNewClassName("");
      await loadData();
    } catch (e) {
      alert("클래스 추가 실패");
      console.error(e);
    }
  }

  function thumbnailUrl(img: ImageInfo) {
    const relativePath = (img.thumbnail_path ?? img.file_path).replace(/\\/g, "/");
    return `${API_SERVER_URL}/${relativePath}`;
  }

  if (loading) return <div style={{ padding: 24, color: "#e5e5e5" }}>Loading...</div>;
  if (!project) return <div style={{ padding: 24, color: "#e5e5e5" }}>Project not found</div>;

  return (
    <div style={{ maxWidth: 1200, margin: "0 auto", padding: 24, color: "#e5e5e5", fontSize: 16, lineHeight: 1.4 }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
        <button onClick={() => navigate("/")} style={btnStyle}>Projects</button>
        <h1 style={{ margin: 0, flex: 1, color: "#fff" }}>{project.name}</h1>
        <span style={badgeStyle(project.task_type)}>{project.task_type.toUpperCase()}</span>
        <button onClick={() => navigate(`/projects/${pid}/labeling`)} style={{ ...btnStyle, background: "#0891b2" }}>
          Labeling
        </button>
        <button onClick={() => navigate(`/projects/${pid}/training`)} style={{ ...btnStyle, background: "#7c3aed" }}>
          Training
        </button>
      </div>

      {project.description && (
        <p style={{ color: "#aaa", marginBottom: 16 }}>{project.description}</p>
      )}

      {/* Stats */}
      <div style={{ ...cardStyle, marginBottom: 16 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 12 }}>
          <StatBox label="Images" value={project.total_images} />
          <StatBox label="Labeled" value={project.labeled_images} />
          <StatBox label="Classes" value={project.total_classes} />
          <StatBox label="Train" value={project.train_images} />
          <StatBox label="Val" value={project.val_images} />
          <StatBox label="Test" value={project.test_images} />
        </div>
      </div>

      {/* Upload Progress */}
      {uploading && (
        <div style={{ ...cardStyle, marginBottom: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
            <span style={{ color: "#ccc", fontSize: 15 }}>
              Uploading {uploadTotal} images...
            </span>
            <span style={{ color: "#fff", fontWeight: 700, fontSize: 15 }}>
              {uploadProgress}%
            </span>
          </div>
          <div style={{ height: 10, background: "#333", borderRadius: 5, overflow: "hidden" }}>
            <div
              style={{
                height: "100%",
                width: `${uploadProgress}%`,
                background: "linear-gradient(90deg, #2563eb, #7c3aed)",
                borderRadius: 5,
                transition: "width 0.2s ease",
              }}
            />
          </div>
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 300px", gap: 16 }}>
        {/* Images */}
        <section style={cardStyle}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <h3 style={{ margin: 0, color: "#fff" }}>Images ({images.length})</h3>
            <div>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept="image/*"
                onChange={handleUpload}
                style={{ display: "none" }}
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                style={{ ...btnStyle, background: "#2563eb" }}
              >
                {uploading ? "Uploading..." : "+ Upload Images"}
              </button>
            </div>
          </div>

          {images.length === 0 ? (
            <p style={{ color: "#888" }}>No images yet. Upload images to get started.</p>
          ) : (
            <VirtualImageList images={images} thumbnailUrl={thumbnailUrl} />
          )}
        </section>

        {/* Right sidebar */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {/* Classes */}
          <section style={cardStyle}>
            <h3 style={{ margin: "0 0 12px", color: "#fff" }}>Classes ({classes.length})</h3>

            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 }}>
              {classes.map((c) => (
                <div key={c.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: 8, background: "#2a2a2a", borderRadius: 6 }}>
                  <div style={{ width: 16, height: 16, borderRadius: 4, background: c.color ?? "#888", flexShrink: 0 }} />
                  <span style={{ fontSize: 15, color: "#e5e5e5", flex: 1 }}>{c.class_name}</span>
                  <span style={{ fontSize: 13, color: "#888" }}>ID: {c.class_id}</span>
                </div>
              ))}
              {classes.length === 0 && (
                <p style={{ color: "#888", fontSize: 15 }}>No classes defined yet.</p>
              )}
            </div>

            <div style={{ borderTop: "1px solid #444", paddingTop: 12 }}>
              <div style={{ display: "flex", gap: 6 }}>
                <input
                  value={newClassName}
                  onChange={(e) => setNewClassName(e.target.value)}
                  placeholder="Class name"
                  style={{ ...inputStyle, flex: 1 }}
                  onKeyDown={(e) => e.key === "Enter" && handleAddClass()}
                />
                <input
                  type="color"
                  value={newClassColor}
                  onChange={(e) => setNewClassColor(e.target.value)}
                  style={{ width: 36, height: 32, border: "none", cursor: "pointer", borderRadius: 4 }}
                />
              </div>
              <button onClick={handleAddClass} style={{ ...btnStyle, background: "#16a34a", width: "100%", marginTop: 8 }}>
                + Add Class
              </button>
            </div>
          </section>

          {/* Labeling Guide */}
          <section style={cardStyle}>
            <h3 style={{ margin: "0 0 8px", color: "#fff" }}>Labeling</h3>
            <p style={{ fontSize: 15, color: "#aaa", lineHeight: 1.6, margin: "0 0 12px" }}>
              이미지를 업로드한 뒤 레이블링을 시작하세요.
              어노테이션은 서버에 자동 저장됩니다.
            </p>
            <button
              onClick={() => navigate(`/projects/${pid}/labeling`)}
              style={{ ...btnStyle, background: "#0891b2", width: "100%" }}
            >
              Open Labeler
            </button>
          </section>

          {/* Quick Actions */}
          <section style={cardStyle}>
            <h3 style={{ margin: "0 0 8px", color: "#fff" }}>Actions</h3>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <button
                onClick={() => navigate(`/projects/${pid}/training`)}
                style={{ ...btnStyle, background: "#7c3aed", width: "100%" }}
              >
                Training
              </button>
              <button
                onClick={() => navigate("/compare")}
                style={{ ...btnStyle, background: "#2563eb", width: "100%" }}
              >
                Compare Models
              </button>
              <button
                onClick={() => navigate("/report")}
                style={{ ...btnStyle, background: "#059669", width: "100%" }}
              >
                Generate Report
              </button>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

const ITEM_HEIGHT = 64;
const LIST_HEIGHT = 600;
const OVERSCAN = 5;

function VirtualImageList({ images, thumbnailUrl }: { images: ImageInfo[]; thumbnailUrl: (img: ImageInfo) => string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);

  const totalHeight = images.length * ITEM_HEIGHT;
  const startIdx = Math.max(0, Math.floor(scrollTop / ITEM_HEIGHT) - OVERSCAN);
  const endIdx = Math.min(images.length, Math.ceil((scrollTop + LIST_HEIGHT) / ITEM_HEIGHT) + OVERSCAN);
  const offsetY = startIdx * ITEM_HEIGHT;

  const handleScroll = useCallback(() => {
    if (containerRef.current) {
      setScrollTop(containerRef.current.scrollTop);
    }
  }, []);

  return (
    <div
      ref={containerRef}
      onScroll={handleScroll}
      style={{ height: LIST_HEIGHT, overflow: "auto" }}
    >
      <div style={{ height: totalHeight, position: "relative" }}>
        <div style={{ position: "absolute", top: offsetY, left: 0, right: 0 }}>
          {images.slice(startIdx, endIdx).map((img) => (
            <div
              key={img.id}
              style={{
                height: ITEM_HEIGHT,
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "8px 4px",
                borderBottom: "1px solid #333",
              }}
            >
              <img
                src={thumbnailUrl(img)}
                alt={img.filename}
                style={{
                  width: 64,
                  height: 48,
                  objectFit: "cover",
                  borderRadius: 4,
                  background: "#333",
                  flexShrink: 0,
                }}
                loading="lazy"
              />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  fontSize: 15,
                  color: "#e5e5e5",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}>
                  {img.filename}
                </div>
                <div style={{ fontSize: 13, color: "#888" }}>
                  {img.width}x{img.height} &middot; {img.annotation_count} annotations
                </div>
              </div>
              <span style={splitBadge(img.split_type)}>{img.split_type}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function StatBox({ label, value }: { label: string; value: number }) {
  return (
    <div style={{ textAlign: "center", padding: 10, background: "#2a2a2a", borderRadius: 8 }}>
      <div style={{ fontSize: 24, fontWeight: 700, color: "#fff" }}>{value}</div>
      <div style={{ fontSize: 13, color: "#999" }}>{label}</div>
    </div>
  );
}

function badgeStyle(type: string): React.CSSProperties {
  return { padding: "3px 10px", borderRadius: 4, fontSize: 13, fontWeight: 700, background: type === "obb" ? "#7c3aed" : "#2563eb", color: "#fff" };
}

function splitBadge(split: string): React.CSSProperties {
  const colors: Record<string, string> = { train: "#16a34a", val: "#2563eb", test: "#ca8a04", unlabeled: "#555" };
  return { padding: "3px 8px", borderRadius: 4, fontSize: 12, fontWeight: 600, background: colors[split] ?? "#555", color: "#fff" };
}

const btnStyle: React.CSSProperties = { padding: "10px 18px", borderRadius: 8, border: "none", background: "#333", color: "#fff", cursor: "pointer", fontSize: 16, fontWeight: 500 };
const inputStyle: React.CSSProperties = { padding: "10px 14px", borderRadius: 8, border: "1px solid #444", background: "#1a1a1a", color: "#fff", fontSize: 16 };
const cardStyle: React.CSSProperties = { background: "#1a1a1a", borderRadius: 12, padding: 24, border: "1px solid #2a2a2a" };

