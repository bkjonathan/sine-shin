import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
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
import { invoke } from "@tauri-apps/api/core";
import { formatDate } from "../utils/date";
import QRCode from "qrcode";
import DatePicker from "../components/ui/DatePicker";
import { Button, Select } from "../components/ui";
import OrderDetailCustomerCard from "../components/pages/order-detail/OrderDetailCustomerCard";
import OrderDetailFinancialSummaryCard from "../components/pages/order-detail/OrderDetailFinancialSummaryCard";
import OrderDetailHeader from "../components/pages/order-detail/OrderDetailHeader";
import OrderDetailProductsCard from "../components/pages/order-detail/OrderDetailProductsCard";
import OrderDetailStatusCard from "../components/pages/order-detail/OrderDetailStatusCard";
import OrderDetailTimelineCard from "../components/pages/order-detail/OrderDetailTimelineCard";
import OrderInvoicePrintLayout from "../components/pages/order-detail/OrderInvoicePrintLayout";
import { IconCheck, IconCircle, IconEdit, IconX } from "../components/icons";

const ORDER_STATUS_OPTIONS: OrderStatus[] = [
  "pending",
  "confirmed",
  "shipping",
  "completed",
  "cancelled",
];

const getOrderStatusDisplay = (
  status?: string | null,
): { labelKey: string; className: string } => {
  switch (status) {
    case "pending":
      return {
        labelKey: "orders.status_pending",
        className:
          "bg-yellow-500/10 text-yellow-500 border border-yellow-500/20",
      };
    case "confirmed":
      return {
        labelKey: "orders.status_confirmed",
        className: "bg-sky-500/10 text-sky-500 border border-sky-500/20",
      };
    case "shipping":
      return {
        labelKey: "orders.status_shipping",
        className:
          "bg-indigo-500/10 text-indigo-500 border border-indigo-500/20",
      };
    case "completed":
      return {
        labelKey: "orders.status_completed",
        className: "bg-green-500/10 text-green-500 border border-green-500/20",
      };
    case "cancelled":
      return {
        labelKey: "orders.status_cancelled",
        className: "bg-red-500/10 text-red-500 border border-red-500/20",
      };
    default:
      return {
        labelKey: "orders.status_unknown",
        className:
          "bg-glass-white text-text-secondary border border-glass-border",
      };
  }
};

