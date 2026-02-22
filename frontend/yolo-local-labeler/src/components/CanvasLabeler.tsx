import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Stage, Layer, Rect, Image as KImage, Transformer, Text, Group } from "react-konva";
import useImage from "use-image";
import type { BoxAnno } from "../types";

const CLASS_COLORS: Record<number, string> = {
  0: "red",
  1: "lime",
};

export type InferenceOverlay = {
  id: string;
  cx: number;
  cy: number;
  w: number;
  h: number;
  rotation: number;
  classId?: number;
  classIndex?: number;
  className?: string;
  confidence?: number;
  canConvert?: boolean;
};

type Props = {
  boxes: BoxAnno[];
  setBoxes: React.Dispatch<React.SetStateAction<BoxAnno[]>>;
  activeClassId: number;
  imageUrl: string;
  classColors?: Record<number, string>;
  classNames?: Record<number, string>;
  viewerHeight?: number | string;
  inferenceOverlays?: InferenceOverlay[];
  showInferenceOverlays?: boolean;
  onInferenceOverlayClick?: (overlay: InferenceOverlay) => void;
};

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export default function CanvasLabeler({
  imageUrl,
  boxes,
  setBoxes,
  activeClassId,
  classColors = {},
  classNames = {},
  viewerHeight = "76vh",
  inferenceOverlays = [],
  showInferenceOverlays = false,
  onInferenceOverlayClick,
}: Props) {
  const [img] = useImage(imageUrl);
  const stageRef = useRef<any>(null);
  const trRef = useRef<any>(null);
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const shouldFitRef = useRef(true);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [draft, setDraft] = useState<BoxAnno | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  const [lastSize, setLastSize] = useState<{ w: number; h: number; rotation: number } | null>(null);
  const [ghostPos, setGhostPos] = useState<{ x: number; y: number } | null>(null);
  const downPos = useRef<{ x: number; y: number } | null>(null);

  const [viewport, setViewport] = useState({ w: 1100, h: 700 });
  const [viewScale, setViewScale] = useState(1);
  const [viewPos, setViewPos] = useState({ x: 0, y: 0 });
  const [panMode, setPanMode] = useState(false);
  const [isPanning, setIsPanning] = useState(false);
  const panStartRef = useRef<{ x: number; y: number; originX: number; originY: number } | null>(null);
  const minimapRef = useRef<HTMLDivElement | null>(null);
  const [isMinimapDragging, setIsMinimapDragging] = useState(false);

  const imgW = img?.width ?? 0;
  const imgH = img?.height ?? 0;

  const fitScale = useMemo(() => {
    if (!imgW || !imgH || !viewport.w || !viewport.h) return 1;
    return Math.min(viewport.w / imgW, viewport.h / imgH);
  }, [imgW, imgH, viewport.w, viewport.h]);

  const minScale = Math.max(0.02, fitScale * 0.2);
  const maxScale = 20;
  const zoomPct = Math.round(viewScale * 100);

  const minimap = useMemo(() => {
    if (!imgW || !imgH) {
      return {
        scale: 1,
        w: 180,
        h: 120,
      };
    }
    const maxW = 200;
    const maxH = 140;
    const scale = Math.min(maxW / imgW, maxH / imgH);
    return {
      scale,
      w: Math.max(80, imgW * scale),
      h: Math.max(60, imgH * scale),
    };
  }, [imgW, imgH]);

  const viewportInImage = useMemo(() => {
    if (!imgW || !imgH) {
      return {
        x: 0,
        y: 0,
        w: 0,
        h: 0,
      };
    }
    const x = clamp(-viewPos.x / viewScale, 0, imgW);
    const y = clamp(-viewPos.y / viewScale, 0, imgH);
    const w = clamp(viewport.w / viewScale, 0, imgW);
    const h = clamp(viewport.h / viewScale, 0, imgH);
    return { x, y, w, h };
  }, [imgH, imgW, viewPos.x, viewPos.y, viewScale, viewport.h, viewport.w]);

  const fitToScreen = useCallback(() => {
    if (!imgW || !imgH || !viewport.w || !viewport.h) return;
    const nextScale = fitScale;
    const nextPos = {
      x: (viewport.w - imgW * nextScale) / 2,
      y: (viewport.h - imgH * nextScale) / 2,
    };
    setViewScale(nextScale);
    setViewPos(nextPos);
  }, [fitScale, imgW, imgH, viewport.w, viewport.h]);

  const actualSize = useCallback(() => {
    if (!imgW || !imgH || !viewport.w || !viewport.h) return;
    setViewScale(1);
    setViewPos({
      x: (viewport.w - imgW) / 2,
      y: (viewport.h - imgH) / 2,
    });
  }, [imgW, imgH, viewport.w, viewport.h]);

  const zoomAt = useCallback((factor: number, center?: { x: number; y: number }) => {
    const cx = center?.x ?? viewport.w / 2;
    const cy = center?.y ?? viewport.h / 2;
    const nextScale = clamp(viewScale * factor, minScale, maxScale);
    const imagePoint = {
      x: (cx - viewPos.x) / viewScale,
      y: (cy - viewPos.y) / viewScale,
    };
    setViewScale(nextScale);
    setViewPos({
      x: cx - imagePoint.x * nextScale,
      y: cy - imagePoint.y * nextScale,
    });
  }, [maxScale, minScale, viewPos.x, viewPos.y, viewScale, viewport.w, viewport.h]);

  const centerOnImagePoint = useCallback((ix: number, iy: number) => {
    setViewPos({
      x: viewport.w / 2 - ix * viewScale,
      y: viewport.h / 2 - iy * viewScale,
    });
  }, [viewScale, viewport.h, viewport.w]);

  const pointerToImage = useCallback(() => {
    const stage = stageRef.current;
    const pos = stage?.getPointerPosition();
    if (!pos) return null;
    return {
      x: (pos.x - viewPos.x) / viewScale,
      y: (pos.y - viewPos.y) / viewScale,
      stageX: pos.x,
      stageY: pos.y,
    };
  }, [viewPos.x, viewPos.y, viewScale]);

  const imageToRect = useCallback((b: Pick<BoxAnno, "cx" | "cy" | "w" | "h" | "rotation">) => {
    return {
      x: b.cx,
      y: b.cy,
      width: b.w,
      height: b.h,
      offsetX: b.w / 2,
      offsetY: b.h / 2,
      rotation: b.rotation,
    };
  }, []);

  const getClassColor = useCallback((classId: number, fallback = "white") => {
    return classColors[classId] ?? CLASS_COLORS[classId] ?? fallback;
  }, [classColors]);

  const updateBox = useCallback((id: string, patch: Partial<BoxAnno>) => {
    setBoxes((prev) => prev.map((b) => (b.id === id ? { ...b, ...patch } : b)));
  }, [setBoxes]);

  function deleteSelectedBox() {
    if (!selectedId) return;
    setBoxes((prev) => prev.filter((b) => b.id !== selectedId));
    setSelectedId(null);
  }

  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;

    const refresh = () => {
      setViewport({
        w: Math.max(320, el.clientWidth),
        h: Math.max(260, el.clientHeight),
      });
    };

    refresh();
    const ro = new ResizeObserver(refresh);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (!selectedId || panMode) {
      trRef.current?.nodes([]);
      return;
    }
    const node = stageRef.current?.findOne(`#box-${selectedId}`);
    if (node) {
      trRef.current.nodes([node]);
      trRef.current.getLayer().batchDraw();
    }
  }, [boxes, panMode, selectedId]);

  useEffect(() => {
    setSelectedId(null);
    setDraft(null);
    setIsDrawing(false);
    setHoveredId(null);
    setIsPanning(false);
    panStartRef.current = null;
    trRef.current?.nodes([]);
    shouldFitRef.current = true;
  }, [imageUrl]);

  useEffect(() => {
    if (!imgW || !imgH || !viewport.w || !viewport.h) return;
    if (shouldFitRef.current) {
      fitToScreen();
      shouldFitRef.current = false;
    }
  }, [fitToScreen, imgW, imgH, viewport.w, viewport.h]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Delete" || e.key === "Backspace") deleteSelectedBox();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selectedId]);

  useEffect(() => {
    if (!selectedId) return;
    setBoxes((prev) => {
      let changed = false;
      const next = prev.map((b) => {
        if (b.id !== selectedId) return b;
        if (b.classId === activeClassId) return b;
        changed = true;
        return { ...b, classId: activeClassId };
      });
      return changed ? next : prev;
    });
  }, [activeClassId, selectedId, setBoxes]);

  function handleWheel(e: any) {
    e.evt.preventDefault();
    const stage = stageRef.current;
    const pointer = stage?.getPointerPosition();
    if (!pointer) return;
    const isZoomGesture = e.evt.ctrlKey || e.evt.metaKey;
    if (isZoomGesture) {
      const factor = e.evt.deltaY > 0 ? 1 / 1.1 : 1.1;
      zoomAt(factor, { x: pointer.x, y: pointer.y });
      return;
    }

    const panFactor = 0.9;
    const dx = e.evt.shiftKey ? -e.evt.deltaY * panFactor : -e.evt.deltaX * panFactor;
    const dy = e.evt.shiftKey ? 0 : -e.evt.deltaY * panFactor;
    setViewPos((prev) => ({ x: prev.x + dx, y: prev.y + dy }));
  }

  function handleMouseDown(e: any) {
    const stage = stageRef.current;
    const pointer = stage?.getPointerPosition();
    if (!pointer) return;

    if (panMode) {
      setIsPanning(true);
      panStartRef.current = {
        x: pointer.x,
        y: pointer.y,
        originX: viewPos.x,
        originY: viewPos.y,
      };
      return;
    }

    if (e.target !== e.target.getStage()) return;
    const p = pointerToImage();
    if (!p || !imgW || !imgH) return;

    const px = clamp(p.x, 0, imgW);
    const py = clamp(p.y, 0, imgH);
    downPos.current = { x: px, y: py };

    setSelectedId(null);
    setIsDrawing(true);
    setDraft({
      id: uid(),
      classId: activeClassId,
      cx: px,
      cy: py,
      w: 1,
      h: 1,
      rotation: 0,
      startX: px,
      startY: py,
    });
  }

  function handleMouseMove() {
    const p = pointerToImage();
    if (!p) return;

    if (isPanning && panStartRef.current) {
      const dx = p.stageX - panStartRef.current.x;
      const dy = p.stageY - panStartRef.current.y;
      setViewPos({
        x: panStartRef.current.originX + dx,
        y: panStartRef.current.originY + dy,
      });
      return;
    }

    if (!imgW || !imgH) return;
    const px = clamp(p.x, 0, imgW);
    const py = clamp(p.y, 0, imgH);

    if (!isDrawing && lastSize) {
      setGhostPos({ x: px, y: py });
    }

    if (!isDrawing || !draft) return;

    const x1 = draft.startX ?? px;
    const y1 = draft.startY ?? py;

    const left = Math.min(x1, px);
    const right = Math.max(x1, px);
    const top = Math.min(y1, py);
    const bottom = Math.max(y1, py);

    setDraft({
      ...draft,
      cx: (left + right) / 2,
      cy: (top + bottom) / 2,
      w: Math.max(2, right - left),
      h: Math.max(2, bottom - top),
    });
  }

  function handleMouseUp() {
    if (isPanning) {
      setIsPanning(false);
      panStartRef.current = null;
      return;
    }

    if (!isDrawing || !draft) return;
    setIsDrawing(false);

    const p = pointerToImage();
    const px = p ? p.x : draft.cx;
    const py = p ? p.y : draft.cy;

    const dp = downPos.current;
    const dist = dp ? Math.hypot(px - dp.x, py - dp.y) : 999;

    if (dist < 5 && lastSize) {
      const stamped: BoxAnno = {
        id: uid(),
        classId: activeClassId,
        cx: px,
        cy: py,
        w: lastSize.w,
        h: lastSize.h,
        rotation: lastSize.rotation,
      };
      setBoxes((prev) => [...prev, stamped]);
      setSelectedId(stamped.id);
      setDraft(null);
      return;
    }

    if (draft.w < 5 || draft.h < 5) {
      setDraft(null);
      return;
    }

    const { startX, startY, ...finalBox } = draft;
    setBoxes((prev) => [...prev, finalBox]);
    setSelectedId(finalBox.id);
    setLastSize({ w: finalBox.w, h: finalBox.h, rotation: finalBox.rotation });
    setDraft(null);
  }

  function minimapPointerToImage(e: React.PointerEvent<HTMLDivElement>) {
    if (!minimapRef.current || !imgW || !imgH) return null;
    const rect = minimapRef.current.getBoundingClientRect();
    const mx = clamp(e.clientX - rect.left, 0, minimap.w);
    const my = clamp(e.clientY - rect.top, 0, minimap.h);
    return {
      x: mx / minimap.scale,
      y: my / minimap.scale,
    };
  }

  function handleMinimapPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    const imagePoint = minimapPointerToImage(e);
    if (!imagePoint) return;
    setIsMinimapDragging(true);
    centerOnImagePoint(imagePoint.x, imagePoint.y);
  }

  function handleMinimapPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!isMinimapDragging) return;
    const imagePoint = minimapPointerToImage(e);
    if (!imagePoint) return;
    centerOnImagePoint(imagePoint.x, imagePoint.y);
  }

  function handleMinimapPointerUp() {
    setIsMinimapDragging(false);
  }

  const stageCursor = panMode ? (isPanning ? "grabbing" : "grab") : "crosshair";

  return (
    <div
      style={{
        border: "1px solid #334155",
        borderRadius: 14,
        overflow: "hidden",
        background: "linear-gradient(180deg, #0f172a 0%, #020617 100%)",
        boxShadow: "0 8px 30px rgba(2, 6, 23, 0.45)",
        height: viewerHeight,
        minHeight: 420,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "8px 10px",
          background: "rgba(15, 23, 42, 0.9)",
          borderBottom: "1px solid #1e293b",
          gap: 10,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button type="button" onClick={() => zoomAt(1 / 1.2)} style={toolBtn}>
            -
          </button>
          <button type="button" onClick={() => zoomAt(1.2)} style={toolBtn}>
            +
          </button>
          <button type="button" onClick={actualSize} style={toolBtn}>
            100%
          </button>
          <button type="button" onClick={fitToScreen} style={toolBtnPrimary}>
            Fit
          </button>
          <button
            type="button"
            onClick={() => setPanMode((v) => !v)}
            style={panMode ? toolBtnPrimary : toolBtn}
          >
            Pan
          </button>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, color: "#cbd5e1", fontSize: 12 }}>
          <span>{zoomPct}%</span>
          <span>{imgW}x{imgH}</span>
          <span style={{ color: "#94a3b8" }}>Ctrl+Wheel: Zoom</span>
          <span style={{ color: "#94a3b8" }}>Double-click: Fit</span>
          <span style={{ color: panMode ? "#38bdf8" : "#94a3b8" }}>
            {panMode ? "Pan mode" : "Draw mode"}
          </span>
        </div>
      </div>

      <div ref={viewportRef} style={{ height: "calc(100% - 44px)", width: "100%", position: "relative" }}>
        <Stage
          ref={stageRef}
          width={viewport.w}
          height={viewport.h}
          style={{ background: "radial-gradient(circle at center, #111827 0%, #030712 100%)", cursor: stageCursor }}
          onWheel={handleWheel}
          onDblClick={fitToScreen}
          onDblTap={fitToScreen}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
        >
          <Layer x={viewPos.x} y={viewPos.y} scaleX={viewScale} scaleY={viewScale}>
            {img && <KImage image={img} listening={false} />}

            {showInferenceOverlays && inferenceOverlays.map((overlay) => (
              <Rect
                key={`inf-${overlay.id}`}
                {...imageToRect(overlay)}
                stroke={overlay.canConvert === false ? "rgba(148, 163, 184, 0.9)" : "rgba(56, 189, 248, 0.95)"}
                fill={overlay.canConvert === false ? "rgba(148, 163, 184, 0.18)" : "rgba(56, 189, 248, 0.25)"}
                strokeWidth={3}
                strokeScaleEnabled={false}
                cornerRadius={4}
                dash={[10, 7]}
                shadowBlur={8}
                shadowColor={overlay.canConvert === false ? "rgba(148, 163, 184, 0.6)" : "rgba(56, 189, 248, 0.65)"}
                draggable={false}
                listening={!panMode}
                onClick={() => {
                  if (!panMode && onInferenceOverlayClick) onInferenceOverlayClick(overlay);
                }}
                onTap={() => {
                  if (!panMode && onInferenceOverlayClick) onInferenceOverlayClick(overlay);
                }}
              />
            ))}

            {boxes.map((b) => {
              const color = getClassColor(b.classId);
              const isSelected = selectedId === b.id;
              const isHovered = hoveredId === b.id;
              const strokeWidth = isSelected ? 4.2 : isHovered ? 3.6 : 3.2;
              const baseRect = imageToRect(b);
              const rectLeft = b.cx - b.w / 2;
              const rectTop = b.cy - b.h / 2;
              const labelText = classNames[b.classId] ?? `Class ${b.classId}`;
              const labelFontSize = 14;
              const labelPadX = 8;
              const labelPadY = 4;
              const labelHeight = labelFontSize + labelPadY * 2;
              const labelWidth = Math.max(70, labelText.length * (labelFontSize * 0.58) + labelPadX * 2);
              const labelUiScale = viewScale > 0 ? 1 / viewScale : 1;
              const labelWidthInImage = labelWidth * labelUiScale;
              const labelHeightInImage = labelHeight * labelUiScale;
              const labelGapPx = 4;
              const labelInsetXPx = 6;
              const canPlaceLabel = imgW > 0 && imgH > 0;
              const theta = (b.rotation * Math.PI) / 180;
              const tangentX = Math.cos(theta);
              const tangentY = Math.sin(theta);
              const normalX = Math.sin(theta);
              const normalY = -Math.cos(theta);
              const offsetToTop = (labelHeight + labelGapPx) * labelUiScale;
              const insetAlongTop = labelInsetXPx * labelUiScale;
              const labelX = clamp(
                rectLeft + tangentX * insetAlongTop + normalX * offsetToTop,
                0,
                Math.max(0, imgW - labelWidthInImage)
              );
              const labelY = clamp(
                rectTop + tangentY * insetAlongTop + normalY * offsetToTop,
                0,
                Math.max(0, imgH - labelHeightInImage)
              );
              return (
                <React.Fragment key={b.id}>
                  <Rect
                    {...baseRect}
                    fill={color}
                    opacity={isSelected ? 0.22 : isHovered ? 0.16 : 0.12}
                    cornerRadius={6}
                    listening={false}
                  />
                  <Rect
                    {...baseRect}
                    stroke="rgba(15, 23, 42, 0.9)"
                    strokeWidth={strokeWidth + 1.6}
                    strokeScaleEnabled={false}
                    cornerRadius={6}
                    listening={false}
                  />
                  <Rect
                    id={`box-${b.id}`}
                    {...baseRect}
                    stroke={color}
                    strokeWidth={strokeWidth}
                    strokeScaleEnabled={false}
                    cornerRadius={6}
                    shadowBlur={isSelected ? 10 : isHovered ? 7 : 5}
                    shadowColor={color}
                    draggable={!panMode}
                    onMouseEnter={() => !panMode && setHoveredId(b.id)}
                    onMouseLeave={() => setHoveredId((prev) => (prev === b.id ? null : prev))}
                    onClick={() => !panMode && setSelectedId(b.id)}
                    onTap={() => !panMode && setSelectedId(b.id)}
                    onDragEnd={(e) => {
                      const node = e.target;
                      updateBox(b.id, {
                        cx: node.x(),
                        cy: node.y(),
                      });
                    }}
                    onTransformEnd={(e) => {
                      const node = e.target;
                      const scaleX = node.scaleX();
                      const scaleY = node.scaleY();
                      const newW = Math.max(2, Math.abs(node.width() * scaleX));
                      const newH = Math.max(2, Math.abs(node.height() * scaleY));
                      const newRot = node.rotation();
                      node.scaleX(1);
                      node.scaleY(1);
                      updateBox(b.id, {
                        cx: node.x(),
                        cy: node.y(),
                        w: newW,
                        h: newH,
                        rotation: newRot,
                      });
                      setLastSize({ w: newW, h: newH, rotation: newRot });
                    }}
                  />
                  {canPlaceLabel && (
                    <Group
                      x={labelX}
                      y={labelY}
                      scaleX={labelUiScale}
                      scaleY={labelUiScale}
                      rotation={b.rotation}
                      listening={false}
                    >
                      <Rect
                        x={0}
                        y={0}
                        width={labelWidth}
                        height={labelHeight}
                        fill="rgba(15, 23, 42, 0.78)"
                        stroke={color}
                        strokeWidth={1.2}
                        strokeScaleEnabled={false}
                        cornerRadius={7}
                        listening={false}
                      />
                      <Text
                        x={labelPadX}
                        y={labelPadY}
                        text={labelText}
                        fontSize={labelFontSize}
                        fontStyle="bold"
                        fill="#f8fafc"
                        listening={false}
                      />
                    </Group>
                  )}
                </React.Fragment>
              );
            })}

            {!panMode && !isDrawing && lastSize && ghostPos && (
              <Rect
                {...imageToRect({
                  cx: ghostPos.x,
                  cy: ghostPos.y,
                  w: lastSize.w,
                  h: lastSize.h,
                  rotation: lastSize.rotation,
                })}
                stroke={getClassColor(activeClassId)}
                strokeWidth={3}
                strokeScaleEnabled={false}
                dash={[8, 6]}
                cornerRadius={6}
                opacity={0.75}
                listening={false}
              />
            )}

            {!panMode && draft && (
              <>
                <Rect
                  {...imageToRect(draft)}
                  stroke="rgba(15, 23, 42, 0.92)"
                  strokeWidth={4.8}
                  strokeScaleEnabled={false}
                  cornerRadius={6}
                  listening={false}
                />
                <Rect
                  {...imageToRect(draft)}
                  stroke={getClassColor(draft.classId, "yellow")}
                  fill="rgba(248, 250, 252, 0.12)"
                  strokeWidth={3.2}
                  strokeScaleEnabled={false}
                  cornerRadius={6}
                  dash={[10, 7]}
                  shadowBlur={8}
                  shadowColor={getClassColor(draft.classId, "yellow")}
                  listening={false}
                />
              </>
            )}

            {!panMode && (
              <Transformer
                ref={trRef}
                keepRatio={false}
                rotateEnabled
                anchorSize={10}
                anchorCornerRadius={6}
                anchorFill="#38bdf8"
                anchorStroke="#0f172a"
                anchorStrokeWidth={1}
                borderStroke="#7dd3fc"
                borderStrokeWidth={1.5}
                borderDash={[5, 4]}
                rotateAnchorOffset={32}
                rotateAnchorCursor="grab"
                anchorStyleFunc={(anchor) => {
                  const anchorName = anchor.name?.() ?? "";
                  if (anchorName.includes("rotater")) {
                    anchor.setAttrs({
                      fill: "#f59e0b",
                      stroke: "#7c2d12",
                      strokeWidth: 1.5,
                      cursor: "grab",
                    });
                  }
                }}
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
            )}
          </Layer>
        </Stage>

        {!!imgW && !!imgH && (
          <div
            ref={minimapRef}
            onPointerDown={handleMinimapPointerDown}
            onPointerMove={handleMinimapPointerMove}
            onPointerUp={handleMinimapPointerUp}
            onPointerLeave={handleMinimapPointerUp}
            style={{
              position: "absolute",
              right: 12,
              bottom: 12,
              width: minimap.w,
              height: minimap.h,
              borderRadius: 8,
              border: "1px solid #334155",
              background: "rgba(2, 6, 23, 0.85)",
              boxShadow: "0 8px 20px rgba(2, 6, 23, 0.45)",
              overflow: "hidden",
              cursor: isMinimapDragging ? "grabbing" : "pointer",
              touchAction: "none",
            }}
          >
            <div
              style={{
                width: minimap.w,
                height: minimap.h,
                backgroundImage: `url(${imageUrl})`,
                backgroundSize: "100% 100%",
                backgroundPosition: "center",
                backgroundRepeat: "no-repeat",
                opacity: 0.9,
              }}
            />
            <div
              style={{
                position: "absolute",
                left: viewportInImage.x * minimap.scale,
                top: viewportInImage.y * minimap.scale,
                width: Math.max(12, viewportInImage.w * minimap.scale),
                height: Math.max(12, viewportInImage.h * minimap.scale),
                border: "1px solid #38bdf8",
                background: "rgba(56, 189, 248, 0.15)",
                boxSizing: "border-box",
              }}
            />
          </div>
        )}
      </div>
    </div>
  );
}

const toolBtn: React.CSSProperties = {
  border: "1px solid #334155",
  background: "#0b1220",
  color: "#e2e8f0",
  borderRadius: 8,
  padding: "5px 10px",
  fontSize: 12,
  fontWeight: 700,
  cursor: "pointer",
};

const toolBtnPrimary: React.CSSProperties = {
  ...toolBtn,
  border: "1px solid #1d4ed8",
  background: "#1d4ed8",
  color: "#eff6ff",
};
