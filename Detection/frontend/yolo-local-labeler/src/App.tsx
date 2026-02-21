import React, { useEffect, useMemo, useState } from "react";
import CanvasLabeler from "./components/CanvasLabeler";
import type { BoxAnno, ClassDef } from "./types";
import { pickFolderImages, ensureSubDir, writeTextFile } from "./utils/fs";
import { exportBBoxYOLO, exportOBBYOLO } from "./utils/yoloExport";
import JSZip from "jszip";
import { saveAs } from "file-saver";
 
type PersistState = {
  classes: ClassDef[];
  annos: AnnoMap;
  activeClassId: number;
  idx: number;
};


type ImageItem = { name: string; url: string };
type AnnoMap = Record<string, BoxAnno[]>; // key: imageName

const LS_KEY = "yolo_local_labeler_state_v1";

export default function App() {
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
    if (typeof saved.activeClassId === "number")
      setActiveClassId(saved.activeClassId);
    if (typeof saved.idx === "number") setIdx(saved.idx);
  } catch (e) {
    console.warn("Failed to load saved state", e);
  }
}, []);

 function saveSession() {
  const state: PersistState = {
    classes,
    annos,
    activeClassId,
    idx,
  };

  localStorage.setItem(LS_KEY, JSON.stringify(state));
  alert("현재 작업 상태가 저장되었습니다.");
}

  // load from localStorage
  useEffect(() => {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (!raw) return;
      const st = JSON.parse(raw);
      if (st?.classes) setClasses(st.classes);
      if (st?.annos) setAnnos(st.annos);
      if (st?.exportMode) setExportMode(st.exportMode);
    } catch {}
  }, []);

  
  function prev() {
    setIdx((v) => Math.max(0, v - 1));
  }
  function next() {
    setIdx((v) => Math.min(images.length - 1, v + 1));
  }

  // keyboard shortcuts
