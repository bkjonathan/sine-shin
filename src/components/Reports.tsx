import { useEffect, useId, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  BarChart3,
  Building2,
  Globe,
  MapPin,
  ShoppingBag,
  TrendingUp,
  Users,
  Wallet,
} from "lucide-react";
import { getOrders } from "../api/orderApi";
import { getCustomers } from "../api/customerApi";
import { OrderStatus, OrderWithCustomer } from "../types/order";
import { Customer } from "../types/customer";
import { useAppSettings } from "../context/AppSettingsContext";
import { formatDate } from "../utils/date";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  BarChart as RechartsBarChart,
  Bar,
  PieChart as RechartsPieChart,
  Pie,
  Cell,
} from "recharts";

type RangeKey = "7d" | "30d" | "90d" | "all";

interface EnrichedOrder extends OrderWithCustomer {
  revenue: number;
  serviceFeeAmount: number;
  discountAmount: number;
  profit: number;
  timelineDate: Date | null;
  city: string;
  platform: string;
  customerLabel: string;
  normalizedStatus: OrderStatus | "unknown";
}

interface TrendPoint {
  key: string;
  label: string;
  timestamp: number;
  revenue: number;
  profit: number;
  orders: number;
}

interface BreakdownRow {
  name: string;
  orders: number;
  revenue: number;
  profit: number;
}

interface CustomerPerformance {
  key: string;
  name: string;
  city: string;
  platform: string;
  orders: number;
  revenue: number;
  profit: number;
}

const RANGE_OPTIONS: Array<{ value: RangeKey; labelKey: string }> = [
  { value: "7d", labelKey: "reports.range_7d" },
  { value: "30d", labelKey: "reports.range_30d" },
  { value: "90d", labelKey: "reports.range_90d" },
  { value: "all", labelKey: "reports.range_all" },
];

const containerVariants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.05 },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 12 },
  show: {
    opacity: 1,
    y: 0,
    transition: { type: "spring" as const, stiffness: 300, damping: 24 },
  },
};

const STATUS_COLORS: Record<OrderStatus | "unknown", string> = {
  pending: "#fbbf24",
  confirmed: "#38bdf8",
  shipping: "#818cf8",
  completed: "#34d399",
  cancelled: "#f87171",
  unknown: "#94a3b8",
};

const getStatusLabelKey = (status: OrderStatus | "unknown") => {
  switch (status) {
    case "pending":
      return "orders.status_pending";
    case "confirmed":
      return "orders.status_confirmed";
    case "shipping":
      return "orders.status_shipping";
    case "completed":
      return "orders.status_completed";
    case "cancelled":
      return "orders.status_cancelled";
    default:
      return "orders.status_unknown";
  }
};

const parseOrderDate = (order: OrderWithCustomer): Date | null => {
  const parseDateValue = (value?: string | null): Date | null => {
    if (!value) return null;

    const raw = value.trim();
    if (!raw) return null;

    // Handle SQLite datetime format (YYYY-MM-DD HH:MM:SS)
    const sqliteDateTimeMatch = raw.match(
      /^(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?)$/,
    );
    if (sqliteDateTimeMatch) {
      const parsed = new Date(
        `${sqliteDateTimeMatch[1]}T${sqliteDateTimeMatch[2]}`,
      );
      if (!Number.isNaN(parsed.getTime())) {
        return parsed;
      }
    }

    // Handle DD-MM-YYYY or DD/MM/YYYY
    const dmyDateMatch = raw.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
    if (dmyDateMatch) {
      const [, day, month, year] = dmyDateMatch;
      const parsed = new Date(
        `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}T00:00:00`,
      );
      if (!Number.isNaN(parsed.getTime())) {
        return parsed;
      }
    }

    // Handle standard ISO or YYYY-MM-DD
    const parsed = new Date(raw);
    if (!Number.isNaN(parsed.getTime())) return parsed;

    return null;
  };

  const date =
    parseDateValue(order.order_date) ?? parseDateValue(order.created_at);

  if (!date) {
    console.warn("Failed to parse date for order:", order.id, order.order_id, {
      order_date: order.order_date,
      created_at: order.created_at,
    });
  }

  return date;
};

const calculateServiceFeeAmount = (order: OrderWithCustomer): number => {
  if (order.service_fee_type === "percent") {
    return ((order.total_price || 0) * (order.service_fee || 0)) / 100;
  }
  return order.service_fee || 0;
};

