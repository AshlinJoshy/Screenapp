/**
 * QA Tests: Auth Routes
 * Maps to QA_LOG.md: A-001 through A-015
 *
 * These are integration tests using Hono's test client.
 * They mock the database layer to avoid needing a real DB in CI.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { app } from "../index.js";

// ─── Mock the db module ───────────────────────────────────────────────────────

vi.mock("../db.js", () => {
  const mockDb = {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    values: vi.fn().mockReturnThis(),
    returning: vi.fn(),
  };
  return { db: mockDb };
});

const { db } = await import("../db.js");

// ─── Helper: Make requests via Hono test client ───────────────────────────────

async function post(path: string, body: unknown, token?: string) {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  return app.request(path, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

async function get(path: string, token?: string) {
  const headers: Record<string, string> = {};
  if (token) headers["Authorization"] = `Bearer ${token}`;
  return app.request(path, { method: "GET", headers });
}

// ─── Test data ────────────────────────────────────────────────────────────────

const MOCK_USER = {
  id: "550e8400-e29b-41d4-a716-446655440000",
  email: "owner@test.com",
  role: "owner" as const,
  displayName: "Test Owner",
  createdAt: new Date(),
};

// ─── Auth Tests ───────────────────────────────────────────────────────────────

describe("POST /api/auth/register", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("A-001: Registers as owner with valid data → 201 + user object", async () => {
    // Mock: no existing user, successful insert
    (db.limit as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (db.returning as ReturnType<typeof vi.fn>).mockResolvedValue([MOCK_USER]);

    const res = await post("/api/auth/register", {
      email: "owner@test.com",
      password: "Password123!",
      role: "owner",
      displayName: "Test Owner",
    });

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.token).toBeDefined();
    expect(body.user.email).toBe("owner@test.com");
    expect(body.user.role).toBe("owner");
  });

  it("A-002: Registers as advertiser with valid data → 201", async () => {
    (db.limit as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (db.returning as ReturnType<typeof vi.fn>).mockResolvedValue([
      { ...MOCK_USER, role: "advertiser", email: "adv@test.com" },
    ]);

    const res = await post("/api/auth/register", {
      email: "adv@test.com",
      password: "Password123!",
      role: "advertiser",
      displayName: "Test Advertiser",
    });

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.user.role).toBe("advertiser");
  });

  it("A-003: Duplicate email → 409 Conflict", async () => {
    // Mock: user exists
    (db.limit as ReturnType<typeof vi.fn>).mockResolvedValue([MOCK_USER]);

    const res = await post("/api/auth/register", {
      email: "owner@test.com",
      password: "Password123!",
      role: "owner",
      displayName: "Test Owner",
    });

    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toMatch(/already registered/i);
  });

  it("A-004: Missing required fields → 422", async () => {
    const res = await post("/api/auth/register", {
      email: "owner@test.com",
      // missing password, role, displayName
    });
    expect(res.status).toBe(400); // Hono zod validator returns 400
  });

  it("A-005: Password < 8 chars → 400", async () => {
    const res = await post("/api/auth/register", {
      email: "owner@test.com",
      password: "short",
      role: "owner",
      displayName: "Test",
    });
    expect(res.status).toBe(400);
  });

  it("A-006: Invalid email format → 400", async () => {
    const res = await post("/api/auth/register", {
      email: "not-an-email",
      password: "Password123!",
      role: "owner",
      displayName: "Test",
    });
    expect(res.status).toBe(400);
  });

  it("A-014: Password not returned in response", async () => {
    (db.limit as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (db.returning as ReturnType<typeof vi.fn>).mockResolvedValue([MOCK_USER]);

    const res = await post("/api/auth/register", {
      email: "owner@test.com",
      password: "Password123!",
      role: "owner",
      displayName: "Test Owner",
    });

    const body = await res.json();
    const bodyStr = JSON.stringify(body);
    expect(bodyStr).not.toContain("password");
    expect(bodyStr).not.toContain("passwordHash");
    expect(bodyStr).not.toContain("password_hash");
  });
});

describe("POST /api/auth/login", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("A-007: Login with correct credentials → 200 + JWT", async () => {
    // Use a real bcrypt hash of "Password123!"
    const { hashPassword } = await import("../utils/crypto.js");
    const hash = await hashPassword("Password123!");

    (db.limit as ReturnType<typeof vi.fn>).mockResolvedValue([
      { ...MOCK_USER, passwordHash: hash },
    ]);

    const res = await post("/api/auth/login", {
      email: "owner@test.com",
      password: "Password123!",
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.token).toBeDefined();
    expect(typeof body.token).toBe("string");
    expect(body.token.split(".").length).toBe(3); // valid JWT has 3 parts
  });

  it("A-008: Wrong password → 401", async () => {
    const { hashPassword } = await import("../utils/crypto.js");
    const hash = await hashPassword("Password123!");

    (db.limit as ReturnType<typeof vi.fn>).mockResolvedValue([
      { ...MOCK_USER, passwordHash: hash },
    ]);

    const res = await post("/api/auth/login", {
      email: "owner@test.com",
      password: "WrongPassword!",
    });

    expect(res.status).toBe(401);
  });

  it("A-009: Non-existent email → 401", async () => {
    (db.limit as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    const res = await post("/api/auth/login", {
      email: "ghost@test.com",
      password: "Password123!",
    });

    expect(res.status).toBe(401);
  });
});

describe("GET /api/auth/me", () => {
  it("A-010: Valid JWT → 200 + user info", async () => {
    const { signJwt } = await import("../utils/jwt.js");
    const token = await signJwt({
      sub: MOCK_USER.id,
      email: MOCK_USER.email,
      role: MOCK_USER.role,
      displayName: MOCK_USER.displayName,
    });

    const res = await get("/api/auth/me", token);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.email).toBe(MOCK_USER.email);
    expect(body.role).toBe(MOCK_USER.role);
  });

  it("A-011: No token → 401", async () => {
    const res = await get("/api/auth/me");
    expect(res.status).toBe(401);
  });

  it("A-012: Malformed token → 401", async () => {
    const res = await get("/api/auth/me", "not.a.valid.jwt");
    expect(res.status).toBe(401);
  });

  it("A-013: Expired token → 401", async () => {
    // Create a token that expired 1 second ago
    const { SignJWT } = await import("jose");
    const secret = new TextEncoder().encode(
      "test-secret-at-least-32-characters-long!!"
    );
    const expiredToken = await new SignJWT({
      sub: MOCK_USER.id,
      email: MOCK_USER.email,
      role: MOCK_USER.role,
      displayName: MOCK_USER.displayName,
    })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt(Math.floor(Date.now() / 1000) - 3600)
      .setExpirationTime(Math.floor(Date.now() / 1000) - 1) // expired
      .sign(secret);

    const res = await get("/api/auth/me", expiredToken);
    expect(res.status).toBe(401);
  });

  it("A-015: JWT contains correct role claim", async () => {
    const { signJwt, verifyJwt } = await import("../utils/jwt.js");
    const token = await signJwt({
      sub: MOCK_USER.id,
      email: MOCK_USER.email,
      role: "owner",
      displayName: MOCK_USER.displayName,
    });

    const payload = await verifyJwt(token);
    expect(payload?.role).toBe("owner");
  });
});
