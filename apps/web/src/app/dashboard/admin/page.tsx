"use client";

import { DashboardShell } from "@/components/layout/DashboardShell";
import { Card, CardBody } from "@/components/ui/Card";
import { BarChart2, Monitor, Users, DollarSign } from "lucide-react";

export default function AdminDashboard() {
  return (
    <DashboardShell allowedRoles={["admin"]}>
      <div className="p-8">
        <h1 className="text-2xl font-bold text-slate-900 mb-2">Admin Dashboard</h1>
        <p className="text-slate-500 mb-8">Platform overview and management.</p>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {[
            { icon: <Monitor size={20} />, label: "Total Screens", color: "indigo" },
            { icon: <Users size={20} />, label: "Total Users", color: "green" },
            { icon: <BarChart2 size={20} />, label: "Active Campaigns", color: "blue" },
            { icon: <DollarSign size={20} />, label: "Platform Revenue", color: "purple" },
          ].map(({ icon, label, color }) => (
            <Card key={label}>
              <CardBody>
                <div className={`inline-flex p-2 rounded-lg mb-3 ${
                  color === "indigo" ? "bg-indigo-50 text-indigo-600" :
                  color === "green" ? "bg-green-50 text-green-600" :
                  color === "blue" ? "bg-blue-50 text-blue-600" :
                  "bg-purple-50 text-purple-600"
                }`}>{icon}</div>
                <p className="text-2xl font-bold text-slate-900">—</p>
                <p className="text-sm text-slate-500 mt-0.5">{label}</p>
              </CardBody>
            </Card>
          ))}
        </div>

        <Card>
          <CardBody className="py-12 text-center text-slate-400">
            <BarChart2 size={48} className="mx-auto mb-4 text-slate-300" />
            <p className="font-medium text-slate-600">Analytics coming in Phase 5</p>
            <p className="text-sm mt-1">Platform revenue, impression totals, and user metrics will appear here.</p>
          </CardBody>
        </Card>
      </div>
    </DashboardShell>
  );
}
