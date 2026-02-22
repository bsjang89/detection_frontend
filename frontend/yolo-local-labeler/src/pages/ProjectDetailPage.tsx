import { useEffect, useState, useRef, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { createPortal } from "react-dom";
import { projectsApi } from "../api/projects";
import { API_SERVER_URL } from "../api/client";
import type { ProjectWithStats, ImageInfo, ClassDef, DuplicateMode } from "../api/projects";

export default function ProjectDetailPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const pid = Number(projectId);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dropDepthRef = useRef(0);

  const [project, setProject] = useState<ProjectWithStats | null>(null);
  const [images, setImages] = useState<ImageInfo[]>([]);
  const [classes, setClasses] = useState<ClassDef[]>([]);
  const [loading, setLoading] = useState(true);

  // Upload state
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadTotal, setUploadTotal] = useState(0);
  const [isDropOver, setIsDropOver] = useState(false);

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

  async function handleUploadFiles(selectedFiles: File[]) {
    if (selectedFiles.length === 0) return;

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

  function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    void handleUploadFiles(Array.from(files));
  }

  function handleDropZoneDragEnter(e: React.DragEvent<HTMLElement>) {
    e.preventDefault();
    e.stopPropagation();
    if (uploading) return;
    dropDepthRef.current += 1;
    setIsDropOver(true);
  }

  function handleDropZoneDragOver(e: React.DragEvent<HTMLElement>) {
    e.preventDefault();
    e.stopPropagation();
    if (uploading) return;
    e.dataTransfer.dropEffect = "copy";
    if (!isDropOver) setIsDropOver(true);
  }

  function handleDropZoneDragLeave(e: React.DragEvent<HTMLElement>) {
    e.preventDefault();
    e.stopPropagation();
    if (uploading) return;
    dropDepthRef.current = Math.max(0, dropDepthRef.current - 1);
    if (dropDepthRef.current === 0) setIsDropOver(false);
  }

  async function handleDropZoneDrop(e: React.DragEvent<HTMLElement>) {
    e.preventDefault();
    e.stopPropagation();
    dropDepthRef.current = 0;
    setIsDropOver(false);
    if (uploading) return;
    const dropped = Array.from(e.dataTransfer.files ?? []).filter((f) => f.type.startsWith("image/"));
    if (dropped.length === 0) {
      alert("Drop image files only.");
      return;
    }
    await handleUploadFiles(dropped);
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
      alert("?대옒??異붽? ?ㅽ뙣");
      console.error(e);
    }
  }

  function imagePreviewUrls(img: ImageInfo): string[] {
    const candidates = [img.thumbnail_path, img.viewer_path, img.file_path].filter(
      (v): v is string => Boolean(v)
    );
    const seen = new Set<string>();
    return candidates
      .map((p) => p.replace(/\\/g, "/"))
      .filter((p) => {
        if (seen.has(p)) return false;
        seen.add(p);
        return true;
      })
      .map((p) => `${API_SERVER_URL}/${encodeURI(p)}`);
  }

  if (loading) return <div style={{ padding: 24, color: "#e5e5e5" }}>Loading...</div>;
  if (!project) return <div style={{ padding: 24, color: "#e5e5e5" }}>Project not found</div>;

  return (
    <div className="page-shell" style={{ maxWidth: 1260, color: "var(--text-0)", fontSize: 16, lineHeight: 1.4 }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
        <button onClick={() => navigate("/")} style={btnStyle}>Projects</button>
        <h1 style={{ margin: 0, flex: 1, color: "#fff" }}>{project.name}</h1>
        <div style={taskTypeWrapStyle}>
          <span style={taskTypeDotStyle(project.task_type)} />
          <div style={{ display: "flex", flexDirection: "column", lineHeight: 1.15 }}>
            <span style={{ fontSize: 11, color: "var(--text-2)", letterSpacing: 0.4 }}>TASK</span>
            <span style={{ fontSize: 14, fontWeight: 800, color: "var(--text-0)" }}>{project.task_type.toUpperCase()}</span>
          </div>
        </div>
        <button
          onClick={() => navigate(`/projects/${pid}/labeling`)}
          style={{ ...btnStyle, background: "linear-gradient(135deg, #0ea5e9, #22d3ee)", minWidth: 132 }}
        >
          Labeling
        </button>
        <button
          onClick={() => navigate(`/projects/${pid}/training`)}
          style={{ ...btnStyle, background: "linear-gradient(135deg, #0284c7, #0ea5e9)", minWidth: 132 }}
        >
          Training
        </button>
      </div>

      <section style={{ ...cardStyle, marginBottom: 16, padding: "14px 18px" }}>
        <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: 0.5, color: "var(--text-2)", marginBottom: 6 }}>
          Description
        </div>
        <p style={{ margin: 0, color: "var(--text-1)", fontSize: 15, lineHeight: 1.5 }}>
          {project.description?.trim() || "No description provided for this project."}
        </p>
      </section>

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
                background: "linear-gradient(90deg, #0ea5e9, #22d3ee)",
                borderRadius: 5,
                transition: "width 0.2s ease",
              }}
            />
          </div>
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 300px", gap: 16 }}>
        {/* Images */}
        <section
          style={{
            ...cardStyle,
            border: isDropOver ? "1px solid var(--line-strong)" : "1px solid var(--line)",
            boxShadow: "none",
            background: isDropOver
              ? "linear-gradient(165deg, rgba(12, 44, 74, 0.9), rgba(10, 32, 58, 0.9))"
              : cardStyle.background,
            transition: "border-color 0.16s ease, box-shadow 0.16s ease, background 0.16s ease",
          }}
          onDragEnter={handleDropZoneDragEnter}
          onDragOver={handleDropZoneDragOver}
          onDragLeave={handleDropZoneDragLeave}
          onDrop={handleDropZoneDrop}
        >
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
                style={{ ...btnStyle, background: "linear-gradient(135deg, #2563eb, #0ea5e9)" }}
              >
                {uploading ? "Uploading..." : "+ Upload Images"}
              </button>
            </div>
          </div>
          <div style={{ marginTop: -4, marginBottom: 12, fontSize: 14, color: isDropOver ? "#7dd3fc" : "#94a3b8" }}>
            {isDropOver ? "Drop images to upload" : "Tip: Click upload button or drag and drop images into this panel."}
          </div>

          {images.length === 0 ? (
            <p style={{ color: "#888" }}>No images yet. Upload images to get started.</p>
          ) : (
            <VirtualImageList images={images} imagePreviewUrls={imagePreviewUrls} />
          )}
        </section>

        {/* Right sidebar */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {/* Classes */}
          <section style={{ ...cardStyle, padding: 18 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 10 }}>
              <h3 style={{ margin: 0, color: "#fff", fontSize: 20 }}>Classes</h3>
              <div style={{ fontSize: 13, fontWeight: 800, color: "#dbeafe", background: "rgba(37, 99, 235, 0.24)", border: "1px solid rgba(125, 211, 252, 0.4)", borderRadius: 999, padding: "4px 10px" }}>
                {classes.length} items
              </div>
            </div>
            <div style={{ fontSize: 13, color: "#94a3b8", marginBottom: 12 }}>
              Training labels used in annotation and inference mapping.
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 14, maxHeight: 240, overflow: "auto", paddingRight: 2 }}>
              {classes.map((c) => (
                <div
                  key={c.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "10px 11px",
                    background: "linear-gradient(180deg, rgba(30, 41, 59, 0.72), rgba(15, 23, 42, 0.72))",
                    borderRadius: 12,
                    border: "1px solid rgba(125, 211, 252, 0.25)",
                  }}
                >
                  <div
                    style={{
                      width: 20,
                      height: 20,
                      borderRadius: 3,
                      background: c.color ?? "#888",
                      border: "1px solid rgba(255,255,255,0.72)",
                      boxShadow: "inset 0 0 0 1px rgba(2,8,23,0.25)",
                      flexShrink: 0,
                    }}
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 15, color: "#e5e7eb", fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {c.class_name}
                    </div>
                    <div style={{ fontSize: 12, color: "#93c5fd" }}>Class ID: {c.class_id}</div>
                  </div>
                  <div style={{ fontSize: 12, fontWeight: 800, color: "#cffafe", background: "rgba(8, 47, 73, 0.75)", border: "1px solid rgba(125, 211, 252, 0.35)", borderRadius: 999, padding: "4px 8px" }}>
                    #{c.class_id}
                  </div>
                </div>
              ))}
              {classes.length === 0 && (
                <div style={{ border: "1px dashed rgba(148, 163, 184, 0.35)", borderRadius: 12, padding: 12, color: "#94a3b8", fontSize: 14 }}>
                  No classes defined yet.
                </div>
              )}
            </div>

            <div style={{ borderTop: "1px solid var(--line)", paddingTop: 12 }}>
              <div style={{ fontSize: 12, color: "#93c5fd", marginBottom: 8, fontWeight: 700 }}>Add New Class</div>
              <div style={{ display: "flex", gap: 8 }}>
                <input
                  value={newClassName}
                  onChange={(e) => setNewClassName(e.target.value)}
                  placeholder="Class name (e.g. Tote, NG)"
                  style={{ ...inputStyle, flex: 1, fontSize: 15, padding: "10px 12px" }}
                  onKeyDown={(e) => e.key === "Enter" && handleAddClass()}
                />
                <label
                  title="Class color"
                  style={{
                    position: "relative",
                    width: 46,
                    height: 46,
                    borderRadius: 14,
                    border: "1px solid rgba(125, 211, 252, 0.38)",
                    background: "linear-gradient(180deg, rgba(15, 23, 42, 0.95), rgba(8, 15, 30, 0.95))",
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    cursor: "pointer",
                    boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.06)",
                  }}
                >
                  <div
                    style={{
                      width: 30,
                      height: 30,
                      borderRadius: 3,
                      border: "1px solid rgba(255,255,255,0.72)",
                      boxShadow: "inset 0 0 0 1px rgba(2,8,23,0.25)",
                      background: newClassColor,
                    }}
                  />
                  <input
                    type="color"
                    value={newClassColor}
                    onChange={(e) => setNewClassColor(e.target.value)}
                    style={{
                      position: "absolute",
                      inset: 0,
                      width: "100%",
                      height: "100%",
                      opacity: 0,
                      border: "none",
                      padding: 0,
                      cursor: "pointer",
                    }}
                  />
                </label>
              </div>
              <button onClick={handleAddClass} style={{ ...btnStyle, background: "linear-gradient(135deg, #0891b2, #10b981)", width: "100%", marginTop: 9 }}>
                + Add Class
              </button>
            </div>
          </section>
          {/* Quick Actions */}
          <section style={cardStyle}>
            <h3 style={{ margin: "0 0 8px", color: "#fff" }}>Actions</h3>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <button
                onClick={() => navigate("/compare")}
                style={{ ...btnStyle, background: "linear-gradient(135deg, #2563eb, #0ea5e9)", width: "100%" }}
              >
                Compare Models
              </button>
              <button
                onClick={() => navigate("/report")}
                style={{ ...btnStyle, background: "linear-gradient(135deg, #059669, #10b981)", width: "100%" }}
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

