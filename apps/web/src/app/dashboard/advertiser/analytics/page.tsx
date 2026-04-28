"use client";

import { DashboardShell } from "@/components/layout/DashboardShell";
import { Card, CardBody } from "@/components/ui/Card";
import { BarChart2 } from "lucide-react";

export default function AnalyticsPage() {
  return (
    <DashboardShell allowedRoles={["advertiser"]}>
      <div className="p-8">
        <h1 className="text-2xl font-bold text-slate-900 mb-2">Analytics</h1>
        <p className="text-slate-500 mb-8">Campaign performance and impression data.</p>
        <Card>
          <CardBody className="py-16 text-center text-slate-400">
            <BarChart2 size={48} className="mx-auto mb-4 text-slate-300" />
            <p className="font-medium text-slate-600">Analytics coming in Phase 5</p>
            <p className="text-sm mt-1">Impressions, spend, and CPI trends will appear here once the auction worker is live.</p>
          </CardBody>
        </Card>
      </div>
    </DashboardShell>
  );
}
