# AdScreen — System Architecture

> Living document. Update when decisions change.

---

## 1. What This Platform Does

AdScreen is a two-sided marketplace for physical digital screens:

- **Screen Owners** list their screens (kiosks, billboards, gym TVs, etc.) with full specs and a floor price
- **Advertisers** browse screens, upload creatives, create campaigns, and bid for airtime
- **Players** run in the browser on the physical screen hardware, displaying approved ads in a loop
- **Admins** moderate approvals, manage payouts, and configure platform settings

---

## 2. System Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        ADVERTISERS                              │
│   Browse Screens → Create Campaign → Set Budget → Bid          │
└──────────────────────────────┬──────────────────────────────────┘
                               │  HTTPS (Next.js Dashboard)
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│                     Next.js Web App (PWA)                       │
│  ┌─────────────┐  ┌──────────────┐  ┌──────────────────────┐  │
│  │ Public Pages│  │ Owner Dash   │  │ Advertiser Dash       │  │
│  │ - Home      │  │ - My Screens │  │ - Campaigns           │  │
│  │ - Screen Map│  │ - Approvals  │  │ - Ad Groups / Ads     │  │
│  │ - Login/Reg │  │ - Revenue    │  │ - Bidding & Budget    │  │
│  └─────────────┘  └──────────────┘  │ - Screen Browser/Map  │  │
│                                     └──────────────────────┘  │
└──────────────────────────────┬──────────────────────────────────┘
                               │  REST API (Hono)
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│                     Hono API Server (Node.js)                   │
│  ┌──────────┐  ┌──────────┐  ┌────────────┐  ┌─────────────┐  │
│  │   Auth   │  │ Screens  │  │ Campaigns  │  │  Auction    │  │
│  │ Service  │  │ Service  │  │ Service    │  │  Engine     │  │
│  └──────────┘  └──────────┘  └────────────┘  └─────────────┘  │
│  ┌──────────┐  ┌──────────┐  ┌────────────┐  ┌─────────────┐  │
│  │Creatives │  │Approvals │  │ Playlist   │  │  Analytics  │  │
│  │ Service  │  │ Service  │  │ Generator  │  │  Service    │  │
│  └──────────┘  └──────────┘  └────────────┘  └─────────────┘  │
└──────────────────────────────┬──────────────────────────────────┘
          ┌───────────────────┬┴────────────────────┐
          │                   │                     │
          ▼                   ▼                     ▼
┌──────────────────┐ ┌───────────────┐  ┌─────────────────────┐
│  PostgreSQL      │ │  Redis        │  │  Cloudflare R2      │
│  (Supabase)      │ │  (Job Queue + │  │  (Media Storage)    │
│  - All data      │ │   Cache)      │  │  - Images/Videos    │
└──────────────────┘ └───────┬───────┘  └─────────────────────┘
                             │
                             ▼
                    ┌───────────────┐
                    │  BullMQ       │
                    │  Worker       │
                    │  - Hourly     │
                    │    Auction    │
                    │  - Creative   │
                    │    Processing │
                    │  - Analytics  │
                    └───────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                  Physical Screen Hardware                        │
│   Chrome/Browser in Kiosk Mode → Player App (Vite PWA)         │
│   - Fetches playlist every 5 min                                │
│   - Sends heartbeat every 30s                                   │
│   - Real-time updates via Pusher                                │
│   - Tracks impressions, reports back                            │
└─────────────────────────────────────────────────────────────────┘
```

---

## 3. Tech Stack Decisions

| Layer | Technology | Why |
|-------|-----------|-----|
| Monorepo | pnpm + Turborepo | Fast installs, shared packages, parallel builds |
| Backend API | Hono (Node.js) | Lightweight, fast, TypeScript-native, edge-ready |
| Frontend | Next.js 16 + React 19 | SSR, PWA support, App Router, Vercel-native |
| Player | Vite + Vanilla TS | No framework overhead, kiosk-optimized, tiny bundle |
| Database | PostgreSQL (Supabase) | Managed, real-time capable, free tier for dev |
| ORM | Drizzle ORM | Type-safe schema, migrations, no ORM overhead |
| Media Storage | Cloudflare R2 | S3-compatible, no egress fees, presigned uploads |
| Real-time | Pusher Channels | Instant playlist push to player on approval |
| Job Queue | BullMQ + Redis | Hourly auction settlement, creative processing |
| Auth | JWT (Jose) + bcryptjs | Stateless, simple, works across all apps |
| Maps | Google Maps API | Screen location entry + advertiser screen discovery |
| Styling | Tailwind CSS v4 | Utility-first, fast, no CSS conflicts |

---

## 4. User Roles

| Role | Description | Auth Method |
|------|-------------|-------------|
| `owner` | Registers and manages physical screens | JWT (email/password) |
| `advertiser` | Creates campaigns and bids for airtime | JWT (email/password) |
| `admin` | Platform moderator, manages all | JWT (email/password) |
| `player` | Physical screen, plays approved ads | API Key (per screen) |

---

## 5. Database Schema

### Core Tables

```sql
users
  id            uuid PK
  email         text UNIQUE NOT NULL
  password_hash text NOT NULL
  role          enum('owner','advertiser','admin') NOT NULL
  display_name  text NOT NULL
  created_at    timestamp

