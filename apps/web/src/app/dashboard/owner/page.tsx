"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { Card, CardBody } from "@/components/ui/Card";
import { screens, approvals, type Screen, type Approval } from "@/lib/api";
import { getToken } from "@/lib/auth";
import { Monitor, CheckSquare, DollarSign, Activity } from "lucide-react";

export default function OwnerDashboard() {
  const [myScreens, setMyScreens] = useState<Screen[]>([]);
  const [pendingApprovals, setPendingApprovals] = useState<Approval[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = getToken();
    if (!token) return;
    Promise.all([
      screens.list(token).catch(() => [] as Screen[]),
      approvals.list(token).catch(() => [] as Approval[]),
    ]).then(([s, a]) => {
      setMyScreens(s);
      setPendingApprovals(a.filter((ap) => ap.approvalStatus === "pending"));
      setLoading(false);
    });
  }, []);

  const activeScreens = myScreens.filter((s) => s.isActive).length;

  return (
    <DashboardShell allowedRoles={["owner"]}>
      <div className="p-8">
        <h1 className="text-2xl font-bold text-slate-900 mb-2">Owner Dashboard</h1>
        <p className="text-slate-500 mb-8">Manage your screens and review ad requests.</p>

        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <StatCard icon={<Monitor size={20} />} label="Total Screens" value={myScreens.length} color="indigo" />
          <StatCard icon={<Activity size={20} />} label="Active Screens" value={activeScreens} color="green" />
          <StatCard icon={<CheckSquare size={20} />} label="Pending Approvals" value={pendingApprovals.length} color="yellow" />
          <StatCard icon={<DollarSign size={20} />} label="Revenue (30d)" value="—" color="purple" />
        </div>

        {/* Pending Approvals */}
        <div className="grid lg:grid-cols-2 gap-6">
          <Card>
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
              <h2 className="font-semibold text-slate-900">Pending Approvals</h2>
              <Link href="/dashboard/owner/approvals" className="text-sm text-indigo-600 hover:underline">
                View all
              </Link>
            </div>
            <CardBody className="p-0">
              {loading ? (
                <div className="px-6 py-8 text-center text-slate-400 text-sm">Loading…</div>
              ) : pendingApprovals.length === 0 ? (
                <div className="px-6 py-8 text-center text-slate-400 text-sm">No pending approvals</div>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {pendingApprovals.slice(0, 5).map((ap) => (
                    <li key={ap.id} className="px-6 py-3 flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-slate-900">{ap.adGroupName}</p>
                        <p className="text-xs text-slate-500">{ap.screenName}</p>
                      </div>
                      <span className="text-xs text-yellow-600 bg-yellow-50 px-2 py-0.5 rounded-full font-medium">
                        Pending
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </CardBody>
          </Card>

          <Card>
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
              <h2 className="font-semibold text-slate-900">My Screens</h2>
              <Link href="/dashboard/owner/screens" className="text-sm text-indigo-600 hover:underline">
                View all
              </Link>
            </div>
            <CardBody className="p-0">
              {loading ? (
                <div className="px-6 py-8 text-center text-slate-400 text-sm">Loading…</div>
              ) : myScreens.length === 0 ? (
                <div className="px-6 py-8 text-center">
                  <p className="text-slate-400 text-sm mb-3">No screens registered yet</p>
                  <Link href="/dashboard/owner/screens" className="text-sm text-indigo-600 font-medium hover:underline">
                    Register your first screen →
                  </Link>
                </div>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {myScreens.slice(0, 5).map((s) => (
                    <li key={s.id} className="px-6 py-3 flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-slate-900">{s.name}</p>
                        <p className="text-xs text-slate-500">{s.city}, {s.country}</p>
                      </div>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                        s.isActive ? "text-green-600 bg-green-50" : "text-slate-500 bg-slate-100"
                      }`}>
                        {s.isActive ? "Active" : "Inactive"}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </CardBody>
          </Card>
        </div>
      </div>
    </DashboardShell>
  );
}

function StatCard({ icon, label, value, color }: {
  icon: React.ReactNode; label: string; value: number | string; color: string;
}) {
  const colors: Record<string, string> = {
    indigo: "bg-indigo-50 text-indigo-600",
    green: "bg-green-50 text-green-600",
    yellow: "bg-yellow-50 text-yellow-600",
    purple: "bg-purple-50 text-purple-600",
  };
  return (
    <Card>
      <CardBody>
        <div className={`inline-flex p-2 rounded-lg ${colors[color]} mb-3`}>{icon}</div>
        <p className="text-2xl font-bold text-slate-900">{value}</p>
        <p className="text-sm text-slate-500 mt-0.5">{label}</p>
      </CardBody>
    </Card>
  );
}
