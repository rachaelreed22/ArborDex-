import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useMode } from "../context/ModeContext";
import { getNeedsAttention } from "../utils/attentionRules";
import { apiUrl } from "../utils/apiUrl";
import { getStaffHeaders } from "../utils/staffAuth";
import { fetchWithTimeout } from "../utils/fetchWithTimeout";
import "./TreeDetail.css";

function extractHistoricalUsesFromLogs(logs) {
  if (!Array.isArray(logs)) return "";

  for (const entry of logs) {
    let diagnosticsObj = entry?.diagnostics;

    if (typeof diagnosticsObj === "string") {
      try {
        diagnosticsObj = JSON.parse(diagnosticsObj);
      } catch {
        diagnosticsObj = null;
      }
    }

    const text = (diagnosticsObj?.uses_throughout_history || "").toString().trim();
    if (text) return text;
  }

  return "";
}

function extractLatestDiagnosticsFromLogs(logs) {
  if (!Array.isArray(logs)) return null;

  for (const entry of logs) {
    if (entry?.source === "staff-measurements" || entry?.source === "record-metadata") continue;

    let diagnosticsObj = entry?.diagnostics;
    if (typeof diagnosticsObj === "string") {
      try {
        diagnosticsObj = JSON.parse(diagnosticsObj);
      } catch {
        diagnosticsObj = null;
      }
    }

    if (diagnosticsObj && typeof diagnosticsObj === "object") {
      return diagnosticsObj;
    }
  }

  return null;
}

function extractLatestStaffMeasurementsFromLogs(logs) {
  if (!Array.isArray(logs)) {
    return { trunkDiameterInches: "", heightEstimateFeet: "" };
  }

  for (const entry of logs) {
    if (entry?.source !== "staff-measurements") continue;

    let diagnosticsObj = entry?.diagnostics;
    if (typeof diagnosticsObj === "string") {
      try {
        diagnosticsObj = JSON.parse(diagnosticsObj);
      } catch {
        diagnosticsObj = null;
      }
    }

    const measurements = diagnosticsObj?.staff_measurements || diagnosticsObj;
    if (!measurements || typeof measurements !== "object") continue;

    return {
      trunkDiameterInches: measurements.trunk_diameter_inches?.toString() || "",
      heightEstimateFeet: measurements.height_estimate_feet?.toString() || "",
    };
  }

  return { trunkDiameterInches: "", heightEstimateFeet: "" };
}

function parseDiagnosticsObject(input) {
  if (!input) return null;
  if (typeof input === "object") return input;
  if (typeof input !== "string") return null;

  try {
    return JSON.parse(input);
  } catch {
    return null;
  }
}

function extractLatestRecordMetadataFromLogs(logs) {
  if (!Array.isArray(logs)) return null;

  for (const entry of logs) {
    if (entry?.source !== "record-metadata") continue;
    const diagnosticsObj = parseDiagnosticsObject(entry?.diagnostics);
    const metadata = diagnosticsObj?.record_metadata || diagnosticsObj;
    if (metadata && typeof metadata === "object") {
      return metadata;
    }
  }

  return null;
}

function findEarliestTimestamp(listing, logs) {
  const timestamps = [];

  if (Array.isArray(listing?.photos)) {
    for (const photo of listing.photos) {
      if (photo?.created_at) timestamps.push(photo.created_at);
    }
  }

  if (Array.isArray(logs)) {
    for (const entry of logs) {
      if (entry?.run_at) timestamps.push(entry.run_at);
      if (entry?.created_at) timestamps.push(entry.created_at);
    }
  }

  const parsed = timestamps
    .map((value) => new Date(value))
    .filter((date) => !Number.isNaN(date.getTime()))
    .sort((a, b) => a.getTime() - b.getTime());

  return parsed[0]?.toISOString() || null;
}

function findLatestTimestamp(listing, logs) {
  const timestamps = [];

  if (Array.isArray(listing?.photos)) {
    for (const photo of listing.photos) {
      if (photo?.created_at) timestamps.push(photo.created_at);
    }
  }

  if (Array.isArray(logs)) {
    for (const entry of logs) {
      if (entry?.run_at) timestamps.push(entry.run_at);
      if (entry?.created_at) timestamps.push(entry.created_at);
    }
  }

  const parsed = timestamps
    .map((value) => new Date(value))
    .filter((date) => !Number.isNaN(date.getTime()))
    .sort((a, b) => b.getTime() - a.getTime());

  return parsed[0]?.toISOString() || null;
}