const LIST_HEIGHT = 600;

function VirtualImageList({
  images,
  imagePreviewUrls,
}: {
  images: ImageInfo[];
  imagePreviewUrls: (img: ImageInfo) => string[];
}) {
  const [hoveredImageId, setHoveredImageId] = useState<number | null>(null);
  const [imageUrlFallbackIndexById, setImageUrlFallbackIndexById] = useState<Record<number, number>>({});
  const [hoverPreview, setHoverPreview] = useState<{
    image: ImageInfo;
    x: number;
    y: number;
  } | null>(null);

  const handleHoverMove = useCallback((event: React.MouseEvent<HTMLDivElement>, image: ImageInfo) => {
    setHoverPreview({
      image,
      x: event.clientX,
      y: event.clientY,
    });
  }, []);

  const previewSize = 220;
  const previewHeight = 148;
  const viewportWidth = typeof window !== "undefined" ? window.innerWidth : 1920;
  const viewportHeight = typeof window !== "undefined" ? window.innerHeight : 1080;
  const cursorGap = 14;
  let previewLeft = 0;
  let previewTop = 0;
  if (hoverPreview) {
    previewLeft = hoverPreview.x + cursorGap;
    previewTop = hoverPreview.y + cursorGap;

    if (previewLeft + previewSize + 10 > viewportWidth) {
      previewLeft = hoverPreview.x - previewSize - cursorGap;
    }
    if (previewTop + previewHeight + 10 > viewportHeight) {
      previewTop = hoverPreview.y - previewHeight - cursorGap;
    }

    previewLeft = Math.min(viewportWidth - previewSize - 10, Math.max(10, previewLeft));
    previewTop = Math.min(viewportHeight - previewHeight - 10, Math.max(10, previewTop));
  }

  return (
    <>
      <div
        style={{ height: LIST_HEIGHT, overflow: "auto", overflowX: "visible", position: "relative", zIndex: 1 }}
      >
        {images.map((img) => {
          const isHovered = hoveredImageId === img.id;
          const urls = imagePreviewUrls(img);
          const fallbackIndex = imageUrlFallbackIndexById[img.id] ?? 0;
          const resolvedIndex = Math.min(fallbackIndex, Math.max(0, urls.length - 1));
          const currentUrl = urls[resolvedIndex] ?? "";
          return (
            <div
              key={img.id}
              onMouseEnter={(e) => {
                setHoveredImageId(img.id);
                handleHoverMove(e, img);
              }}
              onMouseMove={(e) => handleHoverMove(e, img)}
              onMouseLeave={() => {
                setHoveredImageId((prev) => (prev === img.id ? null : prev));
                setHoverPreview((prev) => (prev?.image.id === img.id ? null : prev));
              }}
              style={{
                minHeight: 68,
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "8px 6px",
                borderBottom: "1px solid var(--line)",
                borderRadius: 10,
                background: isHovered ? "rgba(14, 165, 233, 0.11)" : "transparent",
                border: isHovered ? "1px solid var(--line-strong)" : "1px solid transparent",
                boxSizing: "border-box",
                position: "relative",
                zIndex: isHovered ? 2 : 1,
                transition: "background 0.16s ease, border-color 0.16s ease",
              }}
            >
              <div style={{ width: 64, height: 48, position: "relative", flexShrink: 0 }}>
                {currentUrl ? (
                  <img
                    src={currentUrl}
                    alt={img.filename}
                    onError={() => {
                      setImageUrlFallbackIndexById((prev) => {
                        const cur = prev[img.id] ?? 0;
                        if (cur >= urls.length - 1) return prev;
                        return { ...prev, [img.id]: cur + 1 };
                      });
                    }}
                    style={{
                      width: 64,
                      height: 48,
                      objectFit: "cover",
                      borderRadius: 6,
                      background: "rgba(30, 41, 59, 0.45)",
                      border: "1px solid rgba(148, 163, 184, 0.35)",
                      transform: isHovered ? "scale(1.12)" : "scale(1)",
                      transformOrigin: "left center",
                      transition: "transform 0.2s ease, box-shadow 0.2s ease, border-color 0.2s ease",
                      boxShadow: isHovered ? "0 10px 24px rgba(2, 8, 23, 0.45)" : "none",
                    }}
                    loading="lazy"
                  />
                ) : (
                  <div
                    style={{
                      width: 64,
                      height: 48,
                      borderRadius: 6,
                      border: "1px dashed rgba(148, 163, 184, 0.45)",
                      background: "rgba(15, 23, 42, 0.65)",
                    }}
                  />
                )}
              </div>

              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  fontSize: 15,
                  color: "#e5e5e5",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                  fontWeight: isHovered ? 700 : 600,
                }}>
                  {img.filename}
                </div>
                <div style={{ fontSize: 14, color: "#94a3b8" }}>
                  {img.width}x{img.height} &middot; {img.annotation_count} annotations
                </div>
              </div>
              <span style={splitBadge(img.split_type)}>{img.split_type}</span>
            </div>
          );
        })}
      </div>
      {hoverPreview && typeof document !== "undefined" && createPortal(
        <div
          style={{
            position: "fixed",
            left: previewLeft,
            top: previewTop,
            width: previewSize,
            pointerEvents: "none",
            background: "rgba(7, 13, 26, 0.96)",
            border: "1px solid var(--line-strong)",
            borderRadius: 12,
            padding: 8,
            boxShadow: "0 18px 38px rgba(2, 8, 23, 0.55)",
            backdropFilter: "blur(4px)",
            zIndex: 9999,
          }}
        >
          {(() => {
            const previewUrls = imagePreviewUrls(hoverPreview.image);
            const previewFallbackIndex = imageUrlFallbackIndexById[hoverPreview.image.id] ?? 0;
            const previewResolvedIndex = Math.min(previewFallbackIndex, Math.max(0, previewUrls.length - 1));
            const previewUrl = previewUrls[previewResolvedIndex] ?? "";
            return previewUrl ? (
              <img
                src={previewUrl}
                alt={`${hoverPreview.image.filename} preview`}
                onError={() => {
                  setImageUrlFallbackIndexById((prev) => {
                    const cur = prev[hoverPreview.image.id] ?? 0;
                    if (cur >= previewUrls.length - 1) return prev;
                    return { ...prev, [hoverPreview.image.id]: cur + 1 };
                  });
                }}
                style={{ width: "100%", height: 132, objectFit: "cover", borderRadius: 8, display: "block" }}
              />
            ) : (
              <div
                style={{
                  width: "100%",
                  height: 132,
                  borderRadius: 8,
                  border: "1px dashed rgba(148, 163, 184, 0.45)",
                  background: "rgba(15, 23, 42, 0.7)",
                }}
              />
            );
          })()}
        </div>,
        document.body
        )}
    </>
  );
}

