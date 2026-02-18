import { useState, useEffect } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { motion } from "framer-motion";
import { useTranslation } from "react-i18next";
import { getCustomerById, getCustomerOrders } from "../api/customerApi";
import { Customer } from "../types/customer";
import { OrderWithCustomer } from "../types/order";
import { useSound } from "../context/SoundContext";
import { useAppSettings } from "../context/AppSettingsContext";
import { formatDate } from "../utils/date";
import { IconArrowLeft, IconExternalLink } from "./icons";
import { Button } from "./ui";

const fadeVariants = {
  hidden: { opacity: 0, y: 12 },
  show: {
    opacity: 1,
    y: 0,
    transition: { type: "spring" as const, stiffness: 300, damping: 24 },
  },
};

export default function CustomerDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useTranslation();
  const { playSound } = useSound();
  const { formatPrice } = useAppSettings();

  const [customer, setCustomer] = useState<Customer | null>(null);
  const [orders, setOrders] = useState<OrderWithCustomer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (id) {
      fetchData(parseInt(id));
    }
  }, [id]);

  const fetchData = async (customerId: number) => {
    try {
      setLoading(true);
      const [customerData, ordersData] = await Promise.all([
        getCustomerById(customerId),
        getCustomerOrders(customerId),
      ]);
      setCustomer(customerData);
      setOrders(ordersData);
    } catch (err) {
      console.error("Failed to fetch customer details:", err);
      setError("Failed to load customer details");
    } finally {
      setLoading(false);
    }
  };

  const handleBack = () => {
    playSound("click");
    const returnTo = (location.state as { returnTo?: string } | null)?.returnTo;
    navigate(returnTo || "/customers");
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-full">
        <div className="w-8 h-8 border-2 border-[var(--color-glass-border)] border-t-[var(--color-accent-blue)] rounded-full animate-spin" />
      </div>
    );
  }

  if (error || !customer) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-[var(--color-text-muted)]">
        <p>{error || "Customer not found"}</p>
        <Button
          onClick={handleBack}
          variant="ghost"
          className="mt-4"
        >
          {t("customers.detail.back_to_list")}
        </Button>
      </div>
    );
  }

  return (
    <motion.div
      initial="hidden"
      animate="show"
      variants={{
        hidden: { opacity: 0 },
        show: {
          opacity: 1,
          transition: { staggerChildren: 0.06 },
        },
      }}
      className="max-w-6xl mx-auto h-full flex flex-col space-y-6"
    >
      {/* Header with Back Button */}
      <motion.div variants={fadeVariants} className="flex items-center gap-4">
        <button
          onClick={handleBack}
          className="p-2 hover:bg-[var(--color-glass-white-hover)] rounded-lg transition-colors text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"
        >
          <IconArrowLeft size={20} strokeWidth={2} />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-[var(--color-text-primary)]">
            {customer.name}
          </h1>
          <p className="text-sm text-[var(--color-text-muted)]">
            {customer.customer_id}
          </p>
        </div>
      </motion.div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Customer Info Card */}
        <motion.div variants={fadeVariants} className="lg:col-span-1 space-y-6">
          <div className="glass-panel p-6 space-y-4">
            <h2 className="text-lg font-semibold text-[var(--color-text-primary)] mb-4">
              {t("customers.detail.title")}
            </h2>

            <div className="space-y-3">
              <div className="flex items-start gap-3 text-sm">
                <span className="text-[var(--color-text-muted)] w-20">
                  {t("customers.form.phone")}:
                </span>
                <span className="text-[var(--color-text-primary)]">
                  {customer.phone || "-"}
                </span>
              </div>
              <div className="flex items-start gap-3 text-sm">
                <span className="text-[var(--color-text-muted)] w-20">
                  {t("customers.form.city")}:
                </span>
                <span className="text-[var(--color-text-primary)]">
                  {customer.city || "-"}
                </span>
              </div>
              <div className="flex items-start gap-3 text-sm">
                <span className="text-[var(--color-text-muted)] w-20">
                  {t("customers.form.address")}:
                </span>
                <span className="text-[var(--color-text-primary)]">
                  {customer.address || "-"}
                </span>
              </div>
              <div className="flex items-start gap-3 text-sm">
                <span className="text-[var(--color-text-muted)] w-20">
                  {t("customers.form.platform")}:
                </span>
                <span className="text-[var(--color-text-primary)]">
                  {customer.platform || "-"}
                </span>
              </div>
              {customer.social_media_url && (
                <div className="pt-2">
                  <a
                    href={customer.social_media_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 text-sm text-[var(--color-accent-blue)] hover:underline"
                  >
                    {t("customers.visit_social")}
                    <IconExternalLink size={14} strokeWidth={2} />
                  </a>
                </div>
              )}
            </div>
          </div>
        </motion.div>

        {/* Orders List */}
        <motion.div variants={fadeVariants} className="lg:col-span-2">
          <div className="glass-panel p-6 h-full flex flex-col">
            <h2 className="text-lg font-semibold text-[var(--color-text-primary)] mb-4">
              {t("customers.detail.order_history")} ({orders.length})
            </h2>

            <div className="flex-1 overflow-auto">
              <table className="w-full text-sm text-left">
                <thead className="text-xs text-[var(--color-text-muted)] uppercase border-b border-[var(--color-glass-border)]">
                  <tr>
                    <th className="px-4 py-3">
                      {t("customers.detail.order_id")}
                    </th>
                    <th className="px-4 py-3">{t("customers.detail.date")}</th>
                    <th className="px-4 py-3">{t("customers.detail.item")}</th>
                    <th className="px-4 py-3 text-right">
                      {t("customers.detail.qty")}
                    </th>
                    <th className="px-4 py-3 text-right">
                      {t("customers.detail.price")}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--color-glass-border)]">
                  {orders.length === 0 ? (
                    <tr>
                      <td
                        colSpan={5}
                        className="px-4 py-8 text-center text-[var(--color-text-muted)]"
                      >
                        {t("customers.detail.no_orders")}
                      </td>
                    </tr>
                  ) : (
                    orders.map((order) => (
                      <tr
                        key={order.id}
                        className="hover:bg-[var(--color-glass-white-hover)] transition-colors"
                      >
                        <td className="px-4 py-3 font-medium text-[var(--color-text-primary)]">
                          {order.order_id}
                        </td>
                        <td className="px-4 py-3 text-[var(--color-text-secondary)]">
                          {formatDate(order.order_date)}
                        </td>
                        <td className="px-4 py-3 text-[var(--color-text-secondary)]">
                          {order.first_product_url ? (
                            <a
                              href={order.first_product_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-[var(--color-accent-blue)] hover:underline truncate max-w-[150px] block"
                            >
                              {t("customers.detail.view_item")}
                            </a>
                          ) : (
                            "-"
                          )}
                        </td>
                        <td className="px-4 py-3 text-right text-[var(--color-text-secondary)]">
                          {order.total_qty || 0}
                        </td>
                        <td className="px-4 py-3 text-right text-[var(--color-text-secondary)]">
                          {formatPrice(order.total_price || 0)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </motion.div>
      </div>
    </motion.div>
  );
}
