import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { getOrders } from "../api/orderApi";
import { OrderWithCustomer } from "../types/order";
import { useAppSettings } from "../context/AppSettingsContext";
import { formatDate } from "../utils/date";

const containerVariants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.06 },
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

const calculateServiceFeeAmount = (order: OrderWithCustomer) => {
  if (order.service_fee_type === "percent") {
    return ((order.total_price || 0) * (order.service_fee || 0)) / 100;
  }
  return order.service_fee || 0;
};

export default function AccountBook() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { formatPrice } = useAppSettings();
  const [orders, setOrders] = useState<OrderWithCustomer[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    const loadOrders = async () => {
      try {
        setLoading(true);
        const data = await getOrders();
        setOrders(data);
      } catch (error) {
        console.error("Failed to load account book data:", error);
      } finally {
        setLoading(false);
      }
    };

    loadOrders();
  }, []);

  const rows = useMemo(() => {
    const searchTerm = search.trim().toLowerCase();

    return orders
      .filter((order) => {
        if (!searchTerm) {
          return true;
        }

        return [order.order_id, order.customer_name, order.order_from]
          .filter(Boolean)
          .some((value) => value!.toLowerCase().includes(searchTerm));
      })
      .sort((a, b) => {
        const aTime = a.created_at ? new Date(a.created_at).getTime() : 0;
        const bTime = b.created_at ? new Date(b.created_at).getTime() : 0;
        if (aTime !== bTime) {
          return bTime - aTime;
        }
        return b.id - a.id;
      })
      .map((order) => {
        const serviceFeeAmount = calculateServiceFeeAmount(order);
        const productDiscount = order.product_discount || 0;
        const profit = serviceFeeAmount + productDiscount;

        return {
          order,
          serviceFeeAmount,
          productDiscount,
          profit,
        };
      });
  }, [orders, search]);

  const totals = useMemo(() => {
    return rows.reduce(
      (acc, row) => {
        acc.totalSales += row.order.total_price || 0;
        acc.totalServiceFee += row.serviceFeeAmount;
        acc.totalDiscount += row.productDiscount;
        acc.totalProfit += row.profit;
        return acc;
      },
      {
        totalSales: 0,
        totalServiceFee: 0,
        totalDiscount: 0,
        totalProfit: 0,
      },
    );
  }, [rows]);

  return (
    <motion.div
      initial="hidden"
      animate="show"
      variants={containerVariants}
      className="max-w-6xl mx-auto h-full flex flex-col"
    >
      <motion.div
        variants={itemVariants}
        className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6"
      >
        <div>
          <h1 className="text-2xl font-bold text-text-primary tracking-tight">
            {t("account_book.title")}
          </h1>
          <p className="text-sm text-text-muted mt-1">
            {t("account_book.subtitle")}
          </p>
        </div>
        <div className="relative w-full md:w-72">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <svg
              className="h-4 w-4 text-text-muted"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
              />
            </svg>
          </div>
          <input
            type="text"
            className="input-liquid pl-10 w-full"
            placeholder={t("account_book.search_placeholder")}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
      </motion.div>

      <motion.div
        variants={itemVariants}
        className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6"
      >
        <div className="glass-panel p-4">
          <p className="text-xs uppercase tracking-wider text-text-muted">
            {t("account_book.total_orders")}
          </p>
          <p className="text-xl font-bold text-text-primary mt-2">
            {rows.length.toLocaleString()}
          </p>
        </div>
        <div className="glass-panel p-4">
          <p className="text-xs uppercase tracking-wider text-text-muted">
            {t("account_book.total_sales")}
          </p>
          <p className="text-xl font-bold text-text-primary mt-2">
            {formatPrice(totals.totalSales)}
          </p>
        </div>
        <div className="glass-panel p-4">
          <p className="text-xs uppercase tracking-wider text-text-muted">
            {t("account_book.total_discount")}
          </p>
          <p className="text-xl font-bold text-amber-500 mt-2">
            {formatPrice(totals.totalDiscount)}
          </p>
        </div>
        <div className="glass-panel p-4">
          <p className="text-xs uppercase tracking-wider text-text-muted">
            {t("account_book.total_profit")}
          </p>
          <p className="text-xl font-bold text-emerald-500 mt-2">
            {formatPrice(totals.totalProfit)}
          </p>
        </div>
      </motion.div>

      <motion.div variants={itemVariants} className="glass-panel p-4 flex-1 min-h-0">
        {loading ? (
          <div className="flex justify-center items-center py-20">
            <div className="w-8 h-8 border-2 border-glass-border border-t-accent-blue rounded-full animate-spin" />
          </div>
        ) : rows.length === 0 ? (
          <div className="text-center py-20">
            <h3 className="text-lg font-semibold text-text-primary">
              {t("account_book.no_data")}
            </h3>
            <p className="text-sm text-text-muted mt-1">
              {t("account_book.no_data_hint")}
            </p>
          </div>
        ) : (
          <div className="overflow-auto">
            <table className="w-full min-w-[920px] text-sm">
              <thead className="text-xs uppercase tracking-wider text-text-muted border-b border-glass-border">
                <tr>
                  <th className="text-left py-3 px-3">{t("orders.date")}</th>
                  <th className="text-left py-3 px-3">{t("orders.search_key_order_id")}</th>
                  <th className="text-left py-3 px-3">{t("orders.customer")}</th>
                  <th className="text-right py-3 px-3">{t("orders.total_price")}</th>
                  <th className="text-right py-3 px-3">{t("orders.form.service_fee")}</th>
                  <th className="text-right py-3 px-3">
                    {t("orders.form.product_discount")}
                  </th>
                  <th className="text-right py-3 px-3">{t("account_book.profit")}</th>
                  <th className="text-right py-3 px-3">{t("account_book.action")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-glass-border">
                {rows.map((row) => (
                  <tr key={row.order.id} className="hover:bg-glass-white/40 transition-colors">
                    <td className="py-3 px-3 text-text-secondary">
                      {formatDate(row.order.order_date || row.order.created_at)}
                    </td>
                    <td className="py-3 px-3 text-text-primary font-medium">
                      {row.order.order_id || row.order.id}
                    </td>
                    <td className="py-3 px-3 text-text-primary">
                      {row.order.customer_name || "-"}
                    </td>
                    <td className="py-3 px-3 text-right text-text-primary">
                      {formatPrice(row.order.total_price || 0)}
                    </td>
                    <td className="py-3 px-3 text-right text-text-primary">
                      {formatPrice(row.serviceFeeAmount)}
                    </td>
                    <td className="py-3 px-3 text-right text-amber-500 font-medium">
                      {formatPrice(row.productDiscount)}
                    </td>
                    <td className="py-3 px-3 text-right text-emerald-500 font-semibold">
                      {formatPrice(row.profit)}
                    </td>
                    <td className="py-3 px-3 text-right">
                      <button
                        type="button"
                        onClick={() => navigate(`/orders/${row.order.id}`)}
                        className="btn-liquid btn-liquid-ghost px-3 py-1.5 text-xs"
                      >
                        {t("account_book.view_order")}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}