function StatBox({ label, value }: { label: string; value: number }) {
  return (
    <div style={{ textAlign: "center", padding: 10, background: "rgba(30, 41, 59, 0.5)", borderRadius: 10, border: "1px solid var(--line)" }}>
      <div style={{ fontSize: 24, fontWeight: 700, color: "#fff" }}>{value}</div>
      <div style={{ fontSize: 14, color: "#cbd5e1" }}>{label}</div>
    </div>
  );
}

function taskTypeDotStyle(type: string): React.CSSProperties {
  return {
    width: 12,
    height: 12,
    borderRadius: 99,
    background: type === "obb" ? "#22d3ee" : "#60a5fa",
    boxShadow: type === "obb" ? "0 0 14px rgba(34, 211, 238, 0.65)" : "0 0 14px rgba(96, 165, 250, 0.55)",
    marginTop: 1,
  };
}

const taskTypeWrapStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 8,
  padding: "8px 10px",
  borderRadius: 12,
  border: "1px solid var(--line)",
  background: "rgba(8, 15, 30, 0.75)",
  minWidth: 92,
};

function splitBadge(split: string): React.CSSProperties {
  const colors: Record<string, string> = { train: "#16a34a", val: "#2563eb", test: "#ca8a04", unlabeled: "#555" };
  return { padding: "4px 9px", borderRadius: 6, fontSize: 13, fontWeight: 700, background: colors[split] ?? "#555", color: "#fff" };
}

const btnStyle: React.CSSProperties = {
  padding: "11px 18px",
  borderRadius: 10,
  border: "1px solid var(--line)",
  background: "linear-gradient(180deg, rgba(30, 41, 59, 0.9), rgba(15, 23, 42, 0.95))",
  color: "var(--text-0)",
  cursor: "pointer",
  fontSize: 16,
  fontWeight: 700,
  boxShadow: "var(--shadow-1)",
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
};







