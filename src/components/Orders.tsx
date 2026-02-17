import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence, Variants } from "framer-motion";
import {
  getOrdersPaginated,
  ORDER_PAGE_SIZE_LIMITS,
  createOrder,
  updateOrder,
  deleteOrder,
  getOrderById,
  getOrdersForExport,
} from "../api/orderApi";
import { formatDate } from "../utils/date";
import { getCustomers } from "../api/customerApi";
import { OrderWithCustomer, OrderItemPayload } from "../types/order";
import { Customer } from "../types/customer";
import { useSound } from "../context/SoundContext";
import { useTranslation } from "react-i18next";
import { Select } from "./ui/Select";
import { parseCSV } from "../utils/csvUtils";
import { processOrderCSV } from "../utils/orderImportUtils";
import { useAppSettings } from "../context/AppSettingsContext";

// ── Animation Variants ──
const fadeVariants: Variants = {
  hidden: { opacity: 0, y: 12 },
  show: {
    opacity: 1,
    y: 0,
    transition: { type: "spring", stiffness: 300, damping: 24 },
  },
};

const modalVariants: Variants = {
  hidden: { opacity: 0, scale: 0.95, y: 10 },
  visible: { opacity: 1, scale: 1, y: 0 },
  exit: { opacity: 0, scale: 0.95, y: 10 },
};

const getVisiblePages = (currentPage: number, totalPages: number): string[] => {
  if (totalPages <= 0) {
    return [];
  }

  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, i) => String(i + 1));
  }

  const pages: string[] = ["1"];
  const start = Math.max(2, currentPage - 1);
  const end = Math.min(totalPages - 1, currentPage + 1);

  if (start > 2) {
    pages.push("...");
  }

  for (let page = start; page <= end; page++) {
    pages.push(String(page));
  }

  if (end < totalPages - 1) {
    pages.push("...");
  }

  pages.push(String(totalPages));
  return pages;
};

