import { useCallback } from "react";
import { motion } from "framer-motion";
import { useTranslation } from "react-i18next";

import { Button } from "../components/ui";
import { IconRefresh } from "../components/icons";
import DashboardFiltersToolbar from "../components/pages/dashboard/DashboardFiltersToolbar";
import DashboardHeader from "../components/pages/dashboard/DashboardHeader";
import DashboardQuickActions from "../components/pages/dashboard/DashboardQuickActions";
import DashboardRecentActivity from "../components/pages/dashboard/DashboardRecentActivity";
import DashboardRecordsModal from "../components/pages/dashboard/DashboardRecordsModal";
import DashboardSkeleton from "../components/pages/dashboard/DashboardSkeleton";
import DashboardStatsGrid from "../components/pages/dashboard/DashboardStatsGrid";
import { DASHBOARD_DEFAULT_FILTER, DASHBOARD_RECORD_TYPES } from "../constants/dashboard";
import {
  pageContainerVariants,
  pageItemVariants,
} from "../constants/animations";
import { useDashboard } from "../hooks/useDashboard";
import { useDashboardData } from "../hooks/useDashboardData";
import type { DashboardRecordType } from "../types/dashboard";

const resolveModalTitleKey = (modalType: DashboardRecordType | null): string => {
  if (modalType === "profit") {
    return "dashboard.profit_records_title";
  }

  if (modalType === "paid_cargo") {
    return "dashboard.paid_cargo_records_title";
  }

  if (modalType === "unpaid_cargo") {
    return "dashboard.unpaid_cargo_records_title";
  }

  if (modalType === "excluded_cargo") {
    return "dashboard.excluded_cargo_records_title";
  }

  return "dashboard.cargo_records_title";
};

export default function Dashboard() {
  const { t } = useTranslation();
  const {
    formatPrice,
    handleLogout,
    navigateInTab,
    navigateToOrder,
    navigateToOrders,
  } = useDashboard();
  const {
    shop,
    logoSrc,
    stats,
    loading,
    filter,
    statusFilter,
    modalType,
    detailRecords,
    detailLoading,
    setFilter,
    setStatusFilter,
    closeModal,
    openDetailsFor,
    reload,
  } = useDashboardData(DASHBOARD_DEFAULT_FILTER);

  const handleCardClick = useCallback(
    async (key: string) => {
      const candidate = key as DashboardRecordType;
      if (!DASHBOARD_RECORD_TYPES.has(candidate)) {
        return;
      }

      await openDetailsFor(candidate);
    },
    [openDetailsFor],
  );

  if (loading) {
    return <DashboardSkeleton />;
  }

  const recentOrders = stats?.recent_orders ?? [];

  return (
    <motion.div
      variants={pageContainerVariants}
      initial="hidden"
      animate="show"
      className="max-w-5xl mx-auto"
    >
      <motion.div variants={pageItemVariants} className="flex items-center justify-between">
        <DashboardHeader
          logoSrc={logoSrc}
          shopName={shop?.shop_name ?? null}
          onLogout={handleLogout}
        />
        <Button
          onClick={reload}
          disabled={loading}
          variant="ghost"
          className="px-4 py-2 text-sm flex items-center gap-2"
        >
          <IconRefresh size={16} strokeWidth={2} className={loading ? "animate-spin" : ""} />
          {t("common.reload_data")}
        </Button>
      </motion.div>

      <motion.div variants={pageItemVariants} className="relative z-20">
        <DashboardFiltersToolbar
          filter={filter}
          statusFilter={statusFilter}
          onFilterChange={setFilter}
          onStatusFilterChange={setStatusFilter}
        />
      </motion.div>

      <motion.div variants={pageItemVariants}>
        <DashboardStatsGrid
          stats={stats}
          formatPrice={formatPrice}
          onCardClick={handleCardClick}
        />
      </motion.div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <motion.div variants={pageItemVariants} className="lg:col-span-2">
          <DashboardRecentActivity
            orders={recentOrders}
            formatPrice={formatPrice}
            onViewAll={navigateToOrders}
            onSelectOrder={navigateToOrder}
          />
        </motion.div>

        <motion.div variants={pageItemVariants}>
          <DashboardQuickActions onNavigate={navigateInTab} />
        </motion.div>
      </div>

      <DashboardRecordsModal
        isOpen={modalType !== null}
        onClose={closeModal}
        title={t(resolveModalTitleKey(modalType))}
        records={detailRecords}
        loading={detailLoading}
        formatPrice={formatPrice}
      />
    </motion.div>
  );
}
