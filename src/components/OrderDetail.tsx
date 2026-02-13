import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { useTranslation } from "react-i18next";
import { getOrderById } from "../api/orderApi";
import { getShopSettings, ShopSettings } from "../api/settingApi";
import { OrderDetail as OrderDetailType } from "../types/order";
import { useSound } from "../context/SoundContext";
import html2canvas from "html2canvas";
import { save } from "@tauri-apps/plugin-dialog";
import { writeFile } from "@tauri-apps/plugin-fs";
import { convertFileSrc } from "@tauri-apps/api/core";

export default function OrderDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { playSound } = useSound();
  const invoiceRef = useRef<HTMLDivElement>(null);

  const [orderDetail, setOrderDetail] = useState<OrderDetailType | null>(null);
  const [shopSettings, setShopSettings] = useState<ShopSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    if (id) {
      loadData(parseInt(id));
    }
  }, [id]);

  const loadData = async (orderId: number) => {
    try {
      setLoading(true);
      const [orderData, settingsData] = await Promise.all([
        getOrderById(orderId),
        getShopSettings(),
      ]);
      setOrderDetail(orderData);
      setShopSettings(settingsData);
    } catch (err) {
      console.error("Failed to fetch data:", err);
      setError("Failed to load details");
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadInvoice = async () => {
    console.log("Download initiated");
    if (!invoiceRef.current || !orderDetail) {
      console.error("Missing ref or order", {
        ref: !!invoiceRef.current,
        order: !!orderDetail,
      });
      alert("Error: Invoice element not found");
      return;
    }

    const { order } = orderDetail;

    try {
      setDownloading(true);
      playSound("click");

      // Small delay to ensure render
      await new Promise((resolve) => setTimeout(resolve, 100));
      console.log("Starting html2canvas capture...");

      const canvas = await html2canvas(invoiceRef.current, {
        scale: 2, // Higher quality
        useCORS: true,
        backgroundColor: "#ffffff", // Ensure white background
        logging: true, // Enable html2canvas logs
        onclone: (_) => {
          console.log("Cloned document for capture");
        },
      });
      console.log("Canvas generated");

      const blob = await new Promise<Blob | null>((resolve) => {
        canvas.toBlob(resolve, "image/png");
      });

      if (!blob) throw new Error("Failed to generate image blob");
      console.log("Blob generated, size:", blob.size);

      const buffer = await blob.arrayBuffer();
      const uint8Array = new Uint8Array(buffer);

      const fileName = `invoice_${order.order_id || order.id}.png`;
      console.log("Opening save dialog for:", fileName);

      const filePath = await save({
        defaultPath: fileName,
        filters: [
          {
            name: "Image",
            extensions: ["png"],
          },
        ],
      });
      console.log("Save dialog result:", filePath);

      if (filePath) {
        await writeFile(filePath, uint8Array);
        console.log("File written successfully");
        playSound("success");
        alert(t("orders.invoice.success_saved"));
      } else {
        console.log("Save cancelled");
      }
    } catch (err) {
      console.error("Failed to download invoice:", err);
      // Explicitly show the error to the user for now
      alert(
        `Download failed: ${err instanceof Error ? err.message : String(err)}`,
      );
      playSound("error");
    } finally {
      setDownloading(false);
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

  if (error || !orderDetail) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-[var(--color-text-secondary)]">
        <p className="mb-4">{error || t("orders.detail.not_found")}</p>
        <button onClick={handleBack} className="btn-liquid btn-liquid-primary">
          {t("orders.detail.back_to_list")}
        </button>
      </div>
    );
  }

  const { order, items } = orderDetail;

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        className="space-y-6"
      >
        {/* Header */}
        <motion.div
          variants={itemVariants}
          className="flex items-center justify-between gap-4"
        >
          <div className="flex items-center gap-4">
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
          </div>
          <button
            onClick={handleDownloadInvoice}
            disabled={downloading}
            className="btn-liquid btn-liquid-primary flex items-center gap-2"
          >
            {downloading ? (
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
            )}
            {downloading
              ? t("orders.invoice.generating")
              : t("orders.invoice.download")}
          </button>
        </motion.div>

        {/* Hidden Invoice Layout for Capture */}
        <div className="fixed left-[-9999px] top-[-9999px]">
          <div
            ref={invoiceRef}
            style={{
              width: "800px",
              backgroundColor: "#ffffff",
              color: "#000000",
              padding: "40px",
              fontFamily: "'Inter', sans-serif",
            }}
          >
            {/* Invoice Header */}
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "flex-start",
                marginBottom: "40px",
                borderBottom: "2px solid #f1f5f9",
                paddingBottom: "32px",
              }}
            >
              <div
                style={{ display: "flex", alignItems: "center", gap: "24px" }}
              >
                {shopSettings?.logo_path && (
                  <img
                    src={convertFileSrc(shopSettings.logo_path)}
                    alt="Logo"
                    style={{
                      width: "96px",
                      height: "96px",
                      objectFit: "contain",
                      borderRadius: "8px",
                      border: "1px solid #f1f5f9",
                    }}
                  />
                )}
                <div>
                  <h1
                    style={{
                      fontSize: "30px",
                      fontWeight: "bold",
                      color: "#0f172a",
                      marginBottom: "8px",
                    }}
                  >
                    {shopSettings?.shop_name || "Sine Shin"}
                  </h1>
                  <div
                    style={{
                      fontSize: "14px",
                      color: "#64748b",
                      lineHeight: "1.5",
                    }}
                  >
                    {shopSettings?.phone && (
                      <p
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "8px",
                          margin: 0,
                        }}
                      >
                        <span>Tel:</span> {shopSettings.phone}
                      </p>
                    )}
                    {shopSettings?.address && (
                      <p style={{ maxWidth: "300px", margin: 0 }}>
                        {shopSettings.address}
                      </p>
                    )}
                  </div>
                </div>
              </div>
              <div style={{ textAlign: "right" }}>
                <h2
                  style={{
                    fontSize: "36px",
                    fontWeight: "900",
                    color: "#f1f5f9",
                    marginBottom: "8px",
                    textTransform: "uppercase",
                    letterSpacing: "0.1em",
                    margin: 0,
                  }}
                >
                  Invoice
                </h2>
                <div
                  style={{
                    fontSize: "14px",
                    fontWeight: "500",
                    color: "#475569",
                  }}
                >
                  <p style={{ margin: "4px 0" }}>
                    #{order.order_id || order.id}
                  </p>
                  <p style={{ margin: 0 }}>{order.order_date}</p>
                </div>
              </div>
            </div>

            {/* Bill To */}
            <div
              style={{
                marginBottom: "40px",
                backgroundColor: "#f8fafc",
                padding: "24px",
                borderRadius: "12px",
                border: "1px solid #f1f5f9",
              }}
            >
              <h3
                style={{
                  fontSize: "12px",
                  fontWeight: "bold",
                  color: "#94a3b8",
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                  marginBottom: "16px",
                  margin: "0 0 16px 0",
                }}
              >
                Bill To
              </h3>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: "32px",
                }}
              >
                <div>
                  <p
                    style={{
                      fontSize: "18px",
                      fontWeight: "bold",
                      color: "#0f172a",
                      marginBottom: "4px",
                      marginTop: 0,
                    }}
                  >
                    {order.customer_name}
                  </p>
                  <p style={{ fontSize: "14px", color: "#64748b", margin: 0 }}>
                    ID: {t("customers.id_prefix")}
                    {order.customer_id}
                  </p>
                </div>
                {order.order_from && (
                  <div>
                    <p
                      style={{
                        fontSize: "14px",
                        color: "#64748b",
                        marginBottom: "4px",
                        marginTop: 0,
                      }}
                    >
                      Platform
                    </p>
                    <p
                      style={{
                        fontSize: "16px",
                        fontWeight: "600",
                        color: "#0f172a",
                        margin: 0,
                      }}
                    >
                      {order.order_from}
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Order Table */}
            <div style={{ marginBottom: "40px" }}>
              <table
                style={{
                  width: "100%",
                  borderCollapse: "collapse",
                  textAlign: "left",
                }}
              >
                <thead>
                  <tr style={{ borderBottom: "2px solid #0f172a" }}>
                    <th
                      style={{
                        padding: "12px 0",
                        fontSize: "12px",
                        fontWeight: "bold",
                        color: "#0f172a",
                        textTransform: "uppercase",
                        width: "48px",
                      }}
                    >
                      #
                    </th>
                    <th
                      style={{
                        padding: "12px 0",
                        fontSize: "12px",
                        fontWeight: "bold",
                        color: "#0f172a",
                        textTransform: "uppercase",
                      }}
                    >
                      {t("orders.invoice.item_desc")}
                    </th>
                    <th
                      style={{
                        padding: "12px 0",
                        fontSize: "12px",
                        fontWeight: "bold",
                        color: "#0f172a",
                        textTransform: "uppercase",
                        textAlign: "right",
                        width: "96px",
                      }}
                    >
                      Qty
                    </th>
                    <th
                      style={{
                        padding: "12px 0",
                        fontSize: "12px",
                        fontWeight: "bold",
                        color: "#0f172a",
                        textTransform: "uppercase",
                        textAlign: "right",
                        width: "128px",
                      }}
                    >
                      Price
                    </th>
                    <th
                      style={{
                        padding: "12px 0",
                        fontSize: "12px",
                        fontWeight: "bold",
                        color: "#0f172a",
                        textTransform: "uppercase",
                        textAlign: "right",
                        width: "128px",
                      }}
                    >
                      Amount
                    </th>
                  </tr>
                </thead>
                <tbody style={{ fontSize: "14px", color: "#334155" }}>
                  {items.map((item, index) => (
                    <tr
                      key={index}
                      style={{ borderBottom: "1px solid #f1f5f9" }}
                    >
                      <td
                        style={{
                          padding: "16px 0",
                          color: "#94a3b8",
                          fontWeight: "500",
                        }}
                      >
                        {String(index + 1).padStart(2, "0")}
                      </td>
                      <td style={{ padding: "16px 0", fontWeight: "500" }}>
                        {t("orders.detail.product_order_from", {
                          platform: order.order_from || "Online",
                        })}
                        {item.product_url && (
                          <div
                            style={{
                              fontSize: "12px",
                              color: "#94a3b8",
                              marginTop: "4px",
                              whiteSpace: "nowrap",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              maxWidth: "300px",
                            }}
                          >
                            {item.product_url}
                          </div>
                        )}
                      </td>
                      <td style={{ padding: "16px 0", textAlign: "right" }}>
                        {item.product_qty}
                      </td>
                      <td style={{ padding: "16px 0", textAlign: "right" }}>
                        {item.price?.toLocaleString()}
                      </td>
                      <td
                        style={{
                          padding: "16px 0",
                          textAlign: "right",
                          fontWeight: "600",
                        }}
                      >
                        {(
                          (item.price || 0) * (item.product_qty || 1)
                        ).toLocaleString()}
                      </td>
                    </tr>
                  ))}
                  {/* Additional Fees */}
                  {(order.shipping_fee || 0) > 0 && (
                    <tr style={{ borderBottom: "1px solid #f1f5f9" }}>
                      <td
                        style={{
                          padding: "16px 0",
                          color: "#94a3b8",
                          fontWeight: "500",
                        }}
                      >
                        {t("orders.detail.fee")}
                      </td>
                      <td style={{ padding: "16px 0" }}>
                        {t("orders.form.shipping_fee")}
                      </td>
                      <td style={{ padding: "16px 0", textAlign: "right" }}>
                        -
                      </td>
                      <td style={{ padding: "16px 0", textAlign: "right" }}>
                        -
                      </td>
                      <td style={{ padding: "16px 0", textAlign: "right" }}>
                        {order.shipping_fee?.toLocaleString()}
                      </td>
                    </tr>
                  )}
                  {(order.delivery_fee || 0) > 0 && (
                    <tr style={{ borderBottom: "1px solid #f1f5f9" }}>
                      <td
                        style={{
                          padding: "16px 0",
                          color: "#94a3b8",
                          fontWeight: "500",
                        }}
                      >
                        {t("orders.detail.fee")}
                      </td>
                      <td style={{ padding: "16px 0" }}>
                        {t("orders.form.delivery_fee")}
                      </td>
                      <td style={{ padding: "16px 0", textAlign: "right" }}>
                        -
                      </td>
                      <td style={{ padding: "16px 0", textAlign: "right" }}>
                        -
                      </td>
                      <td style={{ padding: "16px 0", textAlign: "right" }}>
                        {order.delivery_fee?.toLocaleString()}
                      </td>
                    </tr>
                  )}
                  {(order.cargo_fee || 0) > 0 && (
                    <tr style={{ borderBottom: "1px solid #f1f5f9" }}>
                      <td
                        style={{
                          padding: "16px 0",
                          color: "#94a3b8",
                          fontWeight: "500",
                        }}
                      >
                        {t("orders.detail.fee")}
                      </td>
                      <td style={{ padding: "16px 0" }}>
                        {t("orders.form.cargo_fee")}
                      </td>
                      <td style={{ padding: "16px 0", textAlign: "right" }}>
                        -
                      </td>
                      <td style={{ padding: "16px 0", textAlign: "right" }}>
                        -
                      </td>
                      <td style={{ padding: "16px 0", textAlign: "right" }}>
                        {order.cargo_fee?.toLocaleString()}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Total Section */}
            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <div
                style={{
                  width: "50%",
                  backgroundColor: "#f8fafc",
                  borderRadius: "12px",
                  padding: "24px",
                  border: "1px solid #f1f5f9",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    marginBottom: "12px",
                    fontSize: "14px",
                    color: "#64748b",
                  }}
                >
                  <span>{t("orders.invoice.subtotal")}</span>
                  <span style={{ fontWeight: "500", color: "#0f172a" }}>
                    {(order.total_price || 0).toLocaleString()}
                  </span>
                </div>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    marginBottom: "16px",
                    fontSize: "14px",
                    color: "#64748b",
                    paddingBottom: "16px",
                    borderBottom: "1px solid #e2e8f0",
                  }}
                >
                  <span>{t("orders.invoice.total_fees")}</span>
                  <span style={{ fontWeight: "500", color: "#0f172a" }}>
                    {(
                      (order.shipping_fee || 0) +
                      (order.delivery_fee || 0) +
                      (order.cargo_fee || 0)
                    ).toLocaleString()}
                  </span>
                </div>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    fontSize: "20px",
                    fontWeight: "bold",
                    color: "#0f172a",
                  }}
                >
                  <span>{t("orders.invoice.total")}</span>
                  <span>
                    {(
                      (order.total_price || 0) +
                      (order.shipping_fee || 0) +
                      (order.delivery_fee || 0) +
                      (order.cargo_fee || 0)
                    ).toLocaleString()}
                  </span>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div
              style={{
                marginTop: "64px",
                paddingTop: "32px",
                borderTop: "1px solid #f1f5f9",
                textAlign: "center",
                fontSize: "12px",
                color: "#94a3b8",
              }}
            >
              <p style={{ margin: 0 }}>{t("orders.invoice.footer_message")}</p>
              <p style={{ marginTop: "4px" }}>
                {t("orders.invoice.footer_credit")}
              </p>
            </div>
          </div>
        </div>

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
              <div className="space-y-6">
                {items.map((item, index) => (
                  <div
                    key={index}
                    className="p-4 bg-[var(--color-glass-white)]/10 rounded-lg border border-[var(--color-glass-border)]"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium text-[var(--color-text-muted)]">
                        Item {index + 1}
                      </span>
                    </div>
                    {item.product_url && (
                      <div className="mb-3">
                        <label className="block text-xs text-[var(--color-text-secondary)] mb-1">
                          {t("orders.product_link")}
                        </label>
                        <a
                          href={item.product_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[var(--color-accent-blue)] hover:underline break-all text-sm"
                        >
                          {item.product_url}
                        </a>
                      </div>
                    )}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <div>
                        <label className="block text-xs text-[var(--color-text-secondary)] mb-1">
                          {t("orders.qty")}
                        </label>
                        <p className="text-[var(--color-text-primary)]">
                          {item.product_qty || 0}
                        </p>
                      </div>
                      <div>
                        <label className="block text-xs text-[var(--color-text-secondary)] mb-1">
                          {t("orders.price")}
                        </label>
                        <p className="text-[var(--color-text-primary)]">
                          {item.price?.toLocaleString()}
                        </p>
                      </div>
                      <div>
                        <label className="block text-xs text-[var(--color-text-secondary)] mb-1">
                          {t("orders.form.weight")}
                        </label>
                        <p className="text-[var(--color-text-primary)]">
                          {item.product_weight || 0} kg
                        </p>
                      </div>
                    </div>
                  </div>
                ))}

                <div className="pt-4 border-t border-[var(--color-glass-border)] grid grid-cols-2 lg:grid-cols-4 gap-4">
                  <div>
                    <label className="block text-sm font-bold text-[var(--color-text-secondary)] mb-1">
                      {t("orders.total_qty")}
                    </label>
                    <p className="text-[var(--color-text-primary)] font-bold">
                      {order.total_qty}
                    </p>
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-[var(--color-text-secondary)] mb-1">
                      {t("orders.total_price")}
                    </label>
                    <p className="text-[var(--color-text-primary)] font-bold">
                      {order.total_price?.toLocaleString()}
                    </p>
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-[var(--color-text-secondary)] mb-1">
                      {t("orders.total_weight")}
                    </label>
                    <p className="text-[var(--color-text-primary)] font-bold">
                      {order.total_weight}
                    </p>
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-[var(--color-text-secondary)] mb-1">
                      {t("orders.form.exchange_rate")}
                    </label>
                    <p className="text-[var(--color-text-primary)] font-bold">
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
                      (order.total_price || 0) +
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
