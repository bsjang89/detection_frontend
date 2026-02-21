import client from "./client";

export interface TrainingConfig {
  epochs: number;
  batch: number;
  imgsz: number;
  lr0: number;
  patience: number;
  cache: boolean;
  workers: number;
  optimizer: string;
  pretrained: boolean;
  mosaic?: number;
  mixup?: number;
  close_mosaic?: number;
}

export interface TrainingSessionCreate {
  project_id: number;
  name?: string;
  model_type: string;
  config: TrainingConfig;
}

export type TrainingStatus = "pending" | "running" | "completed" | "failed" | "stopped";

export interface TrainingSession {
  id: number;
  project_id: number;
  name: string | null;
  model_type: string;
  config: Record<string, unknown>;
  status: TrainingStatus;
  progress: number;
  best_weights_path: string | null;
  last_weights_path: string | null;
  final_map50: number | null;
  final_map50_95: number | null;
  final_precision: number | null;
  final_recall: number | null;
  error_message: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
}

export interface MetricsLog {
  id: number;
  training_session_id: number;
  epoch: number;
  train_box_loss: number | null;
  train_cls_loss: number | null;
  train_dfl_loss: number | null;
  train_total_loss: number | null;
  val_box_loss: number | null;
  val_cls_loss: number | null;
  val_dfl_loss: number | null;
  val_total_loss: number | null;
  map50: number | null;
  map50_95: number | null;
  precision: number | null;
  recall: number | null;
  learning_rate: number | null;
  logged_at: string;
}

export interface DatasetSplitResult {
  train: number;
  val: number;
  test: number;
  total: number;
}

export const trainingApi = {
  createSession: (data: TrainingSessionCreate) =>
    client.post<TrainingSession>("/training/sessions", data),

  startTraining: (sessionId: number) =>
    client.post(`/training/sessions/${sessionId}/start`),

  stopTraining: (sessionId: number) =>
    client.post(`/training/sessions/${sessionId}/stop`),

  getSession: (sessionId: number) =>
    client.get<TrainingSession>(`/training/sessions/${sessionId}`),

  getStatus: (sessionId: number) =>
    client.get(`/training/sessions/${sessionId}/status`),

  getMetrics: (sessionId: number) =>
    client.get<MetricsLog[]>(`/training/sessions/${sessionId}/metrics`),

  listProjectSessions: (projectId: number) =>
    client.get<TrainingSession[]>(`/training/projects/${projectId}/sessions`),

  splitDataset: (
    projectId: number,
    trainRatio = 0.7,
    valRatio = 0.2,
    testRatio = 0.1
  ) =>
    client.post<DatasetSplitResult>(
      `/training/projects/${projectId}/dataset/split`,
      null,
      {
        params: {
          train_ratio: trainRatio,
          val_ratio: valRatio,
          test_ratio: testRatio,
        },
      }
    ),

  getDatasetStats: (projectId: number) =>
    client.get(`/training/projects/${projectId}/dataset/stats`),
};
