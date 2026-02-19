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
import { DashboardStats, ShopData } from "../types/dashboard";

// ── Animation variants ──
const containerVariants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.08 },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  show: {
    opacity: 1,
    y: 0,
    transition: { type: "spring" as const, stiffness: 300, damping: 24 },
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

export default function Dashboard() {
  const { formatPrice } = useAppSettings();
  const navigate = useNavigate();
  const { logout } = useAuth();
  const [shop, setShop] = useState<ShopData | null>(null);
  const [logoSrc, setLogoSrc] = useState("");
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<DateFilterValue>(DEFAULT_FILTER);

  const loadData = useCallback(async (f: DateFilterValue) => {
    try {
      setLoading(true);
      const [shopData, dashboardStats] = await Promise.all([
        invoke<ShopData>("get_shop_settings"),
        invoke<DashboardStats>("get_dashboard_stats", {
          dateFrom: f.dateFrom || null,
          dateTo: f.dateTo || null,
          dateField: f.dateField,
        }),
      ]);

      setShop(shopData);
      setStats(dashboardStats);
      setLogoSrc(shopData.logo_path ? convertFileSrc(shopData.logo_path) : "");
    } catch (err) {
      console.error("Failed to load dashboard data:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData(filter);
  }, [loadData, filter]);

  const handleLogout = useCallback(() => {
    logout();
    navigate("/login", { replace: true });
  }, [logout, navigate]);

  const handleFilterChange = useCallback((newFilter: DateFilterValue) => {
    setFilter(newFilter);
  }, []);

  if (loading) {
    return (
      <div className="p-8 text-center text-text-muted">
        Loading dashboard...
      </div>
    );
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

      <motion.div variants={itemVariants}>
        <DashboardDateFilter value={filter} onChange={handleFilterChange} />
      </motion.div>

      <motion.div variants={itemVariants}>
        <DashboardStatsGrid stats={stats} formatPrice={formatPrice} />
      </motion.div>

      {/* ── Two-column bottom section ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
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
