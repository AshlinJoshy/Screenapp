import {
  pgTable,
  uuid,
  text,
  timestamp,
  integer,
  boolean,
  decimal,
  pgEnum,
  uniqueIndex,
  index,
  jsonb,
  time,
  date,
  bigint,
} from "drizzle-orm/pg-core";

// ─── Enums ───────────────────────────────────────────────────────────────────

export const userRoleEnum = pgEnum("user_role", [
  "owner",
  "advertiser",
  "admin",
]);

export const screenStatusEnum = pgEnum("screen_status", ["online", "offline"]);

export const orientationEnum = pgEnum("orientation", [
  "landscape",
  "portrait",
]);

export const creativeStatusEnum = pgEnum("creative_status", [
  "processing",
  "ready",
  "failed",
]);

export const creativeTypeEnum = pgEnum("creative_type", ["image", "video"]);

export const campaignStatusEnum = pgEnum("campaign_status", [
  "draft",
  "active",
  "paused",
  "completed",
  "archived",
]);

export const adGroupStatusEnum = pgEnum("ad_group_status", [
  "active",
  "paused",
  "budget_exhausted",
]);

export const adStatusEnum = pgEnum("ad_status", ["active", "paused"]);

export const approvalStatusEnum = pgEnum("approval_status", [
  "pending",
  "approved",
  "rejected",
]);

export const payoutStatusEnum = pgEnum("payout_status", ["pending", "paid"]);

// ─── Users ────────────────────────────────────────────────────────────────────

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: text("email").notNull(),
    passwordHash: text("password_hash").notNull(),
    role: userRoleEnum("role").notNull(),
    displayName: text("display_name").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [uniqueIndex("users_email_idx").on(t.email)]
);

// ─── Screens ──────────────────────────────────────────────────────────────────

export const screens = pgTable(
  "screens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    apiKey: text("api_key").notNull(),
    status: screenStatusEnum("status").default("offline").notNull(),
    lastHeartbeat: timestamp("last_heartbeat"),

    // ── Location (Google Maps) ──
    address: text("address"),
    latitude: decimal("latitude", { precision: 10, scale: 8 }),
    longitude: decimal("longitude", { precision: 11, scale: 8 }),
    country: text("country"),
    state: text("state"),
    city: text("city"),

    // ── Physical specs (MANDATORY) ──
    physicalWidthCm: integer("physical_width_cm").notNull(),
    physicalHeightCm: integer("physical_height_cm").notNull(),
    screenDiagonalIn: decimal("screen_diagonal_in", {
      precision: 5,
      scale: 1,
    }).notNull(),

    // ── Digital specs ──
    resolutionW: integer("resolution_w").notNull(),
    resolutionH: integer("resolution_h").notNull(),
    orientation: orientationEnum("orientation").notNull(),
    aspectRatio: text("aspect_ratio").notNull(), // e.g. "16:9", computed

    // ── Content settings (owner chooses) ──
    acceptsImages: boolean("accepts_images").default(true).notNull(),
    acceptsVideos: boolean("accepts_videos").default(true).notNull(),

    // ── File limits (admin sets after review; defaults are conservative) ──
    maxImageSizeMb: integer("max_image_size_mb").default(50).notNull(),
    maxVideoSizeMb: integer("max_video_size_mb").default(500).notNull(),
    maxVideoDurationSec: integer("max_video_duration_sec")
      .default(300)
      .notNull(),
    supportedImageFormats: text("supported_image_formats")
      .array()
      .default(["jpg", "png", "webp"]),
    supportedVideoFormats: text("supported_video_formats")
      .array()
      .default(["mp4", "webm"]),

    // ── Venue info ──
    venueType: text("venue_type"), // 'gym','retail','airport','billboard','restaurant','hotel','other'
    venueName: text("venue_name"),
    estimatedDailyViews: integer("estimated_daily_views"),
    operatingHoursStart: time("operating_hours_start"),
    operatingHoursEnd: time("operating_hours_end"),
    isOpen24h: boolean("is_open_24h").default(false).notNull(),

    // ── Pricing (floor set by owner) ──
    // floor_cps = minimum cents the owner wants PER SECOND of their screen's airtime
    floorCpsCents: integer("floor_cps_cents").notNull().default(0),

    isActive: boolean("is_active").default(true).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("screens_api_key_idx").on(t.apiKey),
    index("screens_owner_idx").on(t.ownerId),
    index("screens_country_state_city_idx").on(t.country, t.state, t.city),
  ]
);

