import { useMemo, useState } from "react";
import { Navigate } from "react-router-dom";
import { useMode } from "../context/ModeContext";
import { apiUrl } from "../utils/apiUrl";
import { getStaffHeaders } from "../utils/staffAuth";
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

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [payload, setPayload] = useState(null);

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
        headers: {
          "Content-Type": "application/json",
          ...getStaffHeaders(),
        },
        body: JSON.stringify({
          park: park.trim(),
          startDate,
          endDate,
          adminGoal: adminGoal.trim(),
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.error || `Report generation failed (${res.status})`);
      }

      setPayload(data);
    } catch (err) {
      setPayload(null);
      setError(err?.message || "Unexpected report generation error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="page park-report-page">
      <section className="park-report-card">
        <h1>ArborAI Park Impact Report</h1>
        <p>
          Generate an administrator-ready pilot report with budget justification, operational impact,
          and service-value insights.
        </p>

        <form className="park-report-form" onSubmit={submitReport}>
          <label>
            Park / Area Name
            <input
              type="text"
              value={park}
              onChange={(e) => setPark(e.target.value)}
              placeholder="Walnut Grove"
            />
          </label>

          <div className="park-report-dates">
            <label>
              Start Date
              <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </label>
            <label>
              End Date
              <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            </label>
          </div>

          <label>
            Administrator Goal
            <textarea
              rows={3}
              value={adminGoal}
              onChange={(e) => setAdminGoal(e.target.value)}
            />
          </label>

          <button className="btn btn-primary" type="submit" disabled={loading}>
            {loading ? "Generating Report..." : "Generate Report"}
          </button>
        </form>

        {error && <p className="park-report-error">{error}</p>}
      </section>

      {report && (
        <section className="park-report-output">
          <article className="park-report-card">
            <h2>{report.title || "Pilot Impact Report"}</h2>
            <p>{report.executive_summary || "No executive summary returned."}</p>
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
            ) : (
              <p>No KPI snapshot returned.</p>
            )}
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
      )}
    </main>
  );
}
