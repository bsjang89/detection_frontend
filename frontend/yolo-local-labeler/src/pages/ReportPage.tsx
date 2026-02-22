import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { inferenceApi } from "../api/inference";
import type { ModelInfo } from "../api/inference";
import client from "../api/client";
import RoundedSelect from "../components/RoundedSelect";

export default function ReportPage() {
  const navigate = useNavigate();
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [selectedModelId, setSelectedModelId] = useState<number | "">("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    inferenceApi.listModels().then((res) => setModels(res.data));
  }, []);

  async function handleGenerate() {
    if (!selectedModelId) {
      alert("Select a model");
      return;
    }
    setLoading(true);
    try {
      const res = await client.get(`/inference/models/${selectedModelId}/report`, {
        responseType: "blob",
      });

      // Download HTML file
      const blob = new Blob([res.data], { type: "text/html" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `report_model_${selectedModelId}.html`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      const detail = axios.isAxiosError(e) ? e.response?.data?.detail : undefined;
      alert(detail ?? "Failed to generate report");
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  const selectedModel = models.find((m) => m.id === selectedModelId);

  return (
    <div className="page-shell" style={{ maxWidth: 980 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
        <button onClick={() => navigate("/")} style={btnStyle}>Projects</button>
        <h1 style={{ margin: 0 }}>Report Generation</h1>
      </div>

      <div style={cardStyle}>
        <h3 style={{ marginTop: 0 }}>Generate HTML Report</h3>

        <label style={labelStyle}>
          Select Model
          <RoundedSelect
            value={selectedModelId ? String(selectedModelId) : ""}
            onChange={(value) => setSelectedModelId(value ? Number(value) : "")}
            placeholder="-- Select a trained model --"
            options={models.map((m) => ({
              value: String(m.id),
              label: `${m.name} (${m.model_type}) - mAP50: ${m.map50 != null ? (m.map50 * 100).toFixed(1) + "%" : "N/A"}`,
            }))}
            style={inputStyle}
          />
        </label>

        {selectedModel && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12, marginTop: 16 }}>
            <StatBox label="Model Type" value={selectedModel.model_type} />
            <StatBox label="Task Type" value={selectedModel.task_type} />
            <StatBox label="mAP50" value={selectedModel.map50 != null ? `${(selectedModel.map50 * 100).toFixed(1)}%` : "N/A"} />
            <StatBox label="mAP50-95" value={selectedModel.map50_95 != null ? `${(selectedModel.map50_95 * 100).toFixed(1)}%` : "N/A"} />
          </div>
        )}

        <button
          onClick={handleGenerate}
          disabled={loading || !selectedModelId}
          style={{ ...btnStyle, background: "linear-gradient(135deg, #10b981, #34d399)", marginTop: 16, padding: "10px 24px" }}
        >
          {loading ? "Generating..." : "Generate & Download Report"}
        </button>
      </div>

      <div style={{ ...cardStyle, marginTop: 16 }}>
        <h3 style={{ marginTop: 0 }}>Report Contents</h3>
        <ul style={{ fontSize: 14, lineHeight: 1.8, color: "#ccc" }}>
          <li>Training configuration and hyperparameters</li>
          <li>Loss curves and mAP progression charts</li>
          <li>Final metrics (mAP50, mAP50-95, Precision, Recall)</li>
          <li>Sample detection results with thumbnails</li>
          <li>Class distribution analysis</li>
        </ul>
      </div>
    </div>
  );
}

function StatBox({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ textAlign: "center", padding: 12, background: "rgba(30, 41, 59, 0.5)", borderRadius: 10, border: "1px solid var(--line)" }}>
      <div style={{ fontSize: 17, fontWeight: 700, color: "#fff" }}>{value}</div>
      <div style={{ fontSize: 14, color: "#cbd5e1" }}>{label}</div>
    </div>
  );
}

const btnStyle: React.CSSProperties = {
  padding: "10px 18px",
  borderRadius: 10,
  border: "1px solid var(--line)",
  background: "linear-gradient(180deg, rgba(30, 41, 59, 0.9), rgba(15, 23, 42, 0.95))",
  color: "var(--text-0)",
  cursor: "pointer",
  fontSize: 15,
  fontWeight: 700,
  boxShadow: "var(--shadow-1)",
};
const inputStyle: React.CSSProperties = {
  padding: "10px 12px",
  borderRadius: 10,
  border: "1px solid var(--line)",
  background: "rgba(15, 23, 42, 0.88)",
  color: "var(--text-0)",
  fontSize: 16,
  width: "100%",
};
const labelStyle: React.CSSProperties = { display: "flex", flexDirection: "column", gap: 6, fontSize: 15, color: "var(--text-1)" };
const cardStyle: React.CSSProperties = {
  background: "linear-gradient(165deg, rgba(20, 30, 56, 0.86), rgba(12, 20, 38, 0.86))",
  borderRadius: 16,
  padding: 24,
  border: "1px solid var(--line)",
  boxShadow: "var(--shadow-1)",
  backdropFilter: "blur(6px)",
};
