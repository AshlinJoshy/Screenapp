"use client";

import { useEffect, useState } from "react";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { Button } from "@/components/ui/Button";
import { Card, CardBody } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Modal } from "@/components/ui/Modal";
import { Input } from "@/components/ui/Input";
import { approvals, ApiError, type Approval } from "@/lib/api";
import { getToken } from "@/lib/auth";
import { formatCents, formatDate } from "@/lib/utils";
import { CheckCircle, XCircle, Clock } from "lucide-react";

export default function ApprovalsPage() {
  const [list, setList] = useState<Approval[]>([]);
  const [loading, setLoading] = useState(true);
  const [reviewing, setReviewing] = useState<Approval | null>(null);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const token = getToken()!;

  useEffect(() => {
    approvals.list(token).then(setList).finally(() => setLoading(false));
  }, [token]);

  async function handleReview(status: "approved" | "rejected") {
    if (!reviewing) return;
    setError("");
    setSaving(true);
    try {
      const updated = await approvals.review(token, reviewing.id, { status, notes: notes || undefined });
      setList((l) => l.map((a) => a.id === updated.id ? updated : a));
      setReviewing(null);
      setNotes("");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to review");
    } finally {
      setSaving(false);
    }
  }

  const pending = list.filter((a) => a.approvalStatus === "pending");
  const reviewed = list.filter((a) => a.approvalStatus !== "pending");

  return (
    <DashboardShell allowedRoles={["owner"]}>
      <div className="p-8">
        <h1 className="text-2xl font-bold text-slate-900 mb-2">Approval Queue</h1>
        <p className="text-slate-500 mb-8">Review ad requests for your screens.</p>

        {loading ? (
          <div className="text-center py-12 text-slate-400">Loading…</div>
        ) : (
          <div className="space-y-8">
            {/* Pending */}
            <section>
              <h2 className="text-lg font-semibold text-slate-800 mb-4 flex items-center gap-2">
                <Clock size={18} className="text-yellow-500" />
                Pending ({pending.length})
              </h2>
              {pending.length === 0 ? (
                <Card><CardBody className="py-10 text-center text-slate-400 text-sm">All caught up! No pending approvals.</CardBody></Card>
              ) : (
                <div className="grid gap-3">
                  {pending.map((ap) => (
                    <ApprovalRow key={ap.id} ap={ap} onReview={() => { setReviewing(ap); setNotes(""); }} />
                  ))}
                </div>
              )}
            </section>

            {/* Reviewed */}
            {reviewed.length > 0 && (
              <section>
                <h2 className="text-lg font-semibold text-slate-800 mb-4">Recently Reviewed</h2>
                <div className="grid gap-3">
                  {reviewed.slice(0, 10).map((ap) => (
                    <ApprovalRow key={ap.id} ap={ap} />
                  ))}
                </div>
              </section>
            )}
          </div>
        )}

        {/* Review modal */}
        <Modal open={!!reviewing} onClose={() => setReviewing(null)} title="Review Ad Request">
          {reviewing && (
            <div className="space-y-4">
              <div className="rounded-lg bg-slate-50 border border-slate-200 p-4 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">Ad Group</span>
                  <span className="font-medium text-slate-900">{reviewing.adGroupName}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">Screen</span>
                  <span className="font-medium text-slate-900">{reviewing.screenName}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">Duration</span>
                  <span className="font-medium text-slate-900">{reviewing.impressionDurationSec}s per impression</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">Daily Budget</span>
                  <span className="font-medium text-slate-900">{formatCents(reviewing.dailyBudgetCents)}/day</span>
                </div>
              </div>

              <Input
                id="notes"
                label="Notes (optional — shown to advertiser on rejection)"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="e.g. Content doesn't match venue type"
              />

              {error && <p className="text-sm text-red-600">{error}</p>}

              <div className="flex gap-3">
                <Button variant="danger" onClick={() => handleReview("rejected")} loading={saving} className="flex-1">
                  <XCircle size={16} /> Reject
                </Button>
                <Button onClick={() => handleReview("approved")} loading={saving} className="flex-1">
                  <CheckCircle size={16} /> Approve
                </Button>
              </div>
            </div>
          )}
        </Modal>
      </div>
    </DashboardShell>
  );
}

function ApprovalRow({ ap, onReview }: { ap: Approval; onReview?: () => void }) {
  return (
    <Card>
      <CardBody className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div>
            <div className="flex items-center gap-2">
              <p className="font-medium text-slate-900">{ap.adGroupName}</p>
              <Badge status={ap.approvalStatus} />
            </div>
            <p className="text-sm text-slate-500">
              {ap.screenName} · {ap.impressionDurationSec}s · {formatCents(ap.dailyBudgetCents)}/day
            </p>
            <p className="text-xs text-slate-400 mt-0.5">{formatDate(ap.createdAt)}</p>
          </div>
        </div>
        {ap.approvalStatus === "pending" && onReview && (
          <Button size="sm" variant="secondary" onClick={onReview}>Review</Button>
        )}
        {ap.approvalNotes && (
          <p className="text-xs text-slate-500 italic max-w-xs">{ap.approvalNotes}</p>
        )}
      </CardBody>
    </Card>
  );
}
