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

export function generatePlaylist(
  adRows: AdRow[],
  durationMap: Map<string, number>
): PlaylistItem[] {
  if (adRows.length === 0) return [];

  const valid = adRows.filter((a) => a.storageUrl);
  if (valid.length === 0) return [];

  const maxWeight = Math.max(...valid.map((a) => a.weight));
  const expanded: AdRow[] = [];
  for (const ad of valid) {
    const slots = Math.max(1, Math.round((ad.weight / maxWeight) * 10));
    for (let i = 0; i < slots; i++) expanded.push(ad);
  }

  // Fisher-Yates shuffle
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
