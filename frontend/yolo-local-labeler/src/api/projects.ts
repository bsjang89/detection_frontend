import client from "./client";

export type TaskType = "bbox" | "obb";
export type ProjectStatus = "active" | "archived" | "deleted";

export interface ProjectCreate {
  name: string;
  description?: string;
  task_type: TaskType;
}

export interface ProjectUpdate {
  name?: string;
  description?: string;
  status?: ProjectStatus;
}

export interface ClassDef {
  id: number;
  project_id: number;
  class_id: number;
  class_name: string;
  color: string | null;
}

export interface ProjectWithStats {
  id: number;
  name: string;
  description: string | null;
  task_type: TaskType;
  status: ProjectStatus;
  created_at: string;
  updated_at: string | null;
  total_images: number;
  labeled_images: number;
  train_images: number;
  val_images: number;
  test_images: number;
  total_classes: number;
  total_annotations: number;
}

export interface ImageInfo {
  id: number;
  project_id: number;
  filename: string;
  file_path: string;
  thumbnail_path?: string | null;
  viewer_path?: string | null;
  width: number;
  height: number;
  split_type: string;
  annotation_version: number;
  uploaded_at: string;
  annotation_count: number;
}

export type DuplicateMode = "skip" | "rename";

export interface UploadImageResult {
  id: number | null;
  filename: string;
  file_path?: string;
  thumbnail_path?: string;
  viewer_path?: string;
  width?: number;
  height?: number;
  status?: "uploaded" | "skipped";
  reason?: string | null;
  renamed_from?: string | null;
}

export const projectsApi = {
  list: () => client.get<ProjectWithStats[]>("/projects/"),

  get: (id: number) => client.get<ProjectWithStats>(`/projects/${id}`),

  create: (data: ProjectCreate) => client.post<ProjectWithStats>("/projects/", data),

  update: (id: number, data: ProjectUpdate) =>
    client.put<ProjectWithStats>(`/projects/${id}`, data),

  delete: (id: number) => client.delete(`/projects/${id}`),

  uploadImages: (
    projectId: number,
    files: File[],
    onProgress?: (percent: number) => void,
    duplicateMode: DuplicateMode = "rename"
  ) => {
    const formData = new FormData();
    files.forEach((f) => formData.append("files", f));
    return client.post<UploadImageResult[]>(`/projects/${projectId}/images/upload`, formData, {
      params: { duplicate_mode: duplicateMode },
      headers: { "Content-Type": "multipart/form-data" },
      timeout: 300000,
      onUploadProgress: (e) => {
        if (e.total && onProgress) {
          onProgress(Math.round((e.loaded / e.total) * 100));
        }
      },
    });
  },

  listImages: (projectId: number) =>
    client.get<ImageInfo[]>("/images", { params: { project_id: projectId } }),

  createClass: (projectId: number, data: { class_id: number; class_name: string; color?: string }) =>
    client.post<ClassDef>(`/projects/${projectId}/classes`, { ...data, project_id: projectId }),

  listClasses: (projectId: number) =>
    client.get<ClassDef[]>(`/projects/${projectId}/classes`),
};
