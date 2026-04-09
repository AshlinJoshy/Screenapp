import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { HTTPException } from "hono/http-exception";
import { ZodError } from "zod";
import { authRouter } from "./routes/auth.js";
import { screensRouter } from "./routes/screens.js";
import { creativesRouter } from "./routes/creatives.js";
import { campaignsRouter } from "./routes/campaigns.js";
import { approvalsRouter } from "./routes/approvals.js";
import { playerRouter } from "./routes/player.js";
import { pricingRouter } from "./routes/pricing.js";

const app = new Hono();

// ─── Middleware ───────────────────────────────────────────────────────────────

app.use("*", logger());

app.use(
  "*",
  cors({
    origin: process.env.CORS_ORIGIN ?? "http://localhost:3000",
    allowMethods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization", "X-Api-Key"],
    credentials: true,
  })
);

// ─── Health Check ────────────────────────────────────────────────────────────

app.get("/health", (c) =>
  c.json({ status: "ok", timestamp: new Date().toISOString() })
);

// ─── Routes ──────────────────────────────────────────────────────────────────

app.route("/api/auth", authRouter);
app.route("/api/screens", screensRouter);
app.route("/api/creatives", creativesRouter);
app.route("/api/campaigns", campaignsRouter);
app.route("/api/approvals", approvalsRouter);
app.route("/api/player", playerRouter);
app.route("/api", pricingRouter);      // /api/screens/:id/pricing + /api/auction/preview

// ─── Error Handling ──────────────────────────────────────────────────────────

app.onError((err, c) => {
  if (err instanceof HTTPException) {
    return c.json({ error: err.message }, err.status);
  }

  if (err instanceof ZodError) {
    return c.json(
      { error: "Validation error", details: err.flatten().fieldErrors },
      422
    );
  }

  console.error("Unhandled error:", err);
  return c.json({ error: "Internal server error" }, 500);
});

app.notFound((c) => c.json({ error: "Not found" }, 404));

// ─── Export app for testing ───────────────────────────────────────────────────

export { app };

// ─── Start server (when not in test) ─────────────────────────────────────────

if (process.env.NODE_ENV !== "test") {
  const port = Number(process.env.PORT ?? 3001);

  serve({ fetch: app.fetch, port }, (info) => {
    console.log(`AdScreen API running on http://localhost:${info.port}`);
  });
}