// ─── Creatives ────────────────────────────────────────────────────────────────

export const creatives = pgTable(
  "creatives",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    advertiserId: uuid("advertiser_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    filename: text("filename").notNull(),
    type: creativeTypeEnum("type").notNull(),
    status: creativeStatusEnum("status").default("processing").notNull(),
    storageUrl: text("storage_url"),
    thumbnailUrl: text("thumbnail_url"),
    fileSizeBytes: bigint("file_size_bytes", { mode: "number" }),
    durationSec: decimal("duration_sec", { precision: 6, scale: 2 }),
    widthPx: integer("width_px"),
    heightPx: integer("height_px"),
    aspectRatio: text("aspect_ratio"),
    mimeType: text("mime_type"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [index("creatives_advertiser_idx").on(t.advertiserId)]
);

// ─── Campaigns ────────────────────────────────────────────────────────────────

export const campaigns = pgTable(
  "campaigns",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    advertiserId: uuid("advertiser_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    status: campaignStatusEnum("status").default("draft").notNull(),
    startDate: date("start_date").notNull(),
    endDate: date("end_date").notNull(),
    dailyBudgetCents: integer("daily_budget_cents").notNull(),
    totalSpendCents: integer("total_spend_cents").default(0).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [index("campaigns_advertiser_idx").on(t.advertiserId)]
);

// ─── Ad Groups ────────────────────────────────────────────────────────────────

export const adGroups = pgTable(
  "ad_groups",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    campaignId: uuid("campaign_id")
      .notNull()
      .references(() => campaigns.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    status: adGroupStatusEnum("status").default("active").notNull(),
    // How long 1 impression plays (5–300 seconds)
    impressionDurationSec: integer("impression_duration_sec").notNull(),
    dailyBudgetCents: integer("daily_budget_cents").notNull(),
    totalSpendCents: integer("total_spend_cents").default(0).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [index("ad_groups_campaign_idx").on(t.campaignId)]
);

// ─── Ads (creatives in an ad group) ──────────────────────────────────────────

export const ads = pgTable(
  "ads",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    adGroupId: uuid("ad_group_id")
      .notNull()
      .references(() => adGroups.id, { onDelete: "cascade" }),
    creativeId: uuid("creative_id")
      .notNull()
      .references(() => creatives.id),
    name: text("name"),
    status: adStatusEnum("status").default("active").notNull(),
    // A/B test weight — higher = shown more often relative to siblings
    weight: integer("weight").default(100).notNull(),
    impressionsCount: integer("impressions_count").default(0).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [index("ads_ad_group_idx").on(t.adGroupId)]
);

// ─── Ad Group → Screen Targets + Approvals ────────────────────────────────────

export const adGroupScreens = pgTable(
  "ad_group_screens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    adGroupId: uuid("ad_group_id")
      .notNull()
      .references(() => adGroups.id, { onDelete: "cascade" }),
    screenId: uuid("screen_id")
      .notNull()
      .references(() => screens.id),
    approvalStatus: approvalStatusEnum("approval_status")
      .default("pending")
      .notNull(),
    approvalNotes: text("approval_notes"),
    reviewedBy: uuid("reviewed_by").references(() => users.id),
    reviewedAt: timestamp("reviewed_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    index("ad_group_screens_ad_group_idx").on(t.adGroupId),
    index("ad_group_screens_screen_idx").on(t.screenId),
    uniqueIndex("ad_group_screens_unique_idx").on(t.adGroupId, t.screenId),
  ]
);

// ─── Playlists ────────────────────────────────────────────────────────────────

export const playlists = pgTable("playlists", {
  id: uuid("id").primaryKey().defaultRandom(),
  screenId: uuid("screen_id")
    .notNull()
    .references(() => screens.id, { onDelete: "cascade" }),
  jsonBlob: jsonb("json_blob").notNull(),
  generatedAt: timestamp("generated_at").defaultNow().notNull(),
  version: integer("version").default(1).notNull(),
});

// ─── Impressions ──────────────────────────────────────────────────────────────

export const impressions = pgTable(
  "impressions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    screenId: uuid("screen_id")
      .notNull()
      .references(() => screens.id),
    adId: uuid("ad_id").notNull().references(() => ads.id),
    adGroupId: uuid("ad_group_id")
      .notNull()
      .references(() => adGroups.id),
    campaignId: uuid("campaign_id")
      .notNull()
      .references(() => campaigns.id),
    playedAt: timestamp("played_at").defaultNow().notNull(),
    durationSec: decimal("duration_sec", { precision: 6, scale: 2 }),
    completed: boolean("completed").default(false).notNull(),
    costCents: integer("cost_cents").notNull().default(0),
  },
  (t) => [
    index("impressions_screen_idx").on(t.screenId),
    index("impressions_campaign_idx").on(t.campaignId),
    index("impressions_played_at_idx").on(t.playedAt),
  ]
);

// ─── Hourly Auction Results ───────────────────────────────────────────────────

export const auctionHourlyResults = pgTable(
  "auction_hourly_results",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    screenId: uuid("screen_id")
      .notNull()
      .references(() => screens.id),
    // Timestamp rounded to the hour
    hourBucket: timestamp("hour_bucket").notNull(),
    nCompetitors: integer("n_competitors").notNull(),
    markupPct: decimal("markup_pct", { precision: 5, scale: 4 }).notNull(),
    floorCpsCents: integer("floor_cps_cents").notNull(),
    effCpsCents: decimal("eff_cps_cents", { precision: 10, scale: 6 }).notNull(),
    totalAirtimeAllocSec: integer("total_airtime_alloc_sec").notNull().default(0),
    totalRevenueCents: integer("total_revenue_cents").notNull().default(0),
    platformRevenueCents: integer("platform_revenue_cents").notNull().default(0),
    ownerRevenueCents: integer("owner_revenue_cents").notNull().default(0),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    index("auction_screen_hour_idx").on(t.screenId, t.hourBucket),
    uniqueIndex("auction_screen_hour_unique_idx").on(t.screenId, t.hourBucket),
  ]
);

// ─── Per-Advertiser Auction Allocations ──────────────────────────────────────

export const auctionAllocations = pgTable(
  "auction_allocations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    auctionResultId: uuid("auction_result_id")
      .notNull()
      .references(() => auctionHourlyResults.id, { onDelete: "cascade" }),
    adGroupId: uuid("ad_group_id")
      .notNull()
      .references(() => adGroups.id),
    allocatedSec: decimal("allocated_sec", {
      precision: 10,
      scale: 4,
    }).notNull(),
    impressionPct: decimal("impression_pct", { precision: 6, scale: 4 }).notNull(),
    impressionsTarget: integer("impressions_target").notNull(),
    cpiCents: decimal("cpi_cents", { precision: 10, scale: 6 }).notNull(),
    hourlySpendCents: integer("hourly_spend_cents").notNull().default(0),
  },
  (t) => [index("auction_alloc_result_idx").on(t.auctionResultId)]
);

// ─── Screen Owner Payouts ─────────────────────────────────────────────────────

export const screenOwnerPayouts = pgTable(
  "screen_owner_payouts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => users.id),
    screenId: uuid("screen_id")
      .notNull()
      .references(() => screens.id),
    periodStart: date("period_start").notNull(),
    periodEnd: date("period_end").notNull(),
    grossRevenueCents: integer("gross_revenue_cents").notNull(),
    platformFeeCents: integer("platform_fee_cents").notNull(),
    netPayoutCents: integer("net_payout_cents").notNull(),
    status: payoutStatusEnum("status").default("pending").notNull(),
    paidAt: timestamp("paid_at"),
  },
  (t) => [index("payouts_owner_idx").on(t.ownerId)]
);

// ─── Saved Screens (Advertiser Favorites) ────────────────────────────────────

export const savedScreens = pgTable(
  "saved_screens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    advertiserId: uuid("advertiser_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    screenId: uuid("screen_id")
      .notNull()
      .references(() => screens.id, { onDelete: "cascade" }),
    savedAt: timestamp("saved_at").defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("saved_screens_unique_idx").on(t.advertiserId, t.screenId),
  ]
);
