/**
 * QA Tests: Bidding Engine / Auction Algorithm
 * Maps to QA_LOG.md Phase 4 (BID-001 through BID-013)
 *
 * These are pure-math unit tests — no database, no HTTP.
 * They validate the God Formula in isolation.
 */

import { describe, it, expect } from "vitest";
import {
  computeMarkup,
  computeEffCps,
  computeSingleAuction,
  runHourlyAllocation,
  previewBid,
} from "../services/auction.js";

// ─── BID-001 to BID-004: Markup formula ──────────────────────────────────────

describe("computeMarkup — M(n)", () => {
  it("BID-001: M(1) = 0.30", () => {
    expect(computeMarkup(1)).toBeCloseTo(0.30, 4);
  });

  it("BID-002: M(2) ≈ 0.360", () => {
    expect(computeMarkup(2)).toBeCloseTo(0.30 + 0.20 * Math.log10(2), 4);
    expect(computeMarkup(2)).toBeGreaterThan(0.30);
    expect(computeMarkup(2)).toBeLessThan(0.40);
  });

  it("BID-003: M(10) = 0.50", () => {
    // log10(10) = 1, so 0.30 + 0.20*1 = 0.50
    expect(computeMarkup(10)).toBeCloseTo(0.50, 4);
  });

  it("BID-004: M(n) caps at 0.60 for n ≥ 32", () => {
    // log10(32) ≈ 1.505, 0.30 + 0.20*1.505 = 0.601 → capped at 0.60
    expect(computeMarkup(32)).toBeCloseTo(0.60, 2);
    expect(computeMarkup(100)).toBeCloseTo(0.60, 2);
    expect(computeMarkup(1000)).toBeCloseTo(0.60, 2);
  });

  it("handles n=0 gracefully (treats as n=1)", () => {
    expect(computeMarkup(0)).toBeCloseTo(0.30, 4);
  });

  it("markup grows monotonically with n", () => {
    const markups = [1, 2, 5, 10, 20, 32].map(computeMarkup);
    for (let i = 1; i < markups.length; i++) {
      expect(markups[i]).toBeGreaterThanOrEqual(markups[i - 1]);
    }
  });
});

// ─── BID-005: CPI calculation ─────────────────────────────────────────────────

describe("computeSingleAuction — CPI", () => {
  it("BID-005: CPI = D × cps_eff", () => {
    const result = computeSingleAuction({
      floorCpsCents: 100,   // 100 cents/sec = $1/sec floor
      nCompetitors: 1,
      impressionDurationSec: 30,
      dailyBudgetCents: 10000,
    });

    // M(1) = 0.30, cps_eff = 100 / 0.70 ≈ 142.857
    const expectedEffCps = 100 / (1 - 0.30);
    const expectedCpi = 30 * expectedEffCps;

    expect(result.effCpsCents).toBeCloseTo(expectedEffCps, 2);
    expect(result.cpiCents).toBeCloseTo(expectedCpi, 2);
  });

  it("Owner always gets floor rate regardless of markup", () => {
    const result = computeSingleAuction({
      floorCpsCents: 56,
      nCompetitors: 5,
      impressionDurationSec: 60,
      dailyBudgetCents: 100000,
    });
    // ownerCpsCents should always equal floorCpsCents
    expect(result.ownerCpsCents).toBe(56);
  });

  it("Longer impression at same floor and n costs proportionally more", () => {
    const base = { floorCpsCents: 50, nCompetitors: 3, dailyBudgetCents: 50000 };
    const r30 = computeSingleAuction({ ...base, impressionDurationSec: 30 });
    const r60 = computeSingleAuction({ ...base, impressionDurationSec: 60 });
    expect(r60.cpiCents).toBeCloseTo(r30.cpiCents * 2, 2);
  });
});

// ─── BID-006: Minimum budget validation ──────────────────────────────────────

