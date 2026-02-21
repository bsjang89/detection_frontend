export type ClassDef = { id: number; name: string };

type BoxAnno = {
  id: string;
  classId: number;
  cx: number;
  cy: number;
  w: number;
  h: number;
  rotation: number;

  // ✅ 드로잉용 (임시)
  startX?: number;
  startY?: number;
};