screens
  id                uuid PK
  owner_id          uuid FK users
  name              text NOT NULL
  api_key           text UNIQUE NOT NULL   -- Player auth
  status            enum('online','offline') DEFAULT 'offline'
  last_heartbeat    timestamp
  -- Location (Google Maps)
  address           text                   -- Full address string
  latitude          decimal(10,8)
  longitude         decimal(11,8)
  country           text
  state             text
  city              text
  -- Physical specs (MANDATORY at listing time)
  physical_width_cm  int NOT NULL
  physical_height_cm int NOT NULL
  screen_diagonal_in decimal(5,1) NOT NULL  -- e.g. 55.0
  -- Digital specs
  resolution_w      int NOT NULL
  resolution_h      int NOT NULL
  orientation       enum('landscape','portrait') NOT NULL
  aspect_ratio      text NOT NULL           -- e.g. "16:9", "9:16"
  -- Content settings (owner chooses)
  accepts_images    boolean DEFAULT true
  accepts_videos    boolean DEFAULT true
  max_image_size_mb int DEFAULT 50          -- Admin sets after review
  max_video_size_mb int DEFAULT 500         -- Admin sets after review
  max_video_duration_sec int DEFAULT 300
  supported_image_formats text[]  DEFAULT '{jpg,png,webp}'
  supported_video_formats text[]  DEFAULT '{mp4,webm}'
  -- Venue info
  venue_type        text                    -- 'gym','retail','airport','billboard'
  venue_name        text
  estimated_daily_views int                 -- Foot traffic estimate
  operating_hours_start time               -- e.g. 06:00
  operating_hours_end   time               -- e.g. 22:00
  -- Pricing (floor, set by owner)
  floor_cps_cents   int NOT NULL            -- Floor cost-per-second in cents
  created_at        timestamp

creatives
  id              uuid PK
  advertiser_id   uuid FK users
  name            text NOT NULL
  filename        text NOT NULL
  type            enum('image','video') NOT NULL
  status          enum('processing','ready','failed') DEFAULT 'processing'
  storage_url     text                      -- Cloudflare R2 URL
  thumbnail_url   text                      -- Auto-generated thumbnail
  file_size_bytes bigint
  duration_sec    decimal(6,2)             -- Video only
  width_px        int
  height_px       int
  aspect_ratio    text                      -- Auto-computed
  mime_type       text
  created_at      timestamp

campaigns
  id              uuid PK
  advertiser_id   uuid FK users
  name            text NOT NULL
  status          enum('draft','active','paused','completed','archived')
  start_date      date NOT NULL
  end_date        date NOT NULL
  daily_budget_cents int NOT NULL
  total_spend_cents  int DEFAULT 0
  created_at      timestamp

ad_groups                                  -- Mid tier (targeting + bidding)
  id              uuid PK
  campaign_id     uuid FK campaigns
  name            text NOT NULL
  status          enum('active','paused')
  impression_duration_sec int NOT NULL     -- How long 1 impression runs
  daily_budget_cents int NOT NULL          -- Sub-budget within campaign
  total_spend_cents  int DEFAULT 0
  created_at      timestamp

ads                                        -- Individual creatives in an ad group
  id              uuid PK
  ad_group_id     uuid FK ad_groups
  creative_id     uuid FK creatives
  name            text
  status          enum('active','paused')
  weight          int DEFAULT 100          -- A/B test weight (higher = shown more)
  impressions_count int DEFAULT 0
  created_at      timestamp

ad_group_screens                           -- Which screens an ad group targets
  id              uuid PK
  ad_group_id     uuid FK ad_groups
  screen_id       uuid FK screens
  approval_status enum('pending','approved','rejected')
  approval_notes  text
  reviewed_by     uuid FK users
  reviewed_at     timestamp
  created_at      timestamp

