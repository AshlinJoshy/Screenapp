/**
 * AdScreen Auction Algorithm — "God Formula"
 *
 * All monetary values are in CENTS (integer) unless noted.
 * All time values are in SECONDS unless noted.
 *
 * Formula reference: ARCHITECTURE.md §6
 */

export interface AuctionInput {
  floorCpsCents: number;        // Screen owner's floor: cents per second of airtime
  nCompetitors: number;          // Active bidders this hour (including this advertiser)
  impressionDurationSec: number; // How long 1 impression runs (5–300s)
  dailyBudgetCents: number;      // Advertiser's daily budget
}

export interface AuctionOutput {
  markupPct: number;             // M(n) — platform's margin
  effCpsCents: number;           // Effective cents/sec the advertiser pays
  cpiCents: number;              // Cost per impression
  ownerCpsCents: number;         // What screen owner earns per second
  minDailyBudgetCents: number;   // Minimum to get ≥ 1 impression per day
  isViable: boolean;             // dailyBudget >= minDailyBudget
  budgetShortfallCents: number;  // 0 if viable
  maxImpressionsPerHour: number; // Based on budget share of hour
  demandSeconds: number;         // Airtime seconds demanded per hour
}

export interface AllocationInput {
  floorCpsCents: number;
  nCompetitors: number;           // total, including all advertisers below
  advertisers: Array<{
    id: string;
    impressionDurationSec: number;
    dailyBudgetCents: number;
  }>;
}

export interface AllocationOutput {
  markupPct: number;
  effCpsCents: number;
  isOversubscribed: boolean;
  totalDemandSeconds: number;
  allocations: Array<{
    id: string;
    cpiCents: number;
    demandSeconds: number;
    allocatedSeconds: number;
    impressionPct: number;           // % of screen's hour allocated
    actualImpressionsPerHour: number;
    actualHourlySpendCents: number;
    isViable: boolean;
    minDailyBudgetCents: number;
  }>;
  ownerRevenueCentsPerHour: number;
  platformRevenueCentsPerHour: number;
  totalRevenueCentsPerHour: number;
}

const MARKUP_BASE = 0.30;
const MARKUP_SCALE = 0.20;
const MARKUP_CAP = 0.60;
const SECONDS_PER_HOUR = 3600;
const HOURS_PER_DAY = 24;

/**
 * M(n) — Platform markup percentage as a function of competitor count.
 * Starts at 30%, grows logarithmically, caps at 60%.
 *
 * M(1)  = 30.0%
 * M(2)  ≈ 36.0%
 * M(5)  ≈ 44.0%
 * M(10) = 50.0%
 * M(32) ≈ 60.0% (cap)
 */
export function computeMarkup(nCompetitors: number): number {
  const n = Math.max(1, nCompetitors);
  const markup = MARKUP_BASE + MARKUP_SCALE * Math.log10(n);
  return Math.min(markup, MARKUP_CAP);
}

/**
 * Compute effective price per second for a single advertiser.
 */
export function computeEffCps(floorCpsCents: number, nCompetitors: number): number {
  const M = computeMarkup(nCompetitors);
  // cps_eff = floor / (1 - M)   → owner always gets floor, platform gets the rest
  return floorCpsCents / (1 - M);
}

/**
 * Full single-advertiser auction calculation.
 * Does NOT compute impression% (that requires knowing all competitors).
 */
export function computeSingleAuction(input: AuctionInput): AuctionOutput {
  const { floorCpsCents, nCompetitors, impressionDurationSec, dailyBudgetCents } = input;

  const markupPct = computeMarkup(nCompetitors);
  const effCpsCents = floorCpsCents / (1 - markupPct);
  const ownerCpsCents = floorCpsCents;

  // Cost per impression = duration × effective cents/second
  const cpiCents = impressionDurationSec * effCpsCents;

  // Minimum daily budget = 1 impression per day
  const minDailyBudgetCents = Math.ceil(cpiCents);
  const isViable = dailyBudgetCents >= minDailyBudgetCents;
  const budgetShortfallCents = isViable ? 0 : minDailyBudgetCents - dailyBudgetCents;

  // Max impressions per hour based on budget
  const hourlyBudgetCents = dailyBudgetCents / HOURS_PER_DAY;
  const maxImpressionsPerHour = Math.floor(hourlyBudgetCents / cpiCents);
  const demandSeconds = maxImpressionsPerHour * impressionDurationSec;

  return {
    markupPct,
    effCpsCents,
    cpiCents,
    ownerCpsCents,
    minDailyBudgetCents,
    isViable,
    budgetShortfallCents,
    maxImpressionsPerHour,
    demandSeconds,
  };
}