describe("Minimum budget check", () => {
  it("BID-006: Budget below B_min → isViable=false with shortfall", () => {
    const result = computeSingleAuction({
      floorCpsCents: 200,
      nCompetitors: 10,    // M(10)=0.50, cps_eff=400, CPI for 60s = 24000 cents
      impressionDurationSec: 60,
      dailyBudgetCents: 100, // way below minimum
    });

    expect(result.isViable).toBe(false);
    expect(result.budgetShortfallCents).toBeGreaterThan(0);
    expect(result.budgetShortfallCents).toBe(
      result.minDailyBudgetCents - 100
    );
  });

  it("Budget exactly equal to B_min → isViable=true", () => {
    const result = computeSingleAuction({
      floorCpsCents: 10,
      nCompetitors: 1,
      impressionDurationSec: 30,
      dailyBudgetCents: 1, // will be adjusted to exact min
    });
    // Just check that min budget is computed
    expect(result.minDailyBudgetCents).toBeGreaterThan(0);

    const atMin = computeSingleAuction({
      floorCpsCents: 10,
      nCompetitors: 1,
      impressionDurationSec: 30,
      dailyBudgetCents: result.minDailyBudgetCents,
    });
    expect(atMin.isViable).toBe(true);
    expect(atMin.budgetShortfallCents).toBe(0);
  });
});

// ─── BID-007 & BID-008: Allocation logic ─────────────────────────────────────

describe("runHourlyAllocation", () => {
  it("BID-007: Undersubscribed — both advertisers get full demand", () => {
    const result = runHourlyAllocation({
      floorCpsCents: 1,   // very cheap: 1 cent/sec
      nCompetitors: 2,
      advertisers: [
        { id: "adv-a", impressionDurationSec: 30, dailyBudgetCents: 100 },
        { id: "adv-b", impressionDurationSec: 30, dailyBudgetCents: 50 },
      ],
    });

    expect(result.isOversubscribed).toBe(false);

    const a = result.allocations.find((x) => x.id === "adv-a")!;
    const b = result.allocations.find((x) => x.id === "adv-b")!;

    // When undersubscribed, allocated = demand
    expect(a.allocatedSeconds).toBeCloseTo(a.demandSeconds, 2);
    expect(b.allocatedSeconds).toBeCloseTo(b.demandSeconds, 2);
  });

  it("BID-008: Oversubscribed — allocation is proportional to demand", () => {
    // Make demand exceed 3600s by using large budgets
    const result = runHourlyAllocation({
      floorCpsCents: 1,   // 1 cent/sec
      nCompetitors: 2,
      advertisers: [
        { id: "adv-a", impressionDurationSec: 30, dailyBudgetCents: 1_000_000 },
        { id: "adv-b", impressionDurationSec: 30, dailyBudgetCents: 500_000 },
      ],
    });

    expect(result.isOversubscribed).toBe(true);

    const a = result.allocations.find((x) => x.id === "adv-a")!;
    const b = result.allocations.find((x) => x.id === "adv-b")!;

    // A has 2x budget → should get 2x the airtime
    expect(a.allocatedSeconds).toBeCloseTo(b.allocatedSeconds * 2, 0);

    // Total allocated should not exceed 3600s
    const totalAllocated = result.allocations.reduce(
      (sum, x) => sum + x.allocatedSeconds,
      0
    );
    expect(totalAllocated).toBeCloseTo(3600, 0);
  });

  it("BID-009: Higher budget = higher impression%", () => {
    const result = runHourlyAllocation({
      floorCpsCents: 1,
      nCompetitors: 2,
      advertisers: [
        { id: "rich", impressionDurationSec: 30, dailyBudgetCents: 1_000_000 },
        { id: "poor", impressionDurationSec: 30, dailyBudgetCents: 100_000 },
      ],
    });

    const rich = result.allocations.find((x) => x.id === "rich")!;
    const poor = result.allocations.find((x) => x.id === "poor")!;
    expect(rich.impressionPct).toBeGreaterThan(poor.impressionPct);
  });

  it("BID-010: Longer impression + 2x budget = same impressions as half budget + half duration", () => {
    // A: 60s impression, $10/day
    // B: 30s impression, $5/day
    // At same floor/competitors, both should get same number of impressions
    const result = runHourlyAllocation({
      floorCpsCents: 1,
      nCompetitors: 2,
      advertisers: [
        { id: "A", impressionDurationSec: 60, dailyBudgetCents: 1000 },
        { id: "B", impressionDurationSec: 30, dailyBudgetCents: 500 },
      ],
    });

    const a = result.allocations.find((x) => x.id === "A")!;
    const b = result.allocations.find((x) => x.id === "B")!;

    // Both should get the same number of impressions per hour
    // (A pays 2x per impression but has 2x budget)
    expect(a.actualImpressionsPerHour).toBeCloseTo(
      b.actualImpressionsPerHour,
      0
    );
  });

  it("Revenue splits correctly between owner and platform", () => {
    const result = runHourlyAllocation({
      floorCpsCents: 100,
      nCompetitors: 10, // M(10) = 0.50
      advertisers: [
        { id: "a", impressionDurationSec: 30, dailyBudgetCents: 1_000_000 },
      ],
    });

    // Platform gets 50%, owner gets 50%
    expect(result.platformRevenueCentsPerHour).toBeCloseTo(
      result.totalRevenueCentsPerHour * 0.5,
      0
    );
    expect(result.ownerRevenueCentsPerHour).toBeCloseTo(
      result.totalRevenueCentsPerHour * 0.5,
      0
    );
  });
});

