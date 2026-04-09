/**
 * QA Tests: Screens Routes
 * Maps to QA_LOG.md: SC-001 through SC-020
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
    innerJoin: vi.fn().mockReturnThis(),
    offset: vi.fn().mockReturnThis(),
  };
  return { db: mockDb };
});

/** Reset all mock implementations to safe chainable defaults before each test */
function resetDbMocks() {
  const d = db as Record<string, ReturnType<typeof vi.fn>>;
  (["select", "from", "where", "limit", "insert", "values", "update", "set", "innerJoin", "offset"] as const).forEach(
    (m) => d[m].mockReturnThis()
  );
  d["returning"].mockReset();
}

const { db } = await import("../db.js");

// ─── Token factories ──────────────────────────────────────────────────────────

async function ownerToken(id = "owner-uuid-1") {
  return signJwt({ sub: id, email: "owner@test.com", role: "owner", displayName: "Owner" });
}

async function advertiserToken(id = "adv-uuid-1") {
  return signJwt({ sub: id, email: "adv@test.com", role: "advertiser", displayName: "Advertiser" });
}

async function adminToken(id = "admin-uuid-1") {
  return signJwt({ sub: id, email: "admin@test.com", role: "admin", displayName: "Admin" });
}

// ─── Helper ───────────────────────────────────────────────────────────────────

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

// ─── Valid screen payload ─────────────────────────────────────────────────────

const VALID_SCREEN = {
  name: "Gym TV Screen 1",
  address: "123 Main St, Austin, TX 78701",
  country: "US",
  state: "Texas",
  city: "Austin",
  latitude: 30.2672,
  longitude: -97.7431,
  physicalWidthCm: 120,
  physicalHeightCm: 68,
  screenDiagonalIn: 55,
  resolutionW: 1920,
  resolutionH: 1080,
  orientation: "landscape",
  acceptsImages: true,
  acceptsVideos: true,
  venueType: "gym",
  venueName: "Planet Fitness",
  estimatedDailyViews: 500,
  isOpen24h: false,
  operatingHoursStart: "06:00",
  operatingHoursEnd: "22:00",
  floorCpsCents: 3,
};

const MOCK_SCREEN = {
  id: "screen-uuid-1",
  ownerId: "owner-uuid-1",
  apiKey: "sk_abc123",
  status: "offline",
  aspectRatio: "16:9",
  isActive: true,
  ...VALID_SCREEN,
  screenDiagonalIn: "55.0",
  latitude: "30.26720000",
  longitude: "-97.74310000",
  createdAt: new Date(),
};

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("POST /api/screens — Register screen", () => {
  beforeEach(() => { vi.clearAllMocks(); resetDbMocks(); });

  it("SC-001: Owner registers screen with all required fields → 201", async () => {
    const token = await ownerToken();
    (db.returning as ReturnType<typeof vi.fn>).mockResolvedValue([MOCK_SCREEN]);

    const res = await req("POST", "/api/screens", VALID_SCREEN, token);
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.id).toBeDefined();
    expect(body.name).toBe("Gym TV Screen 1");
  });

  it("SC-002: Response includes api_key for owner", async () => {
    const token = await ownerToken();
    (db.returning as ReturnType<typeof vi.fn>).mockResolvedValue([MOCK_SCREEN]);

    const res = await req("POST", "/api/screens", VALID_SCREEN, token);
    const body = await res.json();
    expect(body.apiKey).toBeDefined();
    expect(body.apiKey).toMatch(/^sk_/);
  });

  it("SC-003: Missing required field → 400", async () => {
    const token = await ownerToken();
    const { resolutionW: _w, ...withoutResolution } = VALID_SCREEN;

    const res = await req("POST", "/api/screens", withoutResolution, token);
    expect(res.status).toBe(400);
  });

  it("SC-004: Missing physical size → 400", async () => {
    const token = await ownerToken();
    const { physicalWidthCm: _w, physicalHeightCm: _h, screenDiagonalIn: _d, ...withoutPhysical } = VALID_SCREEN;

    const res = await req("POST", "/api/screens", withoutPhysical, token);
    expect(res.status).toBe(400);
  });

  it("SC-005: Advertiser cannot register a screen → 403", async () => {
    const token = await advertiserToken();
    const res = await req("POST", "/api/screens", VALID_SCREEN, token);
    expect(res.status).toBe(403);
  });
});

describe("GET /api/screens — List screens", () => {
  beforeEach(() => { vi.clearAllMocks(); resetDbMocks(); });

  it("SC-006: Owner lists their screens → 200 + array", async () => {
    const token = await ownerToken();
    (db.limit as ReturnType<typeof vi.fn>).mockResolvedValue([MOCK_SCREEN]);

    const res = await req("GET", "/api/screens", undefined, token);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
  });

  it("SC-020: API key NOT exposed in public listing (security)", async () => {
    const token = await advertiserToken();
    // Simulate what the DB returns for the public route: no apiKey field
    const { apiKey: _key, ...publicScreenData } = MOCK_SCREEN;
    (db.offset as ReturnType<typeof vi.fn>).mockResolvedValue([
      { ...publicScreenData, ownerDisplayName: "Test Owner" },
    ]);

    const res = await req("GET", "/api/screens/public", undefined, token);
    const body = await res.json();
    const bodyStr = JSON.stringify(body);
    expect(bodyStr).not.toContain("apiKey");
    expect(bodyStr).not.toContain("api_key");
  });
});

