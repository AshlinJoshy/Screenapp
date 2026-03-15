# AdScreen — Developer Reference

A two-sided digital billboard platform connecting **screen owners** with **advertisers**.
Screen owners register physical screens. Advertisers build campaigns. The Player App runs on the screen hardware and plays approved ads.

---

## Quick Start

```bash
# 1. First-time only: copy all .env.example files
double-click  →  "Setup AdScreen Env.bat"   (on your Desktop)

# 2. Fill in your API keys in each .env file (see Environment Variables below)

# 3. Create the admin account (first time only)
cd apps/api
pnpm seed:admin

# 4. Start all servers
double-click  →  "Start AdScreen.bat"       (on your Desktop)
```

---

## Local URLs

| Service        | URL                        | What it does                              |
|----------------|----------------------------|-------------------------------------------|
| **Dashboard**  | http://localhost:3000      | React/Next.js web app (all 3 roles)       |
| **API**        | http://localhost:3001      | Hono REST API                             |
| **Player**     | http://localhost:3002      | Digital signage player (runs on screens)  |
| API Health     | http://localhost:3001/health | Quick alive check                       |

---

## Test Accounts

These are **suggested credentials** — you create them yourself by registering on the dashboard.

### Step 1 — Register via the dashboard

Go to **http://localhost:3000/register** and create these three accounts:

| Role           | Email                    | Password       | Notes                          |
|----------------|--------------------------|----------------|--------------------------------|
| Screen Owner   | `owner@test.com`         | `Owner1234!`   | Owns the gym screen            |
| Advertiser     | `advertiser@test.com`    | `Advert1234!`  | Wants to run ads on the screen |

> Registration is open. Pick **Screen Owner** or **Advertiser** from the dropdown.

---

### Step 2 — Create the Admin account (seed script)

The admin role cannot be self-registered for security reasons. Run the seed script once:

```bash
# From the project root
cd apps/api
pnpm seed:admin
```

Default admin credentials:

| Role  | Email                  | Password      |
|-------|------------------------|---------------|
| Admin | `admin@adscreen.com`   | `Admin1234!`  |

To use custom credentials:

```bash
SEED_ADMIN_EMAIL=you@company.com SEED_ADMIN_PASS=MySecret pnpm seed:admin
```

---

## The Gym Screen — Full End-to-End Journey

This is the canonical test scenario. Follow these steps in order.

---

### Journey 1 — Screen Owner (Gym Manager)

**Goal:** Register the gym's digital TV so it appears on the AdScreen platform.

1. Open **http://localhost:3000/login**
2. Log in as `owner@test.com`
3. You land on **My Screens** — it's empty
4. Click **Register Screen** and fill in:
   - Name: `Gym Entrance TV`
   - Location: `FitLife Gym, Ground Floor Entrance — Dubai Mall`
   - Resolution: `1920` × `1080`
   - Orientation: `Landscape`
