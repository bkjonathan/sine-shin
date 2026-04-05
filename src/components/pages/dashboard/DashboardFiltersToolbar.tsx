import { useTranslation } from "react-i18next";

import DashboardDateFilter, {
  type DateFilterValue,
} from "./DashboardDateFilter";
import DashboardStatusFilter, {
  type DashboardStatus,
} from "./DashboardStatusFilter";

interface DashboardFiltersToolbarProps {
  filter: DateFilterValue;
  statusFilter: DashboardStatus;
  onFilterChange: (value: DateFilterValue) => void;
  onStatusFilterChange: (value: DashboardStatus) => void;
}

export default function DashboardFiltersToolbar({
  filter,
  statusFilter,
  onFilterChange,
  onStatusFilterChange,
}: DashboardFiltersToolbarProps) {
  const { t } = useTranslation();

  return (
    <div className="mb-4 space-y-2 relative z-20">
      {/* Date filter row */}
      <div className="flex items-center gap-2 flex-wrap">
        <DashboardDateFilter value={filter} onChange={onFilterChange} />
      </div>

      {/* Status filter row */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-[10px] text-text-muted font-semibold uppercase tracking-[0.12em] shrink-0">
          {t("dashboard.order_status")}
        </span>
        <div className="w-px h-3.5 bg-glass-border" />
        <DashboardStatusFilter value={statusFilter} onChange={onStatusFilterChange} />
      </div>
    </div>
  );
}