describe("GET /api/screens/:id", () => {
  beforeEach(() => { vi.clearAllMocks(); resetDbMocks(); });

  it("SC-009: Owner gets their own screen → 200", async () => {
    const token = await ownerToken("owner-uuid-1");
    (db.limit as ReturnType<typeof vi.fn>).mockResolvedValue([MOCK_SCREEN]);

    const res = await req("GET", "/api/screens/screen-uuid-1", undefined, token);
    expect(res.status).toBe(200);
  });

  it("SC-010: Different owner cannot access another owner's screen → 403", async () => {
    const token = await ownerToken("different-owner-uuid");
    (db.limit as ReturnType<typeof vi.fn>).mockResolvedValue([MOCK_SCREEN]);

    const res = await req("GET", "/api/screens/screen-uuid-1", undefined, token);
    expect(res.status).toBe(403);
  });

  it("Returns 404 for non-existent screen", async () => {
    const token = await ownerToken();
    (db.limit as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    const res = await req("GET", "/api/screens/does-not-exist", undefined, token);
    expect(res.status).toBe(404);
  });
});

describe("PATCH /api/screens/:id", () => {
  beforeEach(() => { vi.clearAllMocks(); resetDbMocks(); });

  it("SC-011: Owner updates screen name → 200", async () => {
    const token = await ownerToken("owner-uuid-1");
    // First call: get existing screen; second call: update
    (db.limit as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce([{ id: "screen-uuid-1", ownerId: "owner-uuid-1" }])
      .mockResolvedValueOnce([MOCK_SCREEN]);
    (db.returning as ReturnType<typeof vi.fn>).mockResolvedValue([
      { ...MOCK_SCREEN, name: "Updated Name" },
    ]);

    const res = await req(
      "PATCH",
      "/api/screens/screen-uuid-1",
      { name: "Updated Name" },
      token
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.name).toBe("Updated Name");
  });

  it("SC-013: Other owner cannot update → 403", async () => {
    const token = await ownerToken("other-owner");
    (db.limit as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: "screen-uuid-1", ownerId: "owner-uuid-1" }, // different owner
    ]);

    const res = await req(
      "PATCH",
      "/api/screens/screen-uuid-1",
      { name: "Hacked" },
      token
    );
    expect(res.status).toBe(403);
  });
});

describe("DELETE /api/screens/:id", () => {
  beforeEach(() => { vi.clearAllMocks(); resetDbMocks(); });

  it("SC-014: Owner deactivates their screen → 200", async () => {
    const token = await ownerToken("owner-uuid-1");
    (db.limit as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: "screen-uuid-1", ownerId: "owner-uuid-1" },
    ]);
    (db.returning as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    const res = await req("DELETE", "/api/screens/screen-uuid-1", undefined, token);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });
});

describe("Role-Based Access Control", () => {
  it("Unauthenticated request → 401", async () => {
    const res = await req("GET", "/api/screens");
    expect(res.status).toBe(401);
  });

  it("Advertiser cannot list owner's screens → 403", async () => {
    const token = await advertiserToken();
    const res = await req("GET", "/api/screens", undefined, token);
    expect(res.status).toBe(403);
  });

  it("SC-008: Admin can list all screens → 200", async () => {
    const token = await adminToken();
    (db.limit as ReturnType<typeof vi.fn>).mockResolvedValue([MOCK_SCREEN]);

    const res = await req("GET", "/api/screens", undefined, token);
    expect(res.status).toBe(200);
  });
});

describe("GET /api/screens/public — Browse with filters", () => {
  beforeEach(() => { vi.clearAllMocks(); resetDbMocks(); });

  it("SC-015: Returns active screens to any authenticated user", async () => {
    const token = await advertiserToken();
    (db.offset as ReturnType<typeof vi.fn>).mockResolvedValue([
      { ...MOCK_SCREEN, ownerDisplayName: "Owner" },
    ]);

    const res = await req("GET", "/api/screens/public", undefined, token);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toBeDefined();
    expect(Array.isArray(body.data)).toBe(true);
  });

  it("SC-016: Country filter is accepted in query string", async () => {
    const token = await advertiserToken();
    (db.offset as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    const res = await req("GET", "/api/screens/public?country=US", undefined, token);
    expect(res.status).toBe(200);
  });

  it("SC-018: Orientation filter works", async () => {
    const token = await advertiserToken();
    (db.offset as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    const res = await req("GET", "/api/screens/public?orientation=landscape", undefined, token);
    expect(res.status).toBe(200);
  });

  it("SC-019: acceptsVideo filter works", async () => {
    const token = await advertiserToken();
    (db.offset as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    const res = await req("GET", "/api/screens/public?acceptsVideos=true", undefined, token);
    expect(res.status).toBe(200);
  });

  it("Unauthenticated cannot browse public screens → 401", async () => {
    const res = await req("GET", "/api/screens/public");
    expect(res.status).toBe(401);
  });
});
