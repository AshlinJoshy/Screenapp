const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

type FetchOptions = {
  method?: string;
  body?: unknown;
  token?: string;
};

class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = "ApiError";
  }
}

async function apiFetch<T>(path: string, opts: FetchOptions = {}): Promise<T> {
  const headers: Record<string, string> = {};
  if (opts.body) headers["Content-Type"] = "application/json";
  if (opts.token) headers["Authorization"] = `Bearer ${opts.token}`;

  const res = await fetch(`${API_BASE}${path}`, {
    method: opts.method ?? "GET",
    headers,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new ApiError(res.status, err.error ?? "Request failed");
  }

  return res.json() as Promise<T>;
}

// ── Auth ──────────────────────────────────────────────────────────────────────

export type AuthUser = {
  id: string;
  email: string;
  role: "owner" | "advertiser" | "admin";
  displayName: string;
};

export type AuthResponse = { token: string; user: AuthUser };

export const auth = {
  register: (data: { email: string; password: string; role: "owner" | "advertiser"; displayName: string }) =>
    apiFetch<AuthResponse>("/api/auth/register", { method: "POST", body: data }),

  login: (data: { email: string; password: string }) =>
    apiFetch<AuthResponse>("/api/auth/login", { method: "POST", body: data }),

  me: (token: string) =>
    apiFetch<AuthUser>("/api/auth/me", { token }),
};

// ── Screens ───────────────────────────────────────────────────────────────────

export type Screen = {
  id: string;
  name: string;
  venueType: string;
  city: string;
  state: string;
  country: string;
  resolutionW: number;
  resolutionH: number;
  orientation: string;
  screenDiagonalIn: number;
  floorCpsCents: number;
  isActive: boolean;
  apiKey?: string;
  createdAt: string;
};

export const screens = {
  list: (token: string) =>
    apiFetch<Screen[]>("/api/screens", { token }),

  create: (token: string, data: Partial<Screen>) =>
    apiFetch<Screen>("/api/screens", { method: "POST", body: data, token }),

  get: (token: string, id: string) =>
    apiFetch<Screen>(`/api/screens/${id}`, { token }),

  update: (token: string, id: string, data: Partial<Screen>) =>
    apiFetch<Screen>(`/api/screens/${id}`, { method: "PATCH", body: data, token }),

  delete: (token: string, id: string) =>
    apiFetch<{ success: boolean }>(`/api/screens/${id}`, { method: "DELETE", token }),

  public: (params?: Record<string, string>) => {
    const qs = params ? "?" + new URLSearchParams(params).toString() : "";
    return apiFetch<Screen[]>(`/api/screens/public${qs}`);
  },
};

// ── Creatives ─────────────────────────────────────────────────────────────────

export type Creative = {
  id: string;
  name: string;
  filename: string;
  type: "video" | "image";
  status: "processing" | "ready" | "failed";
  storageUrl: string | null;
  thumbnailUrl: string | null;
  fileSizeBytes: number;
  durationSec: number | null;
  widthPx: number | null;
  heightPx: number | null;
  mimeType: string;
  createdAt: string;
};

export const creatives = {
  list: (token: string) =>
    apiFetch<Creative[]>("/api/creatives", { token }),

  requestUploadUrl: (token: string, data: { name: string; filename: string; contentType: string; fileSizeBytes: number }) =>
    apiFetch<{ creativeId: string; uploadUrl: string; fileUrl: string; expiresAt: string }>(
      "/api/creatives/upload-url", { method: "POST", body: data, token }
    ),

  confirm: (token: string, id: string, data: { durationSec?: number; widthPx?: number; heightPx?: number }) =>
    apiFetch<Creative>(`/api/creatives/${id}/confirm`, { method: "POST", body: data, token }),

  delete: (token: string, id: string) =>
    apiFetch<{ success: boolean }>(`/api/creatives/${id}`, { method: "DELETE", token }),
};

// ── Campaigns ─────────────────────────────────────────────────────────────────

export type Campaign = {
  id: string;
  name: string;
  status: "draft" | "active" | "paused" | "completed" | "archived";
  startDate: string;
  endDate: string;
  dailyBudgetCents: number;
  totalSpendCents: number;
  createdAt: string;
  adGroups?: AdGroup[];
};

export type AdGroup = {
  id: string;
  campaignId: string;
  name: string;
  status: "active" | "paused";
  impressionDurationSec: number;
  dailyBudgetCents: number;
  totalSpendCents: number;
  createdAt: string;
};

export type Ad = {
  id: string;
  adGroupId: string;
  creativeId: string;
  name: string | null;
  weight: number;
  status: "active" | "paused";
  impressionsCount: number;
  createdAt: string;
};

export const campaigns = {
  list: (token: string) =>
    apiFetch<Campaign[]>("/api/campaigns", { token }),

  create: (token: string, data: { name: string; startDate: string; endDate: string; dailyBudgetCents: number }) =>
    apiFetch<Campaign>("/api/campaigns", { method: "POST", body: data, token }),

  get: (token: string, id: string) =>
    apiFetch<Campaign>(`/api/campaigns/${id}`, { token }),

  update: (token: string, id: string, data: Partial<Campaign>) =>
    apiFetch<Campaign>(`/api/campaigns/${id}`, { method: "PATCH", body: data, token }),

  delete: (token: string, id: string) =>
    apiFetch<{ success: boolean }>(`/api/campaigns/${id}`, { method: "DELETE", token }),

  createAdGroup: (token: string, campaignId: string, data: {
    name: string; impressionDurationSec: number; dailyBudgetCents: number; targetScreenIds: string[];
  }) =>
    apiFetch<AdGroup>(`/api/campaigns/${campaignId}/ad-groups`, { method: "POST", body: data, token }),

  submitAdGroup: (token: string, groupId: string) =>
    apiFetch<{ adGroupId: string; targetsSubmitted: number; status: string }>(
      `/api/campaigns/ad-groups/${groupId}/submit`, { method: "POST", token }
    ),

  addAd: (token: string, groupId: string, data: { creativeId: string; weight?: number }) =>
    apiFetch<Ad>(`/api/campaigns/ad-groups/${groupId}/ads`, { method: "POST", body: data, token }),
};

// ── Approvals ─────────────────────────────────────────────────────────────────

export type Approval = {
  id: string;
  adGroupId: string;
  screenId: string;
  approvalStatus: "pending" | "approved" | "rejected";
  approvalNotes: string | null;
  reviewedAt: string | null;
  createdAt: string;
  screenName: string;
  adGroupName: string;
  impressionDurationSec: number;
  dailyBudgetCents: number;
  campaignId: string;
};

export const approvals = {
  list: (token: string) =>
    apiFetch<Approval[]>("/api/approvals", { token }),

  review: (token: string, id: string, data: { status: "approved" | "rejected"; notes?: string }) =>
    apiFetch<Approval>(`/api/approvals/${id}`, { method: "PATCH", body: data, token }),
};

// ── Pricing ───────────────────────────────────────────────────────────────────

export type PricingTier = {
  durationSec: number;
  floorCpsCents: number;
  markupPct: number;
  cpsEffCents: number;
  cpiCents: number;
  minDailyBudgetCents: number;
  estimatedDailyImpressions: number;
  isViable: boolean;
};

export const pricing = {
  get: (id: string) =>
    apiFetch<{ screenId: string; competitorCount: number; tiers: PricingTier[] }>(
      `/api/screens/${id}/pricing`
    ),

  preview: (data: { floorCpsCents: number; nCurrentCompetitors: number; impressionDurationSec: number; dailyBudgetCents: number }) =>
    apiFetch<{ cpiCents: number; estimatedDailyImpressions: number; isViable: boolean; minDailyBudgetCents: number }>(
      "/api/auction/preview", { method: "POST", body: data }
    ),
};

export { ApiError };
