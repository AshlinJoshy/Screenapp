// ─── Enums ────────────────────────────────────────────────────────────────────

export type UserRole = "owner" | "advertiser" | "admin";
export type ScreenStatus = "online" | "offline";
export type Orientation = "landscape" | "portrait";
export type CreativeStatus = "processing" | "ready" | "failed";
export type CreativeType = "image" | "video";
export type CampaignStatus = "draft" | "active" | "paused" | "completed" | "archived";
export type AdGroupStatus = "active" | "paused" | "budget_exhausted";
export type AdStatus = "active" | "paused";
export type ApprovalStatus = "pending" | "approved" | "rejected";
export type PayoutStatus = "pending" | "paid";

export type VenueType =
  | "gym"
  | "retail"
  | "airport"
  | "billboard"
  | "restaurant"
  | "hotel"
  | "transport"
  | "office"
  | "education"
  | "healthcare"
  | "entertainment"
  | "other";

// ─── Entity Types ─────────────────────────────────────────────────────────────

export interface User {
  id: string;
  email: string;
  role: UserRole;
  displayName: string;
  createdAt: string;
}

export interface Screen {
  id: string;
  ownerId: string;
  name: string;
  status: ScreenStatus;
  lastHeartbeat?: string;
  // Location
  address?: string;
  latitude?: string;
  longitude?: string;
  country?: string;
  state?: string;
  city?: string;
  // Physical specs
  physicalWidthCm: number;
  physicalHeightCm: number;
  screenDiagonalIn: string;
  // Digital specs
  resolutionW: number;
  resolutionH: number;
  orientation: Orientation;
  aspectRatio: string;
  // Content settings
  acceptsImages: boolean;
  acceptsVideos: boolean;
  maxImageSizeMb: number;
  maxVideoSizeMb: number;
  maxVideoDurationSec: number;
  supportedImageFormats: string[];
  supportedVideoFormats: string[];
  // Venue
  venueType?: VenueType;
  venueName?: string;
  estimatedDailyViews?: number;
  operatingHoursStart?: string;
  operatingHoursEnd?: string;
  isOpen24h: boolean;
  // Pricing
  floorCpsCents: number;
  isActive: boolean;
  createdAt: string;
}

// Public-facing screen (no api_key, no owner private info)
export interface PublicScreen extends Omit<Screen, "ownerId"> {
  ownerDisplayName: string;
  // Computed pricing info
  estimatedCpiCents?: number; // based on current competition
  nActiveCompetitors?: number;
}

export interface Creative {
  id: string;
  advertiserId: string;
  name: string;
  filename: string;
  type: CreativeType;
  status: CreativeStatus;
  storageUrl?: string;
  thumbnailUrl?: string;
  fileSizeBytes?: number;
  durationSec?: string;
  widthPx?: number;
  heightPx?: number;
  aspectRatio?: string;
  mimeType?: string;
  createdAt: string;
}

export interface Campaign {
  id: string;
  advertiserId: string;
  name: string;
  status: CampaignStatus;
  startDate: string;
  endDate: string;
  dailyBudgetCents: number;
  totalSpendCents: number;
  createdAt: string;
}

export interface AdGroup {
  id: string;
  campaignId: string;
  name: string;
  status: AdGroupStatus;
  impressionDurationSec: number;
  dailyBudgetCents: number;
  totalSpendCents: number;
  createdAt: string;
}

export interface Ad {
  id: string;
  adGroupId: string;
  creativeId: string;
  name?: string;
  status: AdStatus;
  weight: number;
  impressionsCount: number;
  createdAt: string;
}

export interface AdGroupScreen {
  id: string;
  adGroupId: string;
  screenId: string;
  approvalStatus: ApprovalStatus;
  approvalNotes?: string;
  reviewedBy?: string;
  reviewedAt?: string;
  createdAt: string;
}

export interface Impression {
  id: string;
  screenId: string;
  adId: string;
  adGroupId: string;
  campaignId: string;
  playedAt: string;
  durationSec?: string;
  completed: boolean;
  costCents: number;
}

// ─── API Request / Response Types ─────────────────────────────────────────────