function toLocalDatetimeInputValue(value) {
  if (!value) return "";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";

  const local = new Date(parsed.getTime() - parsed.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

function parseQrCodeIdFromQrUrl(url) {
  const value = (url || "").toString().trim();
  if (!value) return "";

  const fileName = value.split("/").pop() || "";
  const withoutExt = fileName.replace(/\.[a-z0-9]+$/i, "");
  return withoutExt || "";
}

function formatDateLabel(value) {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "-";
  return parsed.toLocaleString();
}

function buildShortInternalId(listing) {
  const candidates = [
    listing?.tree_id,
    listing?.short_id,
    listing?.internal_id,
    listing?.internal_tree_id,
    listing?.id,
  ];

  const picked = candidates.find((item) => typeof item === "string" && item.trim());
  if (!picked) return "-";

  const cleaned = picked.trim();
  if (cleaned.includes("-")) {
    return cleaned.split("-")[0].toUpperCase();
  }

  return cleaned.slice(0, 8).toUpperCase();
}

export default function TreeDetail() {
  const { id } = useParams();
  const { mode } = useMode();
  const navigate = useNavigate();

  const [listing, setListing] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [editing, setEditing] = useState(false);
  const [regeneratingQr, setRegeneratingQr] = useState(false);
  const [editForm, setEditForm] = useState({
    title: "",
    description: "",
    location: "",
    latitude: "",
    longitude: "",
  });

  const [aiInput, setAiInput] = useState("");
  const [aiMessages, setAiMessages] = useState([
    {
      role: "system",
      text: "Ask ArborAI anything about this tree — health, environment, care, or observations.",
    },
  ]);
  const [aiLoading, setAiLoading] = useState(false);

  // ⭐ NEW: AI diagnostic output (Dex mode only)
  const [diagnostics, setDiagnostics] = useState(null);
  const [diagnosticsStatus, setDiagnosticsStatus] = useState("idle");
  const [diagnosticsError, setDiagnosticsError] = useState("");
  const [diagnosticsLogs, setDiagnosticsLogs] = useState([]);
  const [measurementForm, setMeasurementForm] = useState({
    trunkDiameterInches: "",
    heightEstimateFeet: "",
  });
  const [savingMeasurements, setSavingMeasurements] = useState(false);
  const [measurementsMessage, setMeasurementsMessage] = useState("");
  const [recordEditing, setRecordEditing] = useState(false);
  const [savingRecord, setSavingRecord] = useState(false);
  const [recordMessage, setRecordMessage] = useState("");
  const [recordForm, setRecordForm] = useState({
    treeAddedAt: "",
    treeId: "",
    managedBy: "",
    inspectionStatus: "",
  });

  const isStaff = mode === "dex";
  const needsAttention = isStaff && getNeedsAttention(diagnostics);

  useEffect(() => {
    let cancelled = false;

    async function loadTreeData() {
      const data = await fetchListing();
      if (!data || cancelled) return;
      const logs = await fetchDiagnosticsLogs();
      const latestDiagnostics = extractLatestDiagnosticsFromLogs(logs);
      setDiagnostics(latestDiagnostics);
      setDiagnosticsStatus(latestDiagnostics ? "success" : "idle");
      setDiagnosticsError("");
    }

    loadTreeData();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, mode]);

  async function fetchListing() {
    try {
      setLoadError("");
      const res = await fetchWithTimeout(apiUrl(`/api/listings/${id}`), {}, 15000);
      if (!res.ok) {
        setListing(null);
        setLoadError("Tree record could not be loaded.");
        return null;
      }
      const data = await res.json();
      setListing(data);
      setEditForm({
        title: data.title || "",
        description: data.description || "",
        location: data.location || "",
        latitude: data.latitude || "",
        longitude: data.longitude || "",
      });
      return data;
    } catch (err) {
      console.error("Error fetching listing:", err);
      if (err?.name === "AbortError") {
        setLoadError("Tree details request timed out. Please try again.");
      } else {
        setLoadError("Unable to load tree details right now.");
      }
      return null;
    } finally {
      setLoading(false);
    }
  }

  async function fetchDiagnosticsLogs() {
    try {
      const res = await fetchWithTimeout(apiUrl(`/api/listings/${id}/diagnostics-logs`), {}, 12000);
      if (!res.ok) {
        setDiagnosticsLogs([]);
        return [];
      }
      const data = await res.json();
      const logs = Array.isArray(data) ? data : [];
      setDiagnosticsLogs(logs);
      setMeasurementForm(extractLatestStaffMeasurementsFromLogs(logs));
      return logs;
    } catch {
      setDiagnosticsLogs([]);
      setMeasurementForm({ trunkDiameterInches: "", heightEstimateFeet: "" });
      return [];
    }
  }

  // ⭐ NEW: Fetch AI diagnostics for Dex mode
  async function fetchDiagnostics() {
    try {
      setDiagnosticsStatus("loading");
      setDiagnosticsError("");
      const res = await fetch(apiUrl(`/api/ai/analyze-tree/${id}`));
      if (!res.ok) {
        setDiagnostics(null);
        setDiagnosticsStatus("error");
        setDiagnosticsError(`${res.status} ${res.statusText}`.trim());
        console.warn("[TreeDetail] diagnostics request failed", res.status, res.statusText);
        return;
      }
      const data = await res.json();
      setDiagnostics(data);
      setDiagnosticsStatus("success");
    } catch (err) {
      setDiagnostics(null);
      setDiagnosticsStatus("error");
      setDiagnosticsError(err?.message || "Network error");
      console.error("Error fetching diagnostics:", err);
    }
  }

  async function handleRunDiagnostics() {
    setMeasurementsMessage("");
    await fetchDiagnostics();

    // If diagnostics generated public copy, refresh listing once so About text updates.
    if (!listing?.description || !listing.description.toString().trim()) {
      await fetchListing();
    }

    await fetchDiagnosticsLogs();
  }

  async function handleSaveMeasurements() {
    setSavingMeasurements(true);
    setMeasurementsMessage("");

    try {
      const trunkRaw = measurementForm.trunkDiameterInches.trim();
      const heightRaw = measurementForm.heightEstimateFeet.trim();
      const trunkValue = trunkRaw ? Number(trunkRaw) : null;
      const heightValue = heightRaw ? Number(heightRaw) : null;

      if ((trunkRaw && !Number.isFinite(trunkValue)) || (heightRaw && !Number.isFinite(heightValue))) {
        throw new Error("Measurements must be valid numbers.");
      }

      if ((trunkValue !== null && trunkValue <= 0) || (heightValue !== null && heightValue <= 0)) {
        throw new Error("Measurements must be greater than zero.");
      }

      const res = await fetch(apiUrl(`/api/listings/${id}/diagnostics-log`), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...getStaffHeaders(),
        },
        body: JSON.stringify({
          source: "staff-measurements",
          diagnostics: {
            staff_measurements: {
              trunk_diameter_inches: trunkValue,
              height_estimate_feet: heightValue,
            },
          },
          notes: "Manual staff measurements for age estimation.",
        }),
      });

      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        throw new Error(payload?.error || `Failed to save measurements (${res.status})`);
      }

      await fetchDiagnosticsLogs();
      setMeasurementsMessage("Measurements saved. Run Diagnostics to refresh the public age estimate.");
    } catch (err) {
      setMeasurementsMessage(err?.message || "Could not save measurements.");
    } finally {
      setSavingMeasurements(false);
    }
  }

  async function handleSaveRecordMetadata() {
    setSavingRecord(true);
    setRecordMessage("");

    try {
      const treeAddedAtIso = recordForm.treeAddedAt
        ? new Date(recordForm.treeAddedAt).toISOString()
        : null;

      if (recordForm.treeAddedAt && Number.isNaN(new Date(recordForm.treeAddedAt).getTime())) {
        throw new Error("Tree Added date must be a valid date/time.");
      }

      const payload = {
        tree_id: recordForm.treeId.trim() || null,
        managed_by: recordForm.managedBy.trim() || null,
        inspection_status: recordForm.inspectionStatus.trim() || null,
        tree_added_at: treeAddedAtIso,
        last_updated_at: new Date().toISOString(),
      };

      const res = await fetch(apiUrl(`/api/listings/${id}/diagnostics-log`), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...getStaffHeaders(),
        },
        body: JSON.stringify({
          source: "record-metadata",
          diagnostics: {
            record_metadata: payload,
          },
          notes: "Manual tree record metadata update from Tree Detail.",
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error || `Failed to save tree record metadata (${res.status})`);
      }

      await fetchDiagnosticsLogs();
      setRecordEditing(false);
      setRecordMessage("Tree record fields updated.");
    } catch (err) {
      setRecordMessage(err?.message || "Could not save record metadata.");
    } finally {
      setSavingRecord(false);
    }
  }

  const handleSaveEdit = async () => {
    try {
      await fetch(apiUrl(`/api/listings/${id}`), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editForm),
      });
      setEditing(false);
      fetchListing();
    } catch (err) {
      console.error("Error saving edits:", err);
    }
  };

  const handleDelete = async () => {
    if (!window.confirm("Are you sure you want to delete this tree? This cannot be undone.")) return;
    try {
      const res = await fetch(apiUrl(`/api/listings/${id}`), {
        method: "DELETE",
        headers: { Accept: "application/json" },
      });

      if (!res.ok) {
        const errorText = await res.text().catch(() => "");
        throw new Error(errorText || `Delete failed (${res.status})`);
      }

      navigate("/database");
    } catch (err) {
      console.error("Error deleting listing:", err);
      alert(`Delete failed: ${err.message || "Unknown error"}`);
    }
  };

  const handleSetMain = async (photoId) => {
    try {
      await fetch(apiUrl(`/api/photos/${photoId}/main`), {
        method: "PATCH",
        headers: getStaffHeaders(),
      });
      fetchListing();
    } catch (err) {
      console.error("Error setting main photo:", err);
    }
  };

  const handleSetWinner = async (photoId) => {
    try {
      await fetch(apiUrl(`/api/photos/${photoId}/winner`), {
        method: "PATCH",
        headers: getStaffHeaders(),
      });
      fetchListing();
    } catch (err) {
      console.error("Error setting winner:", err);
    }
  };

  const handleDeletePhoto = async (photoId) => {
    if (!window.confirm("Delete this photo?")) return;
    try {
      await fetch(apiUrl(`/api/photos/${photoId}`), {
        method: "DELETE",
        headers: getStaffHeaders(),
      });
      fetchListing();
    } catch (err) {
      console.error("Error deleting photo:", err);
    }
  };

  const handleApprovePhoto = async (photoId) => {
    try {
      await fetch(apiUrl(`/api/photos/${photoId}/approve`), {
        method: "PATCH",
        headers: getStaffHeaders(),
      });
      fetchListing();
    } catch (err) {
      console.error("Error approving photo:", err);
    }
  };

  const handleRegenerateQr = async () => {
    setRegeneratingQr(true);

    try {
      const res = await fetch(apiUrl(`/qr/generate/${id}`));
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(data?.error || `QR regeneration failed (${res.status})`);
      }

      await fetchListing();
    } catch (err) {
      console.error("Error regenerating QR:", err);
      alert(`QR regeneration failed: ${err.message || "Unknown error"}`);
    } finally {
      setRegeneratingQr(false);
    }
  };

  // Real AI handler: calls /api/ai/tree with listing + question
  const handleAskAi = async (e) => {
    e.preventDefault();
    if (!aiInput.trim() || !listing) return;

    const userMessage = { role: "user", text: aiInput.trim() };
    setAiMessages((prev) => [...prev, userMessage]);
    const question = aiInput.trim();
    setAiInput("");
    setAiLoading(true);

    try {
      const res = await fetch(apiUrl("/api/ai/tree"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question,
          listing,
        }),
      });

      if (!res.ok) {
        console.error("AI request failed");
        setAiMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            text: "I had trouble reaching the AI service. Please try again in a moment.",
          },
        ]);
        setAiLoading(false);
        return;
      }

      const data = await res.json();
      const answer = data.answer || "I couldn't generate a response.";

      setAiMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          text: answer,
        },
      ]);
    } catch (err) {
      console.error("Error calling AI:", err);
      setAiMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          text: "Something went wrong while contacting ArborAI.",
        },
      ]);
    } finally {
      setAiLoading(false);
    }
  };

  if (loading) return <div className="loading">Loading tree...</div>;
  if (loadError && !listing) return <div className="loading">{loadError}</div>;

  if (!listing) {
    return (
      <div className="page tree-detail-page">
        <div className="empty-state">
          <div className="icon">🌳</div>
          <p>This tree hasn't been registered yet.</p>
          {isStaff ? (
            <button className="btn btn-primary" onClick={() => navigate(`/add?tag=${id}`)}>
              + Register This Tree
            </button>
          ) : (
            <p className="empty-hint">Check back soon — a staff member can register it.</p>
          )}
          <button className="btn btn-secondary" onClick={() => navigate("/")}>
            Home
          </button>
          <button className="btn btn-secondary" onClick={() => navigate("/database")}>
            Back to Database
          </button>
        </div>
      </div>
    );
  }

  const photos = listing.photos || [];
  const mainPhoto = photos.find((p) => p.is_main) || photos[0] || null;
  const winnerPhoto = photos.find((p) => p.winner) || null;
  const photoSummaries = Array.isArray(diagnostics?.photo_summaries) ? diagnostics.photo_summaries : [];
  const aboutThisTreeText =
    (typeof listing.description === "string" && listing.description.trim()) ||
    (typeof diagnostics?.public_about === "string" && diagnostics.public_about.trim()) ||
    "";
  const usesThroughoutHistoryText =
    (typeof diagnostics?.uses_throughout_history === "string" && diagnostics.uses_throughout_history.trim()) ||
    extractHistoricalUsesFromLogs(diagnosticsLogs) ||
    "";
  const estimatedAgeText =
    (typeof diagnostics?.estimated_age === "string" && diagnostics.estimated_age.trim()) ||
    "";
  const staffMeasurements = diagnostics?.staff_measurements || null;
  const diagnosticsChipLabel = !isStaff
    ? "Public mode"
    : diagnosticsStatus === "loading"
    ? "Diagnostics loading"
    : diagnosticsStatus === "success"
    ? needsAttention
      ? "Needs human attention"
      : "Diagnostics ready"
    : diagnosticsStatus === "error"
    ? "Diagnostics failed"
    : "Diagnostics idle";
  const hazardDetails = Array.isArray(diagnostics?.hazard_details)
    ? diagnostics.hazard_details
    : [];
  const hazardsDetected = (() => {
    const raw = (diagnostics?.hazards_detected ?? diagnostics?.hazard_detected ?? "")
      .toString()
      .trim()
      .toLowerCase();
    if (raw === "yes" || raw === "y" || raw === "true") return true;

    if (hazardDetails.length > 0) return true;

    const needsInspection = Boolean(diagnostics?.needs_human_inspection);
    if (needsInspection) return true;

    const alerts = Array.isArray(diagnostics?.alerts) ? diagnostics.alerts : [];
    if (alerts.some((item) => /needs\s+human\s+inspection|hazard|unsafe|structural/i.test((item || "").toString()))) {
      return true;
    }

    const riskFlags = Array.isArray(diagnostics?.risk_flags)
      ? diagnostics.risk_flags
      : Array.isArray(diagnostics?.riskFlags)
        ? diagnostics.riskFlags
        : [];

    if (riskFlags.some((item) => /decay|rot|hollow|cavity|instability|failure|fall\s*risk|unsafe|structural/i.test((item || "").toString()))) {
      return true;
    }

    const summaryText = [
      diagnostics?.summary,
      diagnostics?.environment,
      diagnostics?.public_about,
      ...(Array.isArray(diagnostics?.photo_summaries) ? diagnostics.photo_summaries : []),
    ]
      .map((item) => (item == null ? "" : item.toString().toLowerCase()))
      .join(" | ");

    const hasDecay = /(decay|decaying|rot|rotting|hollow|cavity|loss\s+of\s+integrity)/i.test(summaryText);
    const hasTrunkBaseRoot = /(trunk|base|basal|root|root\s*flare|root\s*collar)/i.test(summaryText);
    const hasNegatedRisk = /(no|not|without)\s+(clear\s+)?(signs?\s+of\s+)?(hazards?|risk|decay|rot|instability|failure)/i.test(summaryText);

    return hasDecay && hasTrunkBaseRoot && !hasNegatedRisk;
  })();

  const recordMetadata = extractLatestRecordMetadataFromLogs(diagnosticsLogs) || {};
  const derivedTreeAddedIso =
    recordMetadata.tree_added_at ||
    listing.created_at ||
    listing.createdAt ||
    findEarliestTimestamp(listing, diagnosticsLogs);
  const derivedLastUpdatedIso =
    recordMetadata.last_updated_at ||
    listing.updated_at ||
    listing.updatedAt ||
    listing.modified_at ||
    findLatestTimestamp(listing, diagnosticsLogs);

  const treeAddedLabel = formatDateLabel(derivedTreeAddedIso);
  const lastUpdatedLabel = formatDateLabel(derivedLastUpdatedIso);
  const shortInternalId =
    (recordMetadata.tree_id || "").toString().trim() || buildShortInternalId(listing);
  const qrCodeId =
    (recordMetadata.qr_code_id || "").toString().trim() ||
    (typeof listing.qr_code_id === "string" && listing.qr_code_id.trim()) ||
    (typeof listing.qr_id === "string" && listing.qr_id.trim()) ||
    (typeof listing.tag_code === "string" && listing.tag_code.trim()) ||
    parseQrCodeIdFromQrUrl(listing.qr_url) ||
    shortInternalId;

  const managedBy =
    (recordMetadata.managed_by || "").toString().trim() ||
    (typeof listing.managed_by === "string" && listing.managed_by.trim()) ||
    (typeof listing.owner_team === "string" && listing.owner_team.trim()) ||
    "ArborDex Staff";

  const inspectionStatus = (() => {
    const explicitStatus =
      (recordMetadata.inspection_status || "").toString().trim() ||
      (typeof listing.inspection_status === "string" && listing.inspection_status.trim()) ||
      (typeof listing.inspectionStatus === "string" && listing.inspectionStatus.trim()) ||
      "";
    if (explicitStatus) return explicitStatus;
    return diagnosticsLogs.length > 0 ? "Inspected" : "Pending Inspection";
  })();

  const healthStatus = (() => {
    if (hazardsDetected || needsAttention) return "Needs Attention";

    const score = (diagnostics?.health_score ?? "").toString().trim().toLowerCase();
    if (!score) return "Monitor";
    if (/(excellent|good|healthy|low risk|stable|low)/i.test(score)) return "Healthy";
    if (/(poor|declin|high|critical|severe|unsafe)/i.test(score)) return "Needs Attention";
    return "Monitor";
  })();

  function handleStartEditRecord() {
    setRecordMessage("");
    setRecordForm({
      treeAddedAt: toLocalDatetimeInputValue(derivedTreeAddedIso),
      treeId: shortInternalId === "-" ? "" : shortInternalId,
      managedBy: managedBy === "ArborDex Staff" ? "" : managedBy,
      inspectionStatus,
    });
    setRecordEditing(true);
  }

