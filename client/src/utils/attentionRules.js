// Returns true if the AI diagnostics indicate any issue requiring human attention.
// Signals: non-empty alerts, non-empty risk_flags, poor/fair health, or moderate+ urgency.
export function getNeedsAttention(diagnostics) {
  if (!diagnostics) return false;

  // Any alerts or risk flags from the AI → needs attention
  if (Array.isArray(diagnostics.alerts) && diagnostics.alerts.length > 0) return true;

  const riskFlags = Array.isArray(diagnostics.risk_flags)
    ? diagnostics.risk_flags
    : Array.isArray(diagnostics.riskFlags)
      ? diagnostics.riskFlags
      : Array.isArray(diagnostics.potential_risks)
        ? diagnostics.potential_risks
        : Array.isArray(diagnostics.potentialRisks)
          ? diagnostics.potentialRisks
          : [];
  if (riskFlags.length > 0) return true;

  // Urgency level of Moderate, High, or Critical → needs attention
  const urgency = (diagnostics.urgency_level || diagnostics.urgencyLevel || "")
    .toString()
    .trim()
    .toLowerCase();
  if (urgency.includes("moderate") || urgency.includes("high") || urgency.includes("critical")) return true;

  // Health score of Poor or Fair → needs attention
  const health = (diagnostics.health_score || "").toString().trim().toLowerCase();
  if (health.includes("poor") || health.includes("fair")) return true;

  // Numeric health score below 70
  const fractionMatch = health.match(/(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)/);
  if (fractionMatch) {
    const score = (Number(fractionMatch[1]) / Number(fractionMatch[2])) * 100;
    if (Number.isFinite(score) && score < 70) return true;
  }
  const percentMatch = health.match(/^(\d+(?:\.\d+)?)%?$/);
  if (percentMatch) {
    const score = Number(percentMatch[1]);
    const normalized = score <= 10 ? score * 10 : score;
    if (Number.isFinite(normalized) && normalized < 70) return true;
  }

  return false;
}
