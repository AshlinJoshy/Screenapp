/**
 * God Formula — shared with apps/api/src/services/auction.ts
 * Duplicated here to keep the worker self-contained (no cross-app imports).
 */

const MARKUP_BASE = 0.30;
const MARKUP_SCALE = 0.20;
const MARKUP_CAP = 0.60;

/** M(n) — platform markup. Starts 30%, grows log, caps 60%. */
export function computeMarkup(nCompetitors: number): number {
  const n = Math.max(1, nCompetitors);
  return Math.min(MARKUP_BASE + MARKUP_SCALE * Math.log10(n), MARKUP_CAP);
}

/** Effective cost-per-second the advertiser pays. */
export function computeEffCps(floorCpsCents: number, nCompetitors: number): number {
  return floorCpsCents / (1 - computeMarkup(nCompetitors));
}