useEffect(() => {
  function onKeyDown(e: KeyboardEvent) {
    const tag = (e.target as any)?.tagName?.toLowerCase?.();
    if (tag === "input" || tag === "textarea") return;

    // 1~9 → class 0~8
    if (/^[1-9]$/.test(e.key)) {
      const classId = Number(e.key) - 1;

      if (classes.some((c) => c.id === classId)) {
        setActiveClassId(classId);
      }
    }

    // 이동 단축키 유지
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

  function setCurrentBoxes(
  next:
    | BoxAnno[]
    | ((prev: BoxAnno[]) => BoxAnno[])
) {
  if (!current) return;

  setAnnos((m) => {
    const prevBoxes = m[current.name] ?? [];
    const nextBoxes =
      typeof next === "function" ? next(prevBoxes) : next;

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
    console.log("T");
    if (!images.length) {
      console.log("❌ no images");
      return;
    }

    async function getDims(url: string): Promise<{ w: number; h: number }> {
       console.log("📐 getDims", url);
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
      const txtName = `${base}.txt`;

      const content =
        exportMode === "obb" ? exportOBBYOLO(boxes, w, h) : exportBBoxYOLO(boxes, w, h);

      zip.file(txtName, content);
    }

    // zip download
    const blob = await zip.generateAsync({ type: "blob" });
    saveAs(blob, `labels_${exportMode}.zip`);

    // optional: write into labels/ folder if we still have permission
    if (dirHandle) {
      try {
        const labelsDir = await ensureSubDir(dirHandle, "labels");
        for (const img of images) {
          const boxes = annos[img.name] ?? [];
          const { w, h } = await getDims(img.url);

          const base = img.name.replace(/\.[^.]+$/, "");
          const txtName = `${base}.txt`;

          const content =
            exportMode === "obb"
              ? exportOBBYOLO(boxes, w, h)
              : exportBBoxYOLO(boxes, w, h);

          await writeTextFile(labelsDir, txtName, content);
        }
        alert("labels/ 폴더에 라벨 저장 완료!");
      } catch {
        // ignore
      }
    }
  }

  const progress = useMemo(() => {
    const labeled = images.filter((im) => (annos[im.name]?.length ?? 0) > 0).length;
    return { labeled, total: images.length };
  }, [images, annos]);

function loadSession() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) {
      alert("저장된 작업이 없습니다.");
      return;
    }
    const saved: PersistState = JSON.parse(raw);
 console.log("📦 raw from localStorage:", saved);

    if (saved.classes) setClasses(saved.classes);
    if (saved.annos) setAnnos(saved.annos);
    if (typeof saved.activeClassId === "number")
      setActiveClassId(saved.activeClassId);

    // idx는 이미지 로드 후 안전하게
    setIdx(0);

    alert("저장된 작업을 불러왔습니다.");
  } catch (e) {
    alert("불러오기 실패");
    console.error(e);
  }
}


function resetSession() {
  if (!confirm("저장된 작업을 모두 초기화할까요?")) return;

  localStorage.removeItem(LS_KEY);
  alert("저장된 작업이 초기화되었습니다.");
}

  return (
    <div style={{ display: "grid", gridTemplateColumns: "320px 1fr 340px", height: "100vh" }}>
      {/* Left */}
      <div style={{ borderRight: "1px solid #e5e7eb", padding: 12, overflow: "auto" }}>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <button onClick={onOpenFolder}>Open Folder</button>
          <button onClick={prev} disabled={!images.length || idx === 0}>
            Prev (A/←)
          </button>
          <button onClick={next} disabled={!images.length || idx === images.length - 1}>
            Next (D/→)
          </button>
           {/* ✅ 세션 관리 버튼 */}
           
  <button onClick={saveSession}>Save Session</button>
  <button onClick={loadSession}>Load Session</button>
  {/* <button onClick={resetSession}>Reset Session</button> */}
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
                <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {im.name}
                </div>
                <div style={{ fontSize: 12, opacity: 0.7 }}>{has ? "●" : "○"}</div>
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
              <select value={exportMode} onChange={(e) => setExportMode(e.target.value as any)}>
                <option value="obb">OBB (rotated)</option>
                <option value="bbox">BBox (normal YOLO)</option>
              </select>
            </label>

            <button onClick={exportAll} disabled={!images.length}>
              Save / Export Labels
            </button>
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
                  <button onClick={() => deleteClass(c.id)} style={{ fontSize: 12 }}>
                    Delete
                  </button>
                </div>

                <input
                  value={c.name}
                  onChange={(e) => renameClass(c.id, e.target.value)}
                  style={{
                    width: "100%",
                    marginTop: 6,
                    padding: "8px 10px",
                    borderRadius: 10,
                    border: "1px solid #e5e7eb",
                  }}
                />

                <button onClick={() => setActiveClassId(c.id)} style={{ marginTop: 8, width: "100%" }}>
                  Select
                </button>
              </div>
            ))}
        </div>

        <div style={{ marginTop: 16 }}>
          <div style={{ fontWeight: 700 }}>Tips</div>
          <ul style={{ fontSize: 13, opacity: 0.8, lineHeight: 1.6 }}>
            <li>빈 공간 드래그: 새 박스 생성</li>
            <li>박스 클릭: 선택 → 핸들로 resize</li>
            <li>선택 상태에서 회전 핸들로 rotate</li>
            <li>클래스 변경: 숫자키 0~9</li>
            <li>Prev/Next: A/D 또는 ←/→</li>
          </ul>
        </div>
      </div>
    </div>
  );
}




// import { useState } from 'react'
// import reactLogo from './assets/react.svg'
// import viteLogo from '/vite.svg'
// import './App.css'

// function App() {
//   const [count, setCount] = useState(0)

//   return (
//     <>
//       <div>
//         <a href="https://vite.dev" target="_blank">
//           <img src={viteLogo} className="logo" alt="Vite logo" />
//         </a>
//         <a href="https://react.dev" target="_blank">
//           <img src={reactLogo} className="logo react" alt="React logo" />
//         </a>
//       </div>
//       <h1>Vite + React</h1>
//       <div className="card">
//         <button onClick={() => setCount((count) => count + 1)}>
//           count is {count}
//         </button>
//         <p>
//           Edit <code>src/App.tsx</code> and save to test HMR
//         </p>
//       </div>
//       <p className="read-the-docs">
//         Click on the Vite and React logos to learn more
//       </p>
//     </>
//   )
// }

// export default App
