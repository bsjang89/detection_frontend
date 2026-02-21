import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import CanvasLabeler from "../components/CanvasLabeler";
import { projectsApi } from "../api/projects";
import { annotationsApi } from "../api/annotations";
import { API_SERVER_URL } from "../api/client";
import type { ProjectWithStats, ImageInfo, ClassDef as ApiClassDef } from "../api/projects";
import type { AnnotationResponse } from "../api/annotations";
import type { BoxAnno } from "../types";

type AnnoMap = Record<number, BoxAnno[]>; // imageId -> boxes
const AUTO_SAVE_DEBOUNCE_MS = 800;

export default function ProjectLabelingPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const pid = Number(projectId);

  const [project, setProject] = useState<ProjectWithStats | null>(null);
  const [images, setImages] = useState<ImageInfo[]>([]);
  const [classes, setClasses] = useState<ApiClassDef[]>([]);
  const [idx, setIdx] = useState(0);
  const [loading, setLoading] = useState(true);

  const [annos, setAnnos] = useState<AnnoMap>({});
  const [activeClassId, setActiveClassId] = useState(0);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState<Set<number>>(new Set());
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const current = images[idx] ?? null;
  const currentBoxes = current ? annos[current.id] ?? [] : [];

  // Load project, images, classes
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
      if (cRes.data.length > 0) {
        // Backend annotation payload expects classes.id
        setActiveClassId(cRes.data[0].id);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  // Load annotations for current image
  useEffect(() => {
    if (!current) return;
    if (annos[current.id] !== undefined) return; // already loaded
    loadAnnotations(current);
  }, [current?.id]);

  async function loadAnnotations(img: ImageInfo) {
    try {
      const res = await annotationsApi.getByImage(img.id);
      const boxes: BoxAnno[] = res.data.map((a) => apiToBox(a, img.width, img.height));
      setAnnos((prev) => ({ ...prev, [img.id]: boxes }));
    } catch (e) {
      console.error("Failed to load annotations", e);
      setAnnos((prev) => ({ ...prev, [img.id]: [] }));
    }
  }

  // Convert API annotation -> BoxAnno (pixel coords for canvas)
  function apiToBox(a: AnnotationResponse, imgW: number, imgH: number): BoxAnno {
    // Prefer pixel coords if available, otherwise denormalize
    return {
      id: String(a.id),
      classId: a.class_id,
      cx: a.px_cx ?? a.cx * imgW,
      cy: a.px_cy ?? a.cy * imgH,
      w: a.px_width ?? a.width * imgW,
      h: a.px_height ?? a.height * imgH,
      rotation: a.rotation,
    };
  }

  // Convert BoxAnno (pixel) -> API format (normalized + pixel)
  function boxToApi(b: BoxAnno, imgW: number, imgH: number) {
    function clamp01(v: number) {
      if (!Number.isFinite(v)) return 0;
      return Math.min(1, Math.max(0, v));
    }

    return {
      class_id: b.classId,
      cx: imgW > 0 ? clamp01(b.cx / imgW) : 0,
      cy: imgH > 0 ? clamp01(b.cy / imgH) : 0,
      width: imgW > 0 ? clamp01(Math.abs(b.w) / imgW) : 0,
      height: imgH > 0 ? clamp01(Math.abs(b.h) / imgH) : 0,
      rotation: b.rotation,
      px_cx: b.cx,
      px_cy: b.cy,
      px_width: b.w,
      px_height: b.h,
    };
  }

  function setCurrentBoxes(next: BoxAnno[] | ((prev: BoxAnno[]) => BoxAnno[])) {
    if (!current) return;
    setAnnos((m) => {
      const prevBoxes = m[current.id] ?? [];
      const nextBoxes = typeof next === "function" ? next(prevBoxes) : next;
      return { ...m, [current.id]: nextBoxes };
    });
    setDirty((prev) => new Set(prev).add(current.id));
  }

  // Save annotations for a specific image
  const saveImageAnnotations = useCallback(async (img: ImageInfo, boxesOverride?: BoxAnno[]) => {
    const boxes = boxesOverride ?? annos[img.id] ?? [];
    await annotationsApi.batchSave(img.id, boxes.map((b) => boxToApi(b, img.width, img.height)));
    setDirty((prev) => {
      const next = new Set(prev);
      next.delete(img.id);
      return next;
    });
  }, [annos]);

  // Save current image annotations
  async function saveCurrentAnnotations() {
    if (!current) return;
    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current);
      autoSaveTimerRef.current = null;
    }
    setSaving(true);
    try {
      await saveImageAnnotations(current, currentBoxes);
    } catch (e) {
      alert("저장 실패");
      console.error(e);
    } finally {
      setSaving(false);
    }
  }

  // Auto-save when navigating away from an image
  const saveAndGo = useCallback(async (newIdx: number) => {
    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current);
      autoSaveTimerRef.current = null;
    }
    if (current && dirty.has(current.id)) {
      try {
        setSaving(true);
        await saveImageAnnotations(current, annos[current.id] ?? []);
      } catch (e) {
        console.error("Auto-save failed", e);
      } finally {
        setSaving(false);
      }
    }
    setIdx(newIdx);
  }, [current, dirty, annos, saveImageAnnotations]);

  // Auto-save while editing current image (debounced)
  useEffect(() => {
    if (!current) return;
    if (!dirty.has(current.id)) return;

    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current);
    }

    autoSaveTimerRef.current = setTimeout(async () => {
      try {
        setSaving(true);
        await saveImageAnnotations(current, annos[current.id] ?? []);
      } catch (e) {
        console.error("Auto-save while editing failed", e);
      } finally {
        setSaving(false);
      }
    }, AUTO_SAVE_DEBOUNCE_MS);

    return () => {
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current);
        autoSaveTimerRef.current = null;
      }
    };
  }, [current, dirty, annos, saveImageAnnotations]);

  function prev() { if (idx > 0) saveAndGo(idx - 1); }
  function next() { if (idx < images.length - 1) saveAndGo(idx + 1); }

  // Keyboard shortcuts
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement)?.tagName?.toLowerCase?.();
      if (tag === "input" || tag === "textarea") return;
      if (/^[1-9]$/.test(e.key)) {
        const num = Number(e.key) - 1;
        if (classes[num]) setActiveClassId(classes[num].id);
      }
      if (e.key === "ArrowRight" || e.key.toLowerCase() === "d") next();
      if (e.key === "ArrowLeft" || e.key.toLowerCase() === "a") prev();
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        saveCurrentAnnotations();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [classes, images.length, idx, dirty, annos, current]);

  function imageUrl(img: ImageInfo) {
    return `${API_SERVER_URL}/${img.file_path.replace(/\\/g, "/")}`;
  }

  const progress = useMemo(() => {
    const labeled = images.filter((im) => (annos[im.id]?.length ?? 0) > 0 || im.annotation_count > 0).length;
    return { labeled, total: images.length };
  }, [images, annos]);

  const classColorMap = useMemo(() => {
    const map: Record<number, string> = {};
    for (const c of classes) {
      map[c.id] = c.color ?? "#ffffff";
    }
    return map;
  }, [classes]);

  if (loading) return <div style={{ padding: 24, color: "#e5e5e5" }}>Loading...</div>;
  if (!project) return <div style={{ padding: 24, color: "#e5e5e5" }}>Project not found</div>;

  return (
    <div style={{ display: "grid", gridTemplateColumns: "280px 1fr 280px", height: "100vh", color: "#e5e5e5" }}>
      {/* Left - Image list */}
      <div style={{ borderRight: "1px solid #2a2a2a", padding: 12, overflow: "auto", background: "#141414" }}>
        <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", marginBottom: 12 }}>
          <button onClick={() => navigate(`/projects/${pid}`)} style={btnSmall}>
            Project
          </button>
          <button onClick={prev} disabled={!images.length || idx === 0} style={btnSmall}>
            Prev
          </button>
          <button onClick={next} disabled={!images.length || idx === images.length - 1} style={btnSmall}>
            Next
          </button>
          <button
            onClick={saveCurrentAnnotations}
            disabled={saving || !current || !dirty.has(current?.id ?? -1)}
            style={{ ...btnSmall, background: dirty.has(current?.id ?? -1) ? "#16a34a" : "#333" }}
          >
            {saving ? "Saving..." : "Save"}
          </button>
        </div>

        <div style={{ fontSize: 13, color: "#999", marginBottom: 8 }}>
          {progress.labeled}/{progress.total} labeled
        </div>

        <VirtualImageList
          images={images}
          annos={annos}
          dirty={dirty}
          idx={idx}
          onSelect={saveAndGo}
        />
      </div>

      {/* Center - Canvas */}
      <div style={{ padding: 12, overflow: "auto", background: "#111" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginBottom: 8 }}>
          <div style={{ fontWeight: 600, fontSize: 14, color: "#fff" }}>
            {current?.filename ?? "No image"}
            {current && dirty.has(current.id) && <span style={{ color: "#eab308", marginLeft: 6, fontSize: 12 }}>(unsaved)</span>}
          </div>
          <div style={{ fontSize: 12, color: "#888" }}>
            {idx + 1} / {images.length}
          </div>
        </div>

        {current ? (
          <CanvasLabeler
            imageUrl={imageUrl(current)}
            boxes={currentBoxes}
            setBoxes={setCurrentBoxes}
            activeClassId={activeClassId}
            classColors={classColorMap}
            viewerHeight="calc(100vh - 130px)"
          />
        ) : (
          <div style={{ padding: 40, border: "1px dashed #444", borderRadius: 12, textAlign: "center", color: "#888" }}>
            No images in this project. Upload images first.
          </div>
        )}
      </div>

      {/* Right - Classes & Info */}
      <div style={{ borderLeft: "1px solid #2a2a2a", padding: 12, overflow: "auto", background: "#141414" }}>
        <div style={{ fontWeight: 700, fontSize: 14, color: "#fff", marginBottom: 12 }}>
          Classes ({classes.length})
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 16 }}>
          {classes.map((c, i) => (
            <div
              key={c.id}
              onClick={() => setActiveClassId(c.id)}
              style={{
                padding: "8px 10px",
                borderRadius: 8,
                cursor: "pointer",
                background: c.id === activeClassId ? "#2563eb" : "#222",
                display: "flex",
                alignItems: "center",
                gap: 8,
              }}
            >
              <div style={{ width: 14, height: 14, borderRadius: 3, background: c.color ?? "#888", flexShrink: 0 }} />
              <span style={{ flex: 1, fontSize: 13, color: "#e5e5e5" }}>{c.class_name}</span>
              <span style={{ fontSize: 11, color: "#888" }}>{i + 1}</span>
            </div>
          ))}
          {classes.length === 0 && (
            <p style={{ color: "#888", fontSize: 13 }}>
              No classes. Add classes in the project detail page.
            </p>
          )}
        </div>

        {/* Current image annotations */}
        <div style={{ borderTop: "1px solid #333", paddingTop: 12 }}>
          <div style={{ fontWeight: 700, fontSize: 14, color: "#fff", marginBottom: 8 }}>
            Annotations ({currentBoxes.length})
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4, maxHeight: 300, overflow: "auto" }}>
            {currentBoxes.map((b, i) => {
              const cls = classes.find((c) => c.id === b.classId);
              return (
                <div key={b.id} style={{ fontSize: 12, color: "#ccc", padding: "4px 6px", background: "#222", borderRadius: 4, display: "flex", gap: 6, alignItems: "center" }}>
                  <div style={{ width: 10, height: 10, borderRadius: 2, background: cls?.color ?? "#888", flexShrink: 0 }} />
                  <span style={{ flex: 1 }}>{cls?.class_name ?? `class_${b.classId}`}</span>
                  <span style={{ color: "#666" }}>{(b.rotation * 180 / Math.PI).toFixed(0)}&deg;</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Tips */}
        <div style={{ borderTop: "1px solid #333", paddingTop: 12, marginTop: 12 }}>
          <div style={{ fontWeight: 700, fontSize: 14, color: "#fff", marginBottom: 6 }}>Tips</div>
          <ul style={{ fontSize: 12, color: "#999", lineHeight: 1.8, paddingLeft: 16, margin: 0 }}>
            <li>Drag: new box</li>
            <li>Click box: select &rarr; resize/rotate</li>
            <li>Ctrl + wheel: zoom in/out</li>
            <li>Wheel: pan canvas</li>
            <li>Double-click: fit to screen</li>
            <li>Use Fit / 100% / Pan in viewer toolbar</li>
            <li>Bottom-right minimap: click/drag to navigate</li>
            <li>Class: number keys 1-9</li>
            <li>Navigate: A/D or &larr;/&rarr;</li>
            <li>Save: Ctrl+S</li>
            <li>Auto-saves while editing and when switching images</li>
          </ul>
        </div>
      </div>
    </div>
  );
}

const IMG_ROW_H = 32;
const OVERSCAN = 10;

function VirtualImageList({
  images,
  annos,
  dirty,
  idx,
  onSelect,
}: {
  images: ImageInfo[];
  annos: AnnoMap;
  dirty: Set<number>;
  idx: number;
  onSelect: (i: number) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewH, setViewH] = useState(600);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    setViewH(el.clientHeight);
    const ro = new ResizeObserver(() => setViewH(el.clientHeight));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Scroll selected item into view when idx changes
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const top = idx * IMG_ROW_H;
    if (top < el.scrollTop) el.scrollTop = top;
    else if (top + IMG_ROW_H > el.scrollTop + viewH) el.scrollTop = top - viewH + IMG_ROW_H;
  }, [idx, viewH]);

  const handleScroll = useCallback(() => {
    if (containerRef.current) setScrollTop(containerRef.current.scrollTop);
  }, []);

  const totalH = images.length * IMG_ROW_H;
  const startIdx = Math.max(0, Math.floor(scrollTop / IMG_ROW_H) - OVERSCAN);
  const endIdx = Math.min(images.length, Math.ceil((scrollTop + viewH) / IMG_ROW_H) + OVERSCAN);

  return (
    <div ref={containerRef} onScroll={handleScroll} style={{ flex: 1, overflow: "auto" }}>
      <div style={{ height: totalH, position: "relative" }}>
        <div style={{ position: "absolute", top: startIdx * IMG_ROW_H, left: 0, right: 0 }}>
          {images.slice(startIdx, endIdx).map((im, offset) => {
            const i = startIdx + offset;
            const hasAnno = (annos[im.id]?.length ?? 0) > 0 || im.annotation_count > 0;
            const isDirty = dirty.has(im.id);
            return (
              <div
                key={im.id}
                onClick={() => onSelect(i)}
                style={{
                  height: IMG_ROW_H,
                  cursor: "pointer",
                  padding: "0 8px",
                  borderRadius: 4,
                  background: i === idx ? "#2a2a2a" : "transparent",
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                }}
              >
                <span style={{ fontSize: 10, width: 12, textAlign: "center", color: hasAnno ? "#16a34a" : "#555", flexShrink: 0 }}>
                  {isDirty ? "*" : hasAnno ? "\u25CF" : "\u25CB"}
                </span>
                <div style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 12, color: i === idx ? "#fff" : "#aaa" }}>
                  {im.filename}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

const btnSmall: React.CSSProperties = {
  padding: "5px 10px",
  borderRadius: 6,
  border: "none",
  background: "#333",
  color: "#fff",
  cursor: "pointer",
  fontSize: 12,
  fontWeight: 500,
};
