import { SignJWT, jwtVerify } from "jose";
import type { UserRole } from "@adscreen/types";

export interface JwtPayload {
  sub: string;       // user id
  email: string;
  role: UserRole;
  displayName: string;
  iat?: number;
  exp?: number;
}

function getSecret(): Uint8Array {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET environment variable is required");
  return new TextEncoder().encode(secret);
}

export async function signJwt(payload: Omit<JwtPayload, "iat" | "exp">): Promise<string> {
  const expiresIn = process.env.JWT_EXPIRES_IN ?? "7d";
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(expiresIn)
    .sign(getSecret());
}

export async function verifyJwt(token: string): Promise<JwtPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret());
    return payload as unknown as JwtPayload;
  } catch {
    return null;
  }
}
