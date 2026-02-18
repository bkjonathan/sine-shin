import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { convertFileSrc } from "@tauri-apps/api/core";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useTranslation } from "react-i18next";
import { useAppSettings } from "../context/AppSettingsContext";
import { DollarSign, ShoppingBag, Users, TrendingUp, Truck } from "lucide-react";

interface ShopData {
  shop_name: string;
  phone: string | null;
  address: string | null;
  logo_path: string | null;
  customer_id_prefix: string | null;
}

interface OrderWithCustomer {
  id: number;
  order_id: string | null;
  customer_id: number | null;
  customer_name: string | null;
  total_price: number;
  // ... other fields if needed for display
  created_at: string | null;
  first_product_url: string | null;
  service_fee: number;
  service_fee_type: string;
}

interface DashboardStats {
  total_revenue: number;
  total_profit: number;
  total_cargo_fee: number;
  total_orders: number;
  total_customers: number;
  recent_orders: OrderWithCustomer[];
}

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

export default function Dashboard() {
  const { t } = useTranslation();
  const { formatPrice } = useAppSettings();
  const navigate = useNavigate();
  const { logout } = useAuth();
  const [shop, setShop] = useState<ShopData | null>(null);
  const [logoSrc, setLogoSrc] = useState("");
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const [shopData, dashboardStats] = await Promise.all([
        invoke<ShopData>("get_shop_settings"),
        invoke<DashboardStats>("get_dashboard_stats"),
      ]);

      setShop(shopData);
      setStats(dashboardStats);

      if (shopData.logo_path) {
        setLogoSrc(convertFileSrc(shopData.logo_path));
      }
    } catch (err) {
      console.error("Failed to load dashboard data:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    logout();
    navigate("/login", { replace: true });
  };

  if (loading) {
    return (
      <div className="p-8 text-center text-text-muted">
        Loading dashboard...
      </div>
    );
  }

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="show"
      className="max-w-5xl mx-auto"
    >
      {/* ── Welcome Header ── */}
      <motion.div
        variants={itemVariants}
        className="mb-8 flex items-center justify-between"
      >
        <div className="flex items-center gap-4">
          {logoSrc && (
            <div className="w-12 h-12 rounded-2xl overflow-hidden glass-panel p-1.5 flex items-center justify-center">
              <img
                src={logoSrc}
                alt="Shop logo"
                className="w-full h-full object-contain rounded-xl"
              />
            </div>
          )}
          <div>
            <h1 className="text-2xl font-bold text-text-primary tracking-tight">
              {shop
                ? t("dashboard.welcome_back", { name: shop.shop_name })
                : t("dashboard.welcome")}
            </h1>
            <p className="text-sm text-text-muted">
              {t("dashboard.happening_today")}
            </p>
          </div>
        </div>

        <button
          onClick={handleLogout}
          className="btn-liquid btn-liquid-ghost text-sm px-4 py-2"
        >
          {t("app.logout")}
        </button>
      </motion.div>

      {/* ── Stats Grid ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4 mb-6">
        {[
          {
            label: "dashboard.total_revenue",
            value: stats ? formatPrice(stats.total_revenue) : "-",
            change: "", // You could calculate this if you had historical data
            positive: true,
            gradient: "from-accent-blue to-accent-cyan",
            icon: DollarSign,
          },
          {
            label: "dashboard.total_orders",
            value: stats ? stats.total_orders.toString() : "-",
            change: "",
            positive: true,
            gradient: "from-accent-purple to-accent-pink",
            icon: ShoppingBag,
          },
          {
            label: "dashboard.total_customers",
            value: stats ? stats.total_customers.toString() : "-",
            change: "",
            positive: true,
            gradient: "from-emerald-500 to-teal-500",
            icon: Users,
          },
          {
            label: "dashboard.total_profit",
            value: stats ? formatPrice(stats.total_profit) : "-",
            change: "",
            positive: true,
            gradient: "from-amber-500 to-orange-500",
            icon: TrendingUp,
          },
          {
            label: "dashboard.total_cargo_fee",
            value: stats ? formatPrice(stats.total_cargo_fee) : "-",
            change: "",
            positive: true,
            gradient: "from-sky-500 to-indigo-500",
            icon: Truck,
          },
        ].map((stat) => (
          <motion.div key={stat.label} variants={itemVariants}>
            <div className="glass-panel p-5 group hover:bg-white/8 transition-colors duration-300">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-medium text-text-muted uppercase tracking-wider">
                  {t(stat.label)}
                </span>
                <div
                  className={`w-8 h-8 rounded-lg bg-linear-to-br ${stat.gradient} flex items-center justify-center opacity-80`}
                >
                  <stat.icon className="text-white w-5 h-5" />
                </div>
              </div>
              <p className="text-2xl font-bold text-text-primary mb-1">
                {stat.value}
              </p>
              {/* <span
                className={`text-xs font-medium ${
                  stat.positive
                    ? "text-[var(--color-success)]"
                    : "text-[var(--color-error)]"
                }`}
              >
                {stat.change} {t("dashboard.from_last_month")}
              </span> */}
            </div>
          </motion.div>
        ))}
      </div>

      {/* ── Two-column bottom section ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Recent Activity (2/3 width) */}
        <motion.div variants={itemVariants} className="lg:col-span-2">
          <div className="glass-panel p-6">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-semibold text-text-primary">
                {t("dashboard.recent_activity")}
              </h2>
              <button
                onClick={() => navigate("/orders")}
                className="text-xs font-medium text-accent-blue hover:text-accent-purple transition-colors"
              >
                {t("dashboard.view_all")}
              </button>
            </div>

            <div className="space-y-1">
              {stats?.recent_orders.map((order) => (
                <div
                  key={order.id}
                  onClick={() => navigate(`/orders/${order.id}`)}
                  className="flex items-center justify-between p-3 rounded-xl transition-colors duration-200 hover:bg-white/4 cursor-pointer group"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-xs font-bold text-text-secondary">
                      {order.customer_name
                        ? order.customer_name
                            .split(" ")
                            .map((n: string) => n[0])
                            .join("")
                            .toUpperCase()
                            .slice(0, 2)
                        : "?"}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-text-primary group-hover:text-white transition-colors">
                        {order.customer_name || t("common.unknown_customer")}
                      </p>
                      <p className="text-xs text-text-muted">
                        {order.order_id}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    {/* Service Fee Display */}
                    <div className="flex flex-col items-end mr-2">
                      <span className="text-xs text-text-muted">
                        {t("dashboard.service_fee")}
                      </span>
                      <span className="text-sm font-medium text-text-primary">
                        {(() => {
                          const fee = order.service_fee || 0;
                          if (order.service_fee_type === "percent") {
                            // For percentage, we need to calculate based on total product price
                            // But we don't have raw product price sum here easily available unless we pass it
                            // In models.rs, total_price is sum(price * qty).
                            // So fee amount = total_price * (fee / 100)
                            // Wait, total_price in OrderWithCustomer is already calculated.
                            // Let's assume total_price is the base for percentage calculation.
                            return formatPrice(order.total_price * (fee / 100));
                          }
                          return formatPrice(fee);
                        })()}
                      </span>
                    </div>

                    {/* Price Display */}
                    <div className="flex flex-col items-end mr-2">
                      <span className="text-xs text-text-muted">
                        {t("dashboard.price")}
                      </span>
                      <span className="text-sm font-semibold text-text-primary">
                        {formatPrice(order.total_price)}
                      </span>
                    </div>

                    {/* Date Display */}
                    <div className="flex flex-col items-end w-24">
                      <span className="text-xs text-text-muted">
                        {t("dashboard.order_date")}
                      </span>
                      <span className="text-xs text-text-muted text-right">
                        {order.created_at
                          ? new Date(order.created_at).toLocaleDateString()
                          : ""}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
              {stats?.recent_orders.length === 0 && (
                <div className="text-center py-8 text-text-muted text-sm">
                  {t("dashboard.no_recent_orders")}
                </div>
              )}
            </div>
          </div>
        </motion.div>

        {/* Quick Actions (1/3 width) */}
        <motion.div variants={itemVariants}>
          <div className="glass-panel p-6">
            <h2 className="text-lg font-semibold text-text-primary mb-5">
              {t("dashboard.quick_actions")}
            </h2>
            <div className="space-y-2">
              {[
                {
                  label: "dashboard.actions.new_order",
                  icon: "🛒",
                  desc: "dashboard.actions.new_order_desc",
                  path: "/orders/new",
                },
                {
                  label: "dashboard.actions.add_product",
                  icon: "➕",
                  desc: "dashboard.actions.add_product_desc",
                  path: "/inventory/new", // check if this route exists or adjust
                },
                {
                  label: "dashboard.actions.manage_staff",
                  icon: "👥",
                  desc: "dashboard.actions.manage_staff_desc",
                  path: "/staff", // check route
                },
                {
                  label: "dashboard.actions.reports",
                  icon: "📊",
                  desc: "dashboard.actions.reports_desc",
                  path: "/reports", // check route
                },
              ].map((action) => (
                <button
                  key={action.label}
                  onClick={() => navigate(action.path)}
                  className="
                    w-full flex items-center gap-3 p-3.5 rounded-xl
                    bg-white/3 border border-white/5
                    text-left transition-all duration-200
                    hover:bg-white/6 hover:border-white/10
                    hover:shadow-[0_4px_16px_rgba(91,127,255,0.06)]
                    group
                  "
                >
                  <span className="text-lg">{action.icon}</span>
                  <div>
                    <p className="text-sm font-medium text-text-primary group-hover:text-white transition-colors">
                      {t(action.label)}
                    </p>
                    <p className="text-xs text-text-muted">{t(action.desc)}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </motion.div>
      </div>
    </motion.div>
  );
}
