export const STAFF_API_KEY = (import.meta.env.VITE_STAFF_API_KEY || "").trim();

export function getStaffHeaders() {
  if (!STAFF_API_KEY) return {};
  return { "x-staff-key": STAFF_API_KEY };
}
