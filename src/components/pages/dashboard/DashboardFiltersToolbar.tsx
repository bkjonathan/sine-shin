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
    <div className="glass-panel p-3.5 mb-4 space-y-2.5 relative z-20">
      <DashboardDateFilter value={filter} onChange={onFilterChange} />
      <div className="flex items-center gap-2">
        <span className="text-[10px] text-text-muted font-medium uppercase tracking-wider shrink-0">
          {t("dashboard.order_status")}
        </span>
        <div className="w-px h-4 bg-glass-border" />
        <DashboardStatusFilter value={statusFilter} onChange={onStatusFilterChange} />
      </div>
    </div>
  );
}