const normalizeStatus = (status?: OrderStatus): OrderStatus | "unknown" => {
  if (
    status === "pending" ||
    status === "confirmed" ||
    status === "shipping" ||
    status === "completed" ||
    status === "cancelled"
  ) {
    return status;
  }
  return "unknown";
};

const safeValue = (value?: string | null) => value?.trim() || "";

function MetricCard({
  label,
  value,
  helperText,
  icon: Icon,
  gradientClass,
}: {
  label: string;
  value: string;
  helperText?: string;
  icon: typeof Wallet;
  gradientClass: string;
}) {
  return (
    <div className="glass-panel p-5">
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs uppercase tracking-wider text-text-muted">
          {label}
        </p>
        <div
          className={`h-9 w-9 rounded-xl bg-linear-to-br ${gradientClass} flex items-center justify-center`}
        >
          <Icon size={18} className="text-white" />
        </div>
      </div>
      <p className="text-2xl font-bold text-text-primary">{value}</p>
      {helperText ? (
        <p className="mt-1 text-xs text-text-muted">{helperText}</p>
      ) : null}
    </div>
  );
}

function TrendChart({
  data,
  formatPrice,
  revenueLabel,
  profitLabel,
  ordersLabel,
  emptyLabel,
}: {
  data: TrendPoint[];
  formatPrice: (amount: number) => string;
  revenueLabel: string;
  profitLabel: string;
  ordersLabel: string;
  emptyLabel: string;
}) {
  if (data.length === 0) {
    return (
      <div className="h-[320px] flex items-center justify-center text-sm text-text-muted">
        {emptyLabel}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="h-[320px]">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={data}
            margin={{ top: 8, right: 12, left: 0, bottom: 8 }}
            aria-label={`${revenueLabel} and ${profitLabel} trend`}
          >
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="rgba(255,255,255,0.12)"
            />
            <XAxis
              dataKey="label"
              tick={{ fill: "rgba(255,255,255,0.7)", fontSize: 11 }}
              axisLine={{ stroke: "rgba(255,255,255,0.2)" }}
              tickLine={{ stroke: "rgba(255,255,255,0.2)" }}
            />
            <YAxis
              tick={{ fill: "rgba(255,255,255,0.65)", fontSize: 11 }}
              axisLine={{ stroke: "rgba(255,255,255,0.2)" }}
              tickLine={{ stroke: "rgba(255,255,255,0.2)" }}
              tickFormatter={(value) => formatPrice(Number(value) || 0)}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: "rgba(12, 12, 28, 0.92)",
                border: "1px solid rgba(255,255,255,0.16)",
                borderRadius: "12px",
                color: "#fff",
              }}
              formatter={(value, name) => [
                formatPrice(Number(value) || 0),
                name === "revenue"
                  ? revenueLabel
                  : name === "profit"
                    ? profitLabel
                    : ordersLabel,
              ]}
              labelStyle={{ color: "rgba(255,255,255,0.85)" }}
            />
            <Line
              type="monotone"
              dataKey="revenue"
              name="revenue"
              stroke="#5b7fff"
              strokeWidth={2.6}
              dot={{ r: 3, strokeWidth: 0 }}
              activeDot={{ r: 5 }}
            />
            <Line
              type="monotone"
              dataKey="profit"
              name="profit"
              stroke="#34d399"
              strokeWidth={2.6}
              dot={{ r: 3, strokeWidth: 0 }}
              activeDot={{ r: 5 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="flex items-center gap-5 text-xs text-text-secondary">
        <span className="inline-flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full bg-[#5b7fff]" />
          {revenueLabel}
        </span>
        <span className="inline-flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full bg-[#34d399]" />
          {profitLabel}
        </span>
      </div>
    </div>
  );
}

function BreakdownBars({
  title,
  subtitle,
  rows,
  metric,
  formatPrice,
  emptyLabel,
}: {
  title: string;
  subtitle: string;
  rows: BreakdownRow[];
  metric: "orders" | "profit";
  formatPrice: (amount: number) => string;
  emptyLabel: string;
}) {
  const gradientId = useId().replace(/:/g, "");
  const chartData = rows.map((row) => ({
    name: row.name,
    value: metric === "orders" ? row.orders : row.profit,
  }));

  return (
    <div className="glass-panel p-5">
      <div className="mb-4">
        <h3 className="text-lg font-semibold text-text-primary">{title}</h3>
        <p className="text-sm text-text-muted mt-1">{subtitle}</p>
      </div>

      <div className="space-y-4">
        {rows.length === 0 ? (
          <p className="text-sm text-text-muted">{emptyLabel}</p>
        ) : (
          <>
            <div className="h-[250px]">
              <ResponsiveContainer width="100%" height="100%">
                <RechartsBarChart
                  data={chartData}
                  layout="vertical"
                  margin={{ top: 6, right: 8, left: 4, bottom: 6 }}
                >
                  <defs>
                    <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="0">
                      <stop offset="0%" stopColor="#5b7fff" />
                      <stop offset="100%" stopColor="#06b6d4" />
                    </linearGradient>
                  </defs>
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="rgba(255,255,255,0.12)"
                    horizontal={false}
                  />
                  <XAxis
                    type="number"
                    tick={{ fill: "rgba(255,255,255,0.65)", fontSize: 11 }}
                    axisLine={{ stroke: "rgba(255,255,255,0.2)" }}
                    tickLine={{ stroke: "rgba(255,255,255,0.2)" }}
                    tickFormatter={(value) =>
                      metric === "orders"
                        ? Number(value).toLocaleString()
                        : formatPrice(Number(value) || 0)
                    }
                  />
                  <YAxis
                    type="category"
                    dataKey="name"
                    width={95}
                    tick={{ fill: "rgba(255,255,255,0.7)", fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "rgba(12, 12, 28, 0.92)",
                      border: "1px solid rgba(255,255,255,0.16)",
                      borderRadius: "12px",
                    }}
                    formatter={(value) =>
                      metric === "orders"
                        ? Number(value).toLocaleString()
                        : formatPrice(Number(value) || 0)
                    }
                  />
                  <Bar
                    dataKey="value"
                    fill={`url(#${gradientId})`}
                    radius={[0, 6, 6, 0]}
                  />
                </RechartsBarChart>
              </ResponsiveContainer>
            </div>

            <div className="space-y-2">
              {rows.slice(0, 3).map((row) => (
                <div
                  key={row.name}
                  className="flex items-center justify-between text-sm"
                >
                  <span className="text-text-secondary truncate pr-3">
                    {row.name}
                  </span>
                  <span className="text-text-primary">
                    {metric === "orders"
                      ? row.orders.toLocaleString()
                      : formatPrice(row.profit)}
                  </span>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function StatusDonut({
  segments,
  total,
  emptyLabel,
  title,
}: {
  segments: Array<{ key: string; label: string; value: number; color: string }>;
  total: number;
  emptyLabel: string;
  title: string;
}) {
  if (segments.length === 0 || total === 0) {
    return (
      <div className="glass-panel p-5 h-full">
        <h3 className="text-lg font-semibold text-text-primary">{title}</h3>
        <p className="text-sm text-text-muted mt-1">{emptyLabel}</p>
      </div>
    );
  }

  return (
    <div className="glass-panel p-5 h-full">
      <h3 className="text-lg font-semibold text-text-primary mb-5">{title}</h3>
      <div className="flex flex-col xl:flex-row xl:items-center gap-5">
        <div className="relative h-[220px] w-[220px] mx-auto xl:mx-0">
          <ResponsiveContainer width="100%" height="100%">
            <RechartsPieChart>
              <Pie
                data={segments}
                dataKey="value"
                nameKey="label"
                innerRadius={56}
                outerRadius={86}
                strokeWidth={2}
                stroke="rgba(10, 10, 26, 0.75)"
              >
                {segments.map((segment) => (
                  <Cell key={segment.key} fill={segment.color} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{
                  backgroundColor: "rgba(12, 12, 28, 0.92)",
                  border: "1px solid rgba(255,255,255,0.16)",
                  borderRadius: "12px",
                }}
                formatter={(value) => Number(value).toLocaleString()}
              />
            </RechartsPieChart>
          </ResponsiveContainer>

          <div className="absolute inset-[30%] rounded-full glass-panel flex flex-col items-center justify-center text-center px-2">
            <p className="text-xs text-text-muted">Total</p>
            <p className="text-lg font-bold text-text-primary">
              {total.toLocaleString()}
            </p>
          </div>
        </div>

        <div className="space-y-2 text-sm flex-1">
          {segments.map((segment) => (
            <div
              key={segment.key}
              className="flex items-center justify-between gap-2"
            >
              <span className="inline-flex items-center gap-2 text-text-secondary">
                <span
                  className="h-2.5 w-2.5 rounded-full"
                  style={{ backgroundColor: segment.color }}
                />
                {segment.label}
              </span>
              <span className="text-text-primary">
                {segment.value.toLocaleString()}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function Reports() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { formatPrice } = useAppSettings();

  const [orders, setOrders] = useState<OrderWithCustomer[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState<RangeKey>("all");

  useEffect(() => {
    const loadData = async () => {
      try {
        setLoading(true);
        console.log("Loading reports data...");
        const [orderData, customerData] = await Promise.all([
          getOrders(),
          getCustomers(),
        ]);
        console.log("Reports data loaded:", {
          ordersCount: orderData.length,
          customersCount: customerData.length,
        });
        setOrders(orderData);
        setCustomers(customerData);
      } catch (error) {
        console.error("Failed to load reports data:", error);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, []);

  const customerIndex = useMemo(() => {
    const map = new Map<number, Customer>();
    for (const customer of customers) {
      map.set(customer.id, customer);
    }
    return map;
  }, [customers]);

  const enrichedOrders = useMemo<EnrichedOrder[]>(() => {
    return orders.map((order) => {
      const customer = order.customer_id
        ? customerIndex.get(order.customer_id)
        : undefined;
      const serviceFeeAmount = calculateServiceFeeAmount(order);
      const discountAmount = order.product_discount || 0;
      const profit = serviceFeeAmount + discountAmount;
      const city = safeValue(customer?.city) || t("common.others");
      const platform =
        safeValue(customer?.platform) ||
        safeValue(order.order_from) ||
        t("common.others");
      const customerLabel =
        safeValue(order.customer_name) ||
        safeValue(customer?.name) ||
        t("common.na");

      return {
        ...order,
        revenue: order.total_price || 0,
        serviceFeeAmount,
        discountAmount,
        profit,
        timelineDate: parseOrderDate(order),
        city,
        platform,
        customerLabel,
        normalizedStatus: normalizeStatus(order.status),
      };
    });
  }, [orders, customerIndex, t]);

  const filteredOrders = useMemo(() => {
    if (range === "all") {
      return [...enrichedOrders];
    }

    const rangeDays = Number.parseInt(range.replace("d", ""), 10);
    const cutoff = Date.now() - rangeDays * 24 * 60 * 60 * 1000;

    return enrichedOrders.filter((order) => {
      if (!order.timelineDate) return false;
      return order.timelineDate.getTime() >= cutoff;
    });
  }, [enrichedOrders, range]);

  const sortedOrders = useMemo(() => {
    return [...filteredOrders].sort((a, b) => {
      const aTime = a.timelineDate?.getTime() ?? 0;
      const bTime = b.timelineDate?.getTime() ?? 0;
      if (aTime !== bTime) {
        return bTime - aTime;
      }
      return b.id - a.id;
    });
  }, [filteredOrders]);

  const totals = useMemo(() => {
    return filteredOrders.reduce(
      (acc, order) => {
        acc.totalRevenue += order.revenue;
        acc.totalProfit += order.profit;
        acc.totalOrders += 1;
        if (order.normalizedStatus === "completed") acc.completedOrders += 1;
        if (order.normalizedStatus === "cancelled") acc.cancelledOrders += 1;
        return acc;
      },
      {
        totalRevenue: 0,
        totalProfit: 0,
        totalOrders: 0,
        completedOrders: 0,
        cancelledOrders: 0,
      },
    );
  }, [filteredOrders]);

  const avgOrderValue =
    totals.totalOrders > 0 ? totals.totalRevenue / totals.totalOrders : 0;
  const avgProfitPerOrder =
    totals.totalOrders > 0 ? totals.totalProfit / totals.totalOrders : 0;
  const completionRate =
    totals.totalOrders > 0
      ? (totals.completedOrders / totals.totalOrders) * 100
      : 0;
  const cancelRate =
    totals.totalOrders > 0
      ? (totals.cancelledOrders / totals.totalOrders) * 100
      : 0;
  const profitMargin =
    totals.totalRevenue > 0
      ? (totals.totalProfit / totals.totalRevenue) * 100
      : 0;

  const trendData = useMemo<TrendPoint[]>(() => {
    const groupByDay = range === "7d" || range === "30d";
    const buckets = new Map<string, TrendPoint>();

    for (const order of filteredOrders) {
      if (!order.timelineDate) continue;

      const date = order.timelineDate;
      const year = date.getFullYear();
      const month = date.getMonth();
      const day = date.getDate();

      const key = groupByDay
        ? `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`
        : `${year}-${String(month + 1).padStart(2, "0")}`;

      const existing = buckets.get(key);
      if (existing) {
        existing.revenue += order.revenue;
        existing.profit += order.profit;
        existing.orders += 1;
        continue;
      }

      const timestamp = groupByDay
        ? new Date(year, month, day).getTime()
        : new Date(year, month, 1).getTime();
      const label = groupByDay
        ? date.toLocaleDateString(undefined, { month: "short", day: "numeric" })
        : date.toLocaleDateString(undefined, {
            month: "short",
            year: "2-digit",
          });

      buckets.set(key, {
        key,
        label,
        timestamp,
        revenue: order.revenue,
        profit: order.profit,
        orders: 1,
      });
    }

    return Array.from(buckets.values()).sort(
      (a, b) => a.timestamp - b.timestamp,
    );
  }, [filteredOrders, range]);

  const cityBreakdown = useMemo<BreakdownRow[]>(() => {
    const map = new Map<string, BreakdownRow>();
    for (const order of filteredOrders) {
      const current = map.get(order.city) || {
        name: order.city,
        orders: 0,
        revenue: 0,
        profit: 0,
      };
      current.orders += 1;
      current.revenue += order.revenue;
      current.profit += order.profit;
      map.set(order.city, current);
    }

    return Array.from(map.values())
      .sort((a, b) => {
        if (b.orders !== a.orders) return b.orders - a.orders;
        return b.profit - a.profit;
      })
      .slice(0, 8);
  }, [filteredOrders]);

  const platformBreakdown = useMemo<BreakdownRow[]>(() => {
    const map = new Map<string, BreakdownRow>();
    for (const order of filteredOrders) {
      const current = map.get(order.platform) || {
        name: order.platform,
        orders: 0,
        revenue: 0,
        profit: 0,
      };
      current.orders += 1;
      current.revenue += order.revenue;
      current.profit += order.profit;
      map.set(order.platform, current);
    }

    return Array.from(map.values())
      .sort((a, b) => {
        if (b.orders !== a.orders) return b.orders - a.orders;
        return b.profit - a.profit;
      })
      .slice(0, 8);
  }, [filteredOrders]);

  const statusSummary = useMemo(() => {
    const map = new Map<OrderStatus | "unknown", number>();

    for (const order of filteredOrders) {
      const count = map.get(order.normalizedStatus) || 0;
      map.set(order.normalizedStatus, count + 1);
    }

    return (
      [
        "pending",
        "confirmed",
        "shipping",
        "completed",
        "cancelled",
        "unknown",
      ] as const
    )
      .map((status) => ({
        key: status,
        label: t(getStatusLabelKey(status)),
        value: map.get(status) || 0,
        color: STATUS_COLORS[status],
      }))
      .filter((row) => row.value > 0);
  }, [filteredOrders, t]);

  const customerPerformance = useMemo<CustomerPerformance[]>(() => {
    const map = new Map<string, CustomerPerformance>();

    for (const order of filteredOrders) {
      const key = order.customer_id
        ? `customer-${order.customer_id}`
        : `name-${order.customerLabel}`;
      const current = map.get(key) || {
        key,
        name: order.customerLabel,
        city: order.city,
        platform: order.platform,
        orders: 0,
        revenue: 0,
        profit: 0,
      };

      current.orders += 1;
      current.revenue += order.revenue;
      current.profit += order.profit;

      map.set(key, current);
    }

    return Array.from(map.values()).sort((a, b) => {
      if (b.profit !== a.profit) return b.profit - a.profit;
      return b.orders - a.orders;
    });
  }, [filteredOrders]);

  const topOrdersByProfit = useMemo(() => {
    return [...sortedOrders]
      .sort((a, b) => {
        if (b.profit !== a.profit) return b.profit - a.profit;
        return b.revenue - a.revenue;
      })
      .slice(0, 12);
  }, [sortedOrders]);

  const highestProfitOrder = topOrdersByProfit[0];
  const topCity = cityBreakdown[0];
  const topPlatform = platformBreakdown[0];
  const topCustomer = customerPerformance[0];

  return (
    <motion.div
      key={loading ? "loading" : "loaded"}
      initial="hidden"
      animate="show"
      variants={containerVariants}
      className="max-w-7xl mx-auto space-y-6"
    >
      <motion.div
        variants={itemVariants}
        className="flex flex-col xl:flex-row xl:items-center xl:justify-between gap-4"
      >
        <div>
          <h1 className="text-2xl font-bold text-text-primary tracking-tight">
            {t("reports.title")}
          </h1>
          <p className="text-sm text-text-muted mt-1">
            {t("reports.subtitle")}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {RANGE_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setRange(option.value)}
              className={`px-4 py-2 rounded-full text-sm font-medium transition-colors border ${
                range === option.value
                  ? "bg-white/15 text-text-primary border-white/25"
                  : "bg-transparent text-text-secondary border-white/10 hover:bg-white/8"
              }`}
            >
              {t(option.labelKey)}
            </button>
          ))}
        </div>
      </motion.div>

      <motion.div variants={itemVariants}>
        <div className="glass-panel p-4 flex items-center gap-3 text-sm">
          <BarChart3 size={18} className="text-accent-blue shrink-0" />
          <p className="text-text-secondary">
            {t("reports.filtered_note", {
              count: filteredOrders.length,
              total: enrichedOrders.length,
            })}
          </p>
        </div>
      </motion.div>

      {loading ? (
        <motion.div variants={itemVariants}>
          <div className="glass-panel p-16 flex justify-center">
            <div className="w-10 h-10 border-2 border-glass-border border-t-accent-blue rounded-full animate-spin" />
          </div>
        </motion.div>
      ) : filteredOrders.length === 0 ? (
        <motion.div variants={itemVariants}>
          <div className="glass-panel p-14 text-center">
            <h2 className="text-xl font-semibold text-text-primary">
              {t("reports.no_data")}
            </h2>
            <p className="text-sm text-text-muted mt-2">
              {t("reports.no_data_hint")}
            </p>
          </div>
        </motion.div>
      ) : (
        <>
          <motion.div
            variants={itemVariants}
            className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4"
          >
            <MetricCard
              label={t("reports.total_revenue")}
              value={formatPrice(totals.totalRevenue)}
              helperText={t("reports.total_revenue_hint")}
              icon={Wallet}
              gradientClass="from-accent-blue to-accent-cyan"
            />
            <MetricCard
              label={t("reports.total_profit")}
              value={formatPrice(totals.totalProfit)}
              helperText={`${profitMargin.toFixed(1)}% ${t("reports.margin")}`}
              icon={TrendingUp}
              gradientClass="from-emerald-500 to-teal-500"
            />
            <MetricCard
              label={t("reports.total_orders")}
              value={totals.totalOrders.toLocaleString()}
              helperText={`${completionRate.toFixed(1)}% ${t("reports.completed_rate")}`}
              icon={ShoppingBag}
              gradientClass="from-amber-500 to-orange-500"
            />
            <MetricCard
              label={t("reports.avg_order_value")}
              value={formatPrice(avgOrderValue)}
              helperText={t("reports.avg_order_value_hint")}
              icon={BarChart3}
              gradientClass="from-fuchsia-500 to-pink-500"
            />
            <MetricCard
              label={t("reports.avg_profit_per_order")}
              value={formatPrice(avgProfitPerOrder)}
              helperText={`${cancelRate.toFixed(1)}% ${t("reports.cancel_rate")}`}
              icon={Users}
              gradientClass="from-indigo-500 to-violet-500"
            />
            <MetricCard
              label={t("reports.top_profit_order")}
              value={
                highestProfitOrder
                  ? formatPrice(highestProfitOrder.profit)
                  : "-"
              }
              helperText={
                highestProfitOrder
                  ? `${highestProfitOrder.order_id || highestProfitOrder.id}`
                  : t("common.na")
              }
              icon={TrendingUp}
              gradientClass="from-sky-500 to-blue-500"
            />
          </motion.div>

          <motion.div variants={itemVariants} className="glass-panel p-5">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-text-primary">
                  {t("reports.profit_revenue_trend")}
                </h2>
                <p className="text-sm text-text-muted mt-1">
                  {t("reports.profit_revenue_trend_hint")}
                </p>
              </div>
            </div>
            <TrendChart
              data={trendData}
              formatPrice={formatPrice}
              revenueLabel={t("reports.total_revenue")}
              profitLabel={t("reports.total_profit")}
              ordersLabel={t("reports.total_orders")}
              emptyLabel={t("reports.chart_no_data")}
            />
          </motion.div>

          <motion.div
            variants={itemVariants}
            className="grid grid-cols-1 xl:grid-cols-3 gap-4"
          >
            <div className="xl:col-span-1">
              <StatusDonut
                segments={statusSummary}
                total={totals.totalOrders}
                emptyLabel={t("reports.chart_no_data")}
                title={t("reports.status_mix")}
              />
            </div>
            <div className="xl:col-span-2 grid grid-cols-1 lg:grid-cols-2 gap-4">
              <BreakdownBars
                title={t("reports.city_breakdown")}
                subtitle={t("reports.city_breakdown_hint")}
                rows={cityBreakdown}
                metric="orders"
                formatPrice={formatPrice}
                emptyLabel={t("reports.chart_no_data")}
              />
              <BreakdownBars
                title={t("reports.platform_breakdown")}
                subtitle={t("reports.platform_breakdown_hint")}
                rows={platformBreakdown}
                metric="orders"
                formatPrice={formatPrice}
                emptyLabel={t("reports.chart_no_data")}
              />
            </div>
          </motion.div>

          <motion.div
            variants={itemVariants}
            className="grid grid-cols-1 md:grid-cols-3 gap-4"
          >
            <div className="glass-panel p-5">
              <div className="flex items-center gap-2 mb-2">
                <MapPin size={16} className="text-accent-cyan" />
                <p className="text-sm text-text-muted uppercase tracking-wider">
                  {t("reports.top_city")}
                </p>
              </div>
              <p className="text-xl font-bold text-text-primary">
                {topCity?.name || t("common.na")}
              </p>
              <p className="text-sm text-text-secondary mt-1">
                {topCity
                  ? t("reports.orders_and_profit", {
                      orders: topCity.orders.toLocaleString(),
                      profit: formatPrice(topCity.profit),
                    })
                  : t("reports.chart_no_data")}
              </p>
            </div>

            <div className="glass-panel p-5">
              <div className="flex items-center gap-2 mb-2">
                <Globe size={16} className="text-accent-blue" />
                <p className="text-sm text-text-muted uppercase tracking-wider">
                  {t("reports.top_platform")}
                </p>
              </div>
              <p className="text-xl font-bold text-text-primary">
                {topPlatform?.name || t("common.na")}
              </p>
              <p className="text-sm text-text-secondary mt-1">
                {topPlatform
                  ? t("reports.orders_and_profit", {
                      orders: topPlatform.orders.toLocaleString(),
                      profit: formatPrice(topPlatform.profit),
                    })
                  : t("reports.chart_no_data")}
              </p>
            </div>

            <div className="glass-panel p-5">
              <div className="flex items-center gap-2 mb-2">
                <Building2 size={16} className="text-emerald-400" />
                <p className="text-sm text-text-muted uppercase tracking-wider">
                  {t("reports.top_customer")}
                </p>
              </div>
              <p className="text-xl font-bold text-text-primary truncate">
                {topCustomer?.name || t("common.na")}
              </p>
              <p className="text-sm text-text-secondary mt-1">
                {topCustomer
                  ? t("reports.orders_and_profit", {
                      orders: topCustomer.orders.toLocaleString(),
                      profit: formatPrice(topCustomer.profit),
                    })
                  : t("reports.chart_no_data")}
              </p>
            </div>
          </motion.div>

          <motion.div variants={itemVariants} className="glass-panel p-5">
            <div className="flex items-start justify-between gap-3 mb-4">
              <div>
                <h2 className="text-lg font-semibold text-text-primary">
                  {t("reports.top_customers_title")}
                </h2>
                <p className="text-sm text-text-muted mt-1">
                  {t("reports.top_customers_hint")}
                </p>
              </div>
            </div>

            <div className="overflow-auto">
              <table className="w-full min-w-[840px] text-sm">
                <thead className="text-xs uppercase tracking-wider text-text-muted border-b border-glass-border">
                  <tr>
                    <th className="text-left py-3 px-3">
                      {t("customers.name")}
                    </th>
                    <th className="text-left py-3 px-3">
                      {t("customers.form.city")}
                    </th>
                    <th className="text-left py-3 px-3">
                      {t("customers.form.platform")}
                    </th>
                    <th className="text-right py-3 px-3">
                      {t("reports.total_orders")}
                    </th>
                    <th className="text-right py-3 px-3">
                      {t("reports.total_revenue")}
                    </th>
                    <th className="text-right py-3 px-3">
                      {t("reports.total_profit")}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-glass-border">
                  {customerPerformance.slice(0, 12).map((customer) => (
                    <tr
                      key={customer.key}
                      className="hover:bg-glass-white/40 transition-colors"
                    >
                      <td className="py-3 px-3 text-text-primary font-medium">
                        {customer.name}
                      </td>
                      <td className="py-3 px-3 text-text-secondary">
                        {customer.city}
                      </td>
                      <td className="py-3 px-3 text-text-secondary">
                        {customer.platform}
                      </td>
                      <td className="py-3 px-3 text-right text-text-primary">
                        {customer.orders.toLocaleString()}
                      </td>
                      <td className="py-3 px-3 text-right text-text-primary">
                        {formatPrice(customer.revenue)}
                      </td>
                      <td className="py-3 px-3 text-right text-emerald-400 font-semibold">
                        {formatPrice(customer.profit)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </motion.div>

          <motion.div variants={itemVariants} className="glass-panel p-5">
            <div className="flex items-start justify-between gap-3 mb-4">
              <div>
                <h2 className="text-lg font-semibold text-text-primary">
                  {t("reports.top_orders_title")}
                </h2>
                <p className="text-sm text-text-muted mt-1">
                  {t("reports.top_orders_hint")}
                </p>
              </div>
            </div>

            <div className="overflow-auto">
              <table className="w-full min-w-[980px] text-sm">
                <thead className="text-xs uppercase tracking-wider text-text-muted border-b border-glass-border">
                  <tr>
                    <th className="text-left py-3 px-3">
                      {t("orders.search_key_order_id")}
                    </th>
                    <th className="text-left py-3 px-3">
                      {t("orders.customer")}
                    </th>
                    <th className="text-left py-3 px-3">
                      {t("customers.form.platform")}
                    </th>
                    <th className="text-left py-3 px-3">
                      {t("customers.form.city")}
                    </th>
                    <th className="text-right py-3 px-3">
                      {t("reports.total_revenue")}
                    </th>
                    <th className="text-right py-3 px-3">
                      {t("reports.total_profit")}
                    </th>
                    <th className="text-right py-3 px-3">{t("orders.date")}</th>
                    <th className="text-right py-3 px-3">
                      {t("account_book.action")}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-glass-border">
                  {topOrdersByProfit.map((order) => (
                    <tr
                      key={order.id}
                      className="hover:bg-glass-white/40 transition-colors"
                    >
                      <td className="py-3 px-3 text-text-primary font-medium">
                        {order.order_id || order.id}
                      </td>
                      <td className="py-3 px-3 text-text-secondary">
                        {order.customerLabel}
                      </td>
                      <td className="py-3 px-3 text-text-secondary">
                        {order.platform}
                      </td>
                      <td className="py-3 px-3 text-text-secondary">
                        {order.city}
                      </td>
                      <td className="py-3 px-3 text-right text-text-primary">
                        {formatPrice(order.revenue)}
                      </td>
                      <td className="py-3 px-3 text-right text-emerald-400 font-semibold">
                        {formatPrice(order.profit)}
                      </td>
                      <td className="py-3 px-3 text-right text-text-secondary">
                        {formatDate(order.timelineDate)}
                      </td>
                      <td className="py-3 px-3 text-right">
                        <button
                          type="button"
                          onClick={() => navigate(`/orders/${order.id}`)}
                          className="btn-liquid btn-liquid-ghost px-3 py-1.5 text-xs"
                        >
                          {t("reports.view_order")}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </motion.div>
        </>
      )}
    </motion.div>
  );
}
