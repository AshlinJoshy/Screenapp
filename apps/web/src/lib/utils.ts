import { clsx, type ClassValue } from "clsx";

export function cn(...inputs: ClassValue[]) {
  return clsx(inputs);
}

export function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    year: "numeric", month: "short", day: "numeric",
  });
}

export function statusColor(status: string): string {
  const map: Record<string, string> = {
    active: "text-green-600 bg-green-50",
    approved: "text-green-600 bg-green-50",
    draft: "text-yellow-600 bg-yellow-50",
    pending: "text-yellow-600 bg-yellow-50",
    paused: "text-orange-600 bg-orange-50",
    rejected: "text-red-600 bg-red-50",
    completed: "text-slate-600 bg-slate-100",
    archived: "text-slate-500 bg-slate-100",
    processing: "text-blue-600 bg-blue-50",
    ready: "text-green-600 bg-green-50",
    failed: "text-red-600 bg-red-50",
  };
  return map[status] ?? "text-slate-600 bg-slate-100";
}
