"use client";

import { useEffect, useState } from "react";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Card, CardBody } from "@/components/ui/Card";
import { Modal } from "@/components/ui/Modal";
import { Badge } from "@/components/ui/Badge";
import { screens, ApiError, type Screen } from "@/lib/api";
import { getToken } from "@/lib/auth";
import { formatCents } from "@/lib/utils";
import { Plus, Monitor, Trash2, Key } from "lucide-react";

type ScreenForm = {
  name: string; venueType: string; city: string; state: string; country: string;
  resolutionW: string; resolutionH: string; orientation: string; screenDiagonalIn: string;
  physicalWidthCm: string; physicalHeightCm: string; floorCpsCents: string;
  acceptsImages: boolean; acceptsVideos: boolean;
};

const emptyForm = (): ScreenForm => ({
  name: "", venueType: "gym", city: "", state: "", country: "US",
  resolutionW: "1920", resolutionH: "1080", orientation: "landscape",
  screenDiagonalIn: "55", physicalWidthCm: "121", physicalHeightCm: "68",
  floorCpsCents: "10", acceptsImages: true, acceptsVideos: true,
});

const VENUE_TYPES = ["gym", "restaurant", "bar", "retail", "hotel", "office", "transit", "outdoor", "healthcare", "education", "entertainment", "other"];

