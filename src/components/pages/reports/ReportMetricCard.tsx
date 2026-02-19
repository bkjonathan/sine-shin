import { LucideIcon } from "lucide-react";

interface ReportMetricCardProps {
  label: string;
  value: string;
  helperText?: string;
  icon: LucideIcon;
  gradientClass: string;
}

export default function ReportMetricCard({
  label,
  value,
  helperText,
  icon: Icon,
  gradientClass,
}: ReportMetricCardProps) {
  return (
    <div className="glass-panel p-5">
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs uppercase tracking-wider text-text-muted">{label}</p>
        <div
          className={`h-9 w-9 rounded-xl bg-linear-to-br ${gradientClass} flex items-center justify-center`}
        >
          <Icon size={18} className="text-white" />
        </div>
      </div>
      <p className="text-2xl font-bold text-text-primary">{value}</p>
      {helperText ? <p className="mt-1 text-xs text-text-muted">{helperText}</p> : null}
    </div>
  );
}
