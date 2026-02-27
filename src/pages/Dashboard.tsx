import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { convertFileSrc } from "@tauri-apps/api/core";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useAppSettings } from "../context/AppSettingsContext";
import DashboardHeader from "../components/pages/dashobard/DashboardHeader";
import DashboardQuickActions from "../components/pages/dashobard/DashboardQuickActions";
import DashboardRecentActivity from "../components/pages/dashobard/DashboardRecentActivity";
import DashboardStatsGrid from "../components/pages/dashobard/DashboardStatsGrid";
import DashboardDateFilter, {
  computeRange,
  type DateFilterValue,
} from "../components/pages/dashobard/DashboardDateFilter";
import DashboardStatusFilter, {
  DashboardStatus,
} from "../components/pages/dashobard/DashboardStatusFilter";
import { DashboardStats, ShopData } from "../types/dashboard";

// ── Animation variants ──
const containerVariants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.06 },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 16 },
  show: {
    opacity: 1,
    y: 0,
    transition: { type: "spring" as const, stiffness: 400, damping: 28 },
  },
};

// Default filter: This Month + Order Date
const DEFAULT_RANGE = computeRange("this_month");
const DEFAULT_FILTER: DateFilterValue = {
  dateFrom: DEFAULT_RANGE.dateFrom,
  dateTo: DEFAULT_RANGE.dateTo,
  dateField: "order_date",
  preset: "this_month",
};

// ── Shimmer Loading Skeleton ──
function DashboardSkeleton() {
  return (
    <div className="max-w-5xl mx-auto animate-pulse">
      {/* Header skeleton */}
      <div className="mb-5 flex items-center justify-between">
        <div className="flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-glass-white" />
          <div>
            <div className="h-6 w-56 bg-glass-white rounded-lg mb-1.5" />
          </div>
        </div>
        <div className="w-9 h-9 rounded-xl bg-glass-white" />
      </div>

      {/* Toolbar skeleton */}
      <div className="glass-panel p-3.5 mb-4">
        <div className="flex items-center gap-2">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-6 w-16 bg-glass-white rounded-lg" />
          ))}
          <div className="w-px h-5 bg-glass-border mx-1" />
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-6 w-14 bg-glass-white rounded-lg" />
          ))}
        </div>
      </div>

      {/* Stats skeleton */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-4">
        {[...Array(5)].map((_, i) => (
          <div
            key={i}
            className="rounded-2xl p-4 bg-glass-white border border-glass-border"
          >
            <div className="flex items-center gap-2.5 mb-2.5">
              <div className="w-8 h-8 rounded-xl bg-glass-white-hover" />
              <div className="h-3 w-16 bg-glass-white-hover rounded" />
            </div>
            <div className="h-6 w-24 bg-glass-white-hover rounded" />
          </div>
        ))}
      </div>

      {/* Bottom section skeleton */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <div className="lg:col-span-2 glass-panel p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="h-4 w-28 bg-glass-white-hover rounded" />
            <div className="h-3 w-14 bg-glass-white-hover rounded" />
          </div>
          {[...Array(5)].map((_, i) => (
            <div key={i} className="flex items-center gap-3 p-2.5 mb-1">
              <div className="w-8 h-8 rounded-lg bg-glass-white-hover shrink-0" />
              <div className="flex-1">
                <div className="h-3.5 w-28 bg-glass-white-hover rounded mb-1" />
                <div className="h-2.5 w-16 bg-glass-white-hover rounded" />
              </div>
              <div className="h-3.5 w-20 bg-glass-white-hover rounded" />
              <div className="h-3 w-14 bg-glass-white-hover rounded" />
            </div>
          ))}
        </div>
        <div className="glass-panel p-5">
          <div className="h-4 w-24 bg-glass-white-hover rounded mb-4" />
          <div className="grid grid-cols-2 gap-2.5">
            {[...Array(4)].map((_, i) => (
              <div
                key={i}
                className="flex flex-col items-center gap-2 p-4 rounded-xl bg-glass-white border border-glass-border"
              >
                <div className="w-10 h-10 rounded-xl bg-glass-white-hover" />
                <div className="h-3 w-14 bg-glass-white-hover rounded" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const { formatPrice } = useAppSettings();
  const navigate = useNavigate();
  const { logout } = useAuth();
  const [shop, setShop] = useState<ShopData | null>(null);
  const [logoSrc, setLogoSrc] = useState("");
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<DateFilterValue>(DEFAULT_FILTER);
  const [statusFilter, setStatusFilter] = useState<DashboardStatus>("all");

  const loadData = useCallback(
    async (f: DateFilterValue, s: DashboardStatus) => {
      try {
        setLoading(true);
        const [shopData, dashboardStats] = await Promise.all([
          invoke<ShopData>("get_shop_settings"),
          invoke<DashboardStats>("get_dashboard_stats", {
            dateFrom: f.dateFrom || null,
            dateTo: f.dateTo || null,
            dateField: f.dateField,
            status: s === "all" ? null : s,
          }),
        ]);

        setShop(shopData);
        setStats(dashboardStats);
        setLogoSrc(
          shopData.logo_path ? convertFileSrc(shopData.logo_path) : "",
        );
      } catch (err) {
        console.error("Failed to load dashboard data:", err);
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    void loadData(filter, statusFilter);
  }, [loadData, filter, statusFilter]);

  const handleLogout = useCallback(() => {
    logout();
    navigate("/login", { replace: true });
  }, [logout, navigate]);

  const handleFilterChange = useCallback((newFilter: DateFilterValue) => {
    setFilter(newFilter);
  }, []);

  if (loading) {
    return <DashboardSkeleton />;
  }

  const recentOrders = stats?.recent_orders ?? [];

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="show"
      className="max-w-5xl mx-auto"
    >
      <motion.div variants={itemVariants}>
        <DashboardHeader
          logoSrc={logoSrc}
          shopName={shop?.shop_name ?? null}
          onLogout={handleLogout}
        />
      </motion.div>

      {/* ── Merged Toolbar: Date Filter + Status Filter ── */}
      <motion.div variants={itemVariants}>
        <div className="glass-panel p-3.5 mb-4 space-y-2.5">
          <DashboardDateFilter value={filter} onChange={handleFilterChange} />
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-text-muted font-medium uppercase tracking-wider shrink-0">
              Status
            </span>
            <div className="w-px h-4 bg-glass-border" />
            <DashboardStatusFilter
              value={statusFilter}
              onChange={setStatusFilter}
            />
          </div>
        </div>
      </motion.div>

      <motion.div variants={itemVariants}>
        <DashboardStatsGrid stats={stats} formatPrice={formatPrice} />
      </motion.div>

      {/* ── Two-column bottom section ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <motion.div variants={itemVariants} className="lg:col-span-2">
          <DashboardRecentActivity
            orders={recentOrders}
            formatPrice={formatPrice}
            onViewAll={() => navigate("/orders")}
            onSelectOrder={(id) => navigate(`/orders/${id}`)}
          />
        </motion.div>

        <motion.div variants={itemVariants}>
          <DashboardQuickActions onNavigate={(path) => navigate(path)} />
        </motion.div>
      </div>
    </motion.div>
  );
}
