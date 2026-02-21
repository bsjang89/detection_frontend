import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { inferenceApi } from "../api/inference";
import { projectsApi } from "../api/projects";
import type { ModelInfo, InferenceResult } from "../api/inference";
import type { ImageInfo } from "../api/projects";
import { API_SERVER_URL } from "../api/client";

export default function ModelComparePage() {
  const navigate = useNavigate();

  const [models, setModels] = useState<ModelInfo[]>([]);
  const [model1Id, setModel1Id] = useState<number | "">("");
  const [model2Id, setModel2Id] = useState<number | "">("");

  const [projectId, setProjectId] = useState<number | "">("");
  const [images, setImages] = useState<ImageInfo[]>([]);
  const [imageId, setImageId] = useState<number | "">("");

  const [confThreshold, setConfThreshold] = useState(0.25);
  const [iouThreshold, setIouThreshold] = useState(0.7);

  const [result1, setResult1] = useState<InferenceResult | null>(null);
  const [result2, setResult2] = useState<InferenceResult | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    inferenceApi.listModels().then((res) => setModels(res.data));
  }, []);

  useEffect(() => {
    if (!projectId) { setImages([]); return; }
    projectsApi.listImages(Number(projectId)).then((res) => setImages(res.data));
  }, [projectId]);

  async function handleCompare() {
    if (!model1Id || !model2Id || !imageId) {
      alert("Select two models and an image");
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
      alert("Comparison failed");
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
      });
      setter(res.data);
    } catch (e) {
      alert("Inference failed");
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  // Group models by project/type
  const projectIds = [...new Set(models.map((m) => m.training_session_id))];

  return (
    <div style={{ maxWidth: 1400, margin: "0 auto", padding: 24 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
        <button onClick={() => navigate("/")} style={btnStyle}>Projects</button>
        <h1 style={{ margin: 0 }}>Model Compare / Inference</h1>
      </div>

      {/* Controls */}
      <div style={{ ...cardStyle, marginBottom: 16 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          <label style={labelStyle}>
            Model A
            <select value={model1Id} onChange={(e) => setModel1Id(e.target.value ? Number(e.target.value) : "")} style={inputStyle}>
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
            <select value={model2Id} onChange={(e) => setModel2Id(e.target.value ? Number(e.target.value) : "")} style={inputStyle}>
              <option value="">-- Select model --</option>
              {models.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name} ({m.model_type}) - mAP50: {m.map50 != null ? (m.map50 * 100).toFixed(1) + "%" : "N/A"}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 16, marginTop: 12 }}>
          <label style={labelStyle}>
            Project (for image selection)
            <input type="number" value={projectId} onChange={(e) => setProjectId(e.target.value ? Number(e.target.value) : "")}
              placeholder="Project ID" style={inputStyle} />
          </label>

          <label style={labelStyle}>
            Image
            <select value={imageId} onChange={(e) => setImageId(e.target.value ? Number(e.target.value) : "")} style={inputStyle}>
              <option value="">-- Select image --</option>
              {images.map((img) => (
                <option key={img.id} value={img.id}>{img.filename}</option>
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
        </div>

        <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
          <button onClick={handleCompare} disabled={loading || !model1Id || !model2Id || !imageId}
            style={{ ...btnStyle, background: "#2563eb", padding: "10px 24px" }}>
            {loading ? "Processing..." : "Compare Both"}
          </button>
          {model1Id && (
            <button onClick={() => handleSinglePredict(Number(model1Id), setResult1)} disabled={loading || !imageId}
              style={{ ...btnStyle, background: "#7c3aed" }}>
              Run Model A Only
            </button>
          )}
          {model2Id && (
            <button onClick={() => handleSinglePredict(Number(model2Id), setResult2)} disabled={loading || !imageId}
              style={{ ...btnStyle, background: "#7c3aed" }}>
              Run Model B Only
            </button>
          )}
        </div>
      </div>

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
          src={`${API_SERVER_URL}/${result.result_image_path}`}
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

const btnStyle: React.CSSProperties = { padding: "8px 16px", borderRadius: 8, border: "none", background: "#333", color: "#fff", cursor: "pointer", fontSize: 14, fontWeight: 500 };
const inputStyle: React.CSSProperties = { padding: "8px 12px", borderRadius: 8, border: "1px solid #444", background: "#1a1a1a", color: "#fff", fontSize: 15, width: "100%" };
const labelStyle: React.CSSProperties = { display: "flex", flexDirection: "column", gap: 5, fontSize: 14, color: "#ccc" };
const cardStyle: React.CSSProperties = { background: "#1a1a1a", borderRadius: 12, padding: 24, border: "1px solid #2a2a2a" };
