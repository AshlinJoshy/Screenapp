/**
 * QA Tests: Approvals, Player, Playlist
 * Maps to QA_LOG.md: AP-001 through AP-004, PL-001 through PL-004
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

async function ownerToken(id = "owner-uuid-1") {
  return signJwt({ sub: id, email: "owner@test.com", role: "owner", displayName: "Owner" });
}
async function advertiserToken(id = "adv-uuid-1") {
  return signJwt({ sub: id, email: "adv@test.com", role: "advertiser", displayName: "Advertiser" });
}
async function adminToken() {
  return signJwt({ sub: "admin-uuid-1", email: "admin@test.com", role: "admin", displayName: "Admin" });
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

const MOCK_APPROVAL = {
  id: "approval-uuid-1",
  adGroupId: "adgroup-uuid-1",
  screenId: "screen-uuid-1",
  approvalStatus: "pending",
  approvalNotes: null,
  reviewedAt: null,
  createdAt: new Date(),
  screenName: "Gym TV",
  adGroupName: "Austin Gyms",
  impressionDurationSec: 30,
  dailyBudgetCents: 2000,
  campaignId: "campaign-uuid-1",
};

// ─── Approvals ────────────────────────────────────────────────────────────────

describe("GET /api/approvals", () => {
  beforeEach(() => { vi.clearAllMocks(); resetDbMocks(); });

  it("AP-001: Owner sees pending approvals for their screens → 200", async () => {
    const token = await ownerToken("owner-uuid-1");

    (db.limit as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce([{ id: "screen-uuid-1" }])    // owner's screens
      .mockResolvedValueOnce([MOCK_APPROVAL]);              // pending approvals

    const res = await req("GET", "/api/approvals", undefined, token);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
  });

  it("Owner with no screens gets empty array → 200", async () => {
    const token = await ownerToken();
    (db.limit as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    const res = await req("GET", "/api/approvals", undefined, token);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual([]);
  });

  it("Advertiser cannot see approvals → 403", async () => {
    const token = await advertiserToken();
    const res = await req("GET", "/api/approvals", undefined, token);
    expect(res.status).toBe(403);
  });

  it("Admin can see all approvals → 200", async () => {
    const token = await adminToken();

    (db.limit as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce([{ id: "screen-uuid-1" }, { id: "screen-uuid-2" }])
      .mockResolvedValueOnce([MOCK_APPROVAL]);

    const res = await req("GET", "/api/approvals", undefined, token);
    expect(res.status).toBe(200);
  });
});

describe("PATCH /api/approvals/:id — Approve / Reject", () => {
  beforeEach(() => { vi.clearAllMocks(); resetDbMocks(); });

  it("AP-002: Owner approves ad group → 200 + status=approved", async () => {
    const token = await ownerToken("owner-uuid-1");

    (db.limit as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce([{
        id: "approval-uuid-1",
        adGroupId: "adgroup-uuid-1",
        screenId: "screen-uuid-1",
        approvalStatus: "pending",
        ownerId: "owner-uuid-1",
      }])
      // playlist regeneration queries (all return empty for simplicity)
      .mockResolvedValue([]);

    (db.returning as ReturnType<typeof vi.fn>).mockResolvedValue([{
      ...MOCK_APPROVAL,
      approvalStatus: "approved",
      reviewedAt: new Date(),
    }]);

    const res = await req("PATCH", "/api/approvals/approval-uuid-1", {
      status: "approved",
    }, token);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.approvalStatus).toBe("approved");
  });

  it("AP-003: Owner rejects ad group → 200 + status=rejected", async () => {
    const token = await ownerToken("owner-uuid-1");

    (db.limit as ReturnType<typeof vi.fn>).mockResolvedValueOnce([{
      id: "approval-uuid-1",
      adGroupId: "adgroup-uuid-1",
      screenId: "screen-uuid-1",
      approvalStatus: "pending",
      ownerId: "owner-uuid-1",
    }]).mockResolvedValue([]);

    (db.returning as ReturnType<typeof vi.fn>).mockResolvedValue([{
      ...MOCK_APPROVAL,
      approvalStatus: "rejected",
      approvalNotes: "Not relevant to our gym audience",
    }]);

    const res = await req("PATCH", "/api/approvals/approval-uuid-1", {
      status: "rejected",
      notes: "Not relevant to our gym audience",
    }, token);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.approvalStatus).toBe("rejected");
  });

  it("AP-004: Different owner cannot review another screen's approval → 403", async () => {
    const token = await ownerToken("other-owner");

    (db.limit as ReturnType<typeof vi.fn>).mockResolvedValueOnce([{
      id: "approval-uuid-1",
      adGroupId: "adgroup-uuid-1",
      screenId: "screen-uuid-1",
      approvalStatus: "pending",
      ownerId: "owner-uuid-1",   // different owner
    }]);

    const res = await req("PATCH", "/api/approvals/approval-uuid-1", {
      status: "approved",
    }, token);

    expect(res.status).toBe(403);
  });

  it("Non-existent approval → 404", async () => {
    const token = await ownerToken();
    (db.limit as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    const res = await req("PATCH", "/api/approvals/does-not-exist", {
      status: "approved",
    }, token);
    expect(res.status).toBe(404);
  });

  it("Invalid status value → 400", async () => {
    const token = await ownerToken();
    const res = await req("PATCH", "/api/approvals/approval-uuid-1", {
      status: "maybe",
    }, token);
    expect(res.status).toBe(400);
  });
});

// ─── Player ───────────────────────────────────────────────────────────────────

describe("GET /api/player/playlist", () => {
  beforeEach(() => { vi.clearAllMocks(); resetDbMocks(); });

  async function playerReq(path: string, apiKey?: string) {
    const headers: Record<string, string> = {};
    if (apiKey) headers["X-Api-Key"] = apiKey;
    return app.request(path, { method: "GET", headers });
  }

  it("PL-001: Valid API key → 200 + playlist", async () => {
    (db.limit as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce([{ id: "screen-uuid-1", ownerId: "owner-uuid-1", isActive: true }])
      .mockResolvedValueOnce([{
        jsonBlob: { items: [] },
        generatedAt: new Date(),
        version: 3,
      }]);

    const res = await playerReq("/api/player/playlist", "sk_validkey123");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.screenId).toBeDefined();
    expect(body.items).toBeDefined();
    expect(body.version).toBe(3);
  });

  it("PL-002: Invalid API key → 401", async () => {
    (db.limit as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    const res = await playerReq("/api/player/playlist", "sk_invalid");
    expect(res.status).toBe(401);
  });

  it("PL-002b: Missing X-Api-Key → 401", async () => {
    const res = await playerReq("/api/player/playlist");
    expect(res.status).toBe(401);
  });

  it("PL-004: Playlist items should only contain approved ad data (format check)", async () => {
    (db.limit as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce([{ id: "screen-uuid-1", ownerId: "owner-uuid-1", isActive: true }])
      .mockResolvedValueOnce([{
        jsonBlob: {
          items: [
            {
              adId: "ad-uuid-1",
              creativeId: "creative-uuid-1",
              storageUrl: "https://media.adscreen.io/creatives/test.mp4",
              type: "video",
              durationSec: 30,
              weight: 100,
            },
          ],
        },
        generatedAt: new Date(),
        version: 1,
      }]);

    const res = await playerReq("/api/player/playlist", "sk_validkey");
    const body = await res.json();
    expect(body.items.length).toBe(1);
    expect(body.items[0].storageUrl).toBeDefined();
    expect(body.items[0].durationSec).toBe(30);
  });
});

describe("POST /api/player/heartbeat", () => {
  beforeEach(() => { vi.clearAllMocks(); resetDbMocks(); });

  async function playerPost(path: string, body: unknown, apiKey?: string) {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (apiKey) headers["X-Api-Key"] = apiKey;
    return app.request(path, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });
  }

  it("PL-003: Valid heartbeat → 200 + screen status = online", async () => {
    (db.limit as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce([{ id: "screen-uuid-1", ownerId: "owner-uuid-1", isActive: true }])
      .mockResolvedValueOnce([{ version: 2 }]); // playlist version

    const res = await playerPost("/api/player/heartbeat", {
      playerVersion: "1.0.0",
      impressions: [],
    }, "sk_validkey");

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.playlistVersion).toBe(2);
    expect(body.nextCheckInSec).toBeGreaterThan(0);
  });

  it("Heartbeat with no API key → 401", async () => {
    const res = await playerPost("/api/player/heartbeat", {
      playerVersion: "1.0.0",
    });
    expect(res.status).toBe(401);
  });
});

// ─── Playlist service unit tests ──────────────────────────────────────────────

describe("generatePlaylist service", () => {
  it("Empty ad rows → empty playlist", async () => {
    const { generatePlaylist } = await import("../services/playlist.js");
    const result = generatePlaylist([], new Map());
    expect(result).toEqual([]);
  });

  it("Ads without storageUrl are excluded", async () => {
    const { generatePlaylist } = await import("../services/playlist.js");
    const durationMap = new Map([["group-1", 30]]);
    const result = generatePlaylist([
      {
        id: "ad-1", adGroupId: "group-1", creativeId: "c-1",
        name: null, weight: 100,
        storageUrl: null, // no URL — should be excluded
        thumbnailUrl: null, type: "video", status: "ready",
      },
    ], durationMap);
    expect(result).toHaveLength(0);
  });

  it("Higher weight ads appear more in playlist", async () => {
    const { generatePlaylist } = await import("../services/playlist.js");
    const durationMap = new Map([["group-1", 30]]);

    const result = generatePlaylist([
      {
        id: "ad-heavy", adGroupId: "group-1", creativeId: "c-1",
        name: null, weight: 1000,
        storageUrl: "https://example.com/heavy.mp4",
        thumbnailUrl: null, type: "video", status: "ready",
      },
      {
        id: "ad-light", adGroupId: "group-1", creativeId: "c-2",
        name: null, weight: 100,
        storageUrl: "https://example.com/light.mp4",
        thumbnailUrl: null, type: "video", status: "ready",
      },
    ], durationMap);

    const heavyCount = result.filter((r) => r.adId === "ad-heavy").length;
    const lightCount = result.filter((r) => r.adId === "ad-light").length;
    expect(heavyCount).toBeGreaterThan(lightCount);
  });

  it("durationSec comes from durationMap, not creative", async () => {
    const { generatePlaylist } = await import("../services/playlist.js");
    const durationMap = new Map([["group-1", 45]]);

    const result = generatePlaylist([
      {
        id: "ad-1", adGroupId: "group-1", creativeId: "c-1",
        name: null, weight: 100,
        storageUrl: "https://example.com/ad.mp4",
        thumbnailUrl: null, type: "video", status: "ready",
      },
    ], durationMap);

    expect(result[0]?.durationSec).toBe(45);
  });
});
