"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { Card, CardBody } from "@/components/ui/Card";
import { campaigns, creatives, type Campaign, type Creative } from "@/lib/api";
import { getToken } from "@/lib/auth";
import { formatCents } from "@/lib/utils";
import { Megaphone, FileVideo, TrendingUp, DollarSign } from "lucide-react";
import { Badge } from "@/components/ui/Badge";

export default function AdvertiserDashboard() {
  const [myCampaigns, setMyCampaigns] = useState<Campaign[]>([]);
  const [myCreatives, setMyCreatives] = useState<Creative[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = getToken();
    if (!token) return;
    Promise.all([
      campaigns.list(token).catch(() => [] as Campaign[]),
      creatives.list(token).catch(() => [] as Creative[]),
    ]).then(([c, cr]) => {
      setMyCampaigns(c);
      setMyCreatives(cr);
      setLoading(false);
    });
  }, []);

  const activeCampaigns = myCampaigns.filter((c) => c.status === "active").length;
  const totalSpend = myCampaigns.reduce((sum, c) => sum + c.totalSpendCents, 0);
  const readyCreatives = myCreatives.filter((c) => c.status === "ready").length;

  return (
    <DashboardShell allowedRoles={["advertiser"]}>
      <div className="p-8">
        <h1 className="text-2xl font-bold text-slate-900 mb-2">Advertiser Dashboard</h1>
        <p className="text-slate-500 mb-8">Manage your campaigns and creative assets.</p>

        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <StatCard icon={<Megaphone size={20} />} label="Total Campaigns" value={myCampaigns.length} color="indigo" />
          <StatCard icon={<TrendingUp size={20} />} label="Active Campaigns" value={activeCampaigns} color="green" />
          <StatCard icon={<FileVideo size={20} />} label="Ready Creatives" value={readyCreatives} color="blue" />
          <StatCard icon={<DollarSign size={20} />} label="Total Spend" value={formatCents(totalSpend)} color="purple" />
        </div>

        <div className="grid lg:grid-cols-2 gap-6">
          {/* Campaigns */}
          <Card>
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
              <h2 className="font-semibold text-slate-900">Recent Campaigns</h2>
              <Link href="/dashboard/advertiser/campaigns" className="text-sm text-indigo-600 hover:underline">View all</Link>
            </div>
            <CardBody className="p-0">
              {loading ? (
                <div className="px-6 py-8 text-center text-slate-400 text-sm">Loading…</div>
              ) : myCampaigns.length === 0 ? (
                <div className="px-6 py-8 text-center">
                  <p className="text-slate-400 text-sm mb-3">No campaigns yet</p>
                  <Link href="/dashboard/advertiser/campaigns" className="text-sm text-indigo-600 font-medium hover:underline">
                    Create your first campaign →
                  </Link>
                </div>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {myCampaigns.slice(0, 5).map((c) => (
                    <li key={c.id} className="px-6 py-3 flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-slate-900">{c.name}</p>
                        <p className="text-xs text-slate-500">{formatCents(c.dailyBudgetCents)}/day · {c.startDate}</p>
                      </div>
                      <Badge status={c.status} />
                    </li>
                  ))}
                </ul>
              )}
            </CardBody>
          </Card>

          {/* Creatives */}
          <Card>
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
              <h2 className="font-semibold text-slate-900">Recent Creatives</h2>
              <Link href="/dashboard/advertiser/creatives" className="text-sm text-indigo-600 hover:underline">View all</Link>
            </div>
            <CardBody className="p-0">
              {loading ? (
                <div className="px-6 py-8 text-center text-slate-400 text-sm">Loading…</div>
              ) : myCreatives.length === 0 ? (
                <div className="px-6 py-8 text-center">
                  <p className="text-slate-400 text-sm mb-3">No creatives uploaded yet</p>
                  <Link href="/dashboard/advertiser/creatives" className="text-sm text-indigo-600 font-medium hover:underline">
                    Upload your first creative →
                  </Link>
                </div>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {myCreatives.slice(0, 5).map((cr) => (
                    <li key={cr.id} className="px-6 py-3 flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-slate-900">{cr.name}</p>
                        <p className="text-xs text-slate-500">{cr.type} · {(cr.fileSizeBytes / 1e6).toFixed(1)} MB</p>
                      </div>
                      <Badge status={cr.status} />
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
    indigo: "bg-indigo-50 text-indigo-600", green: "bg-green-50 text-green-600",
    blue: "bg-blue-50 text-blue-600", purple: "bg-purple-50 text-purple-600",
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