playlists
  id              uuid PK
  screen_id       uuid FK screens UNIQUE
  json_blob       jsonb NOT NULL           -- Ordered list of ad items
  generated_at    timestamp
  version         int DEFAULT 1

impressions                                -- Actual impression tracking
  id              uuid PK
  screen_id       uuid FK screens
  ad_id           uuid FK ads
  ad_group_id     uuid FK ad_groups
  campaign_id     uuid FK campaigns
  played_at       timestamp
  duration_sec    decimal(6,2)
  completed       boolean DEFAULT false    -- Did full ad play?
  cost_cents      int                      -- What was charged

auction_hourly_results                     -- Settled every hour
  id              uuid PK
  screen_id       uuid FK screens
  hour_bucket     timestamp               -- e.g. 2026-04-09 14:00:00 UTC
  n_competitors   int                     -- # of active bidders this hour
  markup_pct      decimal(5,2)            -- M(n) calculated
  floor_cps_cents int                     -- Floor at time of settlement
  eff_cps_cents   decimal(8,4)            -- Effective price per second
  total_airtime_alloc_sec int             -- Sum of all allocated seconds
  total_revenue_cents int                 -- Total platform + owner
  platform_revenue_cents int
  owner_revenue_cents int
  created_at      timestamp

auction_allocations                        -- Per-advertiser per-hour allocation
  id              uuid PK
  auction_result_id uuid FK auction_hourly_results
  ad_group_id     uuid FK ad_groups
  allocated_sec   decimal(8,2)            -- Seconds allocated this hour
  impression_pct  decimal(5,2)            -- % of hour's airtime
  impressions_target int                  -- Expected impressions
  cpi_cents       decimal(8,4)            -- Cost per impression this hour
  hourly_spend_cents int

screen_owner_payouts
  id              uuid PK
  owner_id        uuid FK users
  screen_id       uuid FK screens
  period_start    date
  period_end      date
  gross_revenue_cents int
  platform_fee_cents  int
  net_payout_cents    int
  status          enum('pending','paid')
  paid_at         timestamp

saved_screens                              -- Advertiser favorites
  id              uuid PK
  advertiser_id   uuid FK users
  screen_id       uuid FK screens
  saved_at        timestamp
```

---

## 6. The Bidding Algorithm (God Formula)

### Core Principle
Whoever spends more gets more airtime. Competition drives up price. Screen owner always earns their floor. Platform margin grows with competition.

### Variables
| Symbol | Meaning |
|--------|---------|
| `f` | Screen floor price (cents per second of airtime) |
| `n` | Number of active competitors for this screen this hour |
| `D` | Advertiser's impression duration (seconds, 5–300) |
| `B` | Advertiser's daily budget (cents) |

### Step 1 — Platform Markup M(n)
```
M(n) = min(0.30 + 0.20 × log₁₀(n), 0.60)
```

| Competitors (n) | Markup M(n) | Owner gets | Platform gets |
|----------------|-------------|-----------|--------------|
| 1 | 30.0% | 70.0% | 30.0% |
| 2 | 36.0% | 64.0% | 36.0% |
| 3 | 39.5% | 60.5% | 39.5% |
| 5 | 44.0% | 56.0% | 44.0% |
| 10 | 50.0% | 50.0% | 50.0% |
| 20 | 56.0% | 44.0% | 56.0% |
| 32+ | 60.0% | 40.0% | 60.0% (cap) |

### Step 2 — Effective Price Per Second
```
cps_eff = f / (1 - M(n))
```
Screen owner ALWAYS earns `f` per second. Platform earns `cps_eff - f`.

### Step 3 — Cost Per Impression (CPI)
```
CPI = D × cps_eff
```

### Step 4 — Minimum Daily Budget Check
```
B_min = CPI   [must afford ≥ 1 impression per day]
```
If `B < B_min` → error shown to advertiser:
> "Your daily budget is too low. Add at least $X.XX to get a minimum of 1 impression per day on this screen."

### Step 5 — Airtime Demand Per Hour
```
max_impressions_per_hour = floor((B / 24) / CPI)
demand_seconds = max_impressions_per_hour × D
```

### Step 6 — Allocation (settled every hour)
**Undersubscribed** (total demand ≤ 3600 seconds):
```
allocated_seconds_i = demand_seconds_i
impression_pct_i = allocated_seconds_i / 3600 × 100
```

**Oversubscribed** (total demand > 3600 seconds):
```
allocated_seconds_i = 3600 × (demand_seconds_i / Σ demand_seconds_j)
impression_pct_i = (demand_seconds_i / Σ demand_seconds_j) × 100
```

### Step 7 — Actual Impressions & Cost
```
actual_impressions_i = floor(allocated_seconds_i / D_i)
actual_hourly_spend_i = actual_impressions_i × CPI_i
```

### Step 8 — Revenue Split
```
owner_rev_per_hour = Σ(actual_hourly_spend_i) × (1 - M(n))
platform_rev_per_hour = Σ(actual_hourly_spend_i) × M(n)
```

### Worked Example
Screen: `f = 0.56 cents/sec` (~$20/hr), `n = 5`, `M(5) = 44%`

| | Advertiser A | Advertiser B |
|--|------------|------------|
| Daily budget | $10.00 | $5.00 |
| Impression duration | 60s | 30s |
| cps_eff | $0.01/s | $0.01/s |
| CPI | $0.60 | $0.30 |
| Max IMP/hr | 0 (rounds down) | 0 (rounds down) |

> At $20/hr floor and $10/day budget, there's limited supply coverage. Screen owners should set floor_cps realistically for their screen's traffic tier.

### Pricing Tiers (suggested floor_cps ranges)
| Screen Type | floor_cps (cents/sec) | ~$/hour | ~$/day |
|------------|----------------------|---------|--------|
| Small kiosk, low traffic | 0.03–0.08 | $1–$3 | $24–$72 |
| Mid-size retail screen | 0.08–0.28 | $3–$10 | $72–$240 |
| Premium mall/airport | 0.28–1.39 | $10–$50 | $240–$1,200 |
| Large billboard, high traffic | 1.39–5.56 | $50–$200 | $1,200–$4,800 |

---

## 7. API Routes

### Auth
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/auth/register` | None | Register owner or advertiser |
| POST | `/api/auth/login` | None | Login, returns JWT |
| GET | `/api/auth/me` | JWT | Current user info |

