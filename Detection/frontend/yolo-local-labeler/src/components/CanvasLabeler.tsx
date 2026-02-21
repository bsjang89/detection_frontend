import React, { useEffect, useMemo, useRef, useState } from "react";
import { Stage, Layer, Rect, Image as KImage, Transformer } from "react-konva";
import useImage from "use-image";
import type { BoxAnno } from "../types";

const CLASS_COLORS: Record<number, string> = {
  0: "red",
  1: "lime", // green보다 더 잘 보임
};

// type Props = {
//   imageUrl: string;
//   boxes: BoxAnno[];
//   setBoxes: (next: BoxAnno[]) => void;
//   activeClassId: number;
// };
type Props = {
  boxes: BoxAnno[];
  setBoxes: React.Dispatch<React.SetStateAction<BoxAnno[]>>;
  activeClassId: number;
  imageUrl: string;
};

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

export default function CanvasLabeler({
  imageUrl,
  boxes,
  setBoxes,
  activeClassId,
}: Props) {
  const [img] = useImage(imageUrl);
  const stageRef = useRef<any>(null);
  const trRef = useRef<any>(null);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [draft, setDraft] = useState<BoxAnno | null>(null);

  const imgW = img?.width ?? 0;
  const imgH = img?.height ?? 0;

  /* ===== 화면 축소용 scale (좌표에는 영향 없음) ===== */
  const maxW = 1100;
  const scale = useMemo(() => {
    if (!imgW || !imgH) return 1;
    return Math.min(1, maxW / imgW);
  }, [imgW, imgH]);

//   const stageW = imgW ? imgW * scale : 800;
//   const stageH = imgH ? imgH * scale : 600;
const stageW = imgW || 800;
const stageH = imgH || 600;

  /* ===== Transformer 연결 ===== */
  useEffect(() => {

    if (!selectedId) {
      trRef.current?.nodes([]);
      return;
    }
    const node = stageRef.current?.findOne(`#box-${selectedId}`);
    if (node) {
      trRef.current.nodes([node]);
      trRef.current.getLayer().batchDraw();
    }
  }, [selectedId, boxes]);
  
useEffect(() => {
  function onKeyDown(e: KeyboardEvent) {
    if (e.key === "Delete" || e.key === "Backspace") {
      deleteSelectedBox();
    }
  }

  window.addEventListener("keydown", onKeyDown);
  return () => window.removeEventListener("keydown", onKeyDown);
}, [selectedId]);


  function deleteSelectedBox() {
  if (!selectedId) return;

  setBoxes((prev) => prev.filter((b) => b.id !== selectedId));
  setSelectedId(null);
}
  /* ===== cx,cy 기반 → Rect props ===== */
  function rectProps(b: BoxAnno) {
    return {
      x: b.cx - b.w / 2,
      y: b.cy - b.h / 2,
      width: b.w,
      height: b.h,
      rotation: b.rotation,
    };
  }

    useEffect(() => {
    // ✅ 이미지가 바뀌면 이전 상태 전부 정리
    setSelectedId(null);
    setDraft(null);
    setIsDrawing(false);

    // Transformer 강제 해제
    trRef.current?.nodes([]);
    }, [imageUrl]);

    useEffect(() => {
  if (!selectedId) return;

  setBoxes(
    boxes.map((b) =>
      b.id === selectedId ? { ...b, classId: activeClassId } : b
    )
  );
}, [activeClassId]);
  /* =========================
     Stage 이벤트 (정석)
  ========================= */

  function handleMouseDown(e: any) {
    if (e.target !== e.target.getStage()) return;
    const stage = stageRef.current;
    const pos = stage.getPointerPosition();
    if (!pos) return;

    setIsDrawing(true);
    setDraft({
      id: uid(),
      classId: activeClassId,
      cx: pos.x / scale,
      cy: pos.y / scale,
      w: 1,
      h: 1,
      rotation: 0,
      
        startX: pos.x / scale,
        startY: pos.y / scale,
    });
  }

 function handleMouseMove() {
  if (!isDrawing || !draft) return;

  const stage = stageRef.current;
  const pos = stage.getPointerPosition();
  if (!pos) return;

  const x2 = pos.x / scale;
  const y2 = pos.y / scale;

  const x1 = draft.startX!;
  const y1 = draft.startY!;

  const left = Math.min(x1, x2);
  const right = Math.max(x1, x2);
  const top = Math.min(y1, y2);
  const bottom = Math.max(y1, y2);

  setDraft({
    ...draft,
    cx: (left + right) / 2,
    cy: (top + bottom) / 2,
    w: Math.max(2, right - left),
    h: Math.max(2, bottom - top),
  });
}

  function handleMouseUp() {
    if (!isDrawing || !draft) return;

    setIsDrawing(false);

    if (draft.w < 5 || draft.h < 5) {
      setDraft(null);
      return;
    }

    const { startX, startY, ...finalBox } = draft;
    setBoxes([...boxes, finalBox]);
    setSelectedId(draft.id);
    setDraft(null);
  }

  function updateBox(id: string, patch: Partial<BoxAnno>) {
    setBoxes(boxes.map((b) => (b.id === id ? { ...b, ...patch } : b)));
  }

  /* ========================= */

  return (
    <div style={{ border: "1px solid #e5e7eb", borderRadius: 12 }}>
      <Stage
        ref={stageRef}
        width={stageW}
        height={stageH}
        style={{ background: "#111827" }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
      >
        <Layer scaleX={scale} scaleY={scale}>
            
          {/* 이미지 */}
          {img && <KImage image={img} listening={false} />}

          {/* 기존 박스 */}
          {boxes.map((b) => (
  <Rect
    key={b.id}
    id={`box-${b.id}`}
    {...rectProps(b)}
    stroke={CLASS_COLORS[b.classId] ?? "white"} // ✅ 핵심
    strokeWidth={10}
    draggable
    onClick={() => setSelectedId(b.id)}
    onDragEnd={(e) => {
      const node = e.target;
      updateBox(b.id, {
        cx: node.x() + b.w / 2,
        cy: node.y() + b.h / 2,
      });
    }}
    onTransformEnd={(e) => {
      const node = e.target;
      const scaleX = node.scaleX();
      const scaleY = node.scaleY();

      const newW = node.width() * scaleX;
      const newH = node.height() * scaleY;

      node.scaleX(1);
      node.scaleY(1);

      updateBox(b.id, {
        cx: node.x() + newW / 2,
        cy: node.y() + newH / 2,
        w: newW,
        h: newH,
        rotation: node.rotation(),
      });
    }}
  />
))}


          {/* 드래그 중 박스 */}
          {draft && (
  <Rect
    {...rectProps(draft)}
    stroke={CLASS_COLORS[draft.classId] ?? "yellow"}
    strokeWidth={10}
    dash={[8, 6]}
    listening={false}
  />
)}

          <Transformer
            ref={trRef}
            keepRatio={false}
            rotateEnabled
            enabledAnchors={[
              "top-left",
              "top-right",
              "bottom-left",
              "bottom-right",
              "middle-left",
              "middle-right",
              "top-center",
              "bottom-center",
            ]}
          />
        </Layer>
      </Stage>
    </div>
  );
}
