# AdScreen — Project Roadmap

> Tackle one phase at a time. Each phase must be fully tested before moving to the next.
> See QA_LOG.md for test results.

---

## Phase 0 — Foundation ✅ (Done)
- [x] Monorepo scaffold (pnpm workspaces + Turborepo)
- [x] Root tsconfig, turbo.json, pnpm-workspace.yaml
- [x] ARCHITECTURE.md written
- [x] ROADMAP.md written
- [x] QA_LOG.md started

---

## Phase 1 — Core Data Layer & Auth 🔄 (In Progress)

**Goal:** Everything compiles, auth works, screens can be registered.

### packages/db
- [ ] Full database schema (all tables per ARCHITECTURE.md §5)
- [ ] Drizzle config + migration setup
- [ ] Seed script for admin user

### packages/types
- [ ] All shared TypeScript types (entities, API request/response, enums)

### apps/api — Phase 1 Routes
- [ ] Hono server setup (CORS, error handling, health check)
- [ ] JWT middleware
- [ ] `POST /api/auth/register` — owner + advertiser
- [ ] `POST /api/auth/login`
- [ ] `GET /api/auth/me`
- [ ] `POST /api/screens` — register screen with full specs
- [ ] `GET /api/screens` — owner's screens
- [ ] `GET /api/screens/:id` — screen detail
- [ ] `PATCH /api/screens/:id` — update screen
- [ ] `DELETE /api/screens/:id` — deactivate
- [ ] `GET /api/screens/public` — browse with filters

### Testing Phase 1
- [ ] Vitest setup in apps/api
- [ ] Auth tests (register, login, me, invalid cases)
- [ ] Screen CRUD tests
- [ ] Role-based access tests

---

## Phase 2 — Creatives & Campaign Structure

**Goal:** Advertisers can upload media and build campaigns.

### apps/api — Phase 2 Routes
- [ ] `POST /api/creatives/upload-url` — R2 presigned URL
- [ ] `POST /api/creatives/:id/confirm` — confirm upload
- [ ] `GET /api/creatives` — list own creatives
- [ ] `DELETE /api/creatives/:id`
- [ ] `POST /api/campaigns` — create campaign
- [ ] `GET /api/campaigns` — list campaigns
- [ ] `GET /api/campaigns/:id`
- [ ] `PATCH /api/campaigns/:id`
- [ ] `POST /api/campaigns/:id/ad-groups` — create ad group
- [ ] `GET /api/campaigns/:id/ad-groups`
- [ ] `PATCH /api/ad-groups/:id`
- [ ] `POST /api/ad-groups/:id/ads` — add creative to group
- [ ] `DELETE /api/ad-groups/:id/ads/:adId`

### apps/worker — Phase 2
- [ ] BullMQ setup + Redis connection
- [ ] Creative processing job (extract metadata, generate thumbnail)

### Testing Phase 2
- [ ] Creative upload flow tests
- [ ] Campaign / ad group / ad CRUD tests
- [ ] Worker job tests (mock R2)

---

## Phase 3 — Approvals & Playlist

**Goal:** Owner approves campaigns, player displays approved content.

### apps/api — Phase 3 Routes
- [ ] `POST /api/ad-groups/:id/submit` — submit for approval
- [ ] `GET /api/approvals` — list pending
- [ ] `PATCH /api/approvals/:id` — approve / reject
- [ ] Playlist generation on approval
- [ ] Pusher notification to player on approval
- [ ] `GET /api/player/playlist` — player fetches playlist
- [ ] `POST /api/player/heartbeat`

### apps/player — Phase 3
- [ ] Vite app setup
- [ ] API key auth + first-run setup screen
- [ ] Playlist fetcher (polling every 5 min)
- [ ] Video + image player loop
- [ ] Pusher listener (instant refresh on approval)
- [ ] Heartbeat every 30s
- [ ] Impression reporting

### Testing Phase 3
- [ ] Approval workflow tests
- [ ] Playlist generation tests
- [ ] Player heartbeat tests
- [ ] End-to-end flow (register → upload → create → submit → approve → player plays)

---

## Phase 4 — Bidding Engine & Auction

**Goal:** The God Formula is live. Competition drives pricing. Budgets are enforced.

### apps/api — Phase 4 Routes
- [ ] `GET /api/screens/:id/pricing` — live CPI estimate
- [ ] `GET /api/screens/:id/pricing/history` — historical prices
- [ ] `POST /api/auction/preview` — simulate impression% for a given budget

### apps/worker — Phase 4
- [ ] Hourly auction job (runs at :00 every hour)
  - Count active competitors per screen
  - Compute M(n), cps_eff, CPI per ad group
  - Compute airtime allocations
  - Write `auction_hourly_results` + `auction_allocations`
  - Update playlist weights
  - Check budgets — pause ad groups that hit daily limit
- [ ] Daily budget reset job (runs at 00:00 UTC)
- [ ] Budget exhaustion alerting

