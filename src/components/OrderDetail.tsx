import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { useTranslation } from "react-i18next";
import { getOrderById, updateOrder } from "../api/orderApi";
import { getShopSettings, ShopSettings } from "../api/settingApi";
import { getCustomerById } from "../api/customerApi";
import { OrderDetail as OrderDetailType, OrderStatus } from "../types/order";
import { Customer } from "../types/customer";
import { useAppSettings } from "../context/AppSettingsContext";
import { useSound } from "../context/SoundContext";
import html2canvas from "html2canvas";
import { save } from "@tauri-apps/plugin-dialog";
import { writeFile } from "@tauri-apps/plugin-fs";
import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { formatDate } from "../utils/date";
import QRCode from "qrcode";
import DatePicker from "./ui/DatePicker";
import { Select } from "./ui/Select";

const ORDER_STATUS_OPTIONS: OrderStatus[] = [
  "pending",
  "confirmed",
  "shipping",
  "completed",
  "cancelled",
];

const getOrderStatusLabelKey = (status?: string | null): string => {
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

export default function OrderDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { playSound } = useSound();
  const {
    formatPrice,
    exchange_currency_symbol,
    invoice_printer_name,
    silent_invoice_print,
  } = useAppSettings();
  const invoiceRef = useRef<HTMLDivElement>(null);

  const [orderDetail, setOrderDetail] = useState<OrderDetailType | null>(null);
  const [customerDetail, setCustomerDetail] = useState<Customer | null>(null);
  const [shopSettings, setShopSettings] = useState<ShopSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [printing, setPrinting] = useState(false);

  // Editing state
  const [editingField, setEditingField] = useState<string | null>(null);
  const [tempValue, setTempValue] = useState("");
  const [isUpdating, setIsUpdating] = useState(false);
  const [qrCodeUrl, setQrCodeUrl] = useState<string>("");

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

          // Generate QR Code
          const qrData = {
            orderId: orderData.order.order_id || orderData.order.id,
            customer: {
              name: customerData.name,
              phone: customerData.phone,
              city: customerData.city,
              address: customerData.address,
              customer_id: customerData.customer_id,
            },
          };

          try {
            const url = await QRCode.toDataURL(JSON.stringify(qrData));
            setQrCodeUrl(url);
          } catch (err) {
            console.error("Error generating QR code:", err);
          }
        } catch (customerErr) {
          console.error("Failed to fetch customer details:", customerErr);
        }
      } else {
        // Generate QR Code without customer details if not available
        const qrData = {
          orderId: orderData.order.order_id || orderData.order.id,
          customer: null,
        };

        try {
          const url = await QRCode.toDataURL(JSON.stringify(qrData));
          setQrCodeUrl(url);
        } catch (err) {
          console.error("Error generating QR code:", err);
        }
      }
    } catch (err) {
      console.error("Failed to fetch data:", err);
      setError(t("orders.detail.error_loading"));
    } finally {
      setLoading(false);
    }
  };

  const captureInvoicePngBytes = async (): Promise<Uint8Array> => {
    if (!invoiceRef.current || !orderDetail) {
      console.error("Missing ref or order", {
        ref: !!invoiceRef.current,
        order: !!orderDetail,
      });
      throw new Error(t("orders.invoice.error_element_not_found"));
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
    const canvas = await html2canvas(invoiceRef.current, {
      scale: 2,
      useCORS: true,
      backgroundColor: "#ffffff",
      logging: false,
    });

    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, "image/png");
    });
    if (!blob) throw new Error(t("orders.invoice.error_blob_generation"));
    const buffer = await blob.arrayBuffer();
    return new Uint8Array(buffer);
  };

  const handleDownloadInvoice = async () => {
    if (!orderDetail) {
      alert(t("orders.invoice.error_element_not_found"));
      return;
    }
    const { order } = orderDetail;

    try {
      setDownloading(true);
      playSound("click");
      const uint8Array = await captureInvoicePngBytes();

      const fileName = `invoice_${order.order_id || order.id}.png`;

      const filePath = await save({
        defaultPath: fileName,
        filters: [
          {
            name: t("common.image"),
            extensions: ["png"],
          },
        ],
      });

      if (filePath) {
        await writeFile(filePath, uint8Array);
        playSound("success");
        alert(t("orders.invoice.success_saved"));
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

  const handlePrintInvoice = async () => {
    if (!window.__TAURI_INTERNALS__) {
      window.print();
      return;
    }

    try {
      setPrinting(true);
      playSound("click");

      if (silent_invoice_print) {
        const bytes = await captureInvoicePngBytes();
        await invoke("print_invoice_direct", {
          bytes: Array.from(bytes),
          printerName:
            invoice_printer_name.trim().length > 0
              ? invoice_printer_name.trim()
              : null,
        });
        playSound("success");
        return;
      }

      await invoke("print_window");
    } catch (error) {
      console.error("Failed to print:", error);
      window.print();
    } finally {
      setPrinting(false);
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

      // Determine field type for update parsing
      const isDateField = [
        "order_date",
        "arrived_date",
        "shipment_date",
        "user_withdraw_date",
      ].includes(editingField);
      const isStatusField = editingField === "status";

      let newValue: string | number | null = null;

      if (isDateField) {
        if (tempValue) {
          const d = new Date(tempValue);
          if (!isNaN(d.getTime())) {
            newValue = d.toISOString();
          }
        }
      } else if (isStatusField) {
        newValue = tempValue || "pending";
      } else {
        // Numeric field
        newValue = tempValue === "" ? 0 : parseFloat(tempValue);
        if (isNaN(newValue)) newValue = 0;
      }

      // Construct the update payload
      const updatedOrder: any = {
        id: order.id,
        customer_id: order.customer_id,
        status: order.status || "pending",
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
  const formatExchangePrice = (amount: number) => {
    const formattedNumber = new Intl.NumberFormat("en-US", {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }).format(amount);
    return `${exchange_currency_symbol} ${formattedNumber}`;
  };

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
            <div className="w-[180px]">
              <DatePicker
                selected={tempValue ? new Date(tempValue) : null}
                onChange={(date: Date | null) =>
                  setTempValue(date ? date.toISOString() : "")
                }
                dateFormat="dd/MM/yyyy"
                placeholderText="Select date"
                placement="top-start"
                autoFocus
                className="!py-1"
                showMonthDropdown
                showYearDropdown
                dropdownMode="select"
              />
            </div>
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

  const renderEditableStatus = (
    label: string,
    field: "status",
    value: OrderStatus | undefined,
  ) => {
    const isEditing = editingField === field;

    return (
      <div>
        <label className="block text-sm text-text-secondary mb-1">
          {label}
        </label>
        {isEditing ? (
          <div className="flex items-center gap-2">
            <div className="w-[180px]">
              <Select
                options={ORDER_STATUS_OPTIONS.map((status) => ({
                  value: status,
                  label: t(getOrderStatusLabelKey(status)),
                }))}
                value={tempValue || "pending"}
                onChange={(next) => setTempValue(next.toString())}
              />
            </div>
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
            onClick={() => {
              setTempValue(value || "pending");
              setEditingField(field);
            }}
            title="Click to edit"
          >
            <p className="text-text-primary hover:text-accent-blue hover:underline decoration-dashed underline-offset-4 transition-colors">
              {t(getOrderStatusLabelKey(value))}
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
          className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"
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
              <div className="mt-2">
                {renderEditableStatus(
                  t("orders.form.status"),
                  "status",
                  order.status,
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3 sm:justify-end">
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
            <button
              onClick={handlePrintInvoice}
              disabled={printing}
              className="btn-liquid btn-liquid-secondary flex items-center gap-2"
            >
              {printing ? (
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
                  <polyline points="6 9 6 2 18 2 18 9"></polyline>
                  <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path>
                  <rect x="6" y="14" width="12" height="8"></rect>
                </svg>
              )}
              {printing
                ? t("orders.invoice.generating")
                : t("orders.invoice.print")}
            </button>
          </div>
        </motion.div>

        {/* Hidden Invoice Layout for Capture */}
        <div className="fixed left-[-9999px] top-[-9999px] print-source-wrapper">
          <div
            id="invoice-print-container"
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
                      {t("orders.product_link")}
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
                        {item.product_url && (
                          <div
                            style={{
                              fontSize: "12px",
                              color: "#0f172a",
                              marginTop: "4px",
                              wordBreak: "break-all",
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
                        {formatPrice(item.price || 0)}
                      </td>
                      <td
                        style={{
                          padding: "16px 0",
                          textAlign: "right",
                          fontWeight: "600",
                        }}
                      >
                        {formatPrice(
                          (item.price || 0) * (item.product_qty || 1),
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Total Section with QR Code */}
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "flex-end",
              }}
            >
              <div style={{ textAlign: "left" }}>
                {qrCodeUrl && (
                  <img
                    src={qrCodeUrl}
                    alt="Order QR Code"
                    style={{ width: "100px", height: "100px" }}
                  />
                )}
              </div>
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
                    {formatPrice(order.total_price || 0)}
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
                    {formatExchangePrice(exchangeRate)}
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
                  <span>{formatPrice(orderTotal)}</span>
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
                  <span>{formatExchangePrice(totalWithExchange)}</span>
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
              <div className="border border-glass-border rounded-xl p-6 bg-liquid-bg hover:border-accent-blue/30 transition-colors">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 pb-4 border-b border-glass-border gap-4">
                  <div>
                    <h3 className="text-xl font-bold text-text-primary">
                      {customerName}
                    </h3>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="px-2 py-0.5 rounded text-xs font-medium bg-accent-blue/10 text-accent-blue border border-accent-blue/20">
                        {t("customers.id_label")}: {customerCode}
                      </span>
                      <span className="px-2 py-0.5 rounded text-xs font-medium bg-glass-white/10 text-text-secondary border border-glass-border">
                        {customerPlatform}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-4">
                    <div>
                      <label className="text-xs uppercase tracking-wide text-text-secondary block mb-1.5 font-semibold">
                        {t("customers.form.phone")}
                      </label>
                      <p className="text-text-primary font-medium flex items-center gap-2">
                        <svg
                          className="w-4 h-4 text-accent-blue"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"
                          />
                        </svg>
                        {customerPhone}
                      </p>
                    </div>
                    <div>
                      <label className="text-xs uppercase tracking-wide text-text-secondary block mb-1.5 font-semibold">
                        {t("customers.form.city")}
                      </label>
                      <p className="text-text-primary font-medium flex items-center gap-2">
                        <svg
                          className="w-4 h-4 text-accent-blue"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
                          />
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"
                          />
                        </svg>
                        {customerCity}
                      </p>
                    </div>
                  </div>

                  <div>
                    <label className="text-xs uppercase tracking-wide text-text-secondary block mb-1.5 font-semibold">
                      {t("customers.form.address")}
                    </label>
                    <p className="text-text-primary font-medium leading-relaxed bg-glass-white/5 p-3 rounded-lg border border-glass-border min-h-[80px]">
                      {customerAddress}
                    </p>
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
                          {formatPrice(item.price || 0)}
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
                          {formatPrice(
                            (item.price || 0) * (item.product_qty || 0),
                          )}
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
                      {formatPrice(order.total_price || 0)}
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
                      {formatExchangePrice(order.exchange_rate || 0)}
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
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-4">
                {renderEditableStatus(
                  t("orders.form.status"),
                  "status",
                  order.status,
                )}
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
                    {formatPrice(order.total_price || 0)}
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
                    {formatPrice(orderTotal)}
                  </span>
                </div>
                <div className="pt-3 mt-2 border-t border-glass-border flex justify-between items-center">
                  <span className="font-semibold text-text-primary">
                    {t("orders.invoice.total_with_exchange")}
                  </span>
                  <span className="font-bold text-xl text-accent-blue">
                    {formatExchangePrice(totalWithExchange)}
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
