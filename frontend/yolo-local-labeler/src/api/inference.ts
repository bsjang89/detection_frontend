import client from "./client";

export interface InferenceRequest {
  model_id: number;
  image_id: number;
  conf_threshold?: number;
  iou_threshold?: number;
  save_result_image?: boolean;
  save_to_db?: boolean;
}

export interface InferenceBatchRequest {
  model_id: number;
  image_ids: number[];
  conf_threshold?: number;
  iou_threshold?: number;
  batch_size?: number;
  save_result_image?: boolean;
  save_to_db?: boolean;
}

export interface CompareRequest {
  model_id_1: number;
  model_id_2: number;
  image_id: number;
  conf_threshold?: number;
  iou_threshold?: number;
}

export interface CompareBatchRequest {
  model_id_1: number;
  model_id_2: number;
  image_ids: number[];
  conf_threshold?: number;
  iou_threshold?: number;
  batch_size?: number;
  save_result_image?: boolean;
  save_to_db?: boolean;
  include_detections?: boolean;
}

export interface Detection {
  class_id: number;
  confidence: number;
  bbox?: number[];
  obb?: number[];
}

export interface InferenceResult {
  inference_result_id: number | null;
  detections: Detection[];
  result_image_path: string | null;
  inference_time_ms: number;
  detection_count: number;
}

export interface BatchInferenceResult extends InferenceResult {
  image_id: number;
}

export interface PredictBatchResponse {
  results: BatchInferenceResult[];
}

export interface ModelInfo {
  id: number;
  training_session_id: number;
  name: string;
  weights_path: string;
  is_best: boolean;
  map50: number | null;
  map50_95: number | null;
  precision: number | null;
  recall: number | null;
  model_type: string;
  task_type: string;
  img_size: number;
  num_classes: number;
  created_at: string;
}

export interface CompareResult {
  model_1: InferenceResult & { model_id: number };
  model_2: InferenceResult & { model_id: number };
}

export interface CompareBatchItem {
  image_id: number;
  model_1: InferenceResult & { model_id: number };
  model_2: InferenceResult & { model_id: number };
}

export interface CompareBatchResponse {
  results: CompareBatchItem[];
}

export const inferenceApi = {
  predict: (data: InferenceRequest) =>
    client.post<InferenceResult>("/inference/predict", data),

  predictBatch: (data: InferenceBatchRequest) =>
    client.post<PredictBatchResponse>("/inference/predict/batch", data),

  compare: (data: CompareRequest) =>
    client.post<CompareResult>("/inference/compare", data),

  compareBatch: (data: CompareBatchRequest) =>
    client.post<CompareBatchResponse>("/inference/compare/batch", data, { timeout: 300000 }),

  listModels: () => client.get<ModelInfo[]>("/inference/models"),

  getModel: (modelId: number) =>
    client.get<ModelInfo>(`/inference/models/${modelId}`),
};