// Auth
export interface RegisterRequest {
  email: string;
  password: string;
  role: "owner" | "advertiser";
  displayName: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface AuthResponse {
  token: string;
  user: User;
}

// Screens
export interface CreateScreenRequest {
  name: string;
  // Location
  address: string;
  latitude?: number;
  longitude?: number;
  country?: string;
  state?: string;
  city?: string;
  // Physical
  physicalWidthCm: number;
  physicalHeightCm: number;
  screenDiagonalIn: number;
  // Digital
  resolutionW: number;
  resolutionH: number;
  orientation: Orientation;
  // Content
  acceptsImages: boolean;
  acceptsVideos: boolean;
  // Venue
  venueType?: VenueType;
  venueName?: string;
  estimatedDailyViews?: number;
  operatingHoursStart?: string;
  operatingHoursEnd?: string;
  isOpen24h?: boolean;
  // Pricing
  floorCpsCents: number;
}

export interface UpdateScreenRequest extends Partial<CreateScreenRequest> {}

export interface ScreenWithApiKey extends Screen {
  apiKey: string;
}

// Creatives
export interface CreateUploadUrlRequest {
  name: string;
  filename: string;
  contentType: string;
  fileSizeBytes: number;
}

export interface UploadUrlResponse {
  creativeId: string;
  uploadUrl: string;
  fileUrl: string;
  expiresAt: string;
}

export interface ConfirmUploadRequest {
  durationSec?: number;
  widthPx?: number;
  heightPx?: number;
  mimeType?: string;
}

// Campaigns
export interface CreateCampaignRequest {
  name: string;
  startDate: string;
  endDate: string;
  dailyBudgetCents: number;
}

export interface CreateAdGroupRequest {
  name: string;
  impressionDurationSec: number;
  dailyBudgetCents: number;
  targetScreenIds: string[];
}

export interface AddAdRequest {
  creativeId: string;
  name?: string;
  weight?: number;
}

// Approvals
export interface ReviewApprovalRequest {
  status: "approved" | "rejected";
  notes?: string;
}

// Player
export interface PlaylistItem {
  adId: string;
  creativeId: string;
  storageUrl: string;
  thumbnailUrl?: string;
  type: CreativeType;
  durationSec: number;
  weight: number;
}

export interface PlaylistResponse {
  screenId: string;
  generatedAt: string;
  version: number;
  items: PlaylistItem[];
}

export interface HeartbeatRequest {
  playerVersion: string;
  currentAdId?: string;
  impressions?: Array<{
    adId: string;
    adGroupId: string;
    campaignId: string;
    playedAt: string;
    durationSec: number;
    completed: boolean;
  }>;
}

export interface HeartbeatResponse {
  success: boolean;
  nextCheckInSec: number;
  playlistVersion: number;
}

// Auction / Pricing
export interface PricingEstimate {
  screenId: string;
  floorCpsCents: number;
  nCurrentCompetitors: number;
  markupPct: number;
  effCpsCents: number;
  estimatedCpiCents: Record<number, number>; // duration (sec) → CPI (cents)
}

export interface AuctionPreviewRequest {
  screenId: string;
  impressionDurationSec: number;
  dailyBudgetCents: number;
}

export interface AuctionPreviewResponse {
  cpiCents: number;
  minDailyBudgetCents: number;
  estimatedDailyImpressions: number;
  estimatedImpressionPct: number;
  isViable: boolean;
  budgetShortfallCents?: number;
}

// ─── Bidding Algorithm Types ──────────────────────────────────────────────────

export interface AuctionInput {
  floorCpsCents: number;       // Screen owner's floor (cents/second)
  nCompetitors: number;         // Active bidders this hour
  impressionDurationSec: number; // This advertiser's impression length
  dailyBudgetCents: number;    // This advertiser's daily budget
}

export interface AuctionResult {
  markupPct: number;           // M(n)
  effCpsCents: number;         // cps_eff (cents/sec)
  cpiCents: number;            // Cost per impression
  minDailyBudgetCents: number; // B_min (1 impression/day)
  isViable: boolean;           // budget >= B_min
  budgetShortfallCents: number; // 0 if viable
  maxImpressionsPerHour: number;
  demandSeconds: number;       // Airtime demand per hour
  impressionPct?: number;      // Filled in after allocation
  allocatedSeconds?: number;
  actualImpressionsPerHour?: number;
  actualHourlySpendCents?: number;
}

// ─── Analytics Types ──────────────────────────────────────────────────────────

export interface CampaignAnalytics {
  campaignId: string;
  totalImpressions: number;
  completedImpressions: number;
  impressionCompletionRate: number;
  totalSpendCents: number;
  avgCpiCents: number;
  adGroupBreakdown: AdGroupAnalytics[];
}

export interface AdGroupAnalytics {
  adGroupId: string;
  screenId: string;
  screenName: string;
  impressions: number;
  spendCents: number;
  avgImpressionPct: number;
  avgCpiCents: number;
}

export interface ScreenAnalytics {
  screenId: string;
  totalRevenueCents: number;
  platformFeeCents: number;
  ownerRevenueCents: number;
  totalImpressions: number;
  activeAdGroups: number;
  avgDailyRevenueCents: number;
  revenueByDay: Array<{ date: string; revenueCents: number }>;
}

// ─── Filters ──────────────────────────────────────────────────────────────────

export interface ScreenFilters {
  country?: string;
  state?: string;
  city?: string;
  venueType?: VenueType;
  orientation?: Orientation;
  acceptsImages?: boolean;
  acceptsVideos?: boolean;
  minResolutionW?: number;
  minResolutionH?: number;
  minDiagonalIn?: number;
  maxDiagonalIn?: number;
  minEstimatedDailyViews?: number;
  maxFloorCpsCents?: number;
  status?: ScreenStatus;
  lat?: number;
  lng?: number;
  radiusKm?: number;
  page?: number;
  limit?: number;
}