### Screens (Owner)
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/screens` | owner/admin | List own screens |
| POST | `/api/screens` | owner | Register screen with full specs |
| GET | `/api/screens/:id` | owner/admin | Screen detail |
| PATCH | `/api/screens/:id` | owner/admin | Update screen |
| DELETE | `/api/screens/:id` | owner/admin | Deactivate |
| GET | `/api/screens/public` | JWT | Browse all active screens (with filters) |
| POST | `/api/screens/:id/save` | advertiser | Save/favorite a screen |

### Creatives
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/creatives` | advertiser | List own creatives |
| POST | `/api/creatives/upload-url` | advertiser | Get presigned R2 URL |
| POST | `/api/creatives/:id/confirm` | advertiser | Confirm upload done |
| DELETE | `/api/creatives/:id` | advertiser | Delete creative |

### Campaigns / Ad Groups / Ads
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/campaigns` | advertiser | List campaigns |
| POST | `/api/campaigns` | advertiser | Create campaign |
| GET | `/api/campaigns/:id` | advertiser | Campaign detail |
| PATCH | `/api/campaigns/:id` | advertiser | Update campaign |
| DELETE | `/api/campaigns/:id` | advertiser | Delete draft |
| GET | `/api/campaigns/:id/ad-groups` | advertiser | List ad groups |
| POST | `/api/campaigns/:id/ad-groups` | advertiser | Create ad group |
| PATCH | `/api/ad-groups/:id` | advertiser | Update ad group |
| POST | `/api/ad-groups/:id/ads` | advertiser | Add ad to group |
| DELETE | `/api/ad-groups/:id/ads/:adId` | advertiser | Remove ad |
| POST | `/api/ad-groups/:id/submit` | advertiser | Submit for approval |

### Approvals
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/approvals` | owner/admin | List pending approvals |
| PATCH | `/api/approvals/:id` | owner/admin | Approve or reject |

### Auction & Pricing
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/screens/:id/pricing` | advertiser | Get live CPI estimate |
| GET | `/api/screens/:id/pricing/history` | advertiser | Price history chart |
| POST | `/api/auction/preview` | advertiser | Simulate impression% for budget |

### Analytics
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/analytics/campaigns/:id` | advertiser | Campaign performance |
| GET | `/api/analytics/screens/:id` | owner | Screen revenue analytics |
| GET | `/api/analytics/platform` | admin | Platform-wide revenue |