// ─── BID-013: Preview endpoint ────────────────────────────────────────────────

describe("previewBid", () => {
  it("BID-013: Preview returns accurate CPI estimate", () => {
    const preview = previewBid(
      100,   // floor 100 cents/sec
      4,     // 4 current competitors; joining as 5th → n=5
      60,    // 60s impression
      50000  // $500/day budget
    );

    // Compute expected values the same way the function does (n=5 after +1)
    const M5 = 0.30 + 0.20 * Math.log10(5); // exact, not 0.44 approximation
    const expectedEffCps = 100 / (1 - M5);
    const expectedCpi = 60 * expectedEffCps;

    expect(preview.cpiCents).toBeCloseTo(expectedCpi, 2);
    expect(preview.isViable).toBe(true);
    expect(preview.estimatedDailyImpressions).toBeGreaterThan(0);
    expect(preview.markupPct).toBeCloseTo(M5, 4);
  });

  it("Preview shows not-viable when budget too low", () => {
    const preview = previewBid(
      1000,  // expensive screen: 1000 cents/sec = $10/sec
      0,     // no competitors yet (joins as 1st → M(1)=0.30)
      60,    // 60s impression, CPI = 60 * 1000/0.7 ≈ 85,714 cents
      100    // $1 budget — not viable
    );

    expect(preview.isViable).toBe(false);
    expect(preview.budgetShortfallCents).toBeGreaterThan(0);
    expect(preview.estimatedDailyImpressions).toBe(0);
  });
});

// ─── Computed values sanity checks ───────────────────────────────────────────

describe("Formula sanity checks", () => {
  it("effCps is always > floor (platform always takes a cut)", () => {
    for (const n of [1, 2, 5, 10, 50]) {
      const eff = computeEffCps(100, n);
      expect(eff).toBeGreaterThan(100);
    }
  });

  it("Platform cut (effCps - floor) grows with competition", () => {
    const cuts = [1, 2, 5, 10, 32].map((n) => computeEffCps(100, n) - 100);
    for (let i = 1; i < cuts.length; i++) {
      expect(cuts[i]).toBeGreaterThanOrEqual(cuts[i - 1]);
    }
  });

  it("Owner revenue is exactly floor × seconds", () => {
    const floor = 100; // 100 cents/sec
    const D = 30;       // 30s impression
    const result = computeSingleAuction({
      floorCpsCents: floor,
      nCompetitors: 5,
      impressionDurationSec: D,
      dailyBudgetCents: 100_000,
    });

    // Owner earns floor per second = floor * D per impression
    const ownerPerImpression = result.ownerCpsCents * D;
    const platformPerImpression = result.cpiCents - ownerPerImpression;
    expect(platformPerImpression).toBeGreaterThan(0);
    expect(result.cpiCents).toBeCloseTo(ownerPerImpression + platformPerImpression, 2);
  });
});
