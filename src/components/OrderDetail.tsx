import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { useTranslation } from "react-i18next";
import { getOrderById, updateOrder } from "../api/orderApi";
import { getShopSettings, ShopSettings } from "../api/settingApi";
import { getCustomerById } from "../api/customerApi";
import { OrderDetail as OrderDetailType } from "../types/order";
import { Customer } from "../types/customer";
import { useSound } from "../context/SoundContext";
import html2canvas from "html2canvas";
import { save } from "@tauri-apps/plugin-dialog";
import { writeFile } from "@tauri-apps/plugin-fs";
import { convertFileSrc } from "@tauri-apps/api/core";
import { formatDate } from "../utils/date";

export default function OrderDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { playSound } = useSound();
  const invoiceRef = useRef<HTMLDivElement>(null);

  const [orderDetail, setOrderDetail] = useState<OrderDetailType | null>(null);
  const [customerDetail, setCustomerDetail] = useState<Customer | null>(null);
  const [shopSettings, setShopSettings] = useState<ShopSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);

  // Editing state
  const [editingField, setEditingField] = useState<string | null>(null);
  const [tempValue, setTempValue] = useState("");
  const [isUpdating, setIsUpdating] = useState(false);

  useEffect(() => {
    if (id) {
      loadData(parseInt(id));
    }
  }, [id]);

  const loadData = async (orderId: number) => {
    try {
      setLoading(true);
      setCustomerDetail(null);
      const [orderData, settingsData] = await Promise.all([
        getOrderById(orderId),
        getShopSettings(),
      ]);
      setOrderDetail(orderData);
      setShopSettings(settingsData);

      if (orderData.order.customer_id) {
        try {
          const customerData = await getCustomerById(
            orderData.order.customer_id,
          );
          setCustomerDetail(customerData);
        } catch (customerErr) {
          console.error("Failed to fetch customer details:", customerErr);
        }
      }
    } catch (err) {
      console.error("Failed to fetch data:", err);
      setError(t("orders.detail.error_loading"));
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
      alert(t("orders.invoice.error_element_not_found"));
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

      if (!blob) throw new Error(t("orders.invoice.error_blob_generation"));
      console.log("Blob generated, size:", blob.size);

      const buffer = await blob.arrayBuffer();
      const uint8Array = new Uint8Array(buffer);

      const fileName = `invoice_${order.order_id || order.id}.png`;
      console.log("Opening save dialog for:", fileName);

      const filePath = await save({
        defaultPath: fileName,
        filters: [
          {
            name: t("common.image"),
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
        `${t("orders.invoice.error_download_failed")}: ${err instanceof Error ? err.message : String(err)}`,
      );
      playSound("error");
    } finally {
      setDownloading(false);
    }
  };

  const handleEditClick = (
    field: string,
    value: string | number | undefined | null,
    type: "date" | "number" = "date",
  ) => {
    if (type === "date") {
      if (typeof value === "string" && value) {
        // Create a date object from the UTC date string
        const date = new Date(value);
        // Format as YYYY-MM-DD for input using local time
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, "0");
        const day = String(date.getDate()).padStart(2, "0");
        setTempValue(`${year}-${month}-${day}`);
      } else {
        setTempValue("");
      }
    } else {
      setTempValue(value?.toString() || "");
    }
    setEditingField(field);
  };

  const handleSave = async () => {
    if (!orderDetail || !editingField) return;

    try {
      setIsUpdating(true);

      const { order, items } = orderDetail;

      // Determine if we are updating a date or a number based on field name
      const isDateField = [
        "order_date",
        "arrived_date",
        "shipment_date",
        "user_withdraw_date",
      ].includes(editingField);

      let newValue: string | number | null = null;

      if (isDateField) {
        if (tempValue) {
          const d = new Date(tempValue);
          if (!isNaN(d.getTime())) {
            newValue = d.toISOString();
          }
        }
      } else {
        // Numeric field
        newValue = tempValue === "" ? 0 : parseFloat(tempValue);
        if (isNaN(newValue)) newValue = 0;
      }

      // Construct the update payload
      const updatedOrder: any = {
        id: order.id,
        customer_id: order.customer_id,
        order_from: order.order_from,
        items: items.map((item) => ({
          product_url: item.product_url,
          product_qty: item.product_qty,
          price: item.price,
          product_weight: item.product_weight,
        })),
        exchange_rate: order.exchange_rate,
        shipping_fee: order.shipping_fee,
        delivery_fee: order.delivery_fee,
        cargo_fee: order.cargo_fee,
        order_date: order.order_date,
        arrived_date: order.arrived_date,
        shipment_date: order.shipment_date,
        user_withdraw_date: order.user_withdraw_date,
        service_fee: order.service_fee,
        service_fee_type: order.service_fee_type,
      };

      // Update the specific field
      updatedOrder[editingField] = newValue;

      await updateOrder(updatedOrder);

      // Reload data to reflect changes
      await loadData(order.id);

      setEditingField(null);
      playSound("success");
    } catch (err) {
      console.error("Failed to update:", err);
      // alert(t("common.error"));
      playSound("error");
    } finally {
      setIsUpdating(false);
    }
  };

  const handleCancel = () => {
    setEditingField(null);
    setTempValue("");
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
        <div className="w-8 h-8 border-4 border-accent-blue border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error || !orderDetail) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-text-secondary">
        <p className="mb-4">{error || t("orders.detail.not_found")}</p>
        <button onClick={handleBack} className="btn-liquid btn-liquid-primary">
          {t("orders.detail.back_to_list")}
        </button>
      </div>
    );
  }

  const { order, items } = orderDetail;
  const customerName =
    customerDetail?.name || order.customer_name || t("common.na", "N/A");
  const customerCode =
    customerDetail?.customer_id || order.customer_id?.toString() || "-";
  const customerPhone = customerDetail?.phone || "-";
  const customerCity = customerDetail?.city || "-";
  const customerAddress = customerDetail?.address || "-";
  const customerPlatform = customerDetail?.platform || order.order_from || "-";
  const serviceFeeAmount =
    order.service_fee_type === "percent"
      ? ((order.total_price || 0) * (order.service_fee || 0)) / 100
      : order.service_fee || 0;

  const orderTotal =
    (order.total_price || 0) +
    (order.shipping_fee || 0) +
    (order.delivery_fee || 0) +
    (order.cargo_fee || 0) +
    serviceFeeAmount;
  const exchangeRate = order.exchange_rate || 1;
  const totalWithExchange = orderTotal * exchangeRate;

  const renderEditableDate = (
    label: string,
    field: string,
    value: string | undefined | null,
  ) => {
    const isEditing = editingField === field;

    return (
      <div>
        <label className="block text-sm text-text-secondary mb-1">
          {label}
        </label>
        {isEditing ? (
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={tempValue}
              onChange={(e) => setTempValue(e.target.value)}
              className="bg-glass-white border border-glass-border rounded px-2 py-1 text-sm text-text-primary focus:outline-none focus:border-accent-blue"
              autoFocus
            />
            <button
              onClick={handleSave}
              disabled={isUpdating}
              className="p-1 text-success hover:bg-success/10 rounded"
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <polyline points="20 6 9 17 4 12"></polyline>
              </svg>
            </button>
            <button
              onClick={handleCancel}
              disabled={isUpdating}
              className="p-1 text-text-secondary hover:bg-text-secondary/10 rounded"
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
            </button>
          </div>
        ) : (
          <div
            className="flex items-center gap-2 cursor-pointer group w-fit"
            onClick={() => handleEditClick(field, value, "date")}
            title="Click to edit"
          >
            <p className="text-text-primary hover:text-accent-blue hover:underline decoration-dashed underline-offset-4 transition-colors">
              {formatDate(value) || "-"}
            </p>
            <span className="opacity-0 group-hover:opacity-100 transition-opacity text-accent-blue">
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
              </svg>
            </span>
          </div>
        )}
      </div>
    );
  };

  const renderEditableFee = (
    label: string,
    field: string,
    value: number | undefined | null,
    suffix?: string,
  ) => {
    const isEditing = editingField === field;

    return (
      <div className="flex justify-between items-center py-2 border-b border-glass-border">
        <span className="text-text-secondary">{label}</span>
        {isEditing ? (
          <div className="flex items-center gap-2">
            <input
              type="number"
              value={tempValue}
              onChange={(e) => setTempValue(e.target.value)}
              className="w-24 bg-glass-white border border-glass-border rounded px-2 py-1 text-sm text-text-primary text-right focus:outline-none focus:border-accent-blue"
              autoFocus
            />
            <button
              onClick={handleSave}
              disabled={isUpdating}
              className="p-1 text-success hover:bg-success/10 rounded"
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <polyline points="20 6 9 17 4 12"></polyline>
              </svg>
            </button>
            <button
              onClick={handleCancel}
              disabled={isUpdating}
              className="p-1 text-text-secondary hover:bg-text-secondary/10 rounded"
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
            </button>
          </div>
        ) : (
          <div
            className="flex items-center gap-2 cursor-pointer group"
            onClick={() => handleEditClick(field, value, "number")}
            title="Click to edit"
          >
            <span className="opacity-0 group-hover:opacity-100 transition-opacity text-accent-blue">
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
              </svg>
            </span>
            <span className="text-text-primary hover:text-accent-blue hover:underline decoration-dashed underline-offset-4 transition-colors">
              {(value || 0).toLocaleString()} {suffix && suffix}
            </span>
          </div>
        )}
      </div>
    );
  };

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
              className="p-2 rounded-xl hover:bg-glass-white-hover transition-colors text-text-secondary hover:text-text-primary"
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
              <h1 className="text-2xl font-bold text-text-primary">
                {t("orders.detail.title")} #{order.order_id || order.id}
              </h1>
              <p className="text-text-secondary">
                {t("orders.detail.created_at", {
                  date: formatDate(order.created_at),
                })}
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
              color: "#0f172a",
              padding: "36px",
              fontFamily: "'Poppins', 'Noto Sans Myanmar', sans-serif",
              borderRadius: "20px",
              border: "1px solid #e2e8f0",
              boxShadow: "0 24px 44px -30px rgba(15, 23, 42, 0.45)",
            }}
          >
            {/* Invoice Header */}
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "flex-start",
                marginBottom: "40px",
                borderBottom: "2px solid #dbeafe",
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
                      letterSpacing: "0.01em",
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
                        <span>{t("common.tel")}:</span> {shopSettings.phone}
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
                    color: "#dbeafe",
                    marginBottom: "8px",
                    textTransform: "uppercase",
                    letterSpacing: "0.1em",
                    margin: 0,
                  }}
                >
                  {t("orders.invoice.title")}
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
                  <p style={{ margin: 0 }}>{formatDate(order.order_date)}</p>
                </div>
              </div>
            </div>

            {/* Bill To */}
            <div
              style={{
                marginBottom: "40px",
                padding: "0",
              }}
            >
              <h3
                style={{
                  fontSize: "11px",
                  fontWeight: "700",
                  color: "#64748b",
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                  margin: "0 0 14px 0",
                }}
              >
                {t("orders.invoice.bill_to")}
              </h3>
              <div
                style={{
                  border: "1px solid #dbeafe",
                  borderRadius: "16px",
                  background:
                    "linear-gradient(140deg, #f8fbff 0%, #eff6ff 62%, #ecfeff 100%)",
                  padding: "18px 20px",
                  boxShadow: "inset 0 1px 0 rgba(255,255,255,0.65)",
                }}
              >
                <div
                  style={{
                    fontSize: "13px",
                  }}
                >
                  <p
                    style={{
                      fontSize: "20px",
                      fontWeight: "700",
                      color: "#0f172a",
                      margin: 0,
                      letterSpacing: "0.01em",
                    }}
                  >
                    {customerName}
                  </p>
                  <p
                    style={{
                      fontSize: "12px",
                      color: "#334155",
                      margin: "5px 0 0",
                      fontWeight: "600",
                    }}
                  >
                    {t("customers.id_label")}: {customerCode}
                  </p>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "110px 1fr",
                      rowGap: "6px",
                      columnGap: "8px",
                      marginTop: "16px",
                    }}
                  >
                    <span style={{ color: "#64748b" }}>
                      {t("customers.form.phone")}
                    </span>
                    <span style={{ color: "#0f172a", fontWeight: "500" }}>
                      {customerPhone}
                    </span>
                    <span style={{ color: "#64748b" }}>
                      {t("customers.form.city")}
                    </span>
                    <span style={{ color: "#0f172a", fontWeight: "500" }}>
                      {customerCity}
                    </span>
                    <span style={{ color: "#64748b" }}>
                      {t("customers.form.address")}
                    </span>
                    <span style={{ color: "#0f172a", fontWeight: "500" }}>
                      {customerAddress}
                    </span>
                    <span style={{ color: "#64748b" }}>
                      {t("orders.invoice.platform")}
                    </span>
                    <span style={{ color: "#0f172a", fontWeight: "500" }}>
                      {customerPlatform}
                    </span>
                  </div>
                </div>
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
                      {t("common.no")}
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
                      {t("orders.invoice.qty")}
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
                      {t("orders.invoice.price")}
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
                      {t("orders.invoice.amount")}
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
                          platform: customerPlatform || "Online",
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
                  {serviceFeeAmount > 0 && (
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
                        {t("orders.form.service_fee")}
                        {order.service_fee_type === "percent" &&
                          ` (${order.service_fee}%)`}
                      </td>
                      <td style={{ padding: "16px 0", textAlign: "right" }}>
                        -
                      </td>
                      <td style={{ padding: "16px 0", textAlign: "right" }}>
                        -
                      </td>
                      <td style={{ padding: "16px 0", textAlign: "right" }}>
                        {serviceFeeAmount.toLocaleString()}
                      </td>
                    </tr>
                  )}
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
                      (order.cargo_fee || 0) +
                      serviceFeeAmount
                    ).toLocaleString()}
                  </span>
                </div>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    marginBottom: "12px",
                    fontSize: "14px",
                    color: "#64748b",
                  }}
                >
                  <span>{t("orders.form.exchange_rate")}</span>
                  <span style={{ fontWeight: "500", color: "#0f172a" }}>
                    {exchangeRate.toLocaleString()}
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
                  <span>{orderTotal.toLocaleString()}</span>
                </div>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    marginTop: "10px",
                    paddingTop: "10px",
                    borderTop: "1px dashed #cbd5e1",
                    fontSize: "14px",
                    color: "#334155",
                    fontWeight: "600",
                  }}
                >
                  <span>{t("orders.invoice.total_with_exchange")}</span>
                  <span>{totalWithExchange.toLocaleString()} Kyats</span>
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
              <h2 className="text-lg font-semibold text-text-primary mb-4">
                {t("orders.detail.customer_info")}
              </h2>
              <div className="grid grid-cols-1 gap-4">
                <div
                  className="rounded-2xl p-5 border"
                  style={{
                    borderColor: "#d6c08a",
                    background:
                      "linear-gradient(140deg, #0f172a 0%, #1e293b 62%, #111827 100%)",
                    boxShadow: "inset 0 1px 0 rgba(255,255,255,0.08)",
                  }}
                >
                  <p className="text-[22px] font-bold text-slate-50 m-0 tracking-wide">
                    {customerName}
                  </p>
                  <p className="text-xs font-semibold text-amber-200 mt-1 mb-0">
                    {t("customers.id_label")}: {customerCode}
                  </p>
                  <div className="grid grid-cols-[110px_1fr] gap-y-1.5 gap-x-2 mt-4 text-sm">
                    <span className="text-[#c9b07a]">
                      {t("customers.form.phone")}
                    </span>
                    <span className="text-slate-50 font-medium">
                      {customerPhone}
                    </span>
                    <span className="text-[#c9b07a]">
                      {t("customers.form.city")}
                    </span>
                    <span className="text-slate-50 font-medium">
                      {customerCity}
                    </span>
                    <span className="text-[#c9b07a]">
                      {t("customers.form.address")}
                    </span>
                    <span className="text-slate-50 font-medium wrap-break-word">
                      {customerAddress}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Product Details Card */}
            <div className="glass-panel p-6">
              <h2 className="text-lg font-semibold text-text-primary mb-4">
                {t("orders.detail.product_details")}
              </h2>
              <div className="space-y-4">
                {items.map((item, index) => (
                  <div
                    key={index}
                    className="border border-glass-border rounded-xl p-4 bg-liquid-bg hover:border-accent-blue/30 transition-colors"
                  >
                    {/* Header with item badge */}
                    <div className="flex items-center justify-between mb-3">
                      <span className="px-2.5 py-1 rounded-lg bg-accent-blue/10 text-accent-blue text-xs font-semibold">
                        {t("orders.detail.item_index", { index: index + 1 })}
                      </span>
                    </div>

                    {/* Product URL if exists */}
                    {item.product_url && (
                      <div className="mb-3 pb-3 border-b border-glass-border">
                        <label className="text-xs uppercase tracking-wide text-text-secondary mb-1.5 block font-semibold">
                          {t("orders.product_link")}
                        </label>
                        <a
                          href={item.product_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-accent-blue hover:underline break-all text-sm"
                        >
                          {item.product_url}
                        </a>
                      </div>
                    )}

                    {/* Info Grid */}
                    <div className="grid grid-cols-3 gap-3 mb-3">
                      <div className="text-center p-2.5 rounded-lg bg-glass-white/5 border border-glass-border">
                        <label className="text-xs uppercase tracking-wide text-text-secondary block mb-1.5 font-semibold">
                          {t("orders.qty")}
                        </label>
                        <p className="text-xl font-bold text-text-primary">
                          {item.product_qty || 0}
                        </p>
                      </div>
                      <div className="text-center p-2.5 rounded-lg bg-glass-white/5 border border-glass-border">
                        <label className="text-xs uppercase tracking-wide text-text-secondary block mb-1.5 font-semibold">
                          {t("orders.price")}
                        </label>
                        <p className="text-xl font-bold text-text-primary">
                          {item.price?.toLocaleString()}
                        </p>
                      </div>
                      <div className="text-center p-2.5 rounded-lg bg-glass-white/5 border border-glass-border">
                        <label className="text-xs uppercase tracking-wide text-text-secondary block mb-1.5 font-semibold">
                          {t("orders.form.weight")}
                        </label>
                        <p className="text-xl font-bold text-text-primary">
                          {item.product_weight || 0}{" "}
                          <span className="text-sm">kg</span>
                        </p>
                      </div>
                    </div>

                    {/* Total Section */}
                    <div className="pt-3 border-t border-glass-border">
                      <div className="flex justify-between items-center">
                        <span className="text-sm font-semibold uppercase tracking-wide text-text-secondary">
                          {t("orders.total")}
                        </span>
                        <span className="text-xl font-bold text-accent-blue">
                          {(
                            (item.price || 0) * (item.product_qty || 0)
                          ).toLocaleString()}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}

                <div className="pt-4 border-t border-glass-border grid grid-cols-2 lg:grid-cols-4 gap-4">
                  <div>
                    <label className="block text-sm font-bold text-text-secondary mb-1">
                      {t("orders.total_qty")}
                    </label>
                    <p className="text-text-primary font-bold">
                      {order.total_qty}
                    </p>
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-text-secondary mb-1">
                      {t("orders.total_price")}
                    </label>
                    <p className="text-text-primary font-bold">
                      {order.total_price?.toLocaleString()}
                    </p>
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-text-secondary mb-1">
                      {t("orders.total_weight")}
                    </label>
                    <p className="text-text-primary font-bold">
                      {order.total_weight}
                    </p>
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-text-secondary mb-1">
                      {t("orders.form.exchange_rate")}
                    </label>
                    <p className="text-text-primary font-bold">
                      {order.exchange_rate?.toLocaleString()}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Timeline/Dates Card */}
            <div className="glass-panel p-6">
              <h2 className="text-lg font-semibold text-text-primary mb-4">
                {t("orders.detail.timeline")}
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
                {renderEditableDate(
                  t("orders.form.order_date"),
                  "order_date",
                  order.order_date,
                )}
                {renderEditableDate(
                  t("orders.form.arrived_date"),
                  "arrived_date",
                  order.arrived_date,
                )}
                {renderEditableDate(
                  t("orders.form.shipment_date"),
                  "shipment_date",
                  order.shipment_date,
                )}
                {renderEditableDate(
                  t("orders.form.user_withdraw_date"),
                  "user_withdraw_date",
                  order.user_withdraw_date,
                )}
              </div>
            </div>
          </motion.div>

          {/* Sidebar - Financials */}
          <motion.div variants={itemVariants} className="space-y-6">
            <div className="glass-panel p-6">
              <h2 className="text-lg font-semibold text-text-primary mb-4">
                {t("orders.detail.financial_summary")}
              </h2>
              <div className="space-y-3">
                <div className="flex justify-between items-center py-2 border-b border-glass-border">
                  <span className="text-text-secondary">
                    {t("orders.total_price")}
                  </span>
                  <span className="text-text-primary">
                    {order.total_price?.toLocaleString()}
                  </span>
                </div>
                {renderEditableFee(
                  t("orders.form.service_fee"),
                  "service_fee",
                  order.service_fee,
                  order.service_fee_type === "percent" ? "%" : undefined,
                )}
                {renderEditableFee(
                  t("orders.form.shipping_fee"),
                  "shipping_fee",
                  order.shipping_fee,
                )}
                {renderEditableFee(
                  t("orders.form.delivery_fee"),
                  "delivery_fee",
                  order.delivery_fee,
                )}
                {renderEditableFee(
                  t("orders.form.cargo_fee"),
                  "cargo_fee",
                  order.cargo_fee,
                )}
                <div className="mt-4 pt-4 flex justify-between items-center">
                  <span className="font-semibold text-text-primary">
                    {t("orders.total")}
                  </span>
                  <span className="font-bold text-xl text-success">
                    {orderTotal.toLocaleString()}
                  </span>
                </div>
                <div className="pt-3 mt-2 border-t border-glass-border flex justify-between items-center">
                  <span className="font-semibold text-text-primary">
                    {t("orders.invoice.total_with_exchange")}
                  </span>
                  <span className="font-bold text-xl text-accent-blue">
                    {totalWithExchange.toLocaleString()}
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
