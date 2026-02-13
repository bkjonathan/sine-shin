import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { useTranslation } from "react-i18next";
import { getOrderById } from "../api/orderApi";
import { OrderWithCustomer } from "../types/order";
import { useSound } from "../context/SoundContext";

export default function OrderDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { playSound } = useSound();

  const [order, setOrder] = useState<OrderWithCustomer | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (id) {
      fetchOrder(parseInt(id));
    }
  }, [id]);

  const fetchOrder = async (orderId: number) => {
    try {
      setLoading(true);
      const data = await getOrderById(orderId);
      setOrder(data);
    } catch (err) {
      console.error("Failed to fetch order:", err);
      setError("Failed to load order details");
    } finally {
      setLoading(false);
    }
  };

  const handleBack = () => {
    playSound("click");
    navigate("/orders");
  };

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1,
      },
    },
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: { opacity: 1, y: 0 },
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="w-8 h-8 border-4 border-[var(--color-accent-blue)] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error || !order) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-[var(--color-text-secondary)]">
        <p className="mb-4">{error || t("orders.detail.not_found")}</p>
        <button onClick={handleBack} className="btn-liquid btn-liquid-primary">
          {t("orders.detail.back_to_list")}
        </button>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        className="space-y-6"
      >
        {/* Header */}
        <motion.div variants={itemVariants} className="flex items-center gap-4">
          <button
            onClick={handleBack}
            className="p-2 rounded-xl hover:bg-[var(--color-bg-secondary)] transition-colors text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"
          >
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M19 12H5" />
              <path d="M12 19l-7-7 7-7" />
            </svg>
          </button>
          <div>
            <h1 className="text-2xl font-bold text-[var(--color-text-primary)]">
              {t("orders.detail.title")} #{order.order_id || order.id}
            </h1>
            <p className="text-[var(--color-text-secondary)]">
              {t("orders.detail.created_at", { date: order.created_at })}
            </p>
          </div>
        </motion.div>

        {/* Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Info */}
          <motion.div
            variants={itemVariants}
            className="lg:col-span-2 space-y-6"
          >
            {/* Customer Info Card */}
            <div className="glass-panel p-6">
              <h2 className="text-lg font-semibold text-[var(--color-text-primary)] mb-4">
                {t("orders.detail.customer_info")}
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm text-[var(--color-text-secondary)] mb-1">
                    {t("customers.name")}
                  </label>
                  <p className="text-[var(--color-text-primary)] font-medium">
                    {order.customer_name || "N/A"}
                  </p>
                </div>
                <div>
                  <label className="block text-sm text-[var(--color-text-secondary)] mb-1">
                    {t("orders.form.order_from")}
                  </label>
                  <p className="text-[var(--color-text-primary)]">
                    {order.order_from || "N/A"}
                  </p>
                </div>
              </div>
            </div>

            {/* Product Details Card */}
            <div className="glass-panel p-6">
              <h2 className="text-lg font-semibold text-[var(--color-text-primary)] mb-4">
                {t("orders.detail.product_details")}
              </h2>
              <div className="space-y-4">
                {order.product_url && (
                  <div>
                    <label className="block text-sm text-[var(--color-text-secondary)] mb-1">
                      {t("orders.product_link")}
                    </label>
                    <a
                      href={order.product_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[var(--color-accent-blue)] hover:underline break-all"
                    >
                      {order.product_url}
                    </a>
                  </div>
                )}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div>
                    <label className="block text-sm text-[var(--color-text-secondary)] mb-1">
                      {t("orders.qty")}
                    </label>
                    <p className="text-[var(--color-text-primary)]">
                      {order.product_qty || 0}
                    </p>
                  </div>
                  <div>
                    <label className="block text-sm text-[var(--color-text-secondary)] mb-1">
                      {t("orders.price")}
                    </label>
                    <p className="text-[var(--color-text-primary)]">
                      {order.price?.toLocaleString()}
                    </p>
                  </div>
                  <div>
                    <label className="block text-sm text-[var(--color-text-secondary)] mb-1">
                      {t("orders.form.weight")}
                    </label>
                    <p className="text-[var(--color-text-primary)]">
                      {order.product_weight || 0} kg
                    </p>
                  </div>
                  <div>
                    <label className="block text-sm text-[var(--color-text-secondary)] mb-1">
                      {t("orders.form.exchange_rate")}
                    </label>
                    <p className="text-[var(--color-text-primary)]">
                      {order.exchange_rate?.toLocaleString()}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Timeline/Dates Card */}
            <div className="glass-panel p-6">
              <h2 className="text-lg font-semibold text-[var(--color-text-primary)] mb-4">
                {t("orders.detail.timeline")}
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <label className="block text-sm text-[var(--color-text-secondary)] mb-1">
                    {t("orders.form.order_date")}
                  </label>
                  <p className="text-[var(--color-text-primary)]">
                    {order.order_date || "-"}
                  </p>
                </div>
                <div>
                  <label className="block text-sm text-[var(--color-text-secondary)] mb-1">
                    {t("orders.form.arrived_date")}
                  </label>
                  <p className="text-[var(--color-text-primary)]">
                    {order.arrived_date || "-"}
                  </p>
                </div>
                <div>
                  <label className="block text-sm text-[var(--color-text-secondary)] mb-1">
                    {t("orders.form.shipment_date")}
                  </label>
                  <p className="text-[var(--color-text-primary)]">
                    {order.shipment_date || "-"}
                  </p>
                </div>
                <div>
                  <label className="block text-sm text-[var(--color-text-secondary)] mb-1">
                    {t("orders.form.user_withdraw_date")}
                  </label>
                  <p className="text-[var(--color-text-primary)]">
                    {order.user_withdraw_date || "-"}
                  </p>
                </div>
              </div>
            </div>
          </motion.div>

          {/* Sidebar - Financials */}
          <motion.div variants={itemVariants} className="space-y-6">
            <div className="glass-panel p-6">
              <h2 className="text-lg font-semibold text-[var(--color-text-primary)] mb-4">
                {t("orders.detail.financial_summary")}
              </h2>
              <div className="space-y-3">
                <div className="flex justify-between items-center py-2 border-b border-[var(--color-border)]">
                  <span className="text-[var(--color-text-secondary)]">
                    {t("orders.form.shipping_fee")}
                  </span>
                  <span className="text-[var(--color-text-primary)]">
                    {order.shipping_fee?.toLocaleString() || 0}
                  </span>
                </div>
                <div className="flex justify-between items-center py-2 border-b border-[var(--color-border)]">
                  <span className="text-[var(--color-text-secondary)]">
                    {t("orders.form.delivery_fee")}
                  </span>
                  <span className="text-[var(--color-text-primary)]">
                    {order.delivery_fee?.toLocaleString() || 0}
                  </span>
                </div>
                <div className="flex justify-between items-center py-2 border-b border-[var(--color-border)]">
                  <span className="text-[var(--color-text-secondary)]">
                    {t("orders.form.cargo_fee")}
                  </span>
                  <span className="text-[var(--color-text-primary)]">
                    {order.cargo_fee?.toLocaleString() || 0}
                  </span>
                </div>
                <div className="mt-4 pt-4 flex justify-between items-center">
                  <span className="font-semibold text-[var(--color-text-primary)]">
                    {t("orders.total")}
                  </span>
                  <span className="font-bold text-xl text-[var(--color-accent-green)]">
                    {(
                      (order.price || 0) * (order.product_qty || 1) +
                      (order.shipping_fee || 0) +
                      (order.delivery_fee || 0) +
                      (order.cargo_fee || 0)
                    ).toLocaleString()}
                  </span>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </motion.div>
    </div>
  );
}
