import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { users } from "@adscreen/db";
import { db } from "../db.js";
import { hashPassword, comparePassword } from "../utils/crypto.js";
import { signJwt } from "../utils/jwt.js";
import { requireAuth, type AuthEnv } from "../middleware/auth.js";

const registerSchema = z.object({
  email: z.string().email("Invalid email format"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  role: z.enum(["owner", "advertiser"]),
  displayName: z.string().min(1, "Display name is required").max(100),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const authRouter = new Hono<AuthEnv>();

// POST /api/auth/register
authRouter.post("/register", zValidator("json", registerSchema), async (c) => {
  const body = c.req.valid("json");

  // Check duplicate email
  const existing = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, body.email.toLowerCase()))
    .limit(1);

  if (existing.length > 0) {
    return c.json({ error: "Email already registered" }, 409);
  }

  const passwordHash = await hashPassword(body.password);

  const [user] = await db
    .insert(users)
    .values({
      email: body.email.toLowerCase(),
      passwordHash,
      role: body.role,
      displayName: body.displayName,
    })
    .returning({
      id: users.id,
      email: users.email,
      role: users.role,
      displayName: users.displayName,
      createdAt: users.createdAt,
    });

  const token = await signJwt({
    sub: user.id,
    email: user.email,
    role: user.role,
    displayName: user.displayName,
  });

  return c.json({ token, user }, 201);
});

// POST /api/auth/login
authRouter.post("/login", zValidator("json", loginSchema), async (c) => {
  const body = c.req.valid("json");

  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.email, body.email.toLowerCase()))
    .limit(1);

  if (!user) {
    return c.json({ error: "Invalid email or password" }, 401);
  }

  const valid = await comparePassword(body.password, user.passwordHash);
  if (!valid) {
    return c.json({ error: "Invalid email or password" }, 401);
  }

  const token = await signJwt({
    sub: user.id,
    email: user.email,
    role: user.role,
    displayName: user.displayName,
  });

  return c.json({
    token,
    user: {
      id: user.id,
      email: user.email,
      role: user.role,
      displayName: user.displayName,
      createdAt: user.createdAt,
    },
  });
});

// GET /api/auth/me
authRouter.get("/me", requireAuth, (c) => {
  const user = c.var.user;
  return c.json({
    id: user.sub,
    email: user.email,
    role: user.role,
    displayName: user.displayName,
  });
});
