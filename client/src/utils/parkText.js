export function normalizeParkText(value) {
  return (value || "")
    .toString()
    .replace(/\bMarrionville\b/gi, "Marionville")
    .replace(/\bSout Park\b/gi, "South Park");
}