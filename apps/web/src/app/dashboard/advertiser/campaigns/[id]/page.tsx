"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Modal } from "@/components/ui/Modal";
import { Input } from "@/components/ui/Input";
import { campaigns, creatives, screens, ApiError, type Campaign, type Creative, type Screen, type AdGroup } from "@/lib/api";
import { getToken } from "@/lib/auth";
import { formatCents } from "@/lib/utils";
import { Plus, ArrowLeft, CheckCircle, Users } from "lucide-react";

export default function CampaignDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [loading, setLoading] = useState(true);
  const [publicScreens, setPublicScreens] = useState<Screen[]>([]);
  const [myCreatives, setMyCreatives] = useState<Creative[]>([]);

  // Ad group modal
  const [showGroupModal, setShowGroupModal] = useState(false);
  const [groupForm, setGroupForm] = useState({
    name: "", impressionDurationSec: "30", dailyBudgetCents: "2000",
    targetScreenIds: [] as string[],
  });
  const [savingGroup, setSavingGroup] = useState(false);
  const [groupError, setGroupError] = useState("");

  // Ad modal
  const [showAdModal, setShowAdModal] = useState(false);
  const [adGroupId, setAdGroupId] = useState("");
  const [adForm, setAdForm] = useState({ creativeId: "", weight: "100" });
  const [savingAd, setSavingAd] = useState(false);
  const [adError, setAdError] = useState("");

  const token = getToken()!;

  useEffect(() => {
    Promise.all([
      campaigns.get(token, id),
      screens.public(),
      creatives.list(token),
    ]).then(([c, s, cr]) => {
      setCampaign(c);
      setPublicScreens(s);
      setMyCreatives(cr.filter((x) => x.status === "ready"));
      setLoading(false);
    }).catch(() => router.push("/dashboard/advertiser/campaigns"));
  }, [id, token, router]);

  function toggleScreen(screenId: string) {
    setGroupForm((f) => ({
      ...f,
      targetScreenIds: f.targetScreenIds.includes(screenId)
        ? f.targetScreenIds.filter((s) => s !== screenId)
        : [...f.targetScreenIds, screenId],
    }));
  }

  async function handleCreateGroup(e: React.FormEvent) {
    e.preventDefault();
    setGroupError("");
    setSavingGroup(true);
    try {
      const group = await campaigns.createAdGroup(token, id, {
        name: groupForm.name,
        impressionDurationSec: Number(groupForm.impressionDurationSec),
        dailyBudgetCents: Number(groupForm.dailyBudgetCents),
        targetScreenIds: groupForm.targetScreenIds,
      });
      setCampaign((c) => c ? { ...c, adGroups: [...(c.adGroups ?? []), group] } : c);
      setShowGroupModal(false);
      setGroupForm({ name: "", impressionDurationSec: "30", dailyBudgetCents: "2000", targetScreenIds: [] });
    } catch (err) {
      setGroupError(err instanceof ApiError ? err.message : "Failed to create ad group");
    } finally {
      setSavingGroup(false);
    }
  }

  async function handleAddAd(e: React.FormEvent) {
    e.preventDefault();
    setAdError("");
    setSavingAd(true);
    try {
      await campaigns.addAd(token, adGroupId, {
        creativeId: adForm.creativeId,
        weight: Number(adForm.weight),
      });
      setShowAdModal(false);
    } catch (err) {
      setAdError(err instanceof ApiError ? err.message : "Failed to add ad");
    } finally {
      setSavingAd(false);
    }
  }

  async function handleSubmit(groupId: string) {
    try {
      await campaigns.submitAdGroup(token, groupId);
      alert("Ad group submitted for approval!");
    } catch (err) {
      alert(err instanceof ApiError ? err.message : "Submit failed");
    }
  }

  if (loading) {
    return (
      <DashboardShell allowedRoles={["advertiser"]}>
        <div className="flex items-center justify-center h-64 text-slate-400">Loading…</div>
      </DashboardShell>
    );
  }

  if (!campaign) return null;

  return (
    <DashboardShell allowedRoles={["advertiser"]}>
      <div className="p-8">
        {/* Header */}
        <div className="mb-8">
          <Link href="/dashboard/advertiser/campaigns" className="flex items-center gap-1 text-sm text-slate-500 hover:text-indigo-600 mb-4">
            <ArrowLeft size={14} /> Back to campaigns
          </Link>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-slate-900">{campaign.name}</h1>
            <Badge status={campaign.status} />
          </div>
          <p className="text-slate-500 mt-1">
            {campaign.startDate} → {campaign.endDate} · {formatCents(campaign.dailyBudgetCents)}/day
          </p>
        </div>

        {/* Ad Groups */}
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
            <Users size={18} /> Ad Groups
          </h2>
          <Button size="sm" onClick={() => setShowGroupModal(true)}>
            <Plus size={14} /> New Ad Group
          </Button>
        </div>

        {!campaign.adGroups || campaign.adGroups.length === 0 ? (
          <Card>
            <CardBody className="py-12 text-center">
              <p className="text-slate-400 text-sm mb-4">No ad groups yet. Create one to target specific screens.</p>
              <Button size="sm" onClick={() => setShowGroupModal(true)}><Plus size={14} /> Create Ad Group</Button>
            </CardBody>
          </Card>
        ) : (
          <div className="space-y-4">
            {campaign.adGroups.map((group: AdGroup) => (
              <Card key={group.id}>
                <CardHeader className="flex items-center justify-between">
                  <div>
                    <p className="font-semibold text-slate-900">{group.name}</p>
                    <p className="text-sm text-slate-500">
                      {group.impressionDurationSec}s · {formatCents(group.dailyBudgetCents)}/day
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" variant="secondary" onClick={() => {
                      setAdGroupId(group.id);
                      setAdForm({ creativeId: "", weight: "100" });
                      setShowAdModal(true);
                    }}>
                      <Plus size={14} /> Add Ad
                    </Button>
                    <Button size="sm" onClick={() => handleSubmit(group.id)}>
                      <CheckCircle size={14} /> Submit
                    </Button>
                  </div>
                </CardHeader>
                <CardBody className="text-sm text-slate-500 py-3">
                  Click &quot;Submit&quot; to send this ad group to screen owners for approval.
                </CardBody>
              </Card>
            ))}
          </div>
        )}

        {/* New Ad Group Modal */}
        <Modal open={showGroupModal} onClose={() => setShowGroupModal(false)} title="New Ad Group" className="max-w-2xl">
          <form onSubmit={handleCreateGroup} className="space-y-4">
            <Input id="gname" label="Ad group name" value={groupForm.name}
              onChange={(e) => setGroupForm((f) => ({ ...f, name: e.target.value }))} required />
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium text-slate-700 mb-1 block">Impression duration</label>
                <select value={groupForm.impressionDurationSec}
                  onChange={(e) => setGroupForm((f) => ({ ...f, impressionDurationSec: e.target.value }))}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
                  {[5, 10, 15, 30, 60, 90, 120].map((s) => (
                    <option key={s} value={s}>{s}s</option>
                  ))}
                </select>
              </div>
              <Input id="gbudget" label="Daily budget (cents)" type="number" value={groupForm.dailyBudgetCents}
                onChange={(e) => setGroupForm((f) => ({ ...f, dailyBudgetCents: e.target.value }))} required />
            </div>

            {/* Screen selector */}
            <div>
              <label className="text-sm font-medium text-slate-700 mb-2 block">
                Target screens ({groupForm.targetScreenIds.length} selected)
              </label>
              <div className="max-h-48 overflow-y-auto border border-slate-200 rounded-lg divide-y divide-slate-100">
                {publicScreens.length === 0 ? (
                  <p className="px-4 py-3 text-sm text-slate-400">No active screens available</p>
                ) : (
                  publicScreens.map((s) => (
                    <label key={s.id} className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-slate-50">
                      <input
                        type="checkbox"
                        checked={groupForm.targetScreenIds.includes(s.id)}
                        onChange={() => toggleScreen(s.id)}
                        className="rounded"
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-900">{s.name}</p>
                        <p className="text-xs text-slate-500">{s.city} · {s.venueType} · {formatCents(s.floorCpsCents)}/s floor</p>
                      </div>
                    </label>
                  ))
                )}
              </div>
            </div>

            {groupError && <p className="text-sm text-red-600">{groupError}</p>}
            <div className="flex gap-3">
              <Button type="button" variant="secondary" onClick={() => setShowGroupModal(false)} className="flex-1">Cancel</Button>
              <Button type="submit" loading={savingGroup} disabled={groupForm.targetScreenIds.length === 0} className="flex-1">
                Create Ad Group
              </Button>
            </div>
          </form>
        </Modal>

        {/* Add Ad Modal */}
        <Modal open={showAdModal} onClose={() => setShowAdModal(false)} title="Add Ad to Group">
          <form onSubmit={handleAddAd} className="space-y-4">
            <div>
              <label className="text-sm font-medium text-slate-700 mb-1 block">Creative</label>
              <select value={adForm.creativeId}
                onChange={(e) => setAdForm((f) => ({ ...f, creativeId: e.target.value }))}
                required
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
                <option value="">Select a creative…</option>
                {myCreatives.map((cr) => (
                  <option key={cr.id} value={cr.id}>{cr.name} ({cr.type})</option>
                ))}
              </select>
              {myCreatives.length === 0 && (
                <p className="text-xs text-amber-600 mt-1">No ready creatives. Upload and process one first.</p>
              )}
            </div>
            <Input id="weight" label="Weight (1–1000, higher = shown more often)" type="number"
              min={1} max={1000} value={adForm.weight}
              onChange={(e) => setAdForm((f) => ({ ...f, weight: e.target.value }))} required />
            {adError && <p className="text-sm text-red-600">{adError}</p>}
            <div className="flex gap-3">
              <Button type="button" variant="secondary" onClick={() => setShowAdModal(false)} className="flex-1">Cancel</Button>
              <Button type="submit" loading={savingAd} className="flex-1">Add Ad</Button>
            </div>
          </form>
        </Modal>
      </div>
    </DashboardShell>
  );
}
