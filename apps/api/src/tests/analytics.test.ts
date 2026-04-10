/**
 * QA Tests: Analytics Routes
 * Maps to QA_LOG.md: AN-001 through AN-005
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { app } from "../index.js";
import { signJwt } from "../utils/jwt.js";

vi.mock("../db.js", () => {
  const mockDb = {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    values: vi.fn().mockReturnThis(),
    returning: vi.fn(),
    update: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    innerJoin: vi.fn().mockReturnThis(),
    offset: vi.fn().mockReturnThis(),
    groupBy: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
  };
  return { db: mockDb };
});

const { db } = await import("../db.js");

function resetDbMocks() {
  const d = db as Record<string, ReturnType<typeof vi.fn>>;
  (["select","from","where","limit","insert","values","update","set","delete",
    "innerJoin","offset","groupBy","orderBy"] as const)
    .forEach((m) => d[m].mockReturnThis());
  d["returning"].mockReset();
}

async function advertiserToken(id = "adv-uuid-1") {
  return signJwt({ sub: id, email: "adv@test.com", role: "advertiser", displayName: "Advertiser" });
}
async function ownerToken(id = "owner-uuid-1") {
  return signJwt({ sub: id, email: "owner@test.com", role: "owner", displayName: "Owner" });
}
async function adminToken() {
  return signJwt({ sub: "admin-uuid-1", email: "admin@test.com", role: "admin", displayName: "Admin" });
}

async function req(method: string, path: string, token?: string) {
  const headers: Record<string, string> = {};
  if (token) headers["Authorization"] = `Bearer ${token}`;
  return app.request(path, { method, headers });
}

// ─── Campaign Analytics ───────────────────────────────────────────────────────

describe("GET /api/analytics/campaigns/:id", () => {
  beforeEach(() => { vi.clearAllMocks(); resetDbMocks(); });

  it("AN-001: Advertiser sees their campaign impression count → 200", async () => {
    const token = await advertiserToken("adv-uuid-1");

    // 1st limit: campaign ownership check
    // 2nd limit: impression totals (count+sum query)
    // groupBy → adGroup breakdown
    // orderBy/limit → daily trend
    (db.limit as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce([{ id: "campaign-uuid-1" }])       // ownership
      .mockResolvedValueOnce([{ totalImpressions: 42, totalSpendCents: 8400 }]) // totals
      .mockResolvedValueOnce([]); // daily

    (db.orderBy as ReturnType<typeof vi.fn>).mockReturnThis();
    (db.groupBy as ReturnType<typeof vi.fn>).mockResolvedValueOnce([]); // adGroups breakdown

    const res = await req("GET", "/api/analytics/campaigns/campaign-uuid-1", token);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.campaignId).toBe("campaign-uuid-1");
    expect(body.totals).toBeDefined();
    expect(typeof body.totals.impressions).toBe("number");
    expect(typeof body.totals.spendCents).toBe("number");
  });

  it("AN-001b: Advertiser cannot see another advertiser's campaign → 404", async () => {
    const token = await advertiserToken("other-adv");
    (db.limit as ReturnType<typeof vi.fn>).mockResolvedValue([]); // no campaign found

    const res = await req("GET", "/api/analytics/campaigns/campaign-uuid-1", token);
    expect(res.status).toBe(404);
  });

  it("AN-001c: No auth → 401", async () => {
    const res = await req("GET", "/api/analytics/campaigns/campaign-uuid-1");
    expect(res.status).toBe(401);
  });

  it("AN-001d: Owner cannot access campaign analytics → 403", async () => {
    const token = await ownerToken();
    const res = await req("GET", "/api/analytics/campaigns/campaign-uuid-1", token);
    expect(res.status).toBe(403);
  });

  it("AN-002: Campaign analytics includes total spend → 200", async () => {
    const token = await advertiserToken("adv-uuid-1");

    (db.limit as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce([{ id: "campaign-uuid-1" }])
      .mockResolvedValueOnce([{ totalImpressions: 10, totalSpendCents: 3000 }])
      .mockResolvedValueOnce([]);

    (db.groupBy as ReturnType<typeof vi.fn>).mockResolvedValueOnce([]);

    const res = await req("GET", "/api/analytics/campaigns/campaign-uuid-1", token);
    const body = await res.json();
    expect(body.totals.spendCents).toBe(3000);
  });

  it("Admin can see any campaign analytics → 200", async () => {
    const token = await adminToken();

    // Admin skips ownership check, goes straight to aggregates
    (db.limit as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce([{ totalImpressions: 100, totalSpendCents: 5000 }])
      .mockResolvedValueOnce([]);

    (db.groupBy as ReturnType<typeof vi.fn>).mockResolvedValueOnce([]);

    const res = await req("GET", "/api/analytics/campaigns/any-campaign", token);
    expect(res.status).toBe(200);
  });
});

// ─── Screen Analytics ─────────────────────────────────────────────────────────

describe("GET /api/analytics/screens/:id", () => {
  beforeEach(() => { vi.clearAllMocks(); resetDbMocks(); });

  it("AN-003: Owner sees their screen revenue → 200", async () => {
    const token = await ownerToken("owner-uuid-1");

    (db.limit as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce([{ id: "screen-uuid-1" }])  // ownership
      .mockResolvedValueOnce([{ totalImpressions: 200 }]) // impression count
      .mockResolvedValueOnce([{                           // revenue totals
        totalRevenueCents: 10000,
        ownerRevenueCents: 6000,
        platformRevenueCents: 4000,
      }]);

    (db.orderBy as ReturnType<typeof vi.fn>)
      .mockReturnThis();
    // competition trend
    (db.limit as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce([]);

    const res = await req("GET", "/api/analytics/screens/screen-uuid-1", token);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.totals.ownerRevenueCents).toBe(6000);
    expect(body.totals.impressionsServed).toBe(200);
  });

  it("Owner cannot see another owner's screen analytics → 404", async () => {
    const token = await ownerToken("other-owner");
    (db.limit as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    const res = await req("GET", "/api/analytics/screens/screen-uuid-1", token);
    expect(res.status).toBe(404);
  });

  it("Advertiser cannot access screen analytics → 403", async () => {
    const token = await advertiserToken();
    const res = await req("GET", "/api/analytics/screens/screen-uuid-1", token);
    expect(res.status).toBe(403);
  });
});

// ─── Platform Analytics ───────────────────────────────────────────────────────

describe("GET /api/analytics/platform", () => {
  beforeEach(() => { vi.clearAllMocks(); resetDbMocks(); });

  it("AN-004: Admin sees platform revenue totals → 200", async () => {
    const token = await adminToken();

    (db.limit as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce([{ totalImpressions: 9999 }])
      .mockResolvedValueOnce([{
        totalRevenueCents: 500000,
        platformRevenueCents: 200000,
        ownerRevenueCents: 300000,
      }])
      .mockResolvedValueOnce([]); // top screens (ends at .limit(10))

    (db.orderBy as ReturnType<typeof vi.fn>).mockReturnThis();

    const res = await req("GET", "/api/analytics/platform", token);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.totals.impressions).toBe(9999);
    expect(body.totals.platformRevenueCents).toBe(200000);
    expect(Array.isArray(body.topScreens)).toBe(true);
  });

  it("AN-005: Non-admin cannot access platform analytics → 403", async () => {
    const token = await advertiserToken();
    const res = await req("GET", "/api/analytics/platform", token);
    expect(res.status).toBe(403);
  });

  it("Owner cannot access platform analytics → 403", async () => {
    const token = await ownerToken();
    const res = await req("GET", "/api/analytics/platform", token);
    expect(res.status).toBe(403);
  });
});
