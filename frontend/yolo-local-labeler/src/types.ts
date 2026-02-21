export type ClassDef = { id: number; name: string };

export type BoxAnno = {
  id: string;
  classId: number;
  cx: number;
  cy: number;
  w: number;
  h: number;
  rotation: number;
  // Temporary fields used while drawing.
  startX?: number;
  startY?: number;
};

