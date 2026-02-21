import { BrowserRouter, Routes, Route } from "react-router-dom";
import ProjectList from "./pages/ProjectList";
import ProjectDetailPage from "./pages/ProjectDetailPage";
import LabelingPage from "./pages/LabelingPage";
import ProjectLabelingPage from "./pages/ProjectLabelingPage";
import TrainingPage from "./pages/TrainingPage";
import MonitoringPage from "./pages/MonitoringPage";
import ModelComparePage from "./pages/ModelComparePage";
import ReportPage from "./pages/ReportPage";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<ProjectList />} />
        <Route path="/labeling" element={<LabelingPage />} />
        <Route path="/projects/:projectId" element={<ProjectDetailPage />} />
        <Route path="/projects/:projectId/labeling" element={<ProjectLabelingPage />} />
        <Route path="/projects/:projectId/training" element={<TrainingPage />} />
        <Route path="/projects/:projectId/monitoring/:sessionId" element={<MonitoringPage />} />
        <Route path="/compare" element={<ModelComparePage />} />
        <Route path="/report" element={<ReportPage />} />
      </Routes>
    </BrowserRouter>
  );
}
