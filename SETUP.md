# AdScreen — Developer Setup

## Prerequisites

- Node.js v22+ (installed via nvm-windows)
- pnpm v10+
- A Supabase project (free tier works for MVP)

---

## 1. Clone & Install

```bash
pnpm install
```

---

## 2. Environment Variables

Copy the example files and fill in your values:

```bash
cp .env.example .env
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env.local
cp apps/worker/.env.example apps/worker/.env
```

**Minimum required for local dev:**

| Variable | Where to get it |
|---|---|
| `DATABASE_URL` | Supabase → Settings → Database → Connection string |
| `JWT_SECRET` | Any random 32+ char string |
| `NEXT_PUBLIC_API_URL` | `http://localhost:3001` |

R2, Pusher, and Redis are optional for initial testing (the app will log warnings and skip those features).

---

## 3. Database Setup

Run the Drizzle migrations against your Supabase database:

```bash
cd packages/db
DATABASE_URL="your-supabase-url" pnpm db:generate
DATABASE_URL="your-supabase-url" pnpm db:migrate
```

---

## 4. Run Dev Servers

Open **3 terminals**:

**Terminal 1 — API (port 3001)**
```bash
cd apps/api
cp .env.example .env   # fill in DATABASE_URL + JWT_SECRET
pnpm dev
```

**Terminal 2 — Dashboard (port 3000)**
```bash
cd apps/web
cp .env.example .env.local
pnpm dev
```

**Terminal 3 — Player (port 3002)**
```bash
cd apps/player
pnpm dev
```

Or run all with Turborepo from the root:
```bash
pnpm dev
```

---

## 5. Testing the Player App

### Option A: Regular browser tab
1. Open `http://localhost:3002`
2. Enter your `screenId` and `apiKey` (get these from the dashboard after registering a screen)

### Option B: Kiosk mode (simulates a real screen)
```bash
# Windows — paste this in a terminal
"C:\Program Files\Google\Chrome\Application\chrome.exe" --app=http://localhost:3002 --window-size=1920,1080 --window-position=0,0
```

Or run the npm script:
```bash
cd apps/player
pnpm start:kiosk
```

### Verifying heartbeats
- Watch the API terminal for `POST /api/player/heartbeat` every 30s
- Open the dashboard as Screen Owner → the screen status indicator turns green within 35s

### DevTools commands
In the player kiosk window, open DevTools (F12) and run:
```js
// Force-refresh the playlist
window.playerApp.fetchPlaylist()

// Reset credentials (shows setup screen again)
window.playerApp.clearCredentials()
```

---

## 6. End-to-End Test Flow

1. Register as **Screen Owner** at `http://localhost:3000/register`
2. Create a screen → copy the `apiKey` shown in the screen card
3. Open the player kiosk → enter `screenId` + `apiKey`
4. Register as **Advertiser** (new tab / incognito)
5. Upload a test image as a creative
6. Create a campaign targeting your screen → Submit
7. Switch back to Screen Owner → Approvals → Approve the campaign
8. Player fetches updated playlist within 5 minutes (or force-refresh via DevTools)
9. The creative plays on the player screen

---

## Project Structure

```
adscreen/
├── apps/
│   ├── web/        Next.js 15 dashboard (port 3000)
│   ├── api/        Hono backend (port 3001)
│   ├── player/     Vite player app (port 3002)
│   └── worker/     BullMQ worker (needs Redis)
└── packages/
    ├── db/         Drizzle schema + migrations
    └── types/      Shared TypeScript types
```

---

## Phase Roadmap

| Phase | Status | Description |
|---|---|---|
| 1 | **Done** | Monorepo, auth, screens, DB schema, player app skeleton |
| 2 | Pending | Creative uploads to R2, campaign builder UI |
| 3 | Pending | Approval workflow, playlist generation |
| 4 | Pending | Full player playback + Service Worker caching |
| 5 | Pending | Deploy to Vercel + Fly.io |
