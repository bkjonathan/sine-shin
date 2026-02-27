import { useTranslation } from "react-i18next";
import { OrderStatus } from "../../../types/order";

export type DashboardStatus = "all" | OrderStatus;

interface DashboardStatusFilterProps {
  value: DashboardStatus;
  onChange: (value: DashboardStatus) => void;
}

const STATUS_COLORS: Record<DashboardStatus, string> = {
  all: "bg-accent-blue",
  pending: "bg-amber-400",
  confirmed: "bg-emerald-400",
  shipping: "bg-sky-400",
  completed: "bg-green-500",
  cancelled: "bg-red-400",
};

const STATUSES: DashboardStatus[] = [
  "all",
  "pending",
  "confirmed",
  "shipping",
  "completed",
  "cancelled",
];

export default function DashboardStatusFilter({
  value,
  onChange,
}: DashboardStatusFilterProps) {
  const { t } = useTranslation();

  return (
    <div className="flex items-center gap-1 flex-wrap">
      {STATUSES.map((status) => (
        <button
          key={status}
          type="button"
          onClick={() => onChange(status)}
          className={`
            flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition-all duration-200 border capitalize
            ${
              value === status
                ? "bg-accent-blue/15 text-accent-blue border-accent-blue/30 shadow-[0_0_8px_rgba(91,127,255,0.1)]"
                : "bg-glass-white border-glass-border text-text-muted hover:bg-glass-white-hover hover:text-text-primary"
            }
          `}
        >
          <span
            className={`w-1.5 h-1.5 rounded-full ${STATUS_COLORS[status]} ${
              value === status ? "opacity-100" : "opacity-50"
            }`}
          />
          {t(`dashboard.status_${status}`, status === "all" ? "All" : status)}
        </button>
      ))}
    </div>
  );
}
