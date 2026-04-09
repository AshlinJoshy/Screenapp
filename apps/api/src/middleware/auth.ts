import { createMiddleware } from "hono/factory";
import { HTTPException } from "hono/http-exception";
import { verifyJwt, type JwtPayload } from "../utils/jwt.js";
import type { UserRole } from "@adscreen/types";

export type AuthEnv = {
  Variables: {
    user: JwtPayload;
  };
};

/**
 * Verifies JWT token from Authorization header.
 * Sets ctx.var.user on success.
 */
export const requireAuth = createMiddleware<AuthEnv>(async (c, next) => {
  const authHeader = c.req.header("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    throw new HTTPException(401, { message: "Missing or invalid Authorization header" });
  }

  const token = authHeader.slice(7);
  const payload = await verifyJwt(token);
  if (!payload) {
    throw new HTTPException(401, { message: "Invalid or expired token" });
  }

  c.set("user", payload);
  await next();
});

/**
 * Restricts access to specific roles.
 * Must be used AFTER requireAuth.
 */
export const requireRole = (...roles: UserRole[]) =>
  createMiddleware<AuthEnv>(async (c, next) => {
    const user = c.var.user;
    if (!user || !roles.includes(user.role as UserRole)) {
      throw new HTTPException(403, {
        message: `Access denied. Required role: ${roles.join(" or ")}`,
      });
    }
    await next();
  });
