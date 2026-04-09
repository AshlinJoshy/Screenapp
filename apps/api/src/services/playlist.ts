import type { PlaylistItem } from "@adscreen/types";

interface AdRow {
  id: string;
  adGroupId: string;
  creativeId: string;
  name: string | null;
  weight: number;
  storageUrl: string | null;
  thumbnailUrl: string | null;
  type: "image" | "video";
  status: string;
}

/**
 * Build an ordered playlist from approved ad rows.
 * Respects A/B test weights — higher weight = more frequent in rotation.
 * Returns items in a weighted-shuffled order ready for the player.
 */
export function generatePlaylist(
  adRows: AdRow[],
  durationMap: Map<string, number>
): PlaylistItem[] {
  if (adRows.length === 0) return [];

  // Only include ads with a valid storage URL
  const valid = adRows.filter((a) => a.storageUrl);

  // Expand weighted ads — each ad appears (weight/100) times relative to weight=100
  // Normalise to a max of 10 slots per ad to keep playlist size manageable
  const expanded: AdRow[] = [];
  const maxWeight = Math.max(...valid.map((a) => a.weight));
  for (const ad of valid) {
    const slots = Math.max(1, Math.round((ad.weight / maxWeight) * 10));
    for (let i = 0; i < slots; i++) {
      expanded.push(ad);
    }
  }

  // Shuffle using Fisher-Yates
  for (let i = expanded.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [expanded[i], expanded[j]] = [expanded[j]!, expanded[i]!];
  }

  return expanded.map((ad) => ({
    adId: ad.id,
    creativeId: ad.creativeId,
    storageUrl: ad.storageUrl!,
    thumbnailUrl: ad.thumbnailUrl ?? undefined,
    type: ad.type,
    durationSec: durationMap.get(ad.adGroupId) ?? 30,
    weight: ad.weight,
  }));
}
