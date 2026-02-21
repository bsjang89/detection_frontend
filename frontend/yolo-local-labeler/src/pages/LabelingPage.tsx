import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import CanvasLabeler from "../components/CanvasLabeler";
import type { BoxAnno, ClassDef } from "../types";
import { pickFolderImages, ensureSubDir, writeTextFile } from "../utils/fs";
import { exportBBoxYOLO, exportOBBYOLO } from "../utils/yoloExport";
import JSZip from "jszip";
import { saveAs } from "file-saver";

type PersistState = {
  classes: ClassDef[];
  annos: AnnoMap;
  activeClassId: number;
  idx: number;
};

type ImageItem = { name: string; url: string };
type AnnoMap = Record<string, BoxAnno[]>;

const LS_KEY = "yolo_local_labeler_state_v1";

export default function LabelingPage() {
  const navigate = useNavigate();
  const [images, setImages] = useState<ImageItem[]>([]);
  const [idx, setIdx] = useState(0);

  const [classes, setClasses] = useState<ClassDef[]>([
    { id: 0, name: "class0" },
    { id: 1, name: "class1" },
  ]);

  const [activeClassId, setActiveClassId] = useState(0);
  const [annos, setAnnos] = useState<AnnoMap>({});
  const [exportMode, setExportMode] = useState<"bbox" | "obb">("obb");

  const [dirHandle, setDirHandle] = useState<FileSystemDirectoryHandle | null>(null);

  const current = images[idx];
  const currentBoxes = current ? annos[current.name] ?? [] : [];

  useEffect(() => {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (!raw) return;
      const saved: PersistState = JSON.parse(raw);
      if (saved.classes) setClasses(saved.classes);
      if (saved.annos) setAnnos(saved.annos);
      if (typeof saved.activeClassId === "number") setActiveClassId(saved.activeClassId);
      if (typeof saved.idx === "number") setIdx(saved.idx);
    } catch (e) {
      console.warn("Failed to load saved state", e);
    }
  }, []);

  function saveSession() {
    const state: PersistState = { classes, annos, activeClassId, idx };
    localStorage.setItem(LS_KEY, JSON.stringify(state));
    alert("현재 작업 상태가 저장되었습니다.");
  }

  function loadSession() {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (!raw) { alert("저장된 작업이 없습니다."); return; }
      const saved: PersistState = JSON.parse(raw);
      if (saved.classes) setClasses(saved.classes);
      if (saved.annos) setAnnos(saved.annos);
      if (typeof saved.activeClassId === "number") setActiveClassId(saved.activeClassId);
      setIdx(0);
      alert("저장된 작업을 불러왔습니다.");
    } catch (e) {
      alert("불러오기 실패");
      console.error(e);
    }
  }

  function prev() { setIdx((v) => Math.max(0, v - 1)); }
  function next() { setIdx((v) => Math.min(images.length - 1, v + 1)); }

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement)?.tagName?.toLowerCase?.();
      if (tag === "input" || tag === "textarea") return;
      if (/^[1-9]$/.test(e.key)) {
        const classId = Number(e.key) - 1;
        if (classes.some((c) => c.id === classId)) setActiveClassId(classId);
      }
      if (e.key === "ArrowRight" || e.key.toLowerCase() === "d") next();
      if (e.key === "ArrowLeft" || e.key.toLowerCase() === "a") prev();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [classes, images.length]);

  async function onOpenFolder() {
    const { dirHandle, images } = await pickFolderImages();
    setDirHandle(dirHandle);
    setImages(images.map((x) => ({ name: x.name, url: x.url })));
    setIdx(0);
  }

  function setCurrentBoxes(next: BoxAnno[] | ((prev: BoxAnno[]) => BoxAnno[])) {
    if (!current) return;
    setAnnos((m) => {
      const prevBoxes = m[current.name] ?? [];
      const nextBoxes = typeof next === "function" ? next(prevBoxes) : next;
      return { ...m, [current.name]: nextBoxes };
    });
  }

  function renameClass(id: number, name: string) {
    setClasses((arr) => arr.map((c) => (c.id === id ? { ...c, name } : c)));
  }
  function addClass() {
    const used = new Set(classes.map((c) => c.id));
    let id = 0;
    while (used.has(id) && id < 99) id++;
    setClasses([...classes, { id, name: `class${id}` }].sort((a, b) => a.id - b.id));
  }
  function deleteClass(id: number) {
    setClasses((arr) => arr.filter((c) => c.id !== id));
    if (activeClassId === id) setActiveClassId(0);
  }

  async function exportAll() {
    if (!images.length) return;

    async function getDims(url: string): Promise<{ w: number; h: number }> {
      return new Promise((resolve, reject) => {
        const im = new Image();
        im.onload = () => resolve({ w: im.naturalWidth, h: im.naturalHeight });
        im.onerror = reject;
        im.src = url;
      });
    }

    const zip = new JSZip();
    for (const img of images) {
      const boxes = annos[img.name] ?? [];
      const { w, h } = await getDims(img.url);
      const base = img.name.replace(/\.[^.]+$/, "");
      const content = exportMode === "obb" ? exportOBBYOLO(boxes, w, h) : exportBBoxYOLO(boxes, w, h);
      zip.file(`${base}.txt`, content);
    }

    const blob = await zip.generateAsync({ type: "blob" });
    saveAs(blob, `labels_${exportMode}.zip`);

    if (dirHandle) {
      try {
        const labelsDir = await ensureSubDir(dirHandle, "labels");
        for (const img of images) {
          const boxes = annos[img.name] ?? [];
          const { w, h } = await getDims(img.url);
          const base = img.name.replace(/\.[^.]+$/, "");
          const content = exportMode === "obb" ? exportOBBYOLO(boxes, w, h) : exportBBoxYOLO(boxes, w, h);
          await writeTextFile(labelsDir, `${base}.txt`, content);
        }
        alert("labels/ 폴더에 라벨 저장 완료!");
      } catch { /* ignore */ }
    }
  }

  const progress = useMemo(() => {
    const labeled = images.filter((im) => (annos[im.name]?.length ?? 0) > 0).length;
    return { labeled, total: images.length };
  }, [images, annos]);

  return (
    <div style={{ display: "grid", gridTemplateColumns: "320px 1fr 340px", height: "100vh" }}>
      {/* Left */}
      <div style={{ borderRight: "1px solid #e5e7eb", padding: 12, overflow: "auto" }}>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <button onClick={() => navigate("/")} style={{ fontSize: 12 }}>Projects</button>
          <button onClick={onOpenFolder}>Open Folder</button>
          <button onClick={prev} disabled={!images.length || idx === 0}>Prev (A/&#x2190;)</button>
          <button onClick={next} disabled={!images.length || idx === images.length - 1}>Next (D/&#x2192;)</button>
          <button onClick={saveSession}>Save Session</button>
          <button onClick={loadSession}>Load Session</button>
        </div>

        <div style={{ marginTop: 10, fontSize: 13, opacity: 0.8 }}>
          {progress.labeled}/{progress.total} labeled
        </div>

        <div style={{ marginTop: 12 }}>
          {images.map((im, i) => {
            const has = (annos[im.name]?.length ?? 0) > 0;
            return (
              <div
                key={im.name}
                onClick={() => setIdx(i)}
                style={{
                  cursor: "pointer",
                  padding: 8,
                  borderRadius: 10,
                  marginBottom: 6,
                  background: i === idx ? "#e5e7eb" : "transparent",
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 10,
                }}
              >
                <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{im.name}</div>
                <div style={{ fontSize: 12, opacity: 0.7 }}>{has ? "\u25CF" : "\u25CB"}</div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Center */}
      <div style={{ padding: 12, overflow: "auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
          <div style={{ fontWeight: 600 }}>{current?.name ?? "No image"}</div>
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <label style={{ display: "flex", gap: 6, alignItems: "center" }}>
              Export:
              <select value={exportMode} onChange={(e) => setExportMode(e.target.value as "bbox" | "obb")}>
                <option value="obb">OBB (rotated)</option>
                <option value="bbox">BBox (normal YOLO)</option>
              </select>
            </label>
            <button onClick={exportAll} disabled={!images.length}>Save / Export Labels</button>
          </div>
        </div>

        <div style={{ marginTop: 10 }}>
          {current ? (
            <CanvasLabeler
              imageUrl={current.url}
              boxes={currentBoxes}
              setBoxes={setCurrentBoxes}
              activeClassId={activeClassId}
            />
          ) : (
            <div style={{ padding: 20, border: "1px dashed #9ca3af", borderRadius: 12 }}>
              Open Folder 를 눌러 이미지 폴더를 선택하세요.
            </div>
          )}
        </div>
      </div>

      {/* Right */}
      <div style={{ borderLeft: "1px solid #e5e7eb", padding: 12, overflow: "auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontWeight: 700 }}>Classes</div>
          <button onClick={addClass}>+ Add</button>
        </div>

        <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 8 }}>
          {classes
            .slice()
            .sort((a, b) => a.id - b.id)
            .map((c) => (
              <div
                key={c.id}
                style={{
                  padding: 10,
                  border: "1px solid #e5e7eb",
                  borderRadius: 12,
                  background: c.id === activeClassId ? "#111827" : "white",
                  color: c.id === activeClassId ? "white" : "black",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                  <div style={{ fontSize: 12, opacity: 0.8 }}>Key: {c.id}</div>
                  <button onClick={() => deleteClass(c.id)} style={{ fontSize: 12 }}>Delete</button>
                </div>
                <input
                  value={c.name}
                  onChange={(e) => renameClass(c.id, e.target.value)}
                  style={{ width: "100%", marginTop: 6, padding: "8px 10px", borderRadius: 10, border: "1px solid #e5e7eb" }}
                />
                <button onClick={() => setActiveClassId(c.id)} style={{ marginTop: 8, width: "100%" }}>Select</button>
              </div>
            ))}
        </div>

        <div style={{ marginTop: 16 }}>
          <div style={{ fontWeight: 700 }}>Tips</div>
          <ul style={{ fontSize: 13, opacity: 0.8, lineHeight: 1.6 }}>
            <li>빈 공간 드래그: 새 박스 생성</li>
            <li>박스 클릭: 선택 &rarr; 핸들로 resize</li>
            <li>선택 상태에서 회전 핸들로 rotate</li>
            <li>클래스 변경: 숫자키 0~9</li>
            <li>Prev/Next: A/D 또는 &larr;/&rarr;</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
