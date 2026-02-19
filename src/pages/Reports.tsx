import { useCallback, useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  BarChart3,
  ShoppingBag,
  TrendingUp,
  Truck,
  Users,
  Wallet,
} from "lucide-react";
import { getOrders } from "../api/orderApi";
import { getCustomers } from "../api/customerApi";
import { OrderStatus, OrderWithCustomer } from "../types/order";
import { Customer } from "../types/customer";
import {
  BreakdownRow,
  CustomerPerformance,
  EnrichedOrder,
  TrendPoint,
} from "../types/report";
import { useAppSettings } from "../context/AppSettingsContext";
import ReportBreakdownBars from "../components/pages/reports/ReportBreakdownBars";
import ReportMetricCard from "../components/pages/reports/ReportMetricCard";
import ReportStatusDonut from "../components/pages/reports/ReportStatusDonut";
import ReportTopCustomersTable from "../components/pages/reports/ReportTopCustomersTable";
import ReportTopOrdersTable from "../components/pages/reports/ReportTopOrdersTable";
import ReportTopSummaryCards from "../components/pages/reports/ReportTopSummaryCards";
import ReportTrendChart from "../components/pages/reports/ReportTrendChart";
import DashboardDateFilter, {
  computeRange,
  type DateFilterValue,
} from "../components/pages/dashobard/DashboardDateFilter";

const DEFAULT_RANGE = computeRange("this_month");
const DEFAULT_FILTER: DateFilterValue = {
  dateFrom: DEFAULT_RANGE.dateFrom,
  dateTo: DEFAULT_RANGE.dateTo,
  dateField: "order_date",
  preset: "this_month",
};

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

