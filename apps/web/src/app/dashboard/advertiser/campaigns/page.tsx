"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { Button } from "@/components/ui/Button";
import { Card, CardBody } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Modal } from "@/components/ui/Modal";
import { Input } from "@/components/ui/Input";
import { campaigns, ApiError, type Campaign } from "@/lib/api";
import { getToken } from "@/lib/auth";
import { formatCents, formatDate } from "@/lib/utils";
import { Plus, Megaphone, Trash2, ChevronRight } from "lucide-react";

export default function CampaignsPage() {
  const [list, setList] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ name: "", startDate: "", endDate: "", dailyBudgetCents: "5000" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const token = getToken()!;

  useEffect(() => {
    campaigns.list(token).then(setList).finally(() => setLoading(false));
  }, [token]);

  function setF(field: string, value: string) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSaving(true);
    try {
      const created = await campaigns.create(token, {
        name: form.name,
        startDate: form.startDate,
        endDate: form.endDate,
        dailyBudgetCents: Number(form.dailyBudgetCents),
      });
      setList((l) => [created, ...l]);
      setShowModal(false);
      setForm({ name: "", startDate: "", endDate: "", dailyBudgetCents: "5000" });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to create campaign");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string, status: string) {
    if (status !== "draft") { alert("Only draft campaigns can be deleted."); return; }
    if (!confirm("Delete this campaign?")) return;
    await campaigns.delete(token, id).catch(() => null);
    setList((l) => l.filter((c) => c.id !== id));
  }

  return (
    <DashboardShell allowedRoles={["advertiser"]}>
      <div className="p-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Campaigns</h1>
            <p className="text-slate-500 mt-1">{list.length} campaign{list.length !== 1 ? "s" : ""}</p>
          </div>
          <Button onClick={() => setShowModal(true)}><Plus size={16} /> New Campaign</Button>
        </div>

        {loading ? (
          <div className="text-center py-12 text-slate-400">Loading…</div>
        ) : list.length === 0 ? (
          <Card>
            <CardBody className="py-16 text-center">
              <Megaphone size={48} className="text-slate-300 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-slate-700 mb-2">No campaigns yet</h3>
              <p className="text-slate-400 text-sm mb-6">Create a campaign to start advertising on screens.</p>
              <Button onClick={() => setShowModal(true)}><Plus size={16} /> New Campaign</Button>
            </CardBody>
          </Card>
        ) : (
          <div className="grid gap-4">
            {list.map((c) => (
              <Card key={c.id}>
                <CardBody className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-lg bg-indigo-100 flex items-center justify-center">
                      <Megaphone size={20} className="text-indigo-600" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="font-semibold text-slate-900">{c.name}</p>
                        <Badge status={c.status} />
                      </div>
                      <p className="text-sm text-slate-500">
                        {formatDate(c.startDate)} → {formatDate(c.endDate)} · {formatCents(c.dailyBudgetCents)}/day
                      </p>
                      <p className="text-xs text-slate-400">
                        Spent: {formatCents(c.totalSpendCents)}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={() => handleDelete(c.id, c.status)}
                      className="text-slate-400 hover:text-red-500 transition-colors p-2">
                      <Trash2 size={16} />
                    </button>
                    <Link href={`/dashboard/advertiser/campaigns/${c.id}`}
                      className="text-slate-400 hover:text-indigo-600 transition-colors p-2">
                      <ChevronRight size={16} />
                    </Link>
                  </div>
                </CardBody>
              </Card>
            ))}
          </div>
        )}

        <Modal open={showModal} onClose={() => setShowModal(false)} title="New Campaign">
          <form onSubmit={handleCreate} className="space-y-4">
            <Input id="cname" label="Campaign name" value={form.name}
              onChange={(e) => setF("name", e.target.value)} placeholder="Summer Sale 2026" required />
            <div className="grid grid-cols-2 gap-4">
              <Input id="start" label="Start date" type="date" value={form.startDate}
                onChange={(e) => setF("startDate", e.target.value)} required />
              <Input id="end" label="End date" type="date" value={form.endDate}
                onChange={(e) => setF("endDate", e.target.value)} required />
            </div>
            <Input id="budget" label="Daily budget (cents)" type="number" value={form.dailyBudgetCents}
              onChange={(e) => setF("dailyBudgetCents", e.target.value)}
              placeholder="5000 = $50.00/day" required />
            <p className="text-xs text-slate-500">
              = {formatCents(Number(form.dailyBudgetCents) || 0)}/day
            </p>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <div className="flex gap-3">
              <Button type="button" variant="secondary" onClick={() => setShowModal(false)} className="flex-1">Cancel</Button>
              <Button type="submit" loading={saving} className="flex-1">Create Campaign</Button>
            </div>
          </form>
        </Modal>
      </div>
    </DashboardShell>
  );
}