### Player (API Key auth via X-Api-Key header)
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/player/playlist` | API Key | Fetch current playlist |
| POST | `/api/player/heartbeat` | API Key | Report alive + impression data |

---

## 8. Real-World Player Deployment Options

### Option 1: Any Browser (Dev/Testing) — FREE
- Open `http://localhost:3002` in Chrome → press F11
- Identical to production behavior
- Use for all local QA

### Option 2: Android Tablet/Old Phone — $50–$150
- Install Chrome → open player URL → enable kiosk mode via Android settings
- Good for testing real screen sizes

### Option 3: Raspberry Pi 4 or 5 — $50–$80
- Install Raspberry Pi OS → Chromium in `--kiosk` mode
- Best for production small screens (kiosks, gym TVs)
- Auto-boot, silent, always-on

### Option 4: Intel NUC / Mini PC — $100–$300
- Full Chrome on any OS, highest resolution support
- Best for large format billboard-class screens

### Option 5: Fire TV Stick / Chromecast with Google TV
- Silk browser (Fire TV) or Chrome (Google TV)
- Cheapest managed deployment

**For QA: Use Option 1. For client demos: Use Option 2 or 3.**

---

## 9. Screen Owner Listing Requirements (Mandatory Fields)

When registering a screen, owners MUST provide:

### Physical
- Screen diagonal size (inches) — e.g. 55"
- Physical width and height (cm)
- Orientation (landscape / portrait)

### Digital
- Native resolution (width × height in pixels) — e.g. 1920×1080
- Aspect ratio (auto-computed from resolution) — e.g. 16:9

### Location
- Full address (Google Maps autocomplete)
- Auto-extracts: country, state, city, lat/lng

### Venue
- Venue type (gym, retail, airport, billboard, restaurant, hotel, other)
- Venue name — e.g. "LA Fitness — Times Square"
- Estimated daily foot traffic / views

### Content Settings
- Accepts images? (yes/no)
- Accepts videos? (yes/no)
- Operating hours (start–end, or 24/7)

### Pricing
- Floor price (the system guides with tier suggestions based on venue type)

### After Admin Review (set by admin)
- Max image file size (MB)
- Max video file size (MB)
- Max video duration (seconds)
- Supported image formats (jpg, png, webp, gif)
- Supported video formats (mp4, webm, mov)

---

## 10. Advertiser Screen Discovery

Advertisers can filter screens by:
- **Location**: Google Maps pan/zoom + radius filter
- **Country / State / City** (dropdowns)
- **Venue type** (gym, billboard, airport, etc.)
- **Screen size** (diagonal inches range)
- **Resolution** (min width × height)
- **Orientation** (landscape / portrait / both)
- **Content type** (accepts images / videos)
- **Estimated daily views** (traffic tier)
- **Price range** (estimated CPI range based on floor price)
- **Availability** (active / online now)

---

## 11. Campaign Structure (like Google Ads)

```
Campaign
├── Name, total budget, date range, status
│
└── Ad Group (one per screen cluster / strategy)
    ├── Impression duration (how long 1 impression = e.g. 30s)
    ├── Daily sub-budget
    ├── Target screens (one or many)
    │
    └── Ads (creatives in this group)
        ├── Ad 1: creative_id, weight=100 (A/B test)
        └── Ad 2: creative_id, weight=50  (shown half as often)
```

---

## 12. QA Strategy Overview

| Layer | Tool | When |
|-------|------|------|
| Unit tests (API services) | Vitest | Every PR |
| Integration tests (API routes) | Vitest + Hono test client | Every PR |
| Schema tests | Vitest + test DB | Every schema change |
| E2E tests | Playwright | Pre-release |
| Load testing | k6 | Pre-production |
| Auction algorithm tests | Vitest (pure math) | Every formula change |
| Player display tests | Manual + browser devtools | Per screen size tested |

---

## 13. Deployment Architecture

| Service | Platform | Notes |
|---------|---------|-------|
| Web Dashboard | Vercel | Next.js native, free tier |
| API | Fly.io | Autoscale, $5/mo minimum |
| Worker | Fly.io (separate machine) | Hourly auction cron |
| Database | Supabase | Free tier → Pro on scale |
| Media Storage | Cloudflare R2 | No egress fees |
| Real-time | Pusher | 100 connections free |
| Redis | Upstash | Serverless Redis, free tier |
| Maps | Google Cloud | Pay-per-use |

---

*Last updated: 2026-04-09*
