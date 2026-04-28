/**
 * Seed the admin account.
 * Run once: pnpm seed:admin (from apps/api directory)
 */

import "dotenv/config";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { users } from "@adscreen/db";
import { hashPassword } from "../utils/crypto.js";
import { eq } from "drizzle-orm";

const DATABASE_URL = process.env.DATABASE_URL;
const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "admin@adscreen.io";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "Admin1234!";
const ADMIN_DISPLAY_NAME = process.env.ADMIN_DISPLAY_NAME ?? "Platform Admin";

if (!DATABASE_URL) {
  console.error("DATABASE_URL environment variable is required");
  process.exit(1);
}

const client = postgres(DATABASE_URL);
const db = drizzle(client);

async function main() {
  console.log(`Seeding admin: ${ADMIN_EMAIL}`);

  const existing = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, ADMIN_EMAIL.toLowerCase()))
    .limit(1);

  if (existing.length > 0) {
    console.log("Admin account already exists. Skipping.");
    process.exit(0);
  }

  const passwordHash = await hashPassword(ADMIN_PASSWORD);

  const [admin] = await db
    .insert(users)
    .values({
      email: ADMIN_EMAIL.toLowerCase(),
      passwordHash,
      role: "admin",
      displayName: ADMIN_DISPLAY_NAME,
    })
    .returning({ id: users.id, email: users.email });

  console.log(`Admin created: id=${admin.id}, email=${admin.email}`);
  process.exit(0);
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