### Database
- [ ] `auction_hourly_results` table data flowing
- [ ] `auction_allocations` table data flowing
- [ ] `impressions` recording per player heartbeat

### Testing Phase 4
- [ ] Bidding formula unit tests (pure math, no DB)
- [ ] Auction worker integration tests
- [ ] Budget enforcement tests
- [ ] Minimum budget validation tests
- [ ] Oversubscribed vs undersubscribed scenario tests

---

## Phase 5 — Analytics & Revenue

**Goal:** Everyone can see their numbers.

### apps/api — Phase 5 Routes
- [ ] `GET /api/analytics/campaigns/:id` — impressions, spend, impression%
- [ ] `GET /api/analytics/ad-groups/:id` — per ad group breakdown
- [ ] `GET /api/analytics/screens/:id` — screen owner revenue
- [ ] `GET /api/analytics/platform` — admin platform totals
- [ ] `GET /api/screens/:id/pricing/history` — price trends

### apps/web — Analytics Dashboard
- [ ] Campaign performance charts
- [ ] Impression% over time
- [ ] CPI over time (shows how competition raised price)
- [ ] Screen owner revenue charts
- [ ] Platform revenue (admin only)

### Testing Phase 5
- [ ] Analytics aggregation tests
- [ ] Revenue calculation correctness tests

---

## Phase 6 — Maps & Discovery

**Goal:** Advertisers can browse screens visually and filter.

### apps/web
- [ ] Google Maps integration (screen pins on map)
- [ ] Filter panel (location, venue type, size, resolution, price range)
- [ ] Screen detail modal (specs, pricing estimate, availability)
- [ ] Save / favorite screens
- [ ] Screen comparison view

### apps/api
- [ ] Geo-filtering in `/api/screens/public` (lat/lng radius)
- [ ] `POST /api/screens/:id/save` and `DELETE` for saved screens
- [ ] `GET /api/screens/saved` — advertiser's saved screens

### Testing Phase 6
- [ ] Filter query tests
- [ ] Geo-search tests
- [ ] Saved screens tests

---

## Phase 7 — Full Dashboard UI

**Goal:** Everything has a proper UI. The platform is usable without Postman.

### apps/web — Owner
- [ ] Register screen wizard (maps + spec form)
- [ ] My screens list
- [ ] Approval queue UI
- [ ] Revenue dashboard

### apps/web — Advertiser
- [ ] Creative upload UI
- [ ] Campaign builder (campaign → ad group → ads)
- [ ] Budget & bidding settings
- [ ] Impression% preview / simulator
- [ ] Campaign analytics

### apps/web — Admin
- [ ] All screens management
- [ ] Platform revenue view
- [ ] Admin screen spec override (set max file sizes)
- [ ] Payout management

---

## Phase 8 — Production & Scaling

**Goal:** Real screens. Real money. Real load.

- [ ] Deploy API to Fly.io
- [ ] Deploy Dashboard to Vercel
- [ ] Configure Supabase production DB
- [ ] Configure Cloudflare R2 production bucket
- [ ] Configure Pusher production app
- [ ] Configure Upstash Redis production
- [ ] Configure Google Maps production key
- [ ] Load testing with k6 (auction engine under load)
- [ ] E2E tests with Playwright on staging
- [ ] Real device testing (Pi or Android tablet)
- [ ] Monitoring setup (Sentry, uptime checks)
- [ ] Stripe integration (advertiser billing + owner payouts)

---

## Feature Backlog (Post-Launch)

- [ ] Audience targeting (time-of-day multipliers, day-of-week)
- [ ] Bid strategy automation ("maximize impressions" auto-bid)
- [ ] Bulk screen import for large owners
- [ ] Campaign duplication / templates
- [ ] Email notifications (approval decisions, budget alerts)
- [ ] Mobile app for screen owners (camera to measure screen)
- [ ] Player health monitoring (crash detection, auto-restart)
- [ ] Multi-zone screens (split screen into zones)
- [ ] API for programmatic ad buying

---

## Decision Log

| Date | Decision | Reason |
|------|---------|--------|
| 2026-04-09 | Build Phase 1 first (auth + screens), add auction later | Get something testable fast |
| 2026-04-09 | Auction settles hourly (not real-time) | Simpler to implement, sufficient granularity |
| 2026-04-09 | Platform markup formula: M(n) = min(0.30 + 0.20×log₁₀(n), 0.60) | Log growth feels natural, caps at 60% |
| 2026-04-09 | Physical screen size mandatory at listing | Advertisers need this to choose appropriate creatives |
| 2026-04-09 | Max file sizes set by admin after review | Can't know server capacity upfront; start conservative |
| 2026-04-09 | Google Maps for location | Simplest UX, auto-fills country/state/city |
| 2026-04-09 | Campaign → Ad Group → Ads structure | Matches Google Ads mental model, enables A/B testing |
| 2026-04-09 | Player = browser in kiosk mode | No native app needed, works on Pi/tablet/PC/TV |

---

*Last updated: 2026-04-09*
