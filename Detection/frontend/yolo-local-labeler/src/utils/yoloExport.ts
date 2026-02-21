import type { BoxAnno } from "../types";

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

export function exportBBoxYOLO(boxes: BoxAnno[], imgW: number, imgH: number): string {
  // Standard YOLO: class cx cy w h (normalized)
  return boxes
    .map((b) => {
      const cx = clamp01(b.cx / imgW);
      const cy = clamp01(b.cy / imgH);
      const w = clamp01(b.w / imgW);
      const h = clamp01(b.h / imgH);
      return `${b.classId} ${cx.toFixed(6)} ${cy.toFixed(6)} ${w.toFixed(6)} ${h.toFixed(6)}`;
    })
    .join("\n");
}

export function exportOBBYOLO(boxes: BoxAnno[], imgW: number, imgH: number): string {
  // Ultralytics YOLO OBB commonly accepts polygon(4 points) normalized:
  // class x1 y1 x2 y2 x3 y3 x4 y4
  return boxes
    .map((b) => {
      const rad = (b.rotation * Math.PI) / 180;
      const cos = Math.cos(rad);
      const sin = Math.sin(rad);

      const hw = b.w / 2;
      const hh = b.h / 2;

      const corners = [
        { x: -hw, y: -hh },
        { x: hw, y: -hh },
        { x: hw, y: hh },
        { x: -hw, y: hh },
      ].map((p) => {
        const rx = p.x * cos - p.y * sin;
        const ry = p.x * sin + p.y * cos;
        const x = b.cx + rx;
        const y = b.cy + ry;
        return { x: clamp01(x / imgW), y: clamp01(y / imgH) };
      });

      const pts = corners.map((p) => `${p.x.toFixed(6)} ${p.y.toFixed(6)}`).join(" ");
      return `${b.classId} ${pts}`;
    })
    .join("\n");
}