5. Click Save → your screen appears with status **offline**
6. Copy the **API Key** shown on the screen card (you'll need it for the Player)
7. Copy the **Screen ID** too

The screen is now on the platform. Advertisers can see it in their screen picker.

---

### Journey 2 — Advertiser (Nike, for example)

**Goal:** Upload an ad and target the gym screen.

1. Open **http://localhost:3000/login** (in a different browser or incognito)
2. Log in as `advertiser@test.com`
3. **Upload a creative first:**
   - Go to **Creatives** tab → click **Upload Creative**
   - Upload an image (JPG/PNG) or video (MP4)
   - Wait for status to change from `processing` → `ready`
4. **Build a campaign:**
   - Go to **Campaigns** tab → click **New Campaign**
   - **Step 1 — Details:** Enter name, start/end dates (e.g. 2026-04-01 → 2026-04-30), optional budget
   - **Step 2 — Creatives:** Select the creative you just uploaded (check it)
   - **Step 3 — Screens:** You'll see `Gym Entrance TV` listed → select it
   - **Step 4 — Review:** Confirm and click **Create Campaign**
5. Campaign is now in **draft** status
6. Click **Submit for Approval** → status changes to `pending_approval`

The gym owner now has a pending approval request.

---

### Journey 3 — Screen Owner Reviews the Ad

1. Switch back to the owner account (`owner@test.com`)
2. Go to **Approvals** tab
3. You'll see the campaign from Nike listed under **Pending Review**
4. Click **▼ Preview N creatives** to expand and see the actual ad thumbnail or video
5. Watch the video / inspect the image
6. Click **Approve** (or **Reject** with optional notes)

When approved:
- The playlist is automatically regenerated for that screen
- The Player is notified via Pusher in real-time
- The screen will show the ad at next refresh

---

### Journey 4 — The Player App (the actual screen)

**Goal:** Connect the physical TV to the platform so it plays the approved ad.

#### Testing locally (your monitor = the screen)

1. Open **http://localhost:3002** in a browser
2. The Player shows a "Not configured" screen
3. Open the browser console (F12) and run:
   ```js
   localStorage.setItem("adscreen_screenId", "PASTE_SCREEN_ID_HERE");
   localStorage.setItem("adscreen_apiKey",   "PASTE_API_KEY_HERE");
   location.reload();
   ```
4. The player fetches the playlist from the API
5. It plays all approved creatives in a loop
6. Every 30 seconds it sends a **heartbeat** → the screen status in the dashboard turns **online**
7. Press **F11** for fullscreen — this is what the actual gym TV would show

#### On a real screen (production)

Embed the Player URL with query params or set them via localStorage on first boot. The screen just needs a browser pointed at your hosted Player URL.

---

### Journey 5 — Admin Oversight

1. Log in as `admin@adscreen.com`
2. Go to **Overview** to see platform-wide stats
3. Admins can see **all** screens and **all** approvals across every owner
4. Admins can approve/reject any campaign (useful for moderation)

---

## API Reference

Base URL: `http://localhost:3001`

All protected endpoints require:
```
Authorization: Bearer <jwt_token>
```

---

### Authentication

| Method | Endpoint             | Auth | Description                        |
|--------|----------------------|------|------------------------------------|
| POST   | `/api/auth/register` | No   | Create advertiser or owner account |
| POST   | `/api/auth/login`    | No   | Returns JWT token                  |
| GET    | `/api/auth/me`       | Yes  | Returns current user info          |

**Register body:**
```json
{
  "email": "user@example.com",
  "password": "Min8chars",
  "role": "advertiser",
  "displayName": "Nike Corp"
}
```

**Login body:**
```json
{ "email": "user@example.com", "password": "Min8chars" }
```

**Login response:**
```json
{
  "token": "eyJ...",
  "user": { "id": "uuid", "email": "...", "role": "advertiser", "displayName": "..." }
}
```

---

### Screens

| Method | Endpoint               | Auth           | Description                              |
|--------|------------------------|----------------|------------------------------------------|
| GET    | `/api/screens/public`  | Yes (any role) | Browse all active screens (no API keys)  |
| GET    | `/api/screens`         | owner / admin  | List your own screens (or all for admin) |
| GET    | `/api/screens/:id`     | owner / admin  | Get single screen                        |
| POST   | `/api/screens`         | owner only     | Register a new screen                    |
| PATCH  | `/api/screens/:id`     | owner / admin  | Update screen details                    |
| DELETE | `/api/screens/:id`     | owner / admin  | Deactivate screen                        |

**POST /api/screens body:**
```json
{
  "name": "Gym Entrance TV",
  "locationLabel": "FitLife Gym, Ground Floor — Dubai Mall",
  "resolutionW": 1920,
  "resolutionH": 1080,
  "orientation": "landscape",
  "latitude": 25.1972,
  "longitude": 55.2797
}
```

---

### Creatives

| Method | Endpoint                     | Auth       | Description                                |
|--------|------------------------------|------------|--------------------------------------------|
| GET    | `/api/creatives`             | advertiser | List your creatives                        |
| POST   | `/api/creatives/upload-url`  | advertiser | Get a presigned R2 URL for direct upload   |
| POST   | `/api/creatives/:id/confirm` | advertiser | Confirm upload complete + set metadata     |
| DELETE | `/api/creatives/:id`         | advertiser | Delete creative                            |

**Upload flow:**
1. `POST /upload-url` → get `{ uploadUrl, fileUrl, creativeId }`
2. `PUT uploadUrl` with the raw file bytes (direct to R2, no server)
3. `POST /creatives/:id/confirm` → status becomes `ready`

---

### Campaigns

| Method | Endpoint                     | Auth       | Description                              |
|--------|------------------------------|------------|------------------------------------------|
| GET    | `/api/campaigns`             | advertiser | List your campaigns                      |
| GET    | `/api/campaigns/:id`         | advertiser | Get campaign details                     |
| POST   | `/api/campaigns`             | advertiser | Create draft campaign                    |
| POST   | `/api/campaigns/:id/submit`  | advertiser | Submit draft → pending_approval          |
| DELETE | `/api/campaigns/:id`         | advertiser | Delete campaign                          |

**POST /api/campaigns body:**
```json
{
  "name": "Nike Summer 2026",
  "startDate": "2026-04-01",
  "endDate": "2026-04-30",
  "budgetCents": 50000,
  "creatives": [
    { "creativeId": "uuid", "displayOrder": 0, "displayDurationSec": 10 }
  ],
  "targetScreenIds": ["screen-uuid-1", "screen-uuid-2"]
}
```

---

### Approvals

| Method | Endpoint            | Auth          | Description                                  |
|--------|---------------------|---------------|----------------------------------------------|
| GET    | `/api/approvals`    | owner / admin | List pending/reviewed approvals with creative previews |
| PATCH  | `/api/approvals/:id`| owner / admin | Approve or reject                            |

**PATCH body:**
```json
{ "status": "approved" }
```
or
```json
{ "status": "rejected", "notes": "Content does not match our gym's audience" }
```

When approved → playlist is auto-regenerated and Pusher notifies the player.

---

### Player (Screen Hardware)

| Method | Endpoint                          | Auth    | Description                       |
|--------|-----------------------------------|---------|-----------------------------------|
| GET    | `/api/player/playlist`            | API key | Fetch current playlist for screen |
| POST   | `/api/player/heartbeat`           | API key | Report screen is alive            |

Player endpoints use `X-Api-Key: <screen_api_key>` header instead of JWT.

**Heartbeat body:**
```json
{
  "screenId": "uuid",
  "playerVersion": "1.0.0",
  "currentCreativeId": "uuid",
  "playlistGeneratedAt": "2026-04-01T10:00:00Z"
}
```

---

## User Roles Summary

| Role         | Can do                                                                 |
|--------------|------------------------------------------------------------------------|
| `advertiser` | Upload creatives, create campaigns, target screens, submit for approval|
| `owner`      | Register screens, review & approve/reject ads for their screens        |
| `admin`      | See everything, approve/reject any ad, monitor all screens             |
| `player`     | Fetch playlist + heartbeat using screen API key (not a login role)     |

---

## Environment Variables

### `apps/api/.env`

```env
DATABASE_URL=postgresql://user:pass@host:5432/db
JWT_SECRET=a-long-random-secret-string
PORT=3001
ALLOWED_ORIGINS=http://localhost:3000

# Cloudflare R2 (media storage)
R2_ACCOUNT_ID=your_account_id
R2_ACCESS_KEY_ID=your_key
R2_SECRET_ACCESS_KEY=your_secret
R2_BUCKET_NAME=adscreen-media
R2_PUBLIC_URL=https://pub-xxx.r2.dev

# Pusher (real-time player notifications)
PUSHER_APP_ID=your_app_id
PUSHER_KEY=your_key
PUSHER_SECRET=your_secret
PUSHER_CLUSTER=mt1
```

### `apps/web/.env.local`

```env
NEXT_PUBLIC_API_URL=http://localhost:3001
NEXT_PUBLIC_PUSHER_KEY=your_key
NEXT_PUBLIC_PUSHER_CLUSTER=mt1
```

### `apps/worker/.env`

```env
DATABASE_URL=postgresql://user:pass@host:5432/db
REDIS_URL=redis://localhost:6379
```

---

## Architecture Overview

```
Browser (Owner / Advertiser / Admin)
        │
        ▼
   Next.js Dashboard  (port 3000)
        │  REST API calls
        ▼
   Hono API Server    (port 3001)
        │
   ┌────┴─────────────────────────┐
   │                              │
Supabase PostgreSQL         Cloudflare R2
(via Drizzle ORM)           (image/video storage)
                              ▲
                              │ presigned URL direct upload
                              │ (browser → R2, no server hop)
                           Browser

Pusher Channels  ← API triggers on approval
        │
        ▼
   Player App  (port 3002 / fullscreen on physical screen)
        │
        └── Heartbeat every 30s → API → DB (status = online)
            Playlist poll every 5min → API → plays ads in loop
```

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| `pnpm dev` crashes immediately (Exit code 9) | Run `Setup AdScreen Env.bat` first, then check `apps/api/.env` has `DATABASE_URL` |
| Login says "Invalid credentials" | Make sure you registered with exactly those credentials, or re-run seed script |
| No screens in campaign builder | An owner must register at least one screen first |
| Creatives stuck at "processing" | You skipped the `/confirm` step after uploading. The worker processes confirmed creatives |
| Player shows blank / no playlist | No approved campaigns for that screen yet. Complete Journey 2+3 first |
| Screen status stays "offline" | Player isn't running or `screenId`/`apiKey` are wrong in localStorage |
| Pusher not working | Fill in Pusher keys in `.env` — without them the player won't get real-time updates but polling still works |

---

## Database Schema (key tables)

| Table               | Purpose                                           |
|---------------------|---------------------------------------------------|
| `users`             | All accounts (advertiser, owner, admin)           |
| `screens`           | Registered screens with API key and heartbeat     |
| `creatives`         | Uploaded ad files (image/video) with R2 URLs      |
| `campaigns`         | Advertiser campaigns with date range + budget     |
| `campaign_creatives`| M2M: which creatives belong to which campaign     |
| `campaign_targets`  | M2M: which screens a campaign targets             |
| `approvals`         | One row per campaign×screen pair, with status     |
| `playlists`         | Pre-computed JSON blob per screen, played by Player|

---

*Last updated: 2026-03-15*