return (
  <div className="page tree-detail-page">
    {/* Top bar */}
    <div className="tree-detail-topbar">
      <button className="btn btn-secondary" onClick={() => navigate("/")}>
        Home
      </button>
      <button className="btn btn-secondary" onClick={() => navigate("/database")}>
        ← Back to Database
      </button>
      {isStaff && !editing && (
        <div className="topbar-actions">
          <span
            className={`diagnostics-chip diagnostics-chip-${diagnosticsStatus}`}
            title={diagnosticsError || diagnosticsChipLabel}
          >
            {diagnosticsChipLabel}
          </span>
          <button
            className="btn btn-secondary"
            onClick={handleRegenerateQr}
            disabled={regeneratingQr}
          >
            {regeneratingQr ? "Regenerating QR..." : "Regenerate QR"}
          </button>
          <button
            className="btn btn-primary"
            onClick={handleRunDiagnostics}
            disabled={diagnosticsStatus === "loading"}
          >
            {diagnosticsStatus === "loading" ? "Running Diagnostics..." : "Run Diagnostics"}
          </button>
          <button className="btn btn-secondary" onClick={() => setEditing(true)}>
            ✏️ Edit Details
          </button>
          <button className="btn btn-danger" onClick={handleDelete}>
            🗑️ Delete Tree
          </button>
        </div>
      )}
    </div>

    {/* Main layout */}
    <div className="tree-detail-layout">
      {/* Left column: core info + photos */}
      <div className="tree-detail-main">
        {/* Header / Edit */}
        <section className="card section-header">
          {editing ? (
            <div className="edit-form-grid">
              <div className="form-group">
                <label>Tree Name</label>
                <input
                  type="text"
                  value={editForm.title}
                  onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
                />
              </div>
              <div className="form-group">
                <label>Location</label>
                <input
                  type="text"
                  value={editForm.location}
                  onChange={(e) => setEditForm({ ...editForm, location: e.target.value })}
                />
              </div>
              <div className="form-group">
                <label>Latitude</label>
                <input
                  type="text"
                  value={editForm.latitude}
                  onChange={(e) => setEditForm({ ...editForm, latitude: e.target.value })}
                />
              </div>
              <div className="form-group">
                <label>Longitude</label>
                <input
                  type="text"
                  value={editForm.longitude}
                  onChange={(e) => setEditForm({ ...editForm, longitude: e.target.value })}
                />
              </div>
              <div className="form-group form-group-full">
                <label>Description</label>
                <textarea
                  rows={4}
                  value={editForm.description}
                  onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                />
              </div>
              <div className="form-actions form-group-full">
                <button className="btn btn-primary" onClick={handleSaveEdit}>
                  Save
                </button>
                <button className="btn btn-secondary" onClick={() => setEditing(false)}>
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div className="header-display">
              <h1 className="detail-title">{listing.title || "Untitled Tree"}</h1>
              <div className="header-meta">
                {listing.location && (
                  <p className="detail-location">📍 {listing.location}</p>
                )}
                {(listing.latitude || listing.longitude) && (
                  <p className="detail-coords">
                    🧭 {listing.latitude ?? "—"}, {listing.longitude ?? "—"}
                  </p>
                )}
              </div>
            </div>
          )}
        </section>

        <section className="card section-tree-record">
          <div className="tree-record-header">
            <h2>Tree Record</h2>
            {isStaff && !recordEditing && (
              <button className="btn btn-secondary btn-sm" onClick={handleStartEditRecord}>
                Edit Record Fields
              </button>
            )}
          </div>

          {recordEditing ? (
            <div className="tree-record-grid">
              <div className="record-item">
                <span className="record-label">Tree Added</span>
                <input
                  type="datetime-local"
                  className="record-input"
                  value={recordForm.treeAddedAt}
                  onChange={(e) => setRecordForm((prev) => ({ ...prev, treeAddedAt: e.target.value }))}
                />
              </div>
              <div className="record-item">
                <span className="record-label">Last Updated</span>
                <span className="record-value">{lastUpdatedLabel}</span>
              </div>
              <div className="record-item">
                <span className="record-label">Tree ID</span>
                <input
                  type="text"
                  className="record-input mono"
                  value={recordForm.treeId}
                  onChange={(e) => setRecordForm((prev) => ({ ...prev, treeId: e.target.value }))}
                  placeholder="Internal ID"
                />
              </div>
              <div className="record-item">
                <span className="record-label">Health Status</span>
                <span className="record-value">{healthStatus}</span>
              </div>
              <div className="record-item">
                <span className="record-label">QR Code ID</span>
                <span className="record-value mono">{qrCodeId}</span>
              </div>
              <div className="record-item">
                <span className="record-label">Managed By</span>
                <input
                  type="text"
                  className="record-input"
                  value={recordForm.managedBy}
                  onChange={(e) => setRecordForm((prev) => ({ ...prev, managedBy: e.target.value }))}
                  placeholder="ArborDex Staff"
                />
              </div>
              <div className="record-item">
                <span className="record-label">Inspection Status</span>
                <select
                  className="record-input"
                  value={recordForm.inspectionStatus}
                  onChange={(e) => setRecordForm((prev) => ({ ...prev, inspectionStatus: e.target.value }))}
                >
                  <option value="Pending Inspection">Pending Inspection</option>
                  <option value="Inspected">Inspected</option>
                  <option value="Follow-up Required">Follow-up Required</option>
                </select>
              </div>
            </div>
          ) : (
            <div className="tree-record-grid">
              <div className="record-item">
                <span className="record-label">Tree Added</span>
                <span className="record-value">{treeAddedLabel}</span>
              </div>
              <div className="record-item">
                <span className="record-label">Last Updated</span>
                <span className="record-value">{lastUpdatedLabel}</span>
              </div>
              <div className="record-item">
                <span className="record-label">Tree ID</span>
                <span className="record-value mono">{shortInternalId}</span>
              </div>
              <div className="record-item">
                <span className="record-label">Health Status</span>
                <span className="record-value">{healthStatus}</span>
              </div>
              <div className="record-item">
                <span className="record-label">QR Code ID</span>
                <span className="record-value mono">{qrCodeId}</span>
              </div>
              <div className="record-item">
                <span className="record-label">Managed By</span>
                <span className="record-value">{managedBy}</span>
              </div>
              <div className="record-item">
                <span className="record-label">Inspection Status</span>
                <span className="record-value">{inspectionStatus}</span>
              </div>
            </div>
          )}

          {isStaff && recordEditing && (
            <div className="tree-record-actions">
              <button className="btn btn-primary" onClick={handleSaveRecordMetadata} disabled={savingRecord}>
                {savingRecord ? "Saving..." : "Save Record"}
              </button>
              <button className="btn btn-secondary" onClick={() => setRecordEditing(false)} disabled={savingRecord}>
                Cancel
              </button>
            </div>
          )}

          {recordMessage && <p className="staff-measurements-note">{recordMessage}</p>}
        </section>

{/* Main photo + winner */}
<section className="card section-photos">
  <div className="section-header-row">
    <h2>Main Photo</h2>
    {mainPhoto && mainPhoto.photographer && (
      <span className="photo-credit">📸 {mainPhoto.photographer}</span>
    )}
  </div>

  {mainPhoto ? (
    <div className="main-photo-wrapper">
      <img src={mainPhoto.url} alt={listing.title} className="main-photo" />
    </div>
  ) : (
    <div className="detail-no-photo">
      <span>🌿</span>
      <p>No photos available yet</p>
    </div>
  )}

  {winnerPhoto && (
    <div className="winner-block">
      <div className="winner-badge">⭐ Photo Contest Winner</div>
      <div className="winner-photo-wrapper">
        <img src={winnerPhoto.url} alt="Winner" className="winner-photo" />
      </div>
      {winnerPhoto.photographer && (
        <p className="photo-credit">📸 {winnerPhoto.photographer}</p>
      )}
    </div>
  )}
</section>

{/* Dex‑mode Classification Panels */}
{isStaff && diagnostics && (
  <>
    {/* Species Identification */}
    <section className={`card section-classify ${needsAttention ? "needs-attention" : ""}`}>
      <h2>Species Identification</h2>
      <p>{diagnostics.species || "No species data available."}</p>
    </section>

    {/* Environmental Context */}
    <section className={`card section-classify ${needsAttention ? "needs-attention" : ""}`}>
      <h2>Environmental Context</h2>
      <p>{diagnostics.environment || "No environmental data available."}</p>
    </section>

    {/* Overall Summary */}
    <section className={`card section-classify ${needsAttention ? "needs-attention" : ""}`}>
      <h2>Overall Summary</h2>
      <p>{diagnostics.summary || "No summary available."}</p>
    </section>

    {/* Recommended Actions */}
    <section className={`card section-classify ${needsAttention ? "needs-attention" : ""}`}>
      <h2>Recommended Actions</h2>
      {diagnostics.recommendations?.length ? (
        <ul className="recommend-list">
          {diagnostics.recommendations.map((rec, i) => (
            <li key={i}>{rec}</li>
          ))}
        </ul>
      ) : (
        <p>No recommendations available.</p>
      )}
    </section>

    {/* Per‑Photo Summaries */}
    {photoSummaries.length > 0 && (
      <section className={`card section-classify ${needsAttention ? "needs-attention" : ""}`}>
        <h2>Per‑Photo Summaries</h2>
        <div className="photo-summary-list">
          {photoSummaries.map((item, i) => (
            <div key={i} className="photo-summary-item">
              <h3>Photo {i + 1}</h3>
              <p>{item}</p>
            </div>
          ))}
        </div>
      </section>
    )}
  </>
)}

{/* Description */}
{aboutThisTreeText && (
  <section className="card section-description">
    <h2>About This Tree</h2>
    <p>{aboutThisTreeText}</p>
  </section>
)}

{usesThroughoutHistoryText && (
  <section className="card section-history">
    <h2>Uses Throughout History</h2>
    <p>{usesThroughoutHistoryText}</p>
  </section>
)}

{(estimatedAgeText || staffMeasurements?.trunk_diameter_inches || staffMeasurements?.height_estimate_feet) && (
  <section className="card section-age-estimate">
    <h2>Estimated Age</h2>
    {estimatedAgeText && <p>{estimatedAgeText}</p>}
    {(staffMeasurements?.trunk_diameter_inches || staffMeasurements?.height_estimate_feet) && (
      <div className="tree-measurements-public">
        {staffMeasurements?.trunk_diameter_inches && (
          <p><strong>Trunk Diameter:</strong> {staffMeasurements.trunk_diameter_inches} inches</p>
        )}
        {staffMeasurements?.height_estimate_feet && (
          <p><strong>Height Estimate:</strong> {staffMeasurements.height_estimate_feet} ft</p>
        )}
      </div>
    )}
  </section>
)}

{diagnostics?.health_score && (
  <section className="card section-health-public">
    <h2>Health Rating</h2>
    <p className="health-rating-value">{diagnostics.health_score}</p>
  </section>
)}

{diagnostics?.hazards_detected !== undefined && (
  <section className="card section-hazards-public">
    <h2>Hazards Detected</h2>
    <p className="hazards-value">
      {diagnostics.hazards_detected === "Yes" || diagnostics.hazards_detected === "yes" || diagnostics.hazards_detected === true
        ? "Yes"
        : diagnostics.hazards_detected === "No" || diagnostics.hazards_detected === "no" || diagnostics.hazards_detected === false
        ? "No"
        : diagnostics.hazards_detected}
    </p>
    {diagnostics.hazard_details?.length > 0 && (
      <div className="hazard-details-list">
        <h3>Details</h3>
        <ul>
          {diagnostics.hazard_details.map((detail, i) => (
            <li key={i}>{detail}</li>
          ))}
        </ul>
      </div>
    )}
  </section>
)}

{diagnostics?.recommendations?.length > 0 && (
  <section className="card section-recommendations-public">
    <h2>Recommended Actions</h2>
    <ul className="recommendations-list">
      {diagnostics.recommendations.map((rec, i) => (
        <li key={i}>{rec}</li>
      ))}
    </ul>
  </section>
)}

{diagnosticsLogs.length > 0 && (
  <section className="card section-description">
    <h2>Diagnostics Log</h2>
    {diagnosticsLogs.map((entry) => (
      <div key={entry.id} style={{ marginBottom: "0.9rem" }}>
        <p>
          <strong>Run At:</strong>{" "}
          {entry.run_at ? new Date(entry.run_at).toLocaleString() : "Unknown"}
        </p>
        {entry.source && (
          <p>
            <strong>Source:</strong> {entry.source}
          </p>
        )}
        {entry.notes && <p>{entry.notes}</p>}
      </div>
    ))}
  </section>
)}

{/* Coordinates (main column) */}
{(listing.latitude || listing.longitude) && (
  <section className="card section-coordinates">
    <h2>Location Coordinates</h2>

    <div className="coord-row">
      {listing.latitude && (
        <p><strong>Latitude:</strong> {listing.latitude}</p>
      )}
      {listing.longitude && (
        <p><strong>Longitude:</strong> {listing.longitude}</p>
      )}
    </div>

    <button
      className="btn btn-primary"
      onClick={() =>
        window.open(
          `https://www.google.com/maps?q=${listing.latitude},${listing.longitude}`,
          "_blank"
        )
      }
    >
      View on Map
    </button>
  </section>
)}

{/* Gallery */}
{photos.length > 1 && (
  <section className="card section-gallery">
    <div className="section-header-row">
      <h2>Photo Gallery</h2>
      <span className="gallery-count">{photos.length} photos</span>
    </div>
    <div className="gallery-grid">
      {photos.map((photo, idx) => (
        <div key={photo.id} className="gallery-card">
          <img src={photo.url} alt="Gallery" className="gallery-image" />
          <div className="gallery-meta">
            {photo.photographer && (
              <p className="photo-credit">📸 {photo.photographer}</p>
            )}
            <div className="badge-row">
              {photo.is_main && <span className="badge">Main</span>}
              {photo.winner && <span className="badge badge-warn">⭐ Winner</span>}
              {photo.staff_uploaded === false && <span className="badge badge-warn">Pending</span>}
            </div>
            {photoSummaries[idx] && (
              <details className="gallery-ai-summary">
                <summary>AI Summary</summary>
                <p>{photoSummaries[idx]}</p>
              </details>
            )}
          </div>
          {isStaff && (
            <div className="gallery-card-actions">
              {!photo.is_main && (
                <button
                  className="btn btn-sm btn-secondary"
                  onClick={() => handleSetMain(photo.id)}
                >
                  Set Main
                </button>
              )}
              {!photo.winner && (
                <button
                  className="btn btn-sm btn-secondary"
                  onClick={() => handleSetWinner(photo.id)}
                >
                  Set Winner
                </button>
              )}
              {photo.staff_uploaded === false && (
                <button
                  className="btn btn-sm btn-primary"
                  onClick={() => handleApprovePhoto(photo.id)}
                >
                  Approve
                </button>
              )}
              <button
                className="btn btn-sm btn-danger"
                onClick={() => handleDeletePhoto(photo.id)}
              >
                Delete
              </button>
            </div>
          )}
        </div>
      ))}
    </div>
  </section>
)}
</div>

{/* Right column: QR, AI, staff info */}
<div className="tree-detail-sidebar">

  {/* ⭐ NEW: Dex‑mode Diagnostic Panels */}
  {isStaff && diagnostics && (
    <>
      {/* Alerts */}
      {diagnostics.alerts?.length > 0 && (
        <section className={`card section-alerts ${needsAttention ? "needs-attention" : ""}`}>
          <h2>Alerts</h2>
          <ul className="alert-list">
            {diagnostics.alerts.map((alert, i) => (
              <li key={i} className="alert-item">{alert}</li>
            ))}
          </ul>
        </section>
      )}

      {/* Health Score */}
      <section className={`card section-health ${needsAttention ? "needs-attention" : ""}`}>
        <h2>Health Status</h2>
        <p className="health-score">
          {diagnostics.health_score ?? "No score available"}
        </p>
      </section>

      {/* Confidence */}
      <section className={`card section-confidence ${needsAttention ? "needs-attention" : ""}`}>
        <h2>Confidence Rating</h2>
        <p className="confidence-value">
          {diagnostics.confidence ?? "No confidence rating"}
        </p>
      </section>

      {/* Risk Flags */}
      {diagnostics.risk_flags?.length > 0 && (
        <section className={`card section-risks ${needsAttention ? "needs-attention" : ""}`}>
          <h2>Risk Flags</h2>
          <ul className="risk-list">
            {diagnostics.risk_flags.map((flag, i) => (
              <li key={i} className="risk-item">{flag}</li>
            ))}
          </ul>
        </section>
      )}

      <section className={`card section-risks ${needsAttention ? "needs-attention" : ""}`}>
        <h2>Hazards Detected</h2>
        <p className={hazardsDetected ? "tree-hazard-flag" : ""}>{hazardsDetected ? "Y" : "N"}</p>
        {hazardsDetected && (
          <>
            <h3 className="tree-hazard-flag">Hazard Details</h3>
            {hazardDetails.length > 0 ? (
              <ul className="risk-list">
                {hazardDetails.map((item, i) => (
                  <li key={i} className="risk-item">{item}</li>
                ))}
              </ul>
            ) : (
              <p>Hazard inferred from diagnostics risk signals (decay/structural instability); needs human inspection.</p>
            )}
          </>
        )}
      </section>
    </>
  )}

  {/* QR section */}
  {listing.qr_url && (
    <section className="card section-qr">
      <h2>QR Code</h2>
      <p className="qr-hint">
        Scan this code on-site to open this tree’s page in ArborTag.
      </p>
      <div className="qr-wrapper">
        <img
          src={listing.qr_url}
          alt="Tree QR Code"
          className="qr-image"
        />
      </div>
    </section>
  )}

  {/* AI Assistant */}
  <section className="card section-ai">
    <h2>ArborAI Assistant</h2>
    <p className="ai-subtitle">
      Ask questions about this tree’s health, environment, or care.  
      (This chat is specific to this tree and its photos.)
    </p>
    <div className="ai-chat-window">
      {aiMessages.map((msg, idx) => (
        <div
          key={idx}
          className={
            msg.role === "user"
              ? "ai-message ai-message-user"
              : msg.role === "assistant"
              ? "ai-message ai-message-assistant"
              : "ai-message ai-message-system"
          }
        >
          <div className="ai-message-label">
            {msg.role === "user"
              ? "You"
              : msg.role === "assistant"
              ? "ArborAI"
              : "Info"}
          </div>
          <div className="ai-message-text">{msg.text}</div>
        </div>
      ))}
      {aiLoading && (
        <div className="ai-message ai-message-assistant">
          <div className="ai-message-label">ArborAI</div>
          <div className="ai-message-text">Thinking…</div>
        </div>
      )}
    </div>
    <form className="ai-input-row" onSubmit={handleAskAi}>
      <input
        type="text"
        placeholder="Ask ArborAI about this tree..."
        value={aiInput}
        onChange={(e) => setAiInput(e.target.value)}
      />
      <button className="btn btn-primary" type="submit" disabled={aiLoading}>
        Send
      </button>
    </form>
  </section>

  {/* Staff info */}
  {isStaff && (
    <section className="card section-staff">
      <h2>Staff Info</h2>
      <div className="staff-measurements-panel">
        <h3>Tree Measurements</h3>
        <div className="staff-measurements-grid">
          <div className="form-group">
            <label>Trunk Diameter (inches)</label>
            <input
              type="number"
              min="0"
              step="0.1"
              value={measurementForm.trunkDiameterInches}
              onChange={(e) => setMeasurementForm((prev) => ({ ...prev, trunkDiameterInches: e.target.value }))}
              placeholder="e.g. 18"
            />
          </div>
          <div className="form-group">
            <label>Height Estimate (ft)</label>
            <input
              type="number"
              min="0"
              step="0.1"
              value={measurementForm.heightEstimateFeet}
              onChange={(e) => setMeasurementForm((prev) => ({ ...prev, heightEstimateFeet: e.target.value }))}
              placeholder="e.g. 35"
            />
          </div>
        </div>
        <div className="form-actions">
          <button className="btn btn-secondary" onClick={handleSaveMeasurements} disabled={savingMeasurements}>
            {savingMeasurements ? "Saving Measurements..." : "Save Measurements"}
          </button>
        </div>
        {measurementsMessage && <p className="staff-measurements-note">{measurementsMessage}</p>}
      </div>

      <div className="staff-info-grid">
        <div>
          <span className="label">Listing ID</span>
          <span className="value mono">{listing.id}</span>
        </div>
        <div>
          <span className="label">Total Photos</span>
          <span className="value">{photos.length}</span>
        </div>
        {listing.latitude && (
          <div>
            <span className="label">Latitude</span>
            <span className="value">{listing.latitude}</span>
          </div>
        )}
        {listing.longitude && (
          <div>
            <span className="label">Longitude</span>
            <span className="value">{listing.longitude}</span>
          </div>
        )}
      </div>
    </section>
  )}

        </div> {/* end sidebar */}
      </div> {/* end layout */}
    </div>
  );
}