export default function Orders() {
  const pageSizeOptions: Array<number | "all"> = [5, 10, 20, 50, 100, "all"];
  const [orders, setOrders] = useState<OrderWithCustomer[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const [isPageTransitioning, setIsPageTransitioning] = useState(false);
  const [pageTransitionKey, setPageTransitionKey] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState<number | "all">(
    ORDER_PAGE_SIZE_LIMITS.default,
  );
  const [totalOrders, setTotalOrders] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [searchKey, setSearchKey] = useState<
    "customerName" | "orderId" | "customerId" | "customerPhone"
  >("customerName");
  const [searchInput, setSearchInput] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const { playSound } = useSound();
  const { t } = useTranslation();
  const { formatPrice } = useAppSettings();
  const navigate = useNavigate();

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingOrder, setEditingOrder] = useState<OrderWithCustomer | null>(
    null,
  );
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Import State
  const fileInputRef = useRef<HTMLInputElement>(null);
  const latestFetchIdRef = useRef(0);
  const [isImporting, setIsImporting] = useState(false);
  const visiblePages = getVisiblePages(currentPage, totalPages);
  const displayPages = visiblePages.length > 0 ? visiblePages : ["1"];

  // Form State
  // Form State
  const initialFormState = {
    customer_id: "",
    order_from: "Facebook",
    items: [] as OrderItemPayload[],
    exchange_rate: "",
    shipping_fee: "",
    delivery_fee: "",
    cargo_fee: "",
    order_date: "",
    arrived_date: "",
    shipment_date: "",
    user_withdraw_date: "",
    service_fee: "",
    service_fee_type: "fixed",
  };
  const [formData, setFormData] = useState(initialFormState);

  useEffect(() => {
    // console.log("Form Data Changed:", formData);
  }, [formData]);

  // Delete State
  const [orderToDelete, setOrderToDelete] = useState<OrderWithCustomer | null>(
    null,
  );
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);

  useEffect(() => {
    fetchCustomers();
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      setSearchTerm(searchInput.trim());
    }, 300);

    return () => clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    fetchOrders(currentPage);
  }, [currentPage, pageSize, searchKey, searchTerm]);

  const fetchOrders = async (page: number) => {
    const fetchId = ++latestFetchIdRef.current;
    const shouldShowInitialLoader = !hasLoadedOnce;

    if (shouldShowInitialLoader) {
      setLoading(true);
    } else {
      setIsPageTransitioning(true);
    }

    try {
      const data = await getOrdersPaginated({
        page,
        pageSize,
        searchKey,
        searchTerm,
      });

      if (fetchId !== latestFetchIdRef.current) {
        return;
      }

      if (page > 1 && data.total_pages > 0 && page > data.total_pages) {
        setCurrentPage(data.total_pages);
        return;
      }
      if (page > 1 && data.total_pages === 0) {
        setCurrentPage(1);
        return;
      }

      setOrders(data.orders);
      setTotalOrders(data.total);
      setTotalPages(data.total_pages);
      setHasLoadedOnce(true);
      setPageTransitionKey((prev) => prev + 1);
    } catch (error) {
      console.error("Failed to fetch orders:", error);
    } finally {
      if (fetchId === latestFetchIdRef.current) {
        setLoading(false);
        setIsPageTransitioning(false);
      }
    }
  };

  const fetchCustomers = async () => {
    try {
      const data = await getCustomers();
      setCustomers(data);
    } catch (error) {
      console.error("Failed to fetch customers:", error);
    }
  };

  const handleOpenModal = async (order?: OrderWithCustomer) => {
    if (order) {
      setEditingOrder(order);
      // Fetch details to get items
      try {
        const detail = await getOrderById(order.id);
        setFormData({
          customer_id: order.customer_id?.toString() || "",
          order_from: order.order_from || "Facebook",
          // Map OrderItem to OrderItemPayload
          items: detail.items.map((item) => ({
            product_url: item.product_url,
            product_qty: item.product_qty,
            price: item.price,
            product_weight: item.product_weight,
          })),
          exchange_rate: order.exchange_rate?.toString() || "",
          shipping_fee: order.shipping_fee?.toString() || "",
          delivery_fee: order.delivery_fee?.toString() || "",
          cargo_fee: order.cargo_fee?.toString() || "",
          order_date: order.order_date || "",
          arrived_date: order.arrived_date || "",
          shipment_date: order.shipment_date || "",
          user_withdraw_date: order.user_withdraw_date || "",
          service_fee: order.service_fee?.toString() || "",
          service_fee_type: order.service_fee_type || "fixed",
        });
        setIsModalOpen(true);
      } catch (e) {
        console.error("Failed to load details for editing", e);
        // Maybe show error notification
      }
    } else {
      setEditingOrder(null);
      setFormData({
        ...initialFormState,
        items: [
          { product_url: "", product_qty: 1, price: 0, product_weight: 0 },
        ],
        order_date: "",
        arrived_date: "",
        shipment_date: "",
        user_withdraw_date: "",
        service_fee: "",
        service_fee_type: "fixed",
      });
      setIsModalOpen(true);
    }
    playSound("click");
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditingOrder(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.customer_id) return;

    try {
      setIsSubmitting(true);

      const payload: any = {
        customer_id: parseInt(formData.customer_id),
        order_from: formData.order_from || undefined,
        items: formData.items.map((item) => ({
          product_url: item.product_url || undefined,
          product_qty: item.product_qty ? Number(item.product_qty) : undefined,
          price: item.price ? Number(item.price) : undefined,
          product_weight: item.product_weight
            ? Number(item.product_weight)
            : undefined,
        })),
        exchange_rate: formData.exchange_rate
          ? parseFloat(formData.exchange_rate)
          : undefined,
        shipping_fee: formData.shipping_fee
          ? parseFloat(formData.shipping_fee)
          : undefined,
        delivery_fee: formData.delivery_fee
          ? parseFloat(formData.delivery_fee)
          : undefined,
        cargo_fee: formData.cargo_fee
          ? parseFloat(formData.cargo_fee)
          : undefined,
        order_date: formData.order_date || undefined,
        arrived_date: formData.arrived_date || undefined,
        shipment_date: formData.shipment_date || undefined,
        user_withdraw_date: formData.user_withdraw_date || undefined,
        service_fee: formData.service_fee
          ? parseFloat(formData.service_fee)
          : undefined,
        service_fee_type: formData.service_fee_type || "fixed",
      };

      if (editingOrder) {
        await updateOrder({
          ...payload,
          id: editingOrder.id,
        });
      } else {
        await createOrder(payload);
      }
      playSound("success");
      await fetchOrders(currentPage);
      handleCloseModal();
    } catch (error) {
      console.error("Failed to save order:", error);
      playSound("error");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!orderToDelete) return;
    try {
      await deleteOrder(orderToDelete.id);
      playSound("success");
      await fetchOrders(currentPage);
      setIsDeleteModalOpen(false);
      setOrderToDelete(null);
    } catch (error) {
      console.error("Failed to delete order:", error);
      playSound("error");
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Reset file input
    e.target.value = "";

    try {
      setIsImporting(true);
      const text = await file.text();
      const records = parseCSV(text);

      if (records.length === 0) {
        playSound("error");
        alert(t("orders.import.no_records_found"));
        return;
      }

      const { validOrders, errors } = processOrderCSV(records, customers);

      if (errors.length > 0) {
        console.warn("CSV Import Errors:", errors);
        const continueImport = window.confirm(
          t("orders.import.confirm_errors_message", {
            count: errors.length,
            errors:
              errors.slice(0, 5).join("\n") +
              (errors.length > 5 ? `\n...and ${errors.length - 5} more.` : ""),
          }),
        );
        if (!continueImport) return;
      }

      if (validOrders.length === 0) {
        playSound("error");
        alert(t("orders.import.no_valid_orders"));
        return;
      }

      let successCount = 0;
      let failCount = 0;

      for (const order of validOrders) {
        try {
          await createOrder(order);
          successCount++;
        } catch (err) {
          console.error("Failed to import order:", order, err);
          failCount++;
        }
      }

      playSound(successCount > 0 ? "success" : "error");
      await fetchOrders(currentPage);

      alert(
        t("orders.import.complete", {
          success: successCount,
          failed: failCount,
        }) +
          (errors.length > 0
            ? t("orders.import.skipped_count", { skipped: errors.length })
            : ""),
      );
    } catch (error) {
      console.error("Failed to parse CSV:", error);
      playSound("error");
      alert(t("orders.import.parse_error"));
    } finally {
      setIsImporting(false);
    }
  };

  const handleExport = async () => {
    try {
      const data = await getOrdersForExport();
      if (!data || data.length === 0) {
        playSound("error");
        alert(t("orders.no_orders"));
        return;
      }

      const headers = [
        "Order ID",
        "Customer Name",
        "Customer Phone",
        "Order From",
        "Order Date",
        "Arrived Date",
        "Shipment Date",
        "Service Fee",
        "Service Fee Type",
        "Exchange Rate",
        "Shipping Fee",
        "Delivery Fee",
        "Cargo Fee",
        "Product URL",
        "Item Qty",
        "Item Price",
        "Item Weight",
        "Created At",
      ];

      const csvRows = data.map((row) => {
        return [
          row.order_id || "",
          `"${(row.customer_name || "").replace(/"/g, '""')}"`,
          `"${(row.customer_phone || "").replace(/"/g, '""')}"`,
          row.order_from || "",
          row.order_date || "",
          row.arrived_date || "",
          row.shipment_date || "",
          row.service_fee || "",
          row.service_fee_type || "",
          row.exchange_rate || "",
          row.shipping_fee || "",
          row.delivery_fee || "",
          row.cargo_fee || "",
          `"${(row.product_url || "").replace(/"/g, '""')}"`,
          row.product_qty || "",
          row.product_price || "",
          row.product_weight || "",
          row.created_at || "",
        ].join(",");
      });

      const csvContent = [headers.join(","), ...csvRows].join("\n");
      const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.setAttribute("href", url);

      const date = new Date().toISOString().split("T")[0];
      link.setAttribute("download", `orders_export_full_${date}.csv`);

      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      playSound("success");
    } catch (error) {
      console.error("Failed to export orders:", error);
      playSound("error");
    }
  };

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
      className="max-w-6xl mx-auto h-full flex flex-col"
    >
      {/* ── Header ── */}
      <motion.div
        variants={fadeVariants}
        className="flex items-center justify-between mb-6"
      >
        <div>
          <h1 className="text-2xl font-bold text-text-primary tracking-tight">
            {t("orders.title")}
          </h1>
          <p className="text-sm text-text-muted mt-1">
            {t("orders.manage_orders")}
          </p>
        </div>
        <div className="flex gap-2">
          <input
            type="file"
            accept=".csv"
            ref={fileInputRef}
            onChange={handleFileUpload}
            className="hidden"
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={isImporting}
            className="btn-liquid btn-liquid-ghost px-4 py-2 text-sm flex items-center gap-2"
          >
            {isImporting ? (
              <div className="w-4 h-4 border-2 border-text-secondary border-t-text-primary rounded-full animate-spin" />
            ) : (
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
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="17 8 12 3 7 8" />
                <line x1="12" y1="3" x2="12" y2="15" />
              </svg>
            )}
            {t("orders.import_csv")}
          </button>
          <button
            onClick={handleExport}
            className="btn-liquid btn-liquid-ghost px-4 py-2 text-sm flex items-center gap-2"
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
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            {t("orders.export_csv")}
          </button>
          <button
            onClick={() => handleOpenModal()}
            className="btn-liquid btn-liquid-primary px-4 py-2 text-sm flex items-center gap-2"
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
              <path d="M12 5v14M5 12h14" />
            </svg>
            {t("orders.add_order")}
          </button>
        </div>
      </motion.div>

      {/* ── Search Bar ── */}
      <motion.div variants={fadeVariants} className="mb-6">
        <div className="flex flex-col md:flex-row gap-3 max-w-2xl">
          <div className="w-full md:w-56">
            <Select
              options={[
                {
                  value: "customerName",
                  label: t("orders.search_key_customer_name"),
                },
                { value: "orderId", label: t("orders.search_key_order_id") },
                {
                  value: "customerId",
                  label: t("orders.search_key_customer_id"),
                },
                {
                  value: "customerPhone",
                  label: t("orders.search_key_customer_phone"),
                },
              ]}
              value={searchKey}
              onChange={(value) => {
                setSearchKey(
                  value as
                    | "customerName"
                    | "orderId"
                    | "customerId"
                    | "customerPhone",
                );
                setCurrentPage(1);
              }}
              placeholder={t("orders.search_by")}
            />
          </div>
          <div className="relative flex-1">
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
              placeholder={t("orders.search_placeholder")}
              value={searchInput}
              onChange={(e) => {
                setSearchInput(e.target.value);
                setCurrentPage(1);
              }}
            />
          </div>
        </div>
      </motion.div>

      {/* ── Order List ── */}
      <motion.div
        variants={fadeVariants}
        className="flex-1 min-h-0 flex flex-col"
      >
        <div className="flex-1 overflow-y-auto pr-1">
          {loading ? (
            <div className="flex justify-center items-center py-20">
              <div className="w-8 h-8 border-2 border-glass-border border-t-accent-blue rounded-full animate-spin" />
            </div>
          ) : orders.length === 0 ? (
            isPageTransitioning ? (
              <div className="flex justify-center items-center py-20">
                <div className="w-8 h-8 border-2 border-glass-border border-t-accent-blue rounded-full animate-spin" />
              </div>
            ) : (
              <div className="text-center py-20 bg-glass-white rounded-xl border border-glass-border">
                <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-glass-white-hover flex items-center justify-center text-text-muted">
                  <svg
                    width="32"
                    height="32"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"></path>
                    <line x1="3" y1="6" x2="21" y2="6"></line>
                    <path d="M16 10a4 4 0 0 1-8 0"></path>
                  </svg>
                </div>
                <h3 className="text-lg font-medium text-text-primary">
                  {t("orders.no_orders")}
                </h3>
                <p className="text-sm text-text-muted mt-1">
                  {searchInput.trim()
                    ? t("orders.no_orders_search")
                    : t("orders.no_orders_create")}
                </p>
              </div>
            )
          ) : (
            <div className="relative">
              <AnimatePresence mode="wait" initial={false}>
                <motion.div
                  key={pageTransitionKey}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.2, ease: "easeOut" }}
                  className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 pb-6"
                >
                  <AnimatePresence mode="popLayout">
                    {orders.map((order) => (
                      <motion.div
                        key={order.id}
                        layout
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        className="glass-panel p-5 group hover:border-accent-blue/30 transition-all duration-300 hover:shadow-lg hover:shadow-accent-blue/5 relative overflow-hidden cursor-pointer"
                        onClick={() => navigate(`/orders/${order.id}`)}
                      >
                        <div className="relative z-10">
                          <div className="flex justify-between items-start mb-3">
                            <div className="bg-glass-white px-2 py-1 rounded text-xs font-mono text-text-secondary border border-glass-border">
                              {order.order_id || t("orders.id_pending")}
                            </div>
                            <div
                              className={`px-2 py-1 rounded text-xs font-medium border ${
                                order.status === "completed"
                                  ? "bg-green-500/10 text-green-500 border-green-500/20"
                                  : order.status === "shipping"
                                    ? "bg-purple-500/10 text-purple-500 border-purple-500/20"
                                    : order.status === "confirmed"
                                      ? "bg-blue-500/10 text-blue-500 border-blue-500/20"
                                      : order.status === "cancelled"
                                        ? "bg-red-500/10 text-red-500 border-red-500/20"
                                        : "bg-yellow-500/10 text-yellow-500 border-yellow-500/20"
                              }`}
                            >
                              {t(
                                `orders.statuses.${order.status || "pending"}`,
                              )}
                            </div>

                            <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200 -mr-2 -mt-2">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleOpenModal(order);
                                }}
                                className="p-2 text-text-muted hover:text-accent-blue hover:bg-glass-white-hover rounded-lg transition-colors"
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
                                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                                </svg>
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setOrderToDelete(order);
                                  setIsDeleteModalOpen(true);
                                }}
                                className="p-2 text-text-muted hover:text-error hover:bg-red-500/10 rounded-lg transition-colors"
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
                                  <polyline points="3 6 5 6 21 6" />
                                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                                </svg>
                              </button>
                            </div>
                          </div>

                          <h3 className="font-semibold text-text-primary text-lg mb-1 truncate">
                            {order.customer_name}
                          </h3>
                          <p className="text-sm text-text-muted mb-4">
                            {t("orders.from")}{" "}
                            <span className="text-text-secondary">
                              {order.order_from || "-"}
                            </span>
                          </p>
                          {order.first_product_url && (
                            <a
                              href={order.first_product_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xs text-accent-blue hover:underline mb-2 block truncate"
                              onClick={(e) => e.stopPropagation()}
                            >
                              {t("orders.product_link")}
                            </a>
                          )}

                          <div className="grid grid-cols-2 gap-2 text-sm text-text-secondary mb-4 bg-glass-white/50 p-2 rounded-lg border border-glass-border/50">
                            <div>
                              <span className="text-text-muted text-xs block">
                                {t("orders.date")}
                              </span>
                              {formatDate(order.order_date)}
                            </div>
                            <div>
                              <span className="text-text-muted text-xs block">
                                {t("orders.qty")}
                              </span>
                              {order.total_qty || 0}
                            </div>
                            <div>
                              <span className="text-text-muted text-xs block">
                                {t("orders.total")}
                              </span>
                              {formatPrice(order.total_price || 0)}
                            </div>
                            <div>
                              <span className="text-text-muted text-xs block">
                                {t("orders.weight")}
                              </span>
                              {order.total_weight || 0} kg
                            </div>
                          </div>

                          {/* Status Indicators */}
                          <div className="flex gap-2 text-xs">
                            {order.arrived_date && (
                              <span className="bg-green-500/10 text-green-500 px-2 py-0.5 rounded border border-green-500/20">
                                {t("orders.status_arrived")}
                              </span>
                            )}
                            {order.shipment_date && (
                              <span className="bg-blue-500/10 text-blue-500 px-2 py-0.5 rounded border border-blue-500/20">
                                {t("orders.status_shipped")}
                              </span>
                            )}
                            {!order.arrived_date && !order.shipment_date && (
                              <span className="bg-yellow-500/10 text-yellow-500 px-2 py-0.5 rounded border border-yellow-500/20">
                                {t("orders.status_pending")}
                              </span>
                            )}
                          </div>
                        </div>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </motion.div>
              </AnimatePresence>

              <AnimatePresence>
                {isPageTransitioning && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="absolute inset-0 pointer-events-none rounded-xl bg-glass-white/20 backdrop-blur-[1px] flex items-center justify-center"
                  >
                    <div className="w-7 h-7 border-2 border-glass-border border-t-accent-blue rounded-full animate-spin" />
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}
        </div>

        {!loading && (
          <div className="mt-4 rounded-xl border border-glass-border-light bg-glass-white-hover shadow-[0_10px_24px_rgba(0,0,0,0.2)] backdrop-blur-md p-3 md:p-4">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <p className="text-sm font-medium text-text-secondary">
                {t("orders.total_results", { count: totalOrders })}
              </p>
              <div className="flex items-center gap-2 flex-wrap md:justify-end">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-text-secondary">
                    {t("common.per_page")}
                  </span>
                  <Select
                    className="w-28"
                    options={pageSizeOptions.map((size) => ({
                      value: size,
                      label: size === "all" ? t("common.all") : String(size),
                    }))}
                    value={pageSize}
                    menuPlacement="top"
                    onChange={(value) => {
                      const nextPageSize =
                        value === "all" ? "all" : Number(value);
                      if (
                        nextPageSize !== "all" &&
                        Number.isNaN(nextPageSize)
                      ) {
                        return;
                      }
                      setPageSize(nextPageSize);
                      setCurrentPage(1);
                    }}
                  />
                </div>
                <button
                  onClick={() =>
                    setCurrentPage((prev) => Math.max(1, prev - 1))
                  }
                  disabled={
                    isPageTransitioning || currentPage <= 1 || totalPages === 0
                  }
                  className="btn-liquid btn-liquid-ghost px-3 py-2 text-sm disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {t("common.previous")}
                </button>
                <div className="flex items-center gap-1 overflow-x-auto max-w-full py-1">
                  {displayPages.map((item, index) =>
                    item === "..." ? (
                      <span
                        key={`ellipsis-${index}`}
                        className="px-2 text-sm font-medium text-text-muted"
                      >
                        ...
                      </span>
                    ) : (
                      <button
                        key={item}
                        onClick={() =>
                          totalPages > 0 && setCurrentPage(parseInt(item, 10))
                        }
                        disabled={isPageTransitioning || totalPages === 0}
                        className={`min-w-9 px-3 py-2 text-sm rounded-lg transition-colors ${
                          parseInt(item, 10) === currentPage && totalPages > 0
                            ? "bg-accent-blue text-white shadow-md"
                            : "border border-glass-border-light bg-glass-white text-text-primary hover:bg-glass-white-hover"
                        } disabled:cursor-not-allowed disabled:opacity-50`}
                      >
                        {item}
                      </button>
                    ),
                  )}
                </div>
                <span className="text-sm text-text-secondary px-1">
                  {t("orders.page_status", {
                    page: totalPages === 0 ? 0 : currentPage,
                    total: totalPages,
                  })}
                </span>
                <button
                  onClick={() =>
                    setCurrentPage((prev) =>
                      totalPages === 0 ? 1 : Math.min(totalPages, prev + 1),
                    )
                  }
                  disabled={
                    isPageTransitioning ||
                    totalPages === 0 ||
                    currentPage >= totalPages
                  }
                  className="btn-liquid btn-liquid-ghost px-3 py-2 text-sm disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {t("common.next")}
                </button>
              </div>
            </div>
          </div>
        )}
      </motion.div>

      {/* ── Add/Edit Modal ── */}
      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={handleCloseModal}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />
            <motion.div
              variants={modalVariants}
              initial="hidden"
              animate="visible"
              exit="exit"
              className="relative w-full max-w-4xl glass-panel p-6 shadow-2xl border border-glass-border max-h-[90vh] overflow-y-auto"
            >
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-bold text-[var(--color-text-primary)]">
                  {editingOrder
                    ? t("orders.modal.title_edit")
                    : t("orders.modal.title_add")}
                </h2>
                <button
                  onClick={handleCloseModal}
                  className="p-2 hover:bg-glass-white-hover rounded-full transition-colors"
                >
                  <svg
                    width="20"
                    height="20"
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

              <form
                onSubmit={handleSubmit}
                className="space-y-6"
                autoComplete="off"
              >
                {/* Section: Basic Info */}
                <div className="space-y-4">
                  <h3 className="text-sm font-semibold text-text-primary border-b border-glass-border pb-1">
                    {t("orders.modal.basic_info")}
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Select
                      label={t("orders.form.customer")}
                      required
                      options={customers.map((c) => ({
                        value: c.id,
                        label: `${c.name} (${c.customer_id})`,
                      }))}
                      value={
                        formData.customer_id
                          ? parseInt(formData.customer_id)
                          : ""
                      }
                      onChange={(val) =>
                        setFormData({
                          ...formData,
                          customer_id: val.toString(),
                        })
                      }
                      placeholder={t("orders.form.select_customer")}
                    />
                    <Select
                      label={t("orders.form.order_from")}
                      options={[
                        { value: "Facebook", label: "Facebook" },
                        { value: "TikTok", label: "TikTok" },
                        { value: "Others", label: t("common.others") },
                      ]}
                      value={formData.order_from}
                      onChange={(val) =>
                        setFormData({
                          ...formData,
                          order_from: val.toString(),
                        })
                      }
                    />
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-text-secondary mb-1">
                        {t("orders.form.exchange_rate")}
                      </label>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        className="input-liquid w-full"
                        value={formData.exchange_rate}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            exchange_rate: e.target.value,
                          })
                        }
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-text-secondary mb-1">
                        {t("orders.form.order_date")}
                      </label>
                      <input
                        type={formData.order_date ? "date" : "text"}
                        className="input-liquid w-full"
                        autoComplete="off"
                        placeholder="dd/mm/yyyy"
                        value={formData.order_date}
                        onFocus={(e) => (e.target.type = "date")}
                        onBlur={(e) => {
                          if (!e.target.value) e.target.type = "text";
                        }}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            order_date: e.target.value,
                          })
                        }
                      />
                    </div>
                  </div>
                </div>

                {/* Section: Items */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between border-b border-glass-border pb-1">
                    <h3 className="text-sm font-semibold text-text-primary">
                      {t("orders.modal.product_details")}
                    </h3>
                    <button
                      type="button"
                      onClick={() =>
                        setFormData({
                          ...formData,
                          items: [
                            ...formData.items,
                            {
                              product_url: "",
                              product_qty: 1,
                              price: 0,
                              product_weight: 0,
                            },
                          ],
                        })
                      }
                      className="text-xs flex items-center gap-1 text-accent-blue hover:text-accent-blue-hover transition-colors"
                    >
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
                        <line x1="12" y1="5" x2="12" y2="19"></line>
                        <line x1="5" y1="12" x2="19" y2="12"></line>
                      </svg>
                      {t("orders.form.add_item")}
                    </button>
                  </div>

                  <div className="space-y-4 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
                    {formData.items.map((item, index) => (
                      <div
                        key={index}
                        className="p-4 bg-glass-white/30 rounded-lg border border-glass-border relative group"
                      >
                        {formData.items.length > 1 && (
                          <button
                            type="button"
                            onClick={() =>
                              setFormData({
                                ...formData,
                                items: formData.items.filter(
                                  (_, i) => i !== index,
                                ),
                              })
                            }
                            className="absolute top-2 right-2 text-text-muted hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all p-1"
                            title={t("common.delete")}
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
                        )}

                        <div className="space-y-3">
                          <div>
                            <label className="block text-xs font-medium text-text-secondary mb-1">
                              {t("orders.form.product_url")}
                            </label>
                            <input
                              type="text"
                              className="input-liquid w-full text-sm py-1.5"
                              value={item.product_url || ""}
                              onChange={(e) => {
                                const newItems = [...formData.items];
                                newItems[index].product_url = e.target.value;
                                setFormData({ ...formData, items: newItems });
                              }}
                              placeholder="https://..."
                            />
                          </div>

                          <div className="grid grid-cols-3 gap-3">
                            <div>
                              <label className="block text-xs font-medium text-text-secondary mb-1">
                                {t("orders.qty")}
                              </label>
                              <input
                                type="number"
                                min="1"
                                className="input-liquid w-full text-sm py-1.5"
                                value={item.product_qty || ""}
                                onChange={(e) => {
                                  const newItems = [...formData.items];
                                  newItems[index].product_qty =
                                    parseInt(e.target.value) || 0;
                                  setFormData({ ...formData, items: newItems });
                                }}
                              />
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-text-secondary mb-1">
                                {t("orders.price")}
                              </label>
                              <input
                                type="number"
                                min="0"
                                step="0.01"
                                className="input-liquid w-full text-sm py-1.5"
                                value={item.price || ""}
                                onChange={(e) => {
                                  const newItems = [...formData.items];
                                  newItems[index].price =
                                    parseFloat(e.target.value) || 0;
                                  setFormData({ ...formData, items: newItems });
                                }}
                              />
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-text-secondary mb-1">
                                {t("orders.form.weight")}
                              </label>
                              <input
                                type="number"
                                min="0"
                                step="0.01"
                                className="input-liquid w-full text-sm py-1.5"
                                value={item.product_weight || ""}
                                onChange={(e) => {
                                  const newItems = [...formData.items];
                                  newItems[index].product_weight =
                                    parseFloat(e.target.value) || 0;
                                  setFormData({ ...formData, items: newItems });
                                }}
                              />
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Section: Fees */}
                <div className="space-y-4">
                  <h3 className="text-sm font-semibold text-text-primary border-b border-glass-border pb-1">
                    {t("orders.modal.fees")}
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                    <div>
                      <label className="block text-sm font-medium text-text-secondary mb-1">
                        {t("orders.form.service_fee_label")}
                      </label>
                      <div className="flex gap-2">
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          className="input-liquid w-full"
                          value={formData.service_fee}
                          onChange={(e) =>
                            setFormData({
                              ...formData,
                              service_fee: e.target.value,
                            })
                          }
                        />
                        <select
                          className="input-liquid w-24"
                          value={formData.service_fee_type}
                          onChange={(e) =>
                            setFormData({
                              ...formData,
                              service_fee_type: e.target.value,
                            })
                          }
                        >
                          <option value="fixed">
                            {t("orders.form.fixed")}
                          </option>
                          <option value="percent">%</option>
                        </select>
                      </div>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-text-secondary mb-1">
                        {t("orders.form.shipping_fee")}
                      </label>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        className="input-liquid w-full"
                        value={formData.shipping_fee}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            shipping_fee: e.target.value,
                          })
                        }
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-text-secondary mb-1">
                        {t("orders.form.delivery_fee")}
                      </label>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        className="input-liquid w-full"
                        value={formData.delivery_fee}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            delivery_fee: e.target.value,
                          })
                        }
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-text-secondary mb-1">
                        {t("orders.form.cargo_fee")}
                      </label>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        className="input-liquid w-full"
                        value={formData.cargo_fee}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            cargo_fee: e.target.value,
                          })
                        }
                      />
                    </div>
                  </div>
                </div>

                {/* Section: Status Dates */}
                {editingOrder && (
                  <div className="space-y-4">
                    <h3 className="text-sm font-semibold text-text-primary border-b border-glass-border pb-1">
                      {t("orders.modal.status_dates")}
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-text-secondary mb-1">
                          {t("orders.form.arrived_date")}
                        </label>
                        <input
                          type={formData.arrived_date ? "date" : "text"}
                          className="input-liquid w-full"
                          autoComplete="off"
                          placeholder="dd/mm/yyyy"
                          value={formData.arrived_date}
                          onFocus={(e) => (e.target.type = "date")}
                          onBlur={(e) => {
                            if (!e.target.value) e.target.type = "text";
                          }}
                          onChange={(e) =>
                            setFormData({
                              ...formData,
                              arrived_date: e.target.value,
                            })
                          }
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-text-secondary mb-1">
                          {t("orders.form.shipment_date")}
                        </label>
                        <input
                          type={formData.shipment_date ? "date" : "text"}
                          className="input-liquid w-full"
                          autoComplete="off"
                          placeholder="dd/mm/yyyy"
                          value={formData.shipment_date}
                          onFocus={(e) => (e.target.type = "date")}
                          onBlur={(e) => {
                            if (!e.target.value) e.target.type = "text";
                          }}
                          onChange={(e) =>
                            setFormData({
                              ...formData,
                              shipment_date: e.target.value,
                            })
                          }
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-text-secondary mb-1">
                          {t("orders.form.user_withdraw_date")}
                        </label>
                        <input
                          type={formData.user_withdraw_date ? "date" : "text"}
                          className="input-liquid w-full"
                          autoComplete="off"
                          placeholder="dd/mm/yyyy"
                          value={formData.user_withdraw_date}
                          onFocus={(e) => (e.target.type = "date")}
                          onBlur={(e) => {
                            if (!e.target.value) e.target.type = "text";
                          }}
                          onChange={(e) =>
                            setFormData({
                              ...formData,
                              user_withdraw_date: e.target.value,
                            })
                          }
                        />
                      </div>
                    </div>
                  </div>
                )}

                <div className="flex justify-end gap-3 mt-8 pt-4 border-t border-glass-border">
                  <button
                    type="button"
                    onClick={handleCloseModal}
                    className="btn-liquid btn-liquid-ghost"
                  >
                    {t("orders.modal.cancel")}
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="btn-liquid btn-liquid-primary flex items-center gap-2"
                  >
                    {isSubmitting && (
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    )}
                    {editingOrder
                      ? t("orders.modal.update")
                      : t("orders.modal.create")}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ── Delete Confirmation Modal ── */}
      <AnimatePresence>
        {isDeleteModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsDeleteModalOpen(false)}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />
            <motion.div
              variants={modalVariants}
              initial="hidden"
              animate="visible"
              exit="exit"
              className="relative w-full max-w-sm glass-panel p-6 shadow-2xl border border-[var(--color-glass-border)]"
            >
              <div className="flex flex-col items-center text-center">
                <div className="w-12 h-12 rounded-full bg-red-500/10 text-red-500 flex items-center justify-center mb-4">
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
                    <polyline points="3 6 5 6 21 6"></polyline>
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                  </svg>
                </div>
                <h3 className="text-lg font-bold text-[var(--color-text-primary)] mb-2">
                  {t("orders.delete_modal.title")}
                </h3>
                <p className="text-sm text-[var(--color-text-muted)] mb-6">
                  {t("orders.delete_modal.message")}
                </p>
                <div className="flex gap-3 w-full">
                  <button
                    onClick={() => setIsDeleteModalOpen(false)}
                    className="flex-1 btn-liquid btn-liquid-ghost py-2.5 text-sm"
                  >
                    {t("orders.modal.cancel")}
                  </button>
                  <button
                    onClick={handleConfirmDelete}
                    className="flex-1 btn-liquid bg-red-500 hover:bg-red-600 text-white py-2.5 text-sm"
                  >
                    {t("orders.delete_modal.delete")}
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
