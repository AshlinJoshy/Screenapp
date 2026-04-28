/**
 * QA Tests: Campaigns, Ad Groups, Ads Routes
 * Maps to QA_LOG.md: CP-001 through CP-005
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
  };
  return { db: mockDb };
});

const { db } = await import("../db.js");

function resetDbMocks() {
  const d = db as Record<string, ReturnType<typeof vi.fn>>;
  (["select","from","where","limit","insert","values","update","set","delete","innerJoin","offset"] as const)
    .forEach((m) => d[m].mockReturnThis());
  d["returning"].mockReset();
}

async function advertiserToken(id = "adv-uuid-1") {
  return signJwt({ sub: id, email: "adv@test.com", role: "advertiser", displayName: "Advertiser" });
}
async function ownerToken() {
  return signJwt({ sub: "owner-uuid-1", email: "owner@test.com", role: "owner", displayName: "Owner" });
}

async function req(method: string, path: string, body?: unknown, token?: string) {
  const headers: Record<string, string> = {};
  if (token) headers["Authorization"] = `Bearer ${token}`;
  if (body) headers["Content-Type"] = "application/json";
  return app.request(path, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
}

const MOCK_CAMPAIGN = {
  id: "campaign-uuid-1",
  advertiserId: "adv-uuid-1",
  name: "Summer Sale 2026",
  status: "draft",
  startDate: "2026-05-01",
  endDate: "2026-05-31",
  dailyBudgetCents: 5000,
  totalSpendCents: 0,
  createdAt: new Date(),
};

const MOCK_AD_GROUP = {
  id: "adgroup-uuid-1",
  campaignId: "campaign-uuid-1",
  name: "Austin Gyms",
  status: "active",
  impressionDurationSec: 30,
  dailyBudgetCents: 2000,
  totalSpendCents: 0,
  createdAt: new Date(),
};

// ─── Campaign CRUD ────────────────────────────────────────────────────────────

describe("GET /api/campaigns", () => {
  beforeEach(() => { vi.clearAllMocks(); resetDbMocks(); });

  it("CP-list-001: Advertiser lists their campaigns → 200", async () => {
    const token = await advertiserToken();
    (db.limit as ReturnType<typeof vi.fn>).mockResolvedValue([MOCK_CAMPAIGN]);

    const res = await req("GET", "/api/campaigns", undefined, token);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
  });

  it("Owner cannot list campaigns → 403", async () => {
    const token = await ownerToken();
    const res = await req("GET", "/api/campaigns", undefined, token);
    expect(res.status).toBe(403);
  });
});

describe("POST /api/campaigns", () => {
  beforeEach(() => { vi.clearAllMocks(); resetDbMocks(); });

  it("CP-001: Create campaign with valid data → 201", async () => {
    const token = await advertiserToken();
    (db.returning as ReturnType<typeof vi.fn>).mockResolvedValue([MOCK_CAMPAIGN]);

    const res = await req("POST", "/api/campaigns", {
      name: "Summer Sale 2026",
      startDate: "2026-05-01",
      endDate: "2026-05-31",
      dailyBudgetCents: 5000,
    }, token);

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.name).toBe("Summer Sale 2026");
    expect(body.status).toBe("draft");
  });

  it("endDate before startDate → 422", async () => {
    const token = await advertiserToken();

    const res = await req("POST", "/api/campaigns", {
      name: "Bad Dates",
      startDate: "2026-05-31",
      endDate: "2026-05-01",
      dailyBudgetCents: 5000,
    }, token);
    expect(res.status).toBe(422);
  });

  it("Missing required field → 400", async () => {
    const token = await advertiserToken();
    const res = await req("POST", "/api/campaigns", {
      name: "Incomplete Campaign",
    }, token);
    expect(res.status).toBe(400);
  });
});

describe("GET /api/campaigns/:id", () => {
  beforeEach(() => { vi.clearAllMocks(); resetDbMocks(); });

  it("Get own campaign → 200 with adGroups", async () => {
    const token = await advertiserToken("adv-uuid-1");
    (db.limit as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce([MOCK_CAMPAIGN])   // campaign lookup
      .mockResolvedValueOnce([MOCK_AD_GROUP]);  // ad groups

    const res = await req("GET", "/api/campaigns/campaign-uuid-1", undefined, token);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.id).toBe("campaign-uuid-1");
    expect(body.adGroups).toBeDefined();
  });

  it("Non-existent campaign → 404", async () => {
    const token = await advertiserToken();
    (db.limit as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    const res = await req("GET", "/api/campaigns/does-not-exist", undefined, token);
    expect(res.status).toBe(404);
  });
});

describe("PATCH /api/campaigns/:id", () => {
  beforeEach(() => { vi.clearAllMocks(); resetDbMocks(); });

  it("Update draft campaign → 200", async () => {
    const token = await advertiserToken("adv-uuid-1");
    (db.limit as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: "campaign-uuid-1", status: "draft" },
    ]);
    (db.returning as ReturnType<typeof vi.fn>).mockResolvedValue([
      { ...MOCK_CAMPAIGN, name: "Updated Name" },
    ]);

    const res = await req("PATCH", "/api/campaigns/campaign-uuid-1", {
      name: "Updated Name",
    }, token);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.name).toBe("Updated Name");
  });

  it("Cannot update completed campaign → 422", async () => {
    const token = await advertiserToken("adv-uuid-1");
    (db.limit as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: "campaign-uuid-1", status: "completed" },
    ]);

    const res = await req("PATCH", "/api/campaigns/campaign-uuid-1", {
      name: "Too Late",
    }, token);
    expect(res.status).toBe(422);
  });
});

describe("DELETE /api/campaigns/:id", () => {
  beforeEach(() => { vi.clearAllMocks(); resetDbMocks(); });

  it("Delete draft campaign → 200", async () => {
    const token = await advertiserToken("adv-uuid-1");
    (db.limit as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: "campaign-uuid-1", status: "draft" },
    ]);

    const res = await req("DELETE", "/api/campaigns/campaign-uuid-1", undefined, token);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  it("Cannot delete active campaign → 422", async () => {
    const token = await advertiserToken("adv-uuid-1");
    (db.limit as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: "campaign-uuid-1", status: "active" },
    ]);

    const res = await req("DELETE", "/api/campaigns/campaign-uuid-1", undefined, token);
    expect(res.status).toBe(422);
  });
});

// ─── Ad Groups ────────────────────────────────────────────────────────────────

describe("POST /api/campaigns/:id/ad-groups", () => {
  beforeEach(() => { vi.clearAllMocks(); resetDbMocks(); });

  it("CP-002: Create ad group with valid data → 201", async () => {
    const token = await advertiserToken("adv-uuid-1");
    const SCREEN_UUID = "11111111-1111-1111-1111-111111111111";

    // campaign ownership check
    (db.limit as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce([{ id: "campaign-uuid-1", dailyBudgetCents: 10000 }])
      // target screens validation — return screen with floor that allows budget
      .mockResolvedValueOnce([{ id: SCREEN_UUID, floorCpsCents: 1, name: "Gym Screen" }])
      // targets fetch after insert
      .mockResolvedValueOnce([]);

    (db.returning as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce([MOCK_AD_GROUP]);

    const res = await req("POST", "/api/campaigns/campaign-uuid-1/ad-groups", {
      name: "Austin Gyms",
      impressionDurationSec: 30,
      dailyBudgetCents: 2000,
      targetScreenIds: [SCREEN_UUID],
    }, token);

    expect(res.status).toBe(201);
  });

  it("Advertiser can't create ad group in another's campaign → 404", async () => {
    const token = await advertiserToken("other-adv");
    const SCREEN_UUID = "11111111-1111-1111-1111-111111111111";
    (db.limit as ReturnType<typeof vi.fn>).mockResolvedValue([]); // no campaign found

    const res = await req("POST", "/api/campaigns/campaign-uuid-1/ad-groups", {
      name: "Test Group",
      impressionDurationSec: 30,
      dailyBudgetCents: 2000,
      targetScreenIds: [SCREEN_UUID],
    }, token);
    expect(res.status).toBe(404);
  });
});

// ─── Ads (creatives in ad group) ──────────────────────────────────────────────

describe("POST /api/campaigns/ad-groups/:id/ads", () => {
  beforeEach(() => { vi.clearAllMocks(); resetDbMocks(); });

  it("CP-003: Add ad to ad group → 201", async () => {
    const token = await advertiserToken("adv-uuid-1");
    const CREATIVE_UUID = "22222222-2222-2222-2222-222222222222";

    (db.limit as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce([{ id: "adgroup-uuid-1", campaignId: "campaign-uuid-1" }])
      .mockResolvedValueOnce([{ advertiserId: "adv-uuid-1" }]);

    (db.returning as ReturnType<typeof vi.fn>).mockResolvedValue([{
      id: "ad-uuid-1",
      adGroupId: "adgroup-uuid-1",
      creativeId: CREATIVE_UUID,
      weight: 100,
      status: "active",
      impressionsCount: 0,
      createdAt: new Date(),
    }]);

    const res = await req("POST", "/api/campaigns/ad-groups/adgroup-uuid-1/ads", {
      creativeId: CREATIVE_UUID,
      weight: 100,
    }, token);

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.creativeId).toBe(CREATIVE_UUID);
  });

  it("CP-004: A/B test — add 2nd ad with different weight → 201", async () => {
    const token = await advertiserToken("adv-uuid-1");
    const CREATIVE_UUID2 = "33333333-3333-3333-3333-333333333333";

    (db.limit as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce([{ id: "adgroup-uuid-1", campaignId: "campaign-uuid-1" }])
      .mockResolvedValueOnce([{ advertiserId: "adv-uuid-1" }]);

    (db.returning as ReturnType<typeof vi.fn>).mockResolvedValue([{
      id: "ad-uuid-2",
      adGroupId: "adgroup-uuid-1",
      creativeId: CREATIVE_UUID2,
      weight: 50, // shown half as often
      status: "active",
      impressionsCount: 0,
      createdAt: new Date(),
    }]);

    const res = await req("POST", "/api/campaigns/ad-groups/adgroup-uuid-1/ads", {
      creativeId: CREATIVE_UUID2,
      weight: 50,
    }, token);

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.weight).toBe(50);
  });

  it("Access denied — wrong advertiser → 403", async () => {
    const token = await advertiserToken("other-adv");
    const CREATIVE_UUID = "22222222-2222-2222-2222-222222222222";

    (db.limit as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce([{ id: "adgroup-uuid-1", campaignId: "campaign-uuid-1" }])
      .mockResolvedValueOnce([{ advertiserId: "adv-uuid-1" }]); // different owner

    const res = await req("POST", "/api/campaigns/ad-groups/adgroup-uuid-1/ads", {
      creativeId: CREATIVE_UUID,
    }, token);
    expect(res.status).toBe(403);
  });
});

describe("POST /api/campaigns/ad-groups/:id/submit", () => {
  beforeEach(() => { vi.clearAllMocks(); resetDbMocks(); });

  it("CP-005: Submit ad group for approval → approval records created", async () => {
    const token = await advertiserToken("adv-uuid-1");

    (db.limit as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce([MOCK_AD_GROUP])                    // ad group
      .mockResolvedValueOnce([{ advertiserId: "adv-uuid-1" }])  // campaign ownership
      .mockResolvedValueOnce([{ id: "ad-uuid-1" }])             // active ads check
      .mockResolvedValueOnce([{ id: "t-1", screenId: "screen-uuid-1" }]); // targets

    const res = await req(
      "POST",
      "/api/campaigns/ad-groups/adgroup-uuid-1/submit",
      undefined,
      token
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.targetsSubmitted).toBe(1);
    expect(body.status).toBe("pending");
  });

  it("Submit with no ads → 422", async () => {
    const token = await advertiserToken("adv-uuid-1");

    (db.limit as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce([MOCK_AD_GROUP])
      .mockResolvedValueOnce([{ advertiserId: "adv-uuid-1" }])
      .mockResolvedValueOnce([]); // no active ads

    const res = await req(
      "POST",
      "/api/campaigns/ad-groups/adgroup-uuid-1/submit",
      undefined,
      token
    );
    expect(res.status).toBe(422);
  });
});
