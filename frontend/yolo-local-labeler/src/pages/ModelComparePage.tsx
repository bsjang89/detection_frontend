import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { inferenceApi } from "../api/inference";
import { trainingApi } from "../api/training";
import { projectsApi } from "../api/projects";
import type { ModelInfo, InferenceResult, CompareBatchItem } from "../api/inference";
import type { ImageInfo, ProjectWithStats } from "../api/projects";
import { API_SERVER_URL } from "../api/client";

const COMPARE_RESULTS_PAGE_SIZE = 10;

export default function ModelComparePage() {
  const navigate = useNavigate();

  const [models, setModels] = useState<ModelInfo[]>([]);
  const [model1Id, setModel1Id] = useState<number | "">("");
  const [model2Id, setModel2Id] = useState<number | "">("");

  const [projects, setProjects] = useState<ProjectWithStats[]>([]);
  const [projectId, setProjectId] = useState<number | "">("");
  const [images, setImages] = useState<ImageInfo[]>([]);
  const [imageId, setImageId] = useState<number | "">("");
  const [sessionProjectMap, setSessionProjectMap] = useState<Record<number, number>>({});

  const [confThreshold, setConfThreshold] = useState(0.25);
  const [iouThreshold, setIouThreshold] = useState(0.7);

  const [result1, setResult1] = useState<InferenceResult | null>(null);
  const [result2, setResult2] = useState<InferenceResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [compareAllBatchSize, setCompareAllBatchSize] = useState<5 | 10>(10);
  const [compareAllProgress, setCompareAllProgress] = useState<{ done: number; total: number } | null>(null);
  const [compareAllSummary, setCompareAllSummary] = useState<{
    totalImages: number;
    page: number;
    from: number;
    to: number;
    avgDetectionsA: number;
    avgDetectionsB: number;
    avgTimeA: number;
    avgTimeB: number;
  } | null>(null);
  const [compareAllRows, setCompareAllRows] = useState<CompareBatchItem[]>([]);
  const [compareAllPage, setCompareAllPage] = useState(1);
  const [compareAllPageCache, setCompareAllPageCache] = useState<Record<number, CompareBatchItem[]>>({});
  const [compareAllPrefetching, setCompareAllPrefetching] = useState(false);
  const compareAllRunRef = useRef(0);
  const compareAllPageRef = useRef(1);

  useEffect(() => {
    compareAllPageRef.current = compareAllPage;
  }, [compareAllPage]);

  useEffect(() => {
    async function loadInitial() {
      try {
        const [mRes, pRes] = await Promise.all([
          inferenceApi.listModels(),
          projectsApi.list(),
        ]);
        setModels(mRes.data);
        setProjects(pRes.data);
      } catch (e) {
        console.error(e);
      }
    }
    loadInitial();
  }, []);

  useEffect(() => {
    async function loadImages() {
      if (!projectId) {
        setImages([]);
        setImageId("");
        return;
      }
      try {
        const res = await projectsApi.listImages(Number(projectId));
        setImages(res.data);
      } catch (e) {
        console.error(e);
      }
    }
    loadImages();
  }, [projectId]);

  async function resolveProjectIdFromModel(modelId: number): Promise<number | null> {
    const model = models.find((m) => m.id === modelId);
    if (!model) return null;

    const cached = sessionProjectMap[model.training_session_id];
    if (cached) return cached;

    try {
      const res = await trainingApi.getSession(model.training_session_id);
      const pid = res.data.project_id;
      setSessionProjectMap((prev) => ({ ...prev, [model.training_session_id]: pid }));
      return pid;
    } catch (e) {
      console.error(e);
      return null;
    }
  }

  async function handleModelAChange(value: string) {
    const next = value ? Number(value) : "";
    setModel1Id(next);
    if (next && !projectId) {
      const pid = await resolveProjectIdFromModel(next);
      if (pid) setProjectId(pid);
    }
  }

  async function handleModelBChange(value: string) {
    const next = value ? Number(value) : "";
    setModel2Id(next);
    if (next && !projectId) {
      const pid = await resolveProjectIdFromModel(next);
      if (pid) setProjectId(pid);
    }
  }

  function handleProjectChange(value: string) {
    compareAllRunRef.current += 1;
    const next = value ? Number(value) : "";
    setProjectId(next);
    setImageId("");
    setResult1(null);
    setResult2(null);
    setCompareAllSummary(null);
    setCompareAllRows([]);
    setCompareAllPage(1);
    setCompareAllPageCache({});
    setCompareAllPrefetching(false);
    setCompareAllProgress(null);
  }

  function summarizePageRows(rows: CompareBatchItem[], page: number, totalImages: number) {
    const count = rows.length || 1;
    const sumDetA = rows.reduce((s, r) => s + r.model_1.detection_count, 0);
    const sumDetB = rows.reduce((s, r) => s + r.model_2.detection_count, 0);
    const sumTimeA = rows.reduce((s, r) => s + r.model_1.inference_time_ms, 0);
    const sumTimeB = rows.reduce((s, r) => s + r.model_2.inference_time_ms, 0);
    const fromIdx = (page - 1) * COMPARE_RESULTS_PAGE_SIZE;
    return {
      totalImages,
      page,
      from: fromIdx + 1,
      to: Math.min(fromIdx + rows.length, totalImages),
      avgDetectionsA: sumDetA / count,
      avgDetectionsB: sumDetB / count,
      avgTimeA: sumTimeA / count,
      avgTimeB: sumTimeB / count,
    };
  }

  async function fetchComparePage(
    page: number,
    runId: number,
    modelA: number,
    modelB: number,
    totalImages: number
  ): Promise<{ rows: CompareBatchItem[]; processed: number } | null> {
    const fromIdx = (page - 1) * COMPARE_RESULTS_PAGE_SIZE;
    const chunk = images.slice(fromIdx, fromIdx + COMPARE_RESULTS_PAGE_SIZE);
    if (chunk.length === 0) return { rows: [], processed: 0 };

    const res = await inferenceApi.compareBatch({
      model_id_1: modelA,
      model_id_2: modelB,
      image_ids: chunk.map((img) => img.id),
      conf_threshold: confThreshold,
      iou_threshold: iouThreshold,
      batch_size: compareAllBatchSize,
      save_result_image: true,
      save_to_db: false,
      include_detections: false,
    });

    if (compareAllRunRef.current !== runId) return null;

    const rows = res.data.results as CompareBatchItem[];
    setCompareAllPageCache((prev) => ({ ...prev, [page]: rows }));
    if (compareAllPageRef.current === page) {
      setCompareAllRows(rows);
      setCompareAllSummary(summarizePageRows(rows, page, totalImages));
    }
    return { rows, processed: chunk.length };
  }

  async function handleCompare() {
    if (!model1Id || !model2Id || !imageId) {
      alert("Select Model A, Model B, and Image.");
      return;
    }
    if (model1Id === model2Id) {
      alert("Choose different models for A and B.");
      return;
    }

    setLoading(true);
    setResult1(null);
    setResult2(null);

    try {
      const res = await inferenceApi.compare({
        model_id_1: Number(model1Id),
        model_id_2: Number(model2Id),
        image_id: Number(imageId),
        conf_threshold: confThreshold,
        iou_threshold: iouThreshold,
      });

      setResult1(res.data.model_1);
      setResult2(res.data.model_2);
    } catch (e) {
      const detail = axios.isAxiosError(e) ? e.response?.data?.detail : undefined;
      alert(detail ?? "Comparison failed");
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  async function handleSinglePredict(modelId: number, setter: (r: InferenceResult) => void) {
    if (!imageId) { alert("Select an image"); return; }
    setLoading(true);
    try {
      const res = await inferenceApi.predict({
        model_id: modelId,
        image_id: Number(imageId),
        conf_threshold: confThreshold,
        iou_threshold: iouThreshold,
        save_result_image: true,
        save_to_db: true,
      });
      setter(res.data);
    } catch (e) {
      const detail = axios.isAxiosError(e) ? e.response?.data?.detail : undefined;
      alert(detail ?? "Inference failed");
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  async function handleCompareAllImages() {
    if (!model1Id || !model2Id) {
      alert("Select Model A and Model B.");
      return;
    }
    if (model1Id === model2Id) {
      alert("Choose different models for A and B.");
      return;
    }
    if (!projectId) {
      alert("Select a project first.");
      return;
    }
    if (images.length === 0) {
      alert("No images in selected project.");
      return;
    }

    compareAllRunRef.current += 1;
    const runId = compareAllRunRef.current;
    const modelA = Number(model1Id);
    const modelB = Number(model2Id);
    const totalImages = images.length;
    const totalPages = Math.max(1, Math.ceil(totalImages / COMPARE_RESULTS_PAGE_SIZE));

    setLoading(true);
    setCompareAllSummary(null);
    setCompareAllRows([]);
    setCompareAllPage(1);
    setCompareAllPageCache({});
    setCompareAllPrefetching(false);
    setCompareAllProgress({ done: 0, total: totalImages });

    try {
      const first = await fetchComparePage(1, runId, modelA, modelB, totalImages);
      if (!first) return;
      setCompareAllPage(1);
      setCompareAllRows(first.rows);
      setCompareAllSummary(summarizePageRows(first.rows, 1, totalImages));
      setCompareAllProgress({ done: first.processed, total: totalImages });
    } catch (e) {
      const detail = axios.isAxiosError(e) ? e.response?.data?.detail : undefined;
      alert(detail ?? "Compare all images failed");
      console.error(e);
    } finally {
      setLoading(false);
    }

    if (compareAllRunRef.current !== runId) return;
    if (totalPages <= 1) {
      setCompareAllProgress(null);
      return;
    }

    setCompareAllPrefetching(true);
    let done = Math.min(COMPARE_RESULTS_PAGE_SIZE, totalImages);
    for (let page = 2; page <= totalPages; page++) {
      if (compareAllRunRef.current !== runId) return;
      try {
        const pageResult = await fetchComparePage(page, runId, modelA, modelB, totalImages);
        if (!pageResult) return;
        done += pageResult.processed;
        setCompareAllProgress({ done, total: totalImages });
      } catch (e) {
        const detail = axios.isAxiosError(e) ? e.response?.data?.detail : undefined;
        alert(detail ?? `Failed to prefetch page ${page}`);
        console.error(e);
        break;
      }
    }
    if (compareAllRunRef.current === runId) {
      setCompareAllPrefetching(false);
      setCompareAllProgress(null);
    }
  }

  async function loadCompareAllPage(page: number) {
    if (!model1Id || !model2Id || !projectId) return;

    const totalPages = Math.max(1, Math.ceil(images.length / COMPARE_RESULTS_PAGE_SIZE));
    const safePage = Math.max(1, Math.min(totalPages, page));
    const cachedRows = compareAllPageCache[safePage];
    // Navigation is cache-only to avoid "hanging" on pages that are still processing.
    if (!cachedRows) {
      return;
    }

    setCompareAllPage(safePage);
    setCompareAllRows(cachedRows);
    const cachedCount = cachedRows.length || 1;
    const sumDetA = cachedRows.reduce((s, r) => s + r.model_1.detection_count, 0);
    const sumDetB = cachedRows.reduce((s, r) => s + r.model_2.detection_count, 0);
    const sumTimeA = cachedRows.reduce((s, r) => s + r.model_1.inference_time_ms, 0);
    const sumTimeB = cachedRows.reduce((s, r) => s + r.model_2.inference_time_ms, 0);
    const fromIdx = (safePage - 1) * COMPARE_RESULTS_PAGE_SIZE;
    setCompareAllSummary({
      totalImages: images.length,
      page: safePage,
      from: fromIdx + 1,
      to: Math.min(fromIdx + cachedRows.length, images.length),
      avgDetectionsA: sumDetA / cachedCount,
      avgDetectionsB: sumDetB / cachedCount,
      avgTimeA: sumTimeA / cachedCount,
      avgTimeB: sumTimeB / cachedCount,
    });
  }

  const selectedProject = projects.find((p) => p.id === projectId);
  const selectedImage = images.find((img) => img.id === imageId);
  const readyModels = !!model1Id && !!model2Id && model1Id !== model2Id;
  const readyImage = !!projectId && !!imageId;
  const readyToCompare = readyModels && readyImage;
  const readyToCompareAll = readyModels && !!projectId && images.length > 0;
  const totalComparePages = Math.max(1, Math.ceil(images.length / COMPARE_RESULTS_PAGE_SIZE));
  const currentCompareRows = compareAllRows;
  const prevDisabled = compareAllPage <= 1;
  const nextPageReady = !!compareAllPageCache[compareAllPage + 1];
  const nextDisabled = compareAllPage >= totalComparePages || !nextPageReady;

  return (
    <div style={{ maxWidth: 1400, margin: "0 auto", padding: 24 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
        <button onClick={() => navigate("/")} style={btnStyle}>Projects</button>
        <h1 style={{ margin: 0 }}>Model Compare / Inference</h1>
      </div>

      <div style={{ ...cardStyle, marginBottom: 16, background: "#111827", borderColor: "#1e3a8a" }}>
        <div style={{ fontSize: 13, color: "#cbd5e1", marginBottom: 10, fontWeight: 700 }}>How to use</div>
        <ol style={{ margin: 0, paddingLeft: 18, lineHeight: 1.8, color: "#cbd5e1", fontSize: 13 }}>
          <li>Select Model A and Model B.</li>
          <li>Select a Project, then select an Image from that project.</li>
          <li>Click Compare Both to run both models on the same image.</li>
          <li>Use Run Model A/B Only for quick single-model checks.</li>
          <li>Use Compare All Images to run the selected project in batch.</li>
        </ol>
      </div>

      {/* Controls */}
      <div style={{ ...cardStyle, marginBottom: 16 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          <label style={labelStyle}>
            Model A
            <select value={model1Id} onChange={(e) => handleModelAChange(e.target.value)} style={inputStyle}>
              <option value="">-- Select model --</option>
              {models.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name} ({m.model_type}) - mAP50: {m.map50 != null ? (m.map50 * 100).toFixed(1) + "%" : "N/A"}
                </option>
              ))}
            </select>
          </label>

          <label style={labelStyle}>
            Model B
            <select value={model2Id} onChange={(e) => handleModelBChange(e.target.value)} style={inputStyle}>
              <option value="">-- Select model --</option>
              {models.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name} ({m.model_type}) - mAP50: {m.map50 != null ? (m.map50 * 100).toFixed(1) + "%" : "N/A"}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr 1fr", gap: 16, marginTop: 12 }}>
          <label style={labelStyle}>
            Project
            <select value={projectId} onChange={(e) => handleProjectChange(e.target.value)} style={inputStyle}>
              <option value="">-- Select project --</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>

          <label style={labelStyle}>
            Image
            <select value={imageId} onChange={(e) => setImageId(e.target.value ? Number(e.target.value) : "")} style={inputStyle}>
              <option value="">-- Select image --</option>
              {images.map((img) => (
                <option key={img.id} value={img.id}>{img.filename} ({img.width}x{img.height})</option>
              ))}
            </select>
          </label>

          <label style={labelStyle}>
            Conf Threshold
            <input type="number" value={confThreshold} min={0} max={1} step={0.05}
              onChange={(e) => setConfThreshold(Number(e.target.value))} style={inputStyle} />
          </label>

          <label style={labelStyle}>
            IOU Threshold
            <input type="number" value={iouThreshold} min={0} max={1} step={0.05}
              onChange={(e) => setIouThreshold(Number(e.target.value))} style={inputStyle} />
          </label>

          <label style={labelStyle}>
            Batch (All Images)
            <select
              value={compareAllBatchSize}
              onChange={(e) => setCompareAllBatchSize(Number(e.target.value) as 5 | 10)}
              style={inputStyle}
            >
              <option value={10}>10 (Recommended)</option>
              <option value={5}>5</option>
            </select>
          </label>
        </div>

        <div style={{ marginTop: 12, fontSize: 12, color: "#9ca3af", display: "flex", gap: 14, flexWrap: "wrap" }}>
          <span>Models: {readyModels ? "ready" : "not ready"}</span>
          <span>Image: {readyImage ? "ready" : "not ready"}</span>
          {selectedProject && <span>Project: {selectedProject.name}</span>}
          {selectedImage && <span>Image: {selectedImage.filename}</span>}
        </div>

        <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
          <button onClick={handleCompare} disabled={loading || !readyToCompare}
            style={{ ...btnStyle, background: "#2563eb", padding: "10px 24px" }}>
            {loading ? "Processing..." : "Compare Both (A vs B)"}
          </button>
          <button
            onClick={handleCompareAllImages}
            disabled={loading || !readyToCompareAll}
            style={{ ...btnStyle, background: "#059669" }}
          >
            {loading ? "Processing..." : `Compare All Images (Batch ${compareAllBatchSize})`}
          </button>
          {model1Id && (
            <button onClick={() => handleSinglePredict(Number(model1Id), setResult1)} disabled={loading || !imageId}
              style={{ ...btnStyle, background: "#7c3aed" }}>
              Run Model A Only (quick)
            </button>
          )}
          {model2Id && (
            <button onClick={() => handleSinglePredict(Number(model2Id), setResult2)} disabled={loading || !imageId}
              style={{ ...btnStyle, background: "#7c3aed" }}>
              Run Model B Only (quick)
            </button>
          )}
        </div>

        {compareAllProgress && (
          <div style={{ marginTop: 10, fontSize: 12, color: "#7dd3fc" }}>
            Compare all progress: {compareAllProgress.done}/{compareAllProgress.total}
            {compareAllPrefetching ? " (background prefetch running)" : ""}
          </div>
        )}
        {compareAllSummary && (
          <div style={{ marginTop: 10, fontSize: 12, color: "#cbd5e1", display: "flex", gap: 14, flexWrap: "wrap" }}>
            <span>Total images: {compareAllSummary.totalImages}</span>
            <span>Page: {compareAllSummary.page} ({compareAllSummary.from}-{compareAllSummary.to})</span>
            <span>Avg det A: {compareAllSummary.avgDetectionsA.toFixed(2)}</span>
            <span>Avg det B: {compareAllSummary.avgDetectionsB.toFixed(2)}</span>
            <span>Avg time A: {compareAllSummary.avgTimeA.toFixed(1)}ms</span>
            <span>Avg time B: {compareAllSummary.avgTimeB.toFixed(1)}ms</span>
          </div>
        )}
      </div>

      {compareAllRows.length > 0 && (
        <div style={{ ...cardStyle, marginBottom: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <div style={{ fontWeight: 700, color: "#fff" }}>
              Compare All Results (10 images per page)
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <button
                onClick={() => loadCompareAllPage(compareAllPage - 1)}
                disabled={prevDisabled}
                style={btnStyle}
              >
                Prev 10
              </button>
              <span style={{ fontSize: 12, color: "#cbd5e1" }}>
                Page {compareAllPage}/{totalComparePages}
              </span>
              <button
                onClick={() => loadCompareAllPage(compareAllPage + 1)}
                disabled={nextDisabled}
                style={btnStyle}
              >
                Next 10
              </button>
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {currentCompareRows.map((row) => {
              const img = images.find((im) => im.id === row.image_id);
              return (
                <div key={row.image_id} style={{ border: "1px solid #2a2a2a", borderRadius: 10, padding: 12 }}>
                  <div style={{ fontSize: 13, color: "#e5e7eb", marginBottom: 8 }}>
                    {img?.filename ?? `image_${row.image_id}`} (ID: {row.image_id})
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                    <MiniCompareCard title="Model A" result={row.model_1} />
                    <MiniCompareCard title="Model B" result={row.model_2} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Results side by side */}
      {(result1 || result2) && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          <ResultCard label="Model A" result={result1} />
          <ResultCard label="Model B" result={result2} />
        </div>
      )}
    </div>
  );
}

function ResultCard({ label, result }: { label: string; result: InferenceResult | null }) {
  if (!result) {
    return (
      <div style={{ ...cardStyle, textAlign: "center", padding: 40, color: "#888" }}>
        {label}: No result yet
      </div>
    );
  }

  return (
    <div style={cardStyle}>
      <h3 style={{ marginTop: 0 }}>{label}</h3>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 12 }}>
        <div>
          <div style={{ fontSize: 12, color: "#999" }}>Detections</div>
          <div style={{ fontWeight: 700, fontSize: 20, color: "#e5e5e5" }}>{result.detection_count}</div>
        </div>
        <div>
          <div style={{ fontSize: 12, color: "#999" }}>Inference Time</div>
          <div style={{ fontWeight: 700, fontSize: 20, color: "#e5e5e5" }}>{result.inference_time_ms.toFixed(1)}ms</div>
        </div>
      </div>

      {result.result_image_path && (
        <img
          src={toImageUrl(result.result_image_path)}
          alt="Detection result"
          style={{ width: "100%", borderRadius: 8 }}
        />
      )}

      {result.detections.length > 0 && (
        <div style={{ marginTop: 12, maxHeight: 200, overflow: "auto", fontSize: 13 }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ textAlign: "left", borderBottom: "1px solid #444" }}>
                <th style={{ padding: "6px 8px", color: "#999" }}>Class</th>
                <th style={{ padding: "6px 8px", color: "#999" }}>Conf</th>
              </tr>
            </thead>
            <tbody>
              {result.detections.map((d, i) => (
                <tr key={i} style={{ borderBottom: "1px solid #333" }}>
                  <td style={{ padding: "6px 8px", color: "#e5e5e5" }}>Class {d.class_id}</td>
                  <td style={{ padding: "6px 8px", color: "#e5e5e5" }}>{(d.confidence * 100).toFixed(1)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function MiniCompareCard({
  title,
  result,
}: {
  title: string;
  result: InferenceResult & { model_id: number };
}) {
  return (
    <div style={{ background: "#141414", borderRadius: 8, padding: 10, border: "1px solid #333" }}>
      <div style={{ fontSize: 12, color: "#cbd5e1", marginBottom: 6 }}>{title}</div>
      <div style={{ fontSize: 12, color: "#94a3b8", marginBottom: 6 }}>
        Det: {result.detection_count} | Time: {result.inference_time_ms.toFixed(1)}ms
      </div>
      {result.result_image_path ? (
        <img
          src={toImageUrl(result.result_image_path)}
          alt={`${title} result`}
          style={{ width: "100%", borderRadius: 6, display: "block" }}
        />
      ) : (
        <div style={{ fontSize: 12, color: "#6b7280" }}>No result image</div>
      )}
    </div>
  );
}

function toImageUrl(path: string) {
  const normalized = path.replace(/\\/g, "/");
  if (normalized.startsWith("http://") || normalized.startsWith("https://")) return normalized;
  return `${API_SERVER_URL}/${normalized}`;
}

const btnStyle: React.CSSProperties = { padding: "8px 16px", borderRadius: 8, border: "none", background: "#333", color: "#fff", cursor: "pointer", fontSize: 14, fontWeight: 500 };
const inputStyle: React.CSSProperties = { padding: "8px 12px", borderRadius: 8, border: "1px solid #444", background: "#1a1a1a", color: "#fff", fontSize: 15, width: "100%" };
const labelStyle: React.CSSProperties = { display: "flex", flexDirection: "column", gap: 5, fontSize: 14, color: "#ccc" };
const cardStyle: React.CSSProperties = { background: "#1a1a1a", borderRadius: 12, padding: 24, border: "1px solid #2a2a2a" };
