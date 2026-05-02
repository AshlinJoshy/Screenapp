import { Player } from "./player.js";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3001";

// ─── Bootstrap ────────────────────────────────────────────────────────────────

const app = document.getElementById("app")!;

const STORAGE_KEY_SCREEN_ID = "adscreen:screenId";
const STORAGE_KEY_API_KEY = "adscreen:apiKey";

function getConfig(): { screenId: string; apiKey: string } | null {
  const screenId = localStorage.getItem(STORAGE_KEY_SCREEN_ID);
  const apiKey = localStorage.getItem(STORAGE_KEY_API_KEY);
  if (!screenId || !apiKey) return null;
  return { screenId, apiKey };
}

function renderSetupScreen() {
  app.innerHTML = `
    <div style="
      display: flex; flex-direction: column; align-items: center;
      justify-content: center; height: 100vh; color: #fff; gap: 20px;
    ">
      <h1 style="font-size: 2rem;">AdScreen Player Setup</h1>
      <p style="color: #aaa;">Enter your screen credentials to begin displaying ads.</p>
      <form id="setup-form" style="display: flex; flex-direction: column; gap: 12px; width: 320px;">
        <input
          id="screen-id-input"
          type="text"
          placeholder="Screen ID (UUID)"
          style="padding: 10px; border-radius: 6px; border: 1px solid #444; background: #111; color: #fff;"
          required
        />
        <input
          id="api-key-input"
          type="password"
          placeholder="API Key (sk_...)"
          style="padding: 10px; border-radius: 6px; border: 1px solid #444; background: #111; color: #fff;"
          required
        />
        <button
          type="submit"
          style="padding: 12px; border-radius: 6px; background: #2563eb; color: #fff; border: none; cursor: pointer; font-size: 1rem;"
        >
          Start Player
        </button>
        <p id="setup-error" style="color: #f87171; display: none;"></p>
      </form>
    </div>
  `;

  const form = document.getElementById("setup-form") as HTMLFormElement;
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const screenId = (document.getElementById("screen-id-input") as HTMLInputElement).value.trim();
    const apiKey = (document.getElementById("api-key-input") as HTMLInputElement).value.trim();
    const errorEl = document.getElementById("setup-error")!;

    // Validate credentials against API
    try {
      const res = await fetch(`${API_URL}/api/player/playlist`, {
        headers: { "X-Api-Key": apiKey },
      });

      if (!res.ok) {
        errorEl.textContent = "Invalid Screen ID or API Key. Please check your credentials.";
        errorEl.style.display = "block";
        return;
      }

      localStorage.setItem(STORAGE_KEY_SCREEN_ID, screenId);
      localStorage.setItem(STORAGE_KEY_API_KEY, apiKey);
      window.location.reload();
    } catch {
      errorEl.textContent = "Cannot reach API server. Check connection.";
      errorEl.style.display = "block";
    }
  });
}

// ─── Main ─────────────────────────────────────────────────────────────────────

const config = getConfig();

if (!config) {
  renderSetupScreen();
} else {
  const player = new Player({
    apiUrl: API_URL,
    screenId: config.screenId,
    apiKey: config.apiKey,
    container: app,
    pusherKey: import.meta.env.VITE_PUSHER_KEY,
    pusherCluster: import.meta.env.VITE_PUSHER_CLUSTER ?? "mt1",
  });

  player.start();
}
