import { useTranslation } from "react-i18next";
import { OrderStatus } from "../../../types/order";

export type DashboardStatus = "all" | OrderStatus;

interface DashboardStatusFilterProps {
  value: DashboardStatus;
  onChange: (value: DashboardStatus) => void;
}

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
    <div className="mb-6 glass-panel p-4">
      <div className="flex items-center gap-3">
        <span className="text-xs text-text-muted font-medium min-w-max">
          {t("dashboard.order_status", "Order Status")}:
        </span>
        <div className="flex items-center gap-1.5 flex-wrap">
          {STATUSES.map((status) => (
            <button
              key={status}
              type="button"
              onClick={() => onChange(status)}
              className={`
                px-3 py-1.5 rounded-full text-xs font-medium transition-all duration-200 border capitalize
                ${
                  value === status
                    ? "bg-accent-blue/20 text-accent-blue border-accent-blue/40 shadow-[0_0_12px_rgba(91,127,255,0.15)]"
                    : "bg-glass-white border-glass-border text-text-secondary hover:bg-glass-white-hover hover:text-text-primary"
                }
              `}
            >
              {t(
                `dashboard.status_${status}`,
                status === "all" ? "All" : status,
              )}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
