function normalizeHealthScore(healthScore) {
  if (typeof healthScore === "number" && Number.isFinite(healthScore)) {
    return healthScore;
  }

  if (typeof healthScore !== "string") {
    return null;
  }

  const value = healthScore.trim().toLowerCase();
  if (!value) return null;

  if (value.includes("poor")) return 35;
  if (value.includes("fair")) return 60;
  if (value.includes("good")) return 85;

  const fractionMatch = value.match(/(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)/);
  if (fractionMatch) {
    const numerator = Number(fractionMatch[1]);
    const denominator = Number(fractionMatch[2]);
    if (Number.isFinite(numerator) && Number.isFinite(denominator) && denominator > 0) {
      return (numerator / denominator) * 100;
    }
  }

  const percentMatch = value.match(/(\d+(?:\.\d+)?)\s*%/);
  if (percentMatch) {
    return Number(percentMatch[1]);
  }

  const numberMatch = value.match(/(\d+(?:\.\d+)?)/);
  if (!numberMatch) return null;

  const parsed = Number(numberMatch[1]);
  if (!Number.isFinite(parsed)) return null;
  return parsed <= 10 ? parsed * 10 : parsed;
}

export function getNeedsAttention(diagnostics) {
  if (!diagnostics) return false;

  const healthScore = normalizeHealthScore(diagnostics.health_score);
  const confidenceRaw = (diagnostics.confidence || diagnostics.confidence_rating || "")
    .toString()
    .trim()
    .toLowerCase();

  const hasAlerts = Array.isArray(diagnostics.alerts) && diagnostics.alerts.length > 0;
  const hasRiskFlags = Array.isArray(diagnostics.risk_flags) && diagnostics.risk_flags.length > 0;
  const weakHealth = healthScore !== null && healthScore < 70;
  const unknownSpecies = !diagnostics.species || diagnostics.species.toLowerCase() === "unknown";
  const lowConfidence = !confidenceRaw || confidenceRaw.includes("low");
  const missingEnvironment = !diagnostics.environment;

  return hasAlerts || hasRiskFlags || weakHealth || unknownSpecies || lowConfidence || missingEnvironment;
}
