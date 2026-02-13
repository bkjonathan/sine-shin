import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { convertFileSrc } from "@tauri-apps/api/core";
import { motion } from "framer-motion";

interface ShopData {
  shop_name: string;
  phone: string | null;
  address: string | null;
  logo_path: string | null;
  customer_id_prefix: string | null;
}

// ── Mock data for the liquid dashboard ──
const recentOrders = [
  {
    id: "ORD-001",
    customer: "Sarah Chen",
    amount: "$234.50",
    status: "Completed",
    time: "2 min ago",
  },
  {
    id: "ORD-002",
    customer: "Mike Johnson",
    amount: "$89.00",
    status: "Processing",
    time: "15 min ago",
  },
  {
    id: "ORD-003",
    customer: "Emma Davis",
    amount: "$156.75",
    status: "Completed",
    time: "1 hr ago",
  },
  {
    id: "ORD-004",
    customer: "Alex Kim",
    amount: "$312.00",
    status: "Pending",
    time: "2 hr ago",
  },
  {
    id: "ORD-005",
    customer: "Lisa Wang",
    amount: "$67.25",
    status: "Completed",
    time: "3 hr ago",
  },
];

const statusColors: Record<string, string> = {
  Completed: "text-[var(--color-success)] bg-[var(--color-success)]/10",
  Processing:
    "text-[var(--color-accent-blue)] bg-[var(--color-accent-blue)]/10",
  Pending: "text-[var(--color-warning)] bg-[var(--color-warning)]/10",
};

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

import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useTranslation } from "react-i18next";

// ... existing imports

export default function Dashboard() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { logout } = useAuth();
  const [shop, setShop] = useState<ShopData | null>(null);
  const [logoSrc, setLogoSrc] = useState("");

  useEffect(() => {
    loadShopData();
  }, []);

  const loadShopData = async () => {
    try {
      const data = await invoke<ShopData>("get_shop_settings");
      setShop(data);
      if (data.logo_path) {
        setLogoSrc(convertFileSrc(data.logo_path));
      }
    } catch (err) {
      console.error("Failed to load shop data:", err);
    }
  };

  const handleLogout = () => {
    logout();
    navigate("/login", { replace: true });
  };

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
            <h1 className="text-2xl font-bold text-[var(--color-text-primary)] tracking-tight">
              {shop
                ? t("dashboard.welcome_back", { name: shop.shop_name })
                : t("dashboard.welcome")}
            </h1>
            <p className="text-sm text-[var(--color-text-muted)]">
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
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {[
          {
            label: "dashboard.total_revenue",
            value: "$12,459",
            change: "+12.5%",
            positive: true,
            gradient:
              "from-[var(--color-accent-blue)] to-[var(--color-accent-cyan)]",
          },
          {
            label: "dashboard.total_orders",
            value: "328",
            change: "+8.2%",
            positive: true,
            gradient:
              "from-[var(--color-accent-purple)] to-[var(--color-accent-pink)]",
          },
          {
            label: "dashboard.new_customers",
            value: "64",
            change: "+23.1%",
            positive: true,
            gradient: "from-emerald-500 to-teal-500",
          },
          {
            label: "dashboard.avg_order_value",
            value: "$38.00",
            change: "-2.4%",
            positive: false,
            gradient: "from-amber-500 to-orange-500",
          },
        ].map((stat, i) => (
          <motion.div key={stat.label} variants={itemVariants}>
            <div className="glass-panel p-5 group hover:bg-white/[0.08] transition-colors duration-300">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-medium text-[var(--color-text-muted)] uppercase tracking-wider">
                  {t(stat.label)}
                </span>
                <div
                  className={`w-8 h-8 rounded-lg bg-gradient-to-br ${stat.gradient} flex items-center justify-center opacity-80`}
                >
                  <span className="text-white text-sm font-bold">{i + 1}</span>
                </div>
              </div>
              <p className="text-2xl font-bold text-[var(--color-text-primary)] mb-1">
                {stat.value}
              </p>
              <span
                className={`text-xs font-medium ${
                  stat.positive
                    ? "text-[var(--color-success)]"
                    : "text-[var(--color-error)]"
                }`}
              >
                {stat.change} {t("dashboard.from_last_month")}
              </span>
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
              <h2 className="text-lg font-semibold text-[var(--color-text-primary)]">
                {t("dashboard.recent_activity")}
              </h2>
              <button className="text-xs font-medium text-[var(--color-accent-blue)] hover:text-[var(--color-accent-purple)] transition-colors">
                {t("dashboard.view_all")}
              </button>
            </div>

            <div className="space-y-1">
              {recentOrders.map((order) => (
                <div
                  key={order.id}
                  className="flex items-center justify-between p-3 rounded-xl transition-colors duration-200 hover:bg-white/[0.04] cursor-pointer group"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-xs font-bold text-[var(--color-text-secondary)]">
                      {order.customer
                        .split(" ")
                        .map((n: string) => n[0])
                        .join("")}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-[var(--color-text-primary)] group-hover:text-white transition-colors">
                        {order.customer}
                      </p>
                      <p className="text-xs text-[var(--color-text-muted)]">
                        {order.id}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <span
                      className={`text-xs px-2.5 py-1 rounded-full font-medium ${statusColors[order.status]}`}
                    >
                      {order.status}
                    </span>
                    <span className="text-sm font-semibold text-[var(--color-text-primary)]">
                      {order.amount}
                    </span>
                    <span className="text-xs text-[var(--color-text-muted)] w-16 text-right">
                      {order.time}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </motion.div>

        {/* Quick Actions (1/3 width) */}
        <motion.div variants={itemVariants}>
          <div className="glass-panel p-6">
            <h2 className="text-lg font-semibold text-[var(--color-text-primary)] mb-5">
              {t("dashboard.quick_actions")}
            </h2>
            <div className="space-y-2">
              {[
                {
                  label: "dashboard.actions.new_order",
                  icon: "🛒",
                  desc: "dashboard.actions.new_order_desc",
                },
                {
                  label: "dashboard.actions.add_product",
                  icon: "➕",
                  desc: "dashboard.actions.add_product_desc",
                },
                {
                  label: "dashboard.actions.manage_staff",
                  icon: "👥",
                  desc: "dashboard.actions.manage_staff_desc",
                },
                {
                  label: "dashboard.actions.reports",
                  icon: "📊",
                  desc: "dashboard.actions.reports_desc",
                },
              ].map((action) => (
                <button
                  key={action.label}
                  className="
                    w-full flex items-center gap-3 p-3.5 rounded-xl
                    bg-white/[0.03] border border-white/5
                    text-left transition-all duration-200
                    hover:bg-white/[0.06] hover:border-white/10
                    hover:shadow-[0_4px_16px_rgba(91,127,255,0.06)]
                    group
                  "
                >
                  <span className="text-lg">{action.icon}</span>
                  <div>
                    <p className="text-sm font-medium text-[var(--color-text-primary)] group-hover:text-white transition-colors">
                      {t(action.label)}
                    </p>
                    <p className="text-xs text-[var(--color-text-muted)]">
                      {t(action.desc)}
                    </p>
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
