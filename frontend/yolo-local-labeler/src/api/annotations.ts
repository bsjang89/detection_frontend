import client from "./client";

export interface AnnotationBase {
  class_id: number;
  // normalized 0-1
  cx: number;
  cy: number;
  width: number;
  height: number;
  rotation: number;
  // pixel absolute
  px_cx?: number | null;
  px_cy?: number | null;
  px_width?: number | null;
  px_height?: number | null;
}

export interface AnnotationResponse extends AnnotationBase {
  id: number;
  image_id: number;
  created_at: string;
  updated_at: string | null;
}

export const annotationsApi = {
  getByImage: (imageId: number) =>
    client.get<AnnotationResponse[]>(`/annotations/image/${imageId}`),

  batchSave: (imageId: number, annotations: AnnotationBase[]) =>
    client.post<AnnotationResponse[]>("/annotations/batch", {
      image_id: imageId,
      annotations,
    }),
};
