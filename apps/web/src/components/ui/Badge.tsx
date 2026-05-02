import { cn, statusColor } from "@/lib/utils";

export function Badge({ status, label }: { status: string; label?: string }) {
  return (
    <span className={cn("inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium", statusColor(status))}>
      {label ?? status}
    </span>
  );
}