/**
 * Full multi-advertiser allocation for one screen, one hour.
 * Allocates airtime proportionally when oversubscribed.
 */
export function runHourlyAllocation(input: AllocationInput): AllocationOutput {
  const { floorCpsCents, nCompetitors, advertisers } = input;

  const markupPct = computeMarkup(nCompetitors);
  const effCpsCents = floorCpsCents / (1 - markupPct);

  // First pass — compute each advertiser's demand
  const adData = advertisers.map((adv) => {
    const cpiCents = adv.impressionDurationSec * effCpsCents;
    const minDailyBudgetCents = Math.ceil(cpiCents);
    const isViable = adv.dailyBudgetCents >= minDailyBudgetCents;
    const hourlyBudget = adv.dailyBudgetCents / HOURS_PER_DAY;
    const maxImpressionsPerHour = isViable ? Math.floor(hourlyBudget / cpiCents) : 0;
    const demandSeconds = maxImpressionsPerHour * adv.impressionDurationSec;

    return {
      id: adv.id,
      impressionDurationSec: adv.impressionDurationSec,
      cpiCents,
      minDailyBudgetCents,
      isViable,
      demandSeconds,
    };
  });

  const totalDemandSeconds = adData.reduce((sum, a) => sum + a.demandSeconds, 0);
  const isOversubscribed = totalDemandSeconds > SECONDS_PER_HOUR;

  // Second pass — allocate
  const allocations = adData.map((adv) => {
    let allocatedSeconds: number;

    if (isOversubscribed) {
      // Proportional share
      allocatedSeconds =
        totalDemandSeconds > 0
          ? (SECONDS_PER_HOUR * adv.demandSeconds) / totalDemandSeconds
          : 0;
    } else {
      allocatedSeconds = adv.demandSeconds;
    }

    const impressionPct = (allocatedSeconds / SECONDS_PER_HOUR) * 100;
    const actualImpressionsPerHour = Math.floor(
      allocatedSeconds / adv.impressionDurationSec
    );
    const actualHourlySpendCents = Math.round(
      actualImpressionsPerHour * adv.cpiCents
    );

    return {
      id: adv.id,
      cpiCents: adv.cpiCents,
      demandSeconds: adv.demandSeconds,
      allocatedSeconds,
      impressionPct,
      actualImpressionsPerHour,
      actualHourlySpendCents,
      isViable: adv.isViable,
      minDailyBudgetCents: adv.minDailyBudgetCents,
    };
  });

  const totalRevenueCentsPerHour = allocations.reduce(
    (sum, a) => sum + a.actualHourlySpendCents,
    0
  );
  const platformRevenueCentsPerHour = Math.round(
    totalRevenueCentsPerHour * markupPct
  );
  const ownerRevenueCentsPerHour =
    totalRevenueCentsPerHour - platformRevenueCentsPerHour;

  return {
    markupPct,
    effCpsCents,
    isOversubscribed,
    totalDemandSeconds,
    allocations,
    ownerRevenueCentsPerHour,
    platformRevenueCentsPerHour,
    totalRevenueCentsPerHour,
  };
}

/**
 * Preview: What impression% and daily impressions would an advertiser get?
 * Used by the /auction/preview API endpoint.
 */
export function previewBid(
  floorCpsCents: number,
  nCurrentCompetitors: number,
  impressionDurationSec: number,
  dailyBudgetCents: number
): {
  cpiCents: number;
  minDailyBudgetCents: number;
  estimatedDailyImpressions: number;
  estimatedImpressionPct: number;
  isViable: boolean;
  budgetShortfallCents: number;
  markupPct: number;
  effCpsCents: number;
} {
  const result = computeSingleAuction({
    floorCpsCents,
    nCompetitors: nCurrentCompetitors + 1, // +1 for this advertiser joining
    impressionDurationSec,
    dailyBudgetCents,
  });

  // Daily impressions = total daily budget divided by cost per impression
  // (not hourly-bucketed, so fractional hours aren't lost to rounding)
  const estimatedDailyImpressions = Math.floor(dailyBudgetCents / result.cpiCents);

  // Impression% is per hour; approximate from demand vs hour
  const estimatedImpressionPct =
    Math.min(result.demandSeconds / SECONDS_PER_HOUR, 1) * 100;

  return {
    cpiCents: result.cpiCents,
    minDailyBudgetCents: result.minDailyBudgetCents,
    estimatedDailyImpressions,
    estimatedImpressionPct,
    isViable: result.isViable,
    budgetShortfallCents: result.budgetShortfallCents,
    markupPct: result.markupPct,
    effCpsCents: result.effCpsCents,
  };
}