export default function Reports() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { formatPrice } = useAppSettings();

  const [orders, setOrders] = useState<OrderWithCustomer[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<DateFilterValue>(DEFAULT_FILTER);

  const handleFilterChange = useCallback((newFilter: DateFilterValue) => {
    setFilter(newFilter);
  }, []);

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
      const profit =
        serviceFeeAmount +
        discountAmount +
        (order.shipping_fee_by_shop ? order.shipping_fee || 0 : 0) +
        (order.delivery_fee_by_shop ? order.delivery_fee || 0 : 0) +
        (order.cargo_fee_by_shop && !order.exclude_cargo_fee
          ? order.cargo_fee || 0
          : 0);
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
        cargoFee: order.exclude_cargo_fee ? 0 : order.cargo_fee || 0,
        timelineDate: parseOrderDate(order),
        city,
        platform,
        customerLabel,
        normalizedStatus: normalizeStatus(order.status),
      };
    });
  }, [orders, customerIndex, t]);

  const filteredOrders = useMemo(() => {
    if (!filter.dateFrom || !filter.dateTo) {
      return [...enrichedOrders];
    }

    const from = new Date(filter.dateFrom + "T00:00:00");
    const to = new Date(filter.dateTo + "T23:59:59");

    return enrichedOrders.filter((order) => {
      // Strictly use the selected date field — no fallback, matching backend SQL behavior
      const dateStr =
        filter.dateField === "created_at" ? order.created_at : order.order_date;
      if (!dateStr) return false;

      const raw = dateStr.trim();
      if (!raw) return false;

      // Parse the date string (handle YYYY-MM-DD, YYYY-MM-DD HH:MM:SS, etc.)
      let parsed: Date | null = null;
      const sqliteMatch = raw.match(
        /^(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?)$/,
      );
      if (sqliteMatch) {
        parsed = new Date(`${sqliteMatch[1]}T${sqliteMatch[2]}`);
      } else {
        parsed = new Date(raw.includes("T") ? raw : raw + "T00:00:00");
      }

      if (!parsed || isNaN(parsed.getTime())) return false;

      return parsed >= from && parsed <= to;
    });
  }, [enrichedOrders, filter]);

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
        acc.totalCargoFee += order.cargoFee;
        acc.totalOrders += 1;
        if (order.normalizedStatus === "completed") acc.completedOrders += 1;
        if (order.normalizedStatus === "cancelled") acc.cancelledOrders += 1;
        return acc;
      },
      {
        totalRevenue: 0,
        totalProfit: 0,
        totalCargoFee: 0,
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
    // Group by day for short ranges, by month for longer ones
    const groupByDay =
      filter.preset === "this_week" || filter.preset === "this_month";
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
        existing.cargoFee += order.cargoFee;
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
        cargoFee: order.cargoFee,
        orders: 1,
      });
    }

    return Array.from(buckets.values()).sort(
      (a, b) => a.timestamp - b.timestamp,
    );
  }, [filteredOrders, filter.preset]);

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
      </motion.div>

      <motion.div variants={itemVariants}>
        <DashboardDateFilter value={filter} onChange={handleFilterChange} />
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
            <ReportMetricCard
              label={t("reports.total_revenue")}
              value={formatPrice(totals.totalRevenue)}
              helperText={t("reports.total_revenue_hint")}
              icon={Wallet}
              gradientClass="from-accent-blue to-accent-cyan"
            />
            <ReportMetricCard
              label={t("reports.total_profit")}
              value={formatPrice(totals.totalProfit)}
              helperText={`${profitMargin.toFixed(1)}% ${t("reports.margin")}`}
              icon={TrendingUp}
              gradientClass="from-emerald-500 to-teal-500"
            />
            <ReportMetricCard
              label={t("reports.total_cargo_fee")}
              value={formatPrice(totals.totalCargoFee)}
              helperText={t("reports.total_cargo_fee_hint")}
              icon={Truck}
              gradientClass="from-sky-500 to-indigo-500"
            />
            <ReportMetricCard
              label={t("reports.total_orders")}
              value={totals.totalOrders.toLocaleString()}
              helperText={`${completionRate.toFixed(1)}% ${t("reports.completed_rate")}`}
              icon={ShoppingBag}
              gradientClass="from-amber-500 to-orange-500"
            />
            <ReportMetricCard
              label={t("reports.avg_order_value")}
              value={formatPrice(avgOrderValue)}
              helperText={t("reports.avg_order_value_hint")}
              icon={BarChart3}
              gradientClass="from-fuchsia-500 to-pink-500"
            />
            <ReportMetricCard
              label={t("reports.avg_profit_per_order")}
              value={formatPrice(avgProfitPerOrder)}
              helperText={`${cancelRate.toFixed(1)}% ${t("reports.cancel_rate")}`}
              icon={Users}
              gradientClass="from-indigo-500 to-violet-500"
            />
            <ReportMetricCard
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
            <ReportTrendChart
              data={trendData}
              formatPrice={formatPrice}
              revenueLabel={t("reports.total_revenue")}
              profitLabel={t("reports.total_profit")}
              cargoLabel={t("reports.total_cargo_fee")}
              ordersLabel={t("reports.total_orders")}
              emptyLabel={t("reports.chart_no_data")}
            />
          </motion.div>

          <motion.div
            variants={itemVariants}
            className="grid grid-cols-1 xl:grid-cols-3 gap-4"
          >
            <div className="xl:col-span-1">
              <ReportStatusDonut
                segments={statusSummary}
                total={totals.totalOrders}
                emptyLabel={t("reports.chart_no_data")}
                title={t("reports.status_mix")}
              />
            </div>
            <div className="xl:col-span-2 grid grid-cols-1 lg:grid-cols-2 gap-4">
              <ReportBreakdownBars
                title={t("reports.city_breakdown")}
                subtitle={t("reports.city_breakdown_hint")}
                rows={cityBreakdown}
                metric="orders"
                formatPrice={formatPrice}
                emptyLabel={t("reports.chart_no_data")}
              />
              <ReportBreakdownBars
                title={t("reports.platform_breakdown")}
                subtitle={t("reports.platform_breakdown_hint")}
                rows={platformBreakdown}
                metric="orders"
                formatPrice={formatPrice}
                emptyLabel={t("reports.chart_no_data")}
              />
            </div>
          </motion.div>

          <motion.div variants={itemVariants}>
            <ReportTopSummaryCards
              topCity={topCity}
              topPlatform={topPlatform}
              topCustomer={topCustomer}
              formatPrice={formatPrice}
            />
          </motion.div>

          <motion.div variants={itemVariants}>
            <ReportTopCustomersTable
              customers={customerPerformance}
              formatPrice={formatPrice}
            />
          </motion.div>

          <motion.div variants={itemVariants}>
            <ReportTopOrdersTable
              orders={topOrdersByProfit}
              formatPrice={formatPrice}
              onViewOrder={(orderId) => navigate(`/orders/${orderId}`)}
            />
          </motion.div>
        </>
      )}
    </motion.div>
  );
}
