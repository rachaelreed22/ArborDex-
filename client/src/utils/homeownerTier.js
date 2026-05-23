export const HOMEOWNER_TIER_LIMITS = {
  free: 3,
  gardener: 40,
  estate: 65,
};

export function getTierLimit(tier) {
  return HOMEOWNER_TIER_LIMITS[tier] ?? HOMEOWNER_TIER_LIMITS.free;
}

export function getTierLabel(tier) {
  if (tier === 'gardener') return "Gardener's Tier";
  if (tier === 'estate') return 'Estate Tier';
  return 'Free Tier';
}
