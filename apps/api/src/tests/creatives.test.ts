/**
 * QA Tests: Creatives Routes
 * Maps to QA_LOG.md: CR-001 through CR-005
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

// Mock storage so we don't need real R2 credentials
vi.mock("../services/storage.js", () => ({
  generatePresignedUploadUrl: vi.fn().mockResolvedValue({
    uploadUrl: "https://mock-r2.example.com/upload?sig=abc",
    fileUrl: "https://media.adscreen.io/creatives/test-id.mp4",
    expiresAt: new Date(Date.now() + 900_000).toISOString(),
  }),
}));

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
async function ownerToken(id = "owner-uuid-1") {
  return signJwt({ sub: id, email: "owner@test.com", role: "owner", displayName: "Owner" });
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

const MOCK_CREATIVE = {
  id: "creative-uuid-1",
  advertiserId: "adv-uuid-1",
  name: "My Video Ad",
  filename: "ad-video.mp4",
  type: "video",
  status: "processing",
  storageUrl: null,
  thumbnailUrl: null,
  fileSizeBytes: 10_000_000,
  durationSec: null,
  widthPx: null,
  heightPx: null,
  aspectRatio: null,
  mimeType: "video/mp4",
  createdAt: new Date(),
};

describe("GET /api/creatives", () => {
  beforeEach(() => { vi.clearAllMocks(); resetDbMocks(); });

  it("CR-list-001: Advertiser lists their creatives → 200 + array", async () => {
    const token = await advertiserToken();
    (db.limit as ReturnType<typeof vi.fn>).mockResolvedValue([MOCK_CREATIVE]);

    const res = await req("GET", "/api/creatives", undefined, token);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
  });

  it("CR-list-002: Owner cannot list creatives → 403", async () => {
    const token = await ownerToken();
    const res = await req("GET", "/api/creatives", undefined, token);
    expect(res.status).toBe(403);
  });

  it("CR-list-003: No auth → 401", async () => {
    const res = await req("GET", "/api/creatives");
    expect(res.status).toBe(401);
  });
});

describe("POST /api/creatives/upload-url", () => {
  beforeEach(() => { vi.clearAllMocks(); resetDbMocks(); });

  it("CR-001: Advertiser requests upload URL for video → 201", async () => {
    const token = await advertiserToken();
    (db.returning as ReturnType<typeof vi.fn>).mockResolvedValue([{ id: "creative-uuid-1" }]);

    const res = await req("POST", "/api/creatives/upload-url", {
      name: "My Video Ad",
      filename: "ad.mp4",
      contentType: "video/mp4",
      fileSizeBytes: 10_000_000,
    }, token);

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.creativeId).toBeDefined();
    expect(body.uploadUrl).toContain("mock-r2");
    expect(body.fileUrl).toBeDefined();
    expect(body.expiresAt).toBeDefined();
  });

  it("CR-002: Advertiser requests upload URL for image → 201", async () => {
    const token = await advertiserToken();
    (db.returning as ReturnType<typeof vi.fn>).mockResolvedValue([{ id: "creative-uuid-2" }]);

    const res = await req("POST", "/api/creatives/upload-url", {
      name: "My Banner",
      filename: "banner.jpg",
      contentType: "image/jpeg",
      fileSizeBytes: 500_000,
    }, token);

    expect(res.status).toBe(201);
  });

  it("CR-003: Owner cannot request upload URL → 403", async () => {
    const token = await ownerToken();
    const res = await req("POST", "/api/creatives/upload-url", {
      name: "Test",
      filename: "test.mp4",
      contentType: "video/mp4",
      fileSizeBytes: 1000,
    }, token);
    expect(res.status).toBe(403);
  });

  it("Unsupported content type → 422", async () => {
    const token = await advertiserToken();
    (db.returning as ReturnType<typeof vi.fn>).mockResolvedValue([{ id: "creative-uuid-1" }]);

    const res = await req("POST", "/api/creatives/upload-url", {
      name: "Test",
      filename: "test.pdf",
      contentType: "application/pdf",
      fileSizeBytes: 1000,
    }, token);
    expect(res.status).toBe(422);
  });
});

describe("POST /api/creatives/:id/confirm", () => {
  beforeEach(() => { vi.clearAllMocks(); resetDbMocks(); });

  it("CR-004: Confirm upload → creative status = processing", async () => {
    const token = await advertiserToken("adv-uuid-1");
    (db.limit as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: "creative-uuid-1", advertiserId: "adv-uuid-1" },
    ]);
    (db.returning as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: "creative-uuid-1", status: "processing", type: "video" },
    ]);

    const res = await req("POST", "/api/creatives/creative-uuid-1/confirm", {
      durationSec: 30,
      widthPx: 1920,
      heightPx: 1080,
    }, token);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("processing");
  });

  it("Different advertiser cannot confirm → 403", async () => {
    const token = await advertiserToken("other-adv");
    (db.limit as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: "creative-uuid-1", advertiserId: "adv-uuid-1" },
    ]);

    const res = await req("POST", "/api/creatives/creative-uuid-1/confirm", {}, token);
    expect(res.status).toBe(403);
  });

  it("Non-existent creative → 404", async () => {
    const token = await advertiserToken();
    (db.limit as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    const res = await req("POST", "/api/creatives/does-not-exist/confirm", {}, token);
    expect(res.status).toBe(404);
  });
});

describe("DELETE /api/creatives/:id", () => {
  beforeEach(() => { vi.clearAllMocks(); resetDbMocks(); });

  it("CR-005: Delete own creative → 200", async () => {
    const token = await advertiserToken("adv-uuid-1");
    (db.limit as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: "creative-uuid-1", advertiserId: "adv-uuid-1" },
    ]);

    const res = await req("DELETE", "/api/creatives/creative-uuid-1", undefined, token);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  it("Cannot delete another advertiser's creative → 403", async () => {
    const token = await advertiserToken("other-adv");
    (db.limit as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: "creative-uuid-1", advertiserId: "adv-uuid-1" },
    ]);

    const res = await req("DELETE", "/api/creatives/creative-uuid-1", undefined, token);
    expect(res.status).toBe(403);
  });
});