export default function OrderDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
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
        product_discount: order.product_discount,
        service_fee_type: order.service_fee_type,
        shipping_fee_paid: order.shipping_fee_paid,
        delivery_fee_paid: order.delivery_fee_paid,
        cargo_fee_paid: order.cargo_fee_paid,
        service_fee_paid: order.service_fee_paid,
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
    const returnTo = (location.state as { returnTo?: string } | null)?.returnTo;
    navigate(returnTo || "/orders");
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
        <Button onClick={handleBack} variant="primary">
          {t("orders.detail.back_to_list")}
        </Button>
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
  const productDiscount = order.product_discount || 0;
  const orderProfit = serviceFeeAmount + productDiscount;

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
                className="py-1!"
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
              <IconCheck size={16} strokeWidth={2} />
            </button>
            <button
              onClick={handleCancel}
              disabled={isUpdating}
              className="p-1 text-text-secondary hover:bg-text-secondary/10 rounded"
            >
              <IconX size={16} strokeWidth={2} />
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
              <IconEdit size={14} strokeWidth={2} />
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
    const statusDisplay = getOrderStatusDisplay(value);

    return (
      <div className="space-y-2">
        {label ? (
          <label className="block text-sm text-text-secondary">{label}</label>
        ) : null}
        {isEditing ? (
          <div className="flex items-center gap-2 flex-wrap">
            <div className="w-full">
              <Select
                options={ORDER_STATUS_OPTIONS.map((status) => ({
                  value: status,
                  label: t(getOrderStatusDisplay(status).labelKey),
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
              <IconCheck size={16} strokeWidth={2} />
            </button>
            <button
              onClick={handleCancel}
              disabled={isUpdating}
              className="p-1 text-text-secondary hover:bg-text-secondary/10 rounded"
            >
              <IconX size={16} strokeWidth={2} />
            </button>
          </div>
        ) : (
          <button
            type="button"
            className="group inline-flex w-full items-center justify-between gap-2 rounded-xl border border-glass-border bg-glass-white px-3 py-2 hover:bg-glass-white-hover hover:border-accent-blue/30 transition-colors"
            onClick={() => {
              setTempValue(value || "pending");
              setEditingField(field);
            }}
            title="Click to edit"
          >
            <span
              className={`${statusDisplay.className} inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold`}
            >
              {t(statusDisplay.labelKey)}
            </span>
            <span className="text-text-muted group-hover:text-accent-blue transition-colors">
              <IconEdit size={14} strokeWidth={2} />
            </span>
          </button>
        )}
      </div>
    );
  };

  const handleToggleFeePaid = async (
    feePaidField: string,
    currentValue: boolean,
  ) => {
    if (!orderDetail) return;
    try {
      setIsUpdating(true);
      const { order, items } = orderDetail;
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
        product_discount: order.product_discount,
        service_fee_type: order.service_fee_type,
        shipping_fee_paid: order.shipping_fee_paid,
        delivery_fee_paid: order.delivery_fee_paid,
        cargo_fee_paid: order.cargo_fee_paid,
        service_fee_paid: order.service_fee_paid,
        shipping_fee_by_shop: order.shipping_fee_by_shop,
        delivery_fee_by_shop: order.delivery_fee_by_shop,
        cargo_fee_by_shop: order.cargo_fee_by_shop,
        exclude_cargo_fee: order.exclude_cargo_fee,
      };
      updatedOrder[feePaidField] = !currentValue;
      await updateOrder(updatedOrder);
      await loadData(order.id);
      playSound("success");
    } catch (err) {
      console.error("Failed to toggle fee paid:", err);
      playSound("error");
    } finally {
      setIsUpdating(false);
    }
  };

  const renderEditableFee = (
    label: string,
    field: string,
    value: number | undefined | null,
    suffix?: string,
    feePaidField?: string,
    isPaid?: boolean,
    shopExpenseField?: string,
    isShopExpense?: boolean,
    excludeCargoField?: string,
    isExcluded?: boolean,
  ) => {
    const isEditing = editingField === field;

    return (
      <div className="flex justify-between items-start py-2.5 border-b border-glass-border gap-4">
        <div className="flex flex-col gap-1 min-w-0">
          <span className="text-text-secondary text-sm whitespace-nowrap">
            {label}
          </span>
          {(feePaidField !== undefined ||
            shopExpenseField !== undefined ||
            excludeCargoField !== undefined) && (
            <div className="flex items-center gap-1.5 flex-wrap">
              {feePaidField !== undefined && (
                <button
                  type="button"
                  disabled={isUpdating}
                  onClick={() => handleToggleFeePaid(feePaidField, !!isPaid)}
                  className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium transition-colors cursor-pointer ${
                    isPaid
                      ? "bg-success/15 text-success hover:bg-success/25"
                      : "bg-rose-500/15 text-rose-500 hover:bg-rose-500/25"
                  }`}
                  title={
                    isPaid ? t("orders.detail.paid") : t("orders.detail.unpaid")
                  }
                >
                  {isPaid ? (
                    <IconCheck size={10} strokeWidth={2.5} />
                  ) : (
                    <IconCircle size={10} strokeWidth={2.5} />
                  )}
                  {isPaid ? t("orders.detail.paid") : t("orders.detail.unpaid")}
                </button>
              )}
              {shopExpenseField !== undefined && (
                <button
                  type="button"
                  disabled={isUpdating}
                  onClick={() =>
                    handleToggleFeePaid(shopExpenseField, !!isShopExpense)
                  }
                  className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold transition-all cursor-pointer ${
                    isShopExpense
                      ? "bg-amber-500/15 text-amber-500 border border-amber-500/30 hover:bg-amber-500/20"
                      : "bg-glass-surface text-text-muted border border-glass-border hover:bg-glass-surface-hover"
                  }`}
                  title={t("orders.form.shop_expense")}
                >
                  Shop
                  {isShopExpense ? (
                    <IconCheck size={10} strokeWidth={2.5} />
                  ) : (
                    <IconCircle size={10} strokeWidth={2.5} />
                  )}
                </button>
              )}
              {excludeCargoField !== undefined && (
                <button
                  type="button"
                  disabled={isUpdating}
                  onClick={() =>
                    handleToggleFeePaid(excludeCargoField, !!isExcluded)
                  }
                  className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold transition-all cursor-pointer ${
                    isExcluded
                      ? "bg-rose-500/15 text-rose-500 border border-rose-500/30 hover:bg-rose-500/20"
                      : "bg-glass-surface text-text-muted border border-glass-border hover:bg-glass-surface-hover"
                  }`}
                  title={t("orders.form.exclude_cargo")}
                >
                  {isExcluded ? "Excluded" : "Include"}
                </button>
              )}
            </div>
          )}
        </div>
        {isEditing ? (
          <div className="flex items-center gap-2 shrink-0">
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
              <IconCheck size={16} strokeWidth={2} />
            </button>
            <button
              onClick={handleCancel}
              disabled={isUpdating}
              className="p-1 text-text-secondary hover:bg-text-secondary/10 rounded"
            >
              <IconX size={16} strokeWidth={2} />
            </button>
          </div>
        ) : (
          <div
            className="flex items-center gap-2 cursor-pointer group shrink-0"
            onClick={() => handleEditClick(field, value, "number")}
            title="Click to edit"
          >
            <span className="opacity-0 group-hover:opacity-100 transition-opacity text-accent-blue">
              <IconEdit size={14} strokeWidth={2} />
            </span>
            <span className="text-text-primary font-medium hover:text-accent-blue hover:underline decoration-dashed underline-offset-4 transition-colors">
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
        <motion.div variants={itemVariants}>
          <OrderDetailHeader
            orderDisplayId={order.order_id || order.id}
            createdAt={order.created_at}
            downloading={downloading}
            printing={printing}
            onBack={handleBack}
            onDownloadInvoice={handleDownloadInvoice}
            onPrintInvoice={handlePrintInvoice}
          />
        </motion.div>

        <OrderInvoicePrintLayout
          invoiceRef={invoiceRef}
          shopSettings={shopSettings}
          order={order}
          items={items}
          customerName={customerName}
          customerCode={customerCode}
          customerPhone={customerPhone}
          customerCity={customerCity}
          customerAddress={customerAddress}
          customerPlatform={customerPlatform}
          qrCodeUrl={qrCodeUrl}
          serviceFeeAmount={serviceFeeAmount}
          orderTotal={orderTotal}
          exchangeRate={exchangeRate}
          totalWithExchange={totalWithExchange}
          formatPrice={formatPrice}
          formatExchangePrice={formatExchangePrice}
        />

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <motion.div
            variants={itemVariants}
            className="lg:col-span-2 space-y-6"
          >
            <OrderDetailCustomerCard
              customerName={customerName}
              customerCode={customerCode}
              customerPhone={customerPhone}
              customerCity={customerCity}
              customerAddress={customerAddress}
              customerPlatform={customerPlatform}
            />
            <OrderDetailProductsCard
              items={items}
              order={order}
              formatPrice={formatPrice}
              formatExchangePrice={formatExchangePrice}
            />
            <OrderDetailTimelineCard
              order={order}
              renderEditableDate={renderEditableDate}
            />
          </motion.div>

          <motion.div variants={itemVariants} className="space-y-6">
            <OrderDetailStatusCard
              status={order.status}
              renderEditableStatus={renderEditableStatus}
            />
            <OrderDetailFinancialSummaryCard
              order={order}
              orderTotal={orderTotal}
              orderProfit={orderProfit}
              totalWithExchange={totalWithExchange}
              formatPrice={formatPrice}
              formatExchangePrice={formatExchangePrice}
              renderEditableFee={renderEditableFee}
            />
          </motion.div>
        </div>
      </motion.div>
    </div>
  );
}
