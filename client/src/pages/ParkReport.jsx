import { useMemo, useState } from "react";
import { Navigate } from "react-router-dom";
import { useMode } from "../context/ModeContext";
import { apiUrl } from "../utils/apiUrl";
import { getStaffHeaders } from "../utils/staffAuth";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";
import Papa from "papaparse";
import "./ParkReport.css";

function toList(items) {
  if (!Array.isArray(items)) return [];
  return items
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean);
}

export default function ParkReport() {
  const { mode } = useMode();
  const isStaff = mode === "dex";

  const [park, setPark] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [adminGoal, setAdminGoal] = useState(
    "Evaluate the pilot period and justify park expenses, staffing, and contracted arbor services."
  );
  const [includePriorReports, setIncludePriorReports] = useState(false);
  const [reportScope, setReportScope] = useState("park");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [payload, setPayload] = useState(null);
  const [exportLoading, setExportLoading] = useState(false);

  const metrics = useMemo(() => payload?.metrics || null, [payload]);
  const report = useMemo(() => payload?.report || null, [payload]);

  if (!isStaff) {
    return <Navigate to="/" replace />;
  }

  const submitReport = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const res = await fetch(apiUrl("/api/ai/park-report"), {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getStaffHeaders() },
        body: JSON.stringify({
          park: park.trim(),
          parkId: localStorage.getItem("selectedParkId") || null,
          startDate,
          endDate,
          adminGoal: adminGoal.trim(),
          includePriorReports,
          reportScope,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || `Report generation failed (${res.status})`);
      setPayload(data);
    } catch (err) {
      setPayload(null);
      setError(err?.message || "Unexpected report generation error");
    } finally {
      setLoading(false);
    }
  };

  const exportToCSV = () => {
    if (!report || !metrics) return;
    setExportLoading(true);
    try {
      const csvData = [];
      csvData.push(["Park Report Export"]);
      csvData.push([]);
      csvData.push(["Park", park]);
      csvData.push(["Generated", new Date().toLocaleString()]);
      csvData.push(["Period", `${startDate} to ${endDate}`]);
      csvData.push([]);
      csvData.push(["Executive Summary"]);
      csvData.push([report.executive_summary || ""]);
      csvData.push([]);
      csvData.push(["Program Metrics"]);
      csvData.push(["Metric", "Value"]);
      csvData.push(["Total Trees", metrics.total_trees ?? 0]);
      csvData.push(["Trees with QR", metrics.trees_with_qr ?? 0]);
      csvData.push(["Trees with Photos", metrics.trees_with_photos ?? 0]);
      csvData.push(["Total Photos", metrics.total_photos ?? 0]);
      csvData.push(["Pending Submissions", metrics.pending_photo_submissions ?? 0]);
      csvData.push(["Winner Photos", metrics.winner_photos ?? 0]);
      csvData.push(["Geotagged Trees", metrics.geotagged_trees ?? 0]);
      csvData.push(["Missing Location", metrics.trees_missing_location ?? 0]);
      csvData.push([]);
      csvData.push(["KPI Snapshot"]);
      if (Array.isArray(report.kpi_snapshot)) {
        csvData.push(["Metric", "Value", "Why It Matters"]);
        report.kpi_snapshot.forEach((kpi) => {
          csvData.push([kpi?.metric || "", kpi?.value || "", kpi?.why_it_matters || ""]);
        });
      }
      csvData.push([]);
      const sections = ["Public Impact","Operational Impact","Budget Justification","Arborist Service Value","Pilot Period Findings","Next Period Recommendations","Cautionary Notes"];
      sections.forEach((section) => {
        const key = section.toLowerCase().replace(/ /g, "_");
        csvData.push([section]);
        toList(report[key]).forEach((item) => csvData.push([item]));
        csvData.push([]);
      });
      const csv = Papa.unparse(csvData);
      const link = document.createElement("a");
      link.href = `data:text/csv;charset=utf-8,${encodeURIComponent(csv)}`;
      link.download = `park-report-${park}-${new Date().toISOString().split("T")[0]}.csv`;
      link.click();
    } catch (err) {
      console.error("CSV export error:", err);
      alert("Failed to export CSV");
    } finally {
      setExportLoading(false);
    }
  };

  const exportToPDF = async () => {
    if (!report || !metrics) return;
    setExportLoading(true);
    try {
      const reportElement = document.getElementById("park-report-output");
      if (!reportElement) { alert("Report content not found"); return; }
      const canvas = await html2canvas(reportElement, { scale: 2, backgroundColor: "#ffffff" });
      const imgData = canvas.toDataURL("image/png");
      const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
      const pageHeight = pdf.internal.pageSize.getHeight();
      const pageWidth = pdf.internal.pageSize.getWidth();
      const margin = 10;
      const imgWidth = pageWidth - 2 * margin;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;
      let heightLeft = imgHeight;
      pdf.setFontSize(20);
      pdf.text("ArborAI Park Impact Report", margin, margin + 15);
      pdf.setFontSize(12);
      pdf.text(`Park: ${park}`, margin, margin + 30);
      pdf.text(`Generated: ${new Date().toLocaleString()}`, margin, margin + 40);
      pdf.text(`Period: ${startDate} to ${endDate}`, margin, margin + 50);
      pdf.addPage();
      let position = 0;
      while (heightLeft > 0) {
        pdf.addImage(imgData, "PNG", margin, position, imgWidth, imgHeight);
        heightLeft -= pageHeight;
        if (heightLeft > 0) { pdf.addPage(); position = heightLeft - imgHeight; }
      }
      pdf.save(`park-report-${park}-${new Date().toISOString().split("T")[0]}.pdf`);
    } catch (err) {
      console.error("PDF export error:", err);
      alert("Failed to export PDF");
    } finally {
      setExportLoading(false);
    }
  };

  return (
    <main className="page park-report-page">
      <section className="park-report-card">
        <h1>ArborAI Park Impact Report</h1>
        <p>Generate an administrator-ready pilot report with budget justification, operational impact, and service-value insights.</p>
        <form className="park-report-form" onSubmit={submitReport}>
          <label>
            Park / Area Name
            <input type="text" value={park} onChange={(e) => setPark(e.target.value)} placeholder="Walnut Grove" />
          </label>
          <div className="park-report-dates">
            <label>Start Date<input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} /></label>
            <label>End Date<input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} /></label>
          </div>
          <label>Administrator Goal<textarea rows={3} value={adminGoal} onChange={(e) => setAdminGoal(e.target.value)} /></label>
          <label className="park-report-checkbox-row">
            <input
              type="checkbox"
              checked={includePriorReports}
              onChange={(e) => setIncludePriorReports(e.target.checked)}
            />
            Include prior reports / trend mode
          </label>
          <label>
            Report Scope
            <select value={reportScope} onChange={(e) => setReportScope(e.target.value)}>
              <option value="park">Per Park (default)</option>
              <option value="system-wide">System-wide summary (optional)</option>
            </select>
          </label>
          <button className="btn btn-primary" type="submit" disabled={loading}>
            {loading ? "Generating Report..." : "Generate Report"}
          </button>
        </form>
        {error && <p className="park-report-error">{error}</p>}
      </section>

      {report && (
        <>
          <section className="park-report-export-buttons">
            <button className="btn btn-export btn-csv" onClick={exportToCSV} disabled={exportLoading}>📊 Export to CSV</button>
            <button className="btn btn-export btn-pdf" onClick={exportToPDF} disabled={exportLoading}>📄 Export to PDF</button>
          </section>
          <section className="park-report-output" id="park-report-output">
            <article className="park-report-card">
              <h2>{report.title || "Pilot Impact Report"}</h2>
              <p>{report.executive_summary || "No executive summary returned."}</p>
              {payload?.readiness_mode && (
                <p><strong>Mode:</strong> Pre-pilot readiness mode</p>
              )}
              {typeof payload?.history_used_count === "number" && (
                <p><strong>Prior Reports Used:</strong> {payload.history_used_count}</p>
              )}
            </article>
            {metrics && (
              <article className="park-report-card">
                <h3>Program Metrics</h3>
                <div className="park-report-metrics-grid">
                  <div><strong>Total Trees:</strong> {metrics.total_trees ?? 0}</div>
                  <div><strong>Trees with QR:</strong> {metrics.trees_with_qr ?? 0}</div>
                  <div><strong>Trees with Photos:</strong> {metrics.trees_with_photos ?? 0}</div>
                  <div><strong>Total Photos:</strong> {metrics.total_photos ?? 0}</div>
                  <div><strong>Pending Photo Submissions:</strong> {metrics.pending_photo_submissions ?? 0}</div>
                  <div><strong>Winner Photos:</strong> {metrics.winner_photos ?? 0}</div>
                  <div><strong>Geotagged Trees:</strong> {metrics.geotagged_trees ?? 0}</div>
                  <div><strong>Trees Missing Location:</strong> {metrics.trees_missing_location ?? 0}</div>
                </div>
              </article>
            )}
            <article className="park-report-card">
              <h3>KPI Snapshot</h3>
              {Array.isArray(report.kpi_snapshot) && report.kpi_snapshot.length > 0 ? (
                <div className="park-report-kpis">
                  {report.kpi_snapshot.map((kpi, idx) => (
                    <div key={idx} className="park-report-kpi-item">
                      <p><strong>{kpi?.metric || "Metric"}:</strong> {kpi?.value || "n/a"}</p>
                      <p>{kpi?.why_it_matters || ""}</p>
                    </div>
                  ))}
                </div>
              ) : (<p>No KPI snapshot returned.</p>)}
            </article>
            <article className="park-report-card">
              <h3>Public Impact</h3>
              <ul>{toList(report.public_impact).map((item, idx) => <li key={idx}>{item}</li>)}</ul>
            </article>
            <article className="park-report-card">
              <h3>Operational Impact</h3>
              <ul>{toList(report.operational_impact).map((item, idx) => <li key={idx}>{item}</li>)}</ul>
            </article>
            <article className="park-report-card">
              <h3>Budget Justification</h3>
              <ul>{toList(report.budget_justification).map((item, idx) => <li key={idx}>{item}</li>)}</ul>
            </article>
            <article className="park-report-card">
              <h3>Arborist Service Value</h3>
              <ul>{toList(report.arborist_service_value).map((item, idx) => <li key={idx}>{item}</li>)}</ul>
            </article>
            <article className="park-report-card">
              <h3>Pilot Period Findings</h3>
              <ul>{toList(report.pilot_period_findings).map((item, idx) => <li key={idx}>{item}</li>)}</ul>
            </article>
            <article className="park-report-card">
              <h3>Next Period Recommendations</h3>
              <ul>{toList(report.next_period_recommendations).map((item, idx) => <li key={idx}>{item}</li>)}</ul>
            </article>
            <article className="park-report-card">
              <h3>Cautionary Notes</h3>
              <ul>{toList(report.cautionary_notes).map((item, idx) => <li key={idx}>{item}</li>)}</ul>
            </article>
          </section>
        </>
      )}
    </main>
  );
}