export default function OwnerScreensPage() {
  const [list, setList] = useState<Screen[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState<ScreenForm>(emptyForm());
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [revealKey, setRevealKey] = useState<string | null>(null);

  const token = getToken()!;

  useEffect(() => {
    screens.list(token).then(setList).finally(() => setLoading(false));
  }, [token]);

  function setF(field: keyof ScreenForm, value: string | boolean) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setSaveError("");
    setSaving(true);
    try {
      const created = await screens.create(token, {
        name: form.name,
        venueType: form.venueType,
        city: form.city, state: form.state, country: form.country,
        resolutionW: Number(form.resolutionW), resolutionH: Number(form.resolutionH),
        orientation: form.orientation as Screen["orientation"],
        screenDiagonalIn: Number(form.screenDiagonalIn),
        physicalWidthCm: Number(form.physicalWidthCm),
        physicalHeightCm: Number(form.physicalHeightCm),
        floorCpsCents: Number(form.floorCpsCents),
        acceptsImages: form.acceptsImages,
        acceptsVideos: form.acceptsVideos,
      } as Partial<Screen>);
      setList((l) => [created, ...l]);
      setShowModal(false);
      setForm(emptyForm());
      // Show API key once
      if (created.apiKey) setRevealKey(created.apiKey);
    } catch (err) {
      setSaveError(err instanceof ApiError ? err.message : "Failed to create screen");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this screen?")) return;
    await screens.delete(token, id).catch(() => null);
    setList((l) => l.filter((s) => s.id !== id));
  }

  return (
    <DashboardShell allowedRoles={["owner"]}>
      <div className="p-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">My Screens</h1>
            <p className="text-slate-500 mt-1">{list.length} screen{list.length !== 1 ? "s" : ""} registered</p>
          </div>
          <Button onClick={() => setShowModal(true)}>
            <Plus size={16} /> Register Screen
          </Button>
        </div>

        {loading ? (
          <div className="text-center py-12 text-slate-400">Loading…</div>
        ) : list.length === 0 ? (
          <Card>
            <CardBody className="py-16 text-center">
              <Monitor size={48} className="text-slate-300 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-slate-700 mb-2">No screens yet</h3>
              <p className="text-slate-400 text-sm mb-6">Register your first screen to start earning from ad placements.</p>
              <Button onClick={() => setShowModal(true)}><Plus size={16} /> Register Screen</Button>
            </CardBody>
          </Card>
        ) : (
          <div className="grid gap-4">
            {list.map((s) => (
              <Card key={s.id}>
                <CardBody className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-lg bg-indigo-100 flex items-center justify-center">
                      <Monitor size={20} className="text-indigo-600" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="font-semibold text-slate-900">{s.name}</p>
                        <Badge status={s.isActive ? "active" : "archived"} />
                      </div>
                      <p className="text-sm text-slate-500">
                        {s.city}, {s.country} · {s.venueType} · {s.resolutionW}×{s.resolutionH} · {s.screenDiagonalIn}&quot;
                      </p>
                      <p className="text-xs text-slate-400 mt-0.5">
                        Floor: {formatCents(s.floorCpsCents)}/s
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => handleDelete(s.id)}
                    className="text-slate-400 hover:text-red-500 transition-colors p-2"
                  >
                    <Trash2 size={16} />
                  </button>
                </CardBody>
              </Card>
            ))}
          </div>
        )}

        {/* Register screen modal */}
        <Modal open={showModal} onClose={() => setShowModal(false)} title="Register Screen" className="max-w-2xl">
          <form onSubmit={handleCreate} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <Input id="name" label="Screen name" value={form.name} onChange={(e) => setF("name", e.target.value)} placeholder="Gym TV — Entrance" required />
              <div>
                <label className="text-sm font-medium text-slate-700 mb-1 block">Venue type</label>
                <select value={form.venueType} onChange={(e) => setF("venueType", e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
                  {VENUE_TYPES.map((v) => <option key={v} value={v}>{v.charAt(0).toUpperCase() + v.slice(1)}</option>)}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <Input id="city" label="City" value={form.city} onChange={(e) => setF("city", e.target.value)} required />
              <Input id="state" label="State / Region" value={form.state} onChange={(e) => setF("state", e.target.value)} />
              <Input id="country" label="Country (ISO)" value={form.country} onChange={(e) => setF("country", e.target.value)} placeholder="US" required />
            </div>

            <div className="grid grid-cols-3 gap-4">
              <Input id="resW" label="Resolution W (px)" type="number" value={form.resolutionW} onChange={(e) => setF("resolutionW", e.target.value)} required />
              <Input id="resH" label="Resolution H (px)" type="number" value={form.resolutionH} onChange={(e) => setF("resolutionH", e.target.value)} required />
              <div>
                <label className="text-sm font-medium text-slate-700 mb-1 block">Orientation</label>
                <select value={form.orientation} onChange={(e) => setF("orientation", e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
                  <option value="landscape">Landscape</option>
                  <option value="portrait">Portrait</option>
                  <option value="square">Square</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <Input id="diag" label='Diagonal (inches)"' type="number" step="0.1" value={form.screenDiagonalIn} onChange={(e) => setF("screenDiagonalIn", e.target.value)} required />
              <Input id="physW" label="Physical width (cm)" type="number" value={form.physicalWidthCm} onChange={(e) => setF("physicalWidthCm", e.target.value)} required />
              <Input id="physH" label="Physical height (cm)" type="number" value={form.physicalHeightCm} onChange={(e) => setF("physicalHeightCm", e.target.value)} required />
            </div>

            <Input id="floor" label="Floor price (cents/second)" type="number" value={form.floorCpsCents}
              onChange={(e) => setF("floorCpsCents", e.target.value)} placeholder="10" required />

            <div className="flex gap-6">
              <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                <input type="checkbox" checked={form.acceptsImages} onChange={(e) => setF("acceptsImages", e.target.checked)} className="rounded" />
                Accepts images
              </label>
              <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                <input type="checkbox" checked={form.acceptsVideos} onChange={(e) => setF("acceptsVideos", e.target.checked)} className="rounded" />
                Accepts videos
              </label>
            </div>

            {saveError && <p className="text-sm text-red-600">{saveError}</p>}

            <div className="flex gap-3 pt-2">
              <Button type="button" variant="secondary" onClick={() => setShowModal(false)} className="flex-1">Cancel</Button>
              <Button type="submit" loading={saving} className="flex-1">Register Screen</Button>
            </div>
          </form>
        </Modal>

        {/* API key reveal modal */}
        <Modal open={!!revealKey} onClose={() => setRevealKey(null)} title="Screen API Key">
          <div className="space-y-4">
            <div className="flex items-start gap-3 rounded-lg bg-amber-50 border border-amber-200 px-4 py-3">
              <Key size={18} className="text-amber-600 shrink-0 mt-0.5" />
              <p className="text-sm text-amber-800">
                Save this API key — it won&apos;t be shown again. Enter it in the player app to authenticate this screen.
              </p>
            </div>
            <div className="rounded-lg bg-slate-900 px-4 py-3 font-mono text-sm text-green-400 break-all">
              {revealKey}
            </div>
            <Button onClick={() => setRevealKey(null)} className="w-full">Done</Button>
          </div>
        </Modal>
      </div>
    </DashboardShell>
  );
}
