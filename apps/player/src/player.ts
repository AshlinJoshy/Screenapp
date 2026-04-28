import type { PlaylistItem, PlaylistResponse, HeartbeatResponse } from "@adscreen/types";

const HEARTBEAT_INTERVAL_MS = 30_000;     // 30 seconds
const PLAYLIST_POLL_INTERVAL_MS = 300_000; // 5 minutes
const PLAYER_VERSION = "1.0.0";

interface PlayerConfig {
  apiUrl: string;
  screenId: string;
  apiKey: string;
  container: HTMLElement;
  pusherKey?: string;
  pusherCluster?: string;
}

export class Player {
  private config: PlayerConfig;
  private playlist: PlaylistItem[] = [];
  private currentIndex = 0;
  private playlistVersion = 0;
  private heartbeatTimer?: ReturnType<typeof setInterval>;
  private pollTimer?: ReturnType<typeof setInterval>;
  private pendingImpressions: Array<{
    adId: string;
    adGroupId: string;
    campaignId: string;
    playedAt: string;
    durationSec: number;
    completed: boolean;
  }> = [];

  constructor(config: PlayerConfig) {
    this.config = config;
  }

  // ─── Public ─────────────────────────────────────────────────────────────────

  async start() {
    this.renderLoadingScreen();

    await this.fetchPlaylist();

    if (this.playlist.length === 0) {
      this.renderNoContent();
      return;
    }

    this.startHeartbeat();
    this.startPlaylistPolling();
    this.playCurrentItem();
  }

  // ─── API Calls ──────────────────────────────────────────────────────────────

  private async fetchPlaylist() {
    try {
      const res = await fetch(`${this.config.apiUrl}/api/player/playlist`, {
        headers: { "X-Api-Key": this.config.apiKey },
      });

      if (!res.ok) {
        console.error("Playlist fetch failed:", res.status);
        return;
      }

      const data: PlaylistResponse = await res.json();

      if (data.version !== this.playlistVersion) {
        this.playlist = data.items;
        this.playlistVersion = data.version;
        this.currentIndex = 0;
        console.log(`Playlist updated to v${data.version} (${data.items.length} items)`);
      }
    } catch (err) {
      console.error("Error fetching playlist:", err);
    }
  }

  private async sendHeartbeat(): Promise<HeartbeatResponse | null> {
    try {
      const currentItem = this.playlist[this.currentIndex];
      const impressionsToSend = [...this.pendingImpressions];
      this.pendingImpressions = [];

      const res = await fetch(`${this.config.apiUrl}/api/player/heartbeat`, {
        method: "POST",
        headers: {
          "X-Api-Key": this.config.apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          playerVersion: PLAYER_VERSION,
          currentAdId: currentItem?.adId,
          impressions: impressionsToSend,
        }),
      });

      if (!res.ok) return null;

      const data: HeartbeatResponse = await res.json();

      // If playlist version changed, fetch new one
      if (data.playlistVersion > this.playlistVersion) {
        await this.fetchPlaylist();
        this.playCurrentItem();
      }

      return data;
    } catch (err) {
      // Put impressions back in queue if heartbeat failed
      this.pendingImpressions.unshift(...this.pendingImpressions);
      console.error("Heartbeat failed:", err);
      return null;
    }
  }

  // ─── Playback ────────────────────────────────────────────────────────────────

  private playCurrentItem() {
    const item = this.playlist[this.currentIndex];
    if (!item) return;

    const startTime = Date.now();
    this.renderItem(item, () => {
      const durationSec = (Date.now() - startTime) / 1000;
      const completed = durationSec >= item.durationSec * 0.9; // 90% = completed

      this.pendingImpressions.push({
        adId: item.adId,
        adGroupId: "", // filled when we have campaign context
        campaignId: "",
        playedAt: new Date(startTime).toISOString(),
        durationSec,
        completed,
      });

      this.currentIndex = (this.currentIndex + 1) % this.playlist.length;
      this.playCurrentItem();
    });
  }

  private renderItem(item: PlaylistItem, onComplete: () => void) {
    this.config.container.innerHTML = "";

    if (item.type === "image") {
      this.renderImage(item, onComplete);
    } else {
      this.renderVideo(item, onComplete);
    }
  }

  private renderImage(item: PlaylistItem, onComplete: () => void) {
    const img = document.createElement("img");
    img.src = item.storageUrl;
    img.style.cssText = `
      width: 100%; height: 100%; object-fit: contain;
      position: absolute; top: 0; left: 0;
    `;

    img.onload = () => {
      setTimeout(onComplete, item.durationSec * 1000);
    };

    img.onerror = () => {
      console.error("Image failed to load:", item.storageUrl);
      setTimeout(onComplete, 2000);
    };

    this.config.container.appendChild(img);
  }

  private renderVideo(item: PlaylistItem, onComplete: () => void) {
    const video = document.createElement("video");
    video.src = item.storageUrl;
    video.style.cssText = `
      width: 100%; height: 100%; object-fit: contain;
      position: absolute; top: 0; left: 0; background: #000;
    `;
    video.autoplay = true;
    video.muted = true;
    video.playsInline = true;

    video.onended = () => onComplete();

    video.onerror = () => {
      console.error("Video failed to load:", item.storageUrl);
      setTimeout(onComplete, 2000);
    };

    // Respect max duration even if video is longer
    if (item.durationSec) {
      setTimeout(() => {
        video.pause();
        onComplete();
      }, item.durationSec * 1000);
    }

    this.config.container.appendChild(video);
    video.play().catch(console.error);
  }

  // ─── Timers ──────────────────────────────────────────────────────────────────

  private startHeartbeat() {
    this.heartbeatTimer = setInterval(
      () => this.sendHeartbeat(),
      HEARTBEAT_INTERVAL_MS
    );
    // Send initial heartbeat immediately
    this.sendHeartbeat();
  }

  private startPlaylistPolling() {
    this.pollTimer = setInterval(
      () => this.fetchPlaylist(),
      PLAYLIST_POLL_INTERVAL_MS
    );
  }

  stop() {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    if (this.pollTimer) clearInterval(this.pollTimer);
  }

  // ─── Loading / Error States ───────────────────────────────────────────────────

  private renderLoadingScreen() {
    this.config.container.innerHTML = `
      <div style="
        display: flex; align-items: center; justify-content: center;
        height: 100vh; color: #fff; font-size: 1.5rem;
      ">
        Loading playlist...
      </div>
    `;
  }

  private renderNoContent() {
    this.config.container.innerHTML = `
      <div style="
        display: flex; flex-direction: column; align-items: center;
        justify-content: center; height: 100vh; color: #666;
      ">
        <p style="font-size: 2rem;">No active ads</p>
        <p style="font-size: 1rem; margin-top: 8px;">Checking for new content every 5 minutes...</p>
      </div>
    `;
    // Keep polling in case content gets approved
    this.startPlaylistPolling();
    this.startHeartbeat();
  }
}
