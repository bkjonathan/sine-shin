import { useState, useEffect, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { invoke } from "@tauri-apps/api/core";
import { toPng } from "html-to-image";
import { MYANMAR_FONT_EMBED_CSS } from "../assets/fonts/myanmar-fonts";
import { motion, AnimatePresence, Variants } from "framer-motion";
import {
  getOrders,
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
import {
  createEmptyOrderFormData,
  createEmptyOrderFormItem,
  OrderFormData,
  OrderFormErrors,
  OrderFormItemData,
  OrderStatus,
  OrderWithCustomer,
  OrderDetail,
} from "../types/order";
import { Customer } from "../types/customer";
import { useSound } from "../context/SoundContext";
import { useTranslation } from "react-i18next";
import { Button, Input, Select } from "../components/ui";
import { parseCSV } from "../utils/csvUtils";
import { processOrderCSV } from "../utils/orderImportUtils";
import { useAppSettings } from "../context/AppSettingsContext";
import OrderDeleteModal from "../components/pages/orders/OrderDeleteModal";
import OrderFormModal from "../components/pages/orders/OrderFormModal";
import {
  IconDownload,
  IconEdit,
  IconLayoutGrid,
  IconPackage,
  IconPlus,
  IconPrinter,
  IconSearch,
  IconSortAsc,
  IconSortDesc,
  IconTable,
  IconTrash,
  IconUpload,
} from "../components/icons";
import ParcelPrintModal from "../components/pages/orders/ParcelPrintModal";
import ParcelPrintLayout from "../components/pages/orders/ParcelPrintLayout";
import { ParcelPrintOptions } from "../components/pages/orders/ParcelPrintLayout";

// ── Animation Variants ──
const fadeVariants: Variants = {
  hidden: { opacity: 0, y: 12 },
  show: {
    opacity: 1,
    y: 0,
    transition: { type: "spring", stiffness: 300, damping: 24 },
  },
};

const ORDER_STATUS_OPTIONS: Array<{ value: OrderStatus; labelKey: string }> = [
  { value: "pending", labelKey: "orders.status_pending" },
  { value: "confirmed", labelKey: "orders.status_confirmed" },
  { value: "shipping", labelKey: "orders.status_shipping" },
  { value: "completed", labelKey: "orders.status_completed" },
  { value: "cancelled", labelKey: "orders.status_cancelled" },
];

const ORDER_STATUS_FILTER_OPTIONS: Array<{
  value: OrderStatus | "all";
  labelKey: string;
}> = [{ value: "all", labelKey: "common.all" }, ...ORDER_STATUS_OPTIONS];

const getOrderStatusDisplay = (
  status?: OrderStatus,
): {
  labelKey: string;
  className: string;
} => {
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

const parsePageParam = (value: string | null): number => {
  const parsedPage = Number.parseInt(value ?? "1", 10);

  if (Number.isNaN(parsedPage) || parsedPage < 1) {
    return 1;
  }

  return parsedPage;
};

const getOrdersListPath = (page: number): string => {
  return page > 1 ? `/orders?page=${page}` : "/orders";
};

const MAX_SERVICE_FEE_PERCENT = 100;

const hasOrderFormErrors = (errors: OrderFormErrors): boolean => {
  if (
    errors.itemErrors?.some((itemError) => Object.keys(itemError).length > 0)
  ) {
    return true;
  }

  return Object.entries(errors).some(([key, value]) => {
    if (key === "itemErrors") {
      return false;
    }

    return Boolean(value);
  });
};

export default function Orders() {
  const pageSizeOptions: Array<number | "all"> = [5, 10, 20, 50, 100, "all"];
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [orders, setOrders] = useState<OrderWithCustomer[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const [isPageTransitioning, setIsPageTransitioning] = useState(false);
  const [pageTransitionKey, setPageTransitionKey] = useState(0);
  const [currentPage, setCurrentPage] = useState(() =>
    parsePageParam(searchParams.get("page")),
  );
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
  const [statusFilter, setStatusFilter] = useState<OrderStatus | "all">("all");
  const { playSound } = useSound();
  const { t } = useTranslation();
  const { formatPrice, invoice_printer_name, silent_invoice_print } =
    useAppSettings();

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingOrder, setEditingOrder] = useState<OrderWithCustomer | null>(
    null,
  );
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Import State
  const fileInputRef = useRef<HTMLInputElement>(null);
  const latestFetchIdRef = useRef(0);
  const parcelPrintRef = useRef<HTMLDivElement>(null);
  const [isImporting, setIsImporting] = useState(false);
  const visiblePages = getVisiblePages(currentPage, totalPages);
  const displayPages = visiblePages.length > 0 ? visiblePages : ["1"];

  // Form State
  const [formData, setFormData] = useState<OrderFormData>(() =>
    createEmptyOrderFormData(),
  );
  const [formErrors, setFormErrors] = useState<OrderFormErrors>({});

  // Delete State
  const [orderToDelete, setOrderToDelete] = useState<OrderWithCustomer | null>(
    null,
  );
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);

  // View Mode State (persisted in localStorage)
  const [viewMode, setViewMode] = useState<"grid" | "table">(() => {
    return (
      (localStorage.getItem("orders_view_mode") as "grid" | "table") ?? "grid"
    );
  });

  const handleSetViewMode = (mode: "grid" | "table") => {
    setViewMode(mode);
    localStorage.setItem("orders_view_mode", mode);
  };

  // Parcel Printing State
  const [selectedOrderIds, setSelectedOrderIds] = useState<Set<number>>(
    new Set(),
  );
  const [isPrintModalOpen, setIsPrintModalOpen] = useState(false);
  const [printOrders, setPrintOrders] = useState<
    (OrderDetail & {
      order: { customer_address?: string; customer_phone?: string };
    })[]
  >([]);
  const [printOptions, setPrintOptions] = useState<ParcelPrintOptions>({
    showCustomerName: true,
    showCustomerId: false,
    showCustomerPhone: true,
    showCustomerAddress: true,
    showProductDetails: true,
    showOrderId: true,
    showShopName: true,
  });

  const handleToggleOrderSelection = (id: number) => {
    setSelectedOrderIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleToggleSelectAll = () => {
    if (selectedOrderIds.size === orders.length) {
      setSelectedOrderIds(new Set());
    } else {
      setSelectedOrderIds(new Set(orders.map((o) => o.id)));
    }
  };

  const handleExecutePrint = async (options: ParcelPrintOptions) => {
    try {
      // 1. Fetch full order details
      const detailedOrders = await Promise.all(
        Array.from(selectedOrderIds).map((id) => getOrderById(id)),
      );

      const formattedOrders = detailedOrders.map((detail) => {
        const customer = customers.find(
          (c) =>
            c.id === detail.order.customer_id ||
            c.customer_id === detail.order.customer_id?.toString(),
        );
        return {
          ...detail,
          order: {
            ...detail.order,
            customer_address: customer?.address || undefined,
            customer_phone:
              customer?.phone ||
              (detail.order as any).customer_phone ||
              undefined,
          },
        };
      });

      // 2. Set state and wait for React to render the layout
      setPrintOptions(options);
      setPrintOrders(formattedOrders);

      // Wait for React render + browser paint
      await new Promise<void>((resolve) => {
        requestAnimationFrame(() => {
          setTimeout(resolve, 300);
        });
      });

      // 3. Capture the rendered layout as PNG using html-to-image
      if (!parcelPrintRef.current) {
        throw new Error("Parcel print layout ref not available");
      }

      await document.fonts.ready;
      await new Promise((r) => setTimeout(r, 150));

      const dataUrl = await toPng(parcelPrintRef.current, {
        pixelRatio: 2,
        backgroundColor: "#ffffff",
        skipFonts: true,
        fontEmbedCSS: MYANMAR_FONT_EMBED_CSS,
      });

      // 4. Convert base64 data URL → Uint8Array
      const base64 = dataUrl.split(",")[1];
      const binary = atob(base64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
      }

      // 5. Print via Rust command
      if (window.__TAURI_INTERNALS__) {
        if (silent_invoice_print) {
          await invoke("print_invoice_direct", {
            bytes: Array.from(bytes),
            printerName:
              invoice_printer_name.trim().length > 0
                ? invoice_printer_name.trim()
                : null,
          });
        } else {
          // Save to temp, then use print_window as fallback
          await invoke("print_invoice_direct", {
            bytes: Array.from(bytes),
            printerName:
              invoice_printer_name.trim().length > 0
                ? invoice_printer_name.trim()
                : null,
          });
        }
      } else {
        // Browser fallback: open image in new tab for printing
        const win = window.open("");
        if (win) {
          win.document.write(
            `<img src="${dataUrl}" onload="window.print();window.close()" />`,
          );
        }
      }

      playSound("success");
    } catch (err) {
      console.error("Failed to print parcels:", err);
      playSound("error");
    } finally {
      setPrintOrders([]);
      setIsPrintModalOpen(false);
      setSelectedOrderIds(new Set());
    }
  };

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
    const nextSearchParams = new URLSearchParams(searchParams);

    if (currentPage > 1) {
      nextSearchParams.set("page", String(currentPage));
    } else {
      nextSearchParams.delete("page");
    }

    if (nextSearchParams.toString() !== searchParams.toString()) {
      setSearchParams(nextSearchParams, { replace: true });
    }
  }, [currentPage, searchParams, setSearchParams]);

  const [sortBy, setSortBy] = useState<
    "customer_name" | "order_id" | "created_at"
  >("order_id");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc"); // Default to desc for orders

  const getLocalPaginatedOrders = (
    allOrders: OrderWithCustomer[],
    page: number,
  ): { orders: OrderWithCustomer[]; total: number; total_pages: number } => {
    const normalizedSearchTerm = searchTerm.trim().toLowerCase();

    const filteredOrders = allOrders.filter((order) => {
      if (
        statusFilter !== "all" &&
        (order.status ?? "").toLowerCase() !== statusFilter
      ) {
        return false;
      }

      if (!normalizedSearchTerm) {
        return true;
      }

      let searchableValue = "";
      switch (searchKey) {
        case "customerName":
          searchableValue = order.customer_name ?? "";
          break;
        case "orderId":
          searchableValue = order.order_id ?? "";
          break;
        case "customerId":
          searchableValue =
            order.customer_id !== undefined && order.customer_id !== null
              ? String(order.customer_id)
              : "";
          break;
        case "customerPhone":
          searchableValue =
            customers.find((customer) => customer.id === order.customer_id)
              ?.phone ?? "";
          break;
        default:
          searchableValue = "";
      }

      return searchableValue.toLowerCase().includes(normalizedSearchTerm);
    });

    const sortedOrders = [...filteredOrders].sort((a, b) => {
      let comparison = 0;

      if (sortBy === "customer_name") {
        comparison = (a.customer_name ?? "").localeCompare(
          b.customer_name ?? "",
          undefined,
          { sensitivity: "base" },
        );
      } else if (sortBy === "created_at") {
        const aDate = a.created_at ? new Date(a.created_at).getTime() : 0;
        const bDate = b.created_at ? new Date(b.created_at).getTime() : 0;
        comparison = aDate - bDate;
      } else {
        comparison = a.id - b.id;
      }

      return sortOrder === "asc" ? comparison : -comparison;
    });

    const total = sortedOrders.length;
    const noLimit = pageSize === "all";

    if (noLimit) {
      return {
        orders: sortedOrders,
        total,
        total_pages: total > 0 ? 1 : 0,
      };
    }

    const requestedPageSize =
      typeof pageSize === "number"
        ? pageSize
        : ORDER_PAGE_SIZE_LIMITS.default;
    const resolvedPageSize = Math.max(
      ORDER_PAGE_SIZE_LIMITS.min,
      Math.min(
        ORDER_PAGE_SIZE_LIMITS.max,
        requestedPageSize,
      ),
    );
    const totalPages = total > 0 ? Math.ceil(total / resolvedPageSize) : 0;
    const safePage = Math.max(1, page);
    const start = (safePage - 1) * resolvedPageSize;

    return {
      orders: sortedOrders.slice(start, start + resolvedPageSize),
      total,
      total_pages: totalPages,
    };
  };

  useEffect(() => {
    fetchOrders(currentPage);
  }, [
    currentPage,
    pageSize,
    searchKey,
    searchTerm,
    statusFilter,
    sortBy,
    sortOrder,
  ]);

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
        statusFilter,
        sortBy,
        sortOrder,
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
      console.error("Failed to fetch paginated orders:", error);

      try {
        const allOrders = await getOrders();
        const data = getLocalPaginatedOrders(allOrders, page);

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
      } catch (fallbackError) {
        console.error("Fallback orders fetch failed:", fallbackError);
      }
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

  const isValidNonNegativeNumber = (value: string): boolean => {
    if (!value.trim()) {
      return true;
    }

    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed >= 0;
  };

  const parseOptionalNumber = (value: string): number | undefined => {
    const trimmed = value.trim();
    if (!trimmed) {
      return undefined;
    }

    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : undefined;
  };

  const validateOrderForm = (value: OrderFormData): OrderFormErrors => {
    const errors: OrderFormErrors = {};

    if (!value.customer_id) {
      errors.customer_id = t("orders.validation.customer_required");
    }

    if (!value.order_date) {
      errors.order_date = t("orders.validation.order_date_required");
    }

    if (value.items.length === 0) {
      errors.items = t("orders.validation.items_required");
    } else {
      const itemErrors: NonNullable<OrderFormErrors["itemErrors"]> =
        value.items.map(() => ({}));

      value.items.forEach((item, index) => {
        const currentItemErrors = itemErrors[index];

        if (!Number.isInteger(item.product_qty) || item.product_qty < 1) {
          currentItemErrors.product_qty = t(
            "orders.validation.product_qty_invalid",
          );
        }

        if (!Number.isFinite(item.price) || item.price < 0) {
          currentItemErrors.price = t("orders.validation.price_invalid");
        }

        if (!Number.isFinite(item.product_weight) || item.product_weight < 0) {
          currentItemErrors.product_weight = t(
            "orders.validation.weight_invalid",
          );
        }
      });

      if (itemErrors.some((itemError) => Object.keys(itemError).length > 0)) {
        errors.itemErrors = itemErrors;
      }
    }

    if (!isValidNonNegativeNumber(value.exchange_rate)) {
      errors.exchange_rate = t("orders.validation.exchange_rate_invalid");
    }

    if (!isValidNonNegativeNumber(value.shipping_fee)) {
      errors.shipping_fee = t("orders.validation.shipping_fee_invalid");
    }

    if (!isValidNonNegativeNumber(value.delivery_fee)) {
      errors.delivery_fee = t("orders.validation.delivery_fee_invalid");
    }

    if (!isValidNonNegativeNumber(value.cargo_fee)) {
      errors.cargo_fee = t("orders.validation.cargo_fee_invalid");
    }

    if (!isValidNonNegativeNumber(value.product_discount)) {
      errors.product_discount = t("orders.validation.product_discount_invalid");
    }

    if (!isValidNonNegativeNumber(value.service_fee)) {
      errors.service_fee = t("orders.validation.service_fee_invalid");
    } else if (
      value.service_fee_type === "percent" &&
      (parseOptionalNumber(value.service_fee) ?? 0) > MAX_SERVICE_FEE_PERCENT
    ) {
      errors.service_fee = t("orders.validation.service_fee_percent_max", {
        max: MAX_SERVICE_FEE_PERCENT,
      });
    }

    return errors;
  };

  const handleFormFieldChange = (
    field: keyof OrderFormData,
    value: string | boolean,
  ) => {
    setFormData((prev) => {
      const next = { ...prev };

      if (field === "status") {
        next.status = value as OrderStatus;
      } else if (field === "service_fee_type") {
        next.service_fee_type = value as "fixed" | "percent";
      } else if (field !== "items") {
        (next as Record<string, unknown>)[field] = value;
      }

      return next;
    });

    setFormErrors((prev) => ({ ...prev, [field]: undefined }));
  };

  const handleOrderItemChange = (
    index: number,
    field: keyof OrderFormItemData,
    value: string,
  ) => {
    setFormData((prev) => ({
      ...prev,
      items: prev.items.map((item, itemIndex) => {
        if (itemIndex !== index) {
          return item;
        }

        if (field === "product_url") {
          return { ...item, product_url: value };
        }

        const parsed = Number(value);
        return {
          ...item,
          [field]: Number.isFinite(parsed) ? parsed : 0,
        };
      }),
    }));

    setFormErrors((prev) => {
      const nextErrors: OrderFormErrors = { ...prev, items: undefined };

      if (!prev.itemErrors) {
        return nextErrors;
      }

      nextErrors.itemErrors = prev.itemErrors.map((itemError, itemIndex) => {
        if (itemIndex !== index) {
          return itemError;
        }

        return {
          ...itemError,
          [field]: undefined,
        };
      });

      return nextErrors;
    });
  };

  const handleAddOrderItem = () => {
    setFormData((prev) => ({
      ...prev,
      items: [...prev.items, createEmptyOrderFormItem()],
    }));
    setFormErrors((prev) => ({ ...prev, items: undefined }));
  };

  const handleRemoveOrderItem = (index: number) => {
    setFormData((prev) => {
      if (prev.items.length <= 1) {
        return prev;
      }

      return {
        ...prev,
        items: prev.items.filter((_, itemIndex) => itemIndex !== index),
      };
    });

    setFormErrors((prev) => {
      const nextErrors: OrderFormErrors = { ...prev, items: undefined };
      if (!prev.itemErrors) {
        return nextErrors;
      }

      nextErrors.itemErrors = prev.itemErrors.filter(
        (_, itemIndex) => itemIndex !== index,
      );
      return nextErrors;
    });
  };

  const handleOpenModal = async (order?: OrderWithCustomer) => {
    setFormErrors({});

    if (order) {
      setEditingOrder(order);

      try {
        const detail = await getOrderById(order.id);
        const nextItems =
          detail.items.length > 0
            ? detail.items.map((item) => ({
                product_url: item.product_url || "",
                product_qty: item.product_qty ?? 1,
                price: item.price ?? 0,
                product_weight: item.product_weight ?? 0,
              }))
            : [createEmptyOrderFormItem()];

        setFormData({
          customer_id: order.customer_id?.toString() || "",
          status: order.status || "pending",
          order_from: order.order_from || "Facebook",
          items: nextItems,
          exchange_rate: order.exchange_rate?.toString() || "",
          shipping_fee: order.shipping_fee?.toString() || "",
          delivery_fee: order.delivery_fee?.toString() || "",
          cargo_fee: order.cargo_fee?.toString() || "",
          order_date: order.order_date || "",
          arrived_date: order.arrived_date || "",
          shipment_date: order.shipment_date || "",
          user_withdraw_date: order.user_withdraw_date || "",
          service_fee: order.service_fee?.toString() || "",
          product_discount: order.product_discount?.toString() || "",
          service_fee_type: order.service_fee_type || "fixed",
          shipping_fee_by_shop: order.shipping_fee_by_shop,
          delivery_fee_by_shop: order.delivery_fee_by_shop,
          cargo_fee_by_shop: order.cargo_fee_by_shop,
          exclude_cargo_fee: order.exclude_cargo_fee,
        });
        setIsModalOpen(true);
      } catch (e) {
        console.error("Failed to load details for editing", e);
      }
    } else {
      setEditingOrder(null);
      setFormData(createEmptyOrderFormData());
      setIsModalOpen(true);
    }

    playSound("click");
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditingOrder(null);
    setFormErrors({});
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const validationErrors = validateOrderForm(formData);
    setFormErrors(validationErrors);

    if (hasOrderFormErrors(validationErrors)) {
      playSound("error");
      return;
    }

    try {
      setIsSubmitting(true);

      const payload = {
        customer_id: parseInt(formData.customer_id, 10),
        status: formData.status || "pending",
        order_from: formData.order_from || undefined,
        items: formData.items.map((item) => ({
          product_url: item.product_url.trim() || undefined,
          product_qty:
            item.product_qty > 0 ? Number(item.product_qty) : undefined,
          price: Number.isFinite(item.price) ? Number(item.price) : undefined,
          product_weight: Number.isFinite(item.product_weight)
            ? Number(item.product_weight)
            : undefined,
        })),
        exchange_rate: parseOptionalNumber(formData.exchange_rate),
        shipping_fee: parseOptionalNumber(formData.shipping_fee),
        delivery_fee: parseOptionalNumber(formData.delivery_fee),
        cargo_fee: parseOptionalNumber(formData.cargo_fee),
        order_date: formData.order_date || undefined,
        arrived_date: formData.arrived_date || undefined,
        shipment_date: formData.shipment_date || undefined,
        user_withdraw_date: formData.user_withdraw_date || undefined,
        service_fee: parseOptionalNumber(formData.service_fee),
        product_discount: parseOptionalNumber(formData.product_discount),
        service_fee_type: formData.service_fee_type || "fixed",
        shipping_fee_by_shop: !!formData.shipping_fee_by_shop,
        delivery_fee_by_shop: !!formData.delivery_fee_by_shop,
        cargo_fee_by_shop: !!formData.cargo_fee_by_shop,
        exclude_cargo_fee: !!formData.exclude_cargo_fee,
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
        "Status",
        "Order From",
        "Order Date",
        "Arrived Date",
        "Shipment Date",
        "Service Fee",
        "Product Discount",
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
          row.status || "",
          row.order_from || "",
          row.order_date || "",
          row.arrived_date || "",
          row.shipment_date || "",
          row.service_fee || "",
          row.product_discount || "",
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
    <>
      <ParcelPrintLayout
        ref={parcelPrintRef}
        orders={printOrders}
        options={printOptions}
        shopName={t("app.name", "Thai Htay")}
      />
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
            <Button
              onClick={() => fileInputRef.current?.click()}
              disabled={isImporting}
              variant="ghost"
              className="px-4 py-2 text-sm flex items-center gap-2"
            >
              {isImporting ? (
                <div className="w-4 h-4 border-2 border-text-secondary border-t-text-primary rounded-full animate-spin" />
              ) : (
                <IconUpload size={16} strokeWidth={2} />
              )}
              {t("orders.import_csv")}
            </Button>
            <Button
              onClick={handleExport}
              variant="ghost"
              className="px-4 py-2 text-sm flex items-center gap-2"
            >
              <IconDownload size={16} strokeWidth={2} />
              {t("orders.export_csv")}
            </Button>
            <Button
              onClick={() => setIsPrintModalOpen(true)}
              variant={selectedOrderIds.size > 0 ? "primary" : "default"}
              disabled={selectedOrderIds.size === 0}
              className="px-4 py-2 text-sm flex items-center gap-2"
            >
              <IconPrinter size={16} strokeWidth={2} />
              {t("orders.print_parcels", "Print Parcels")}{" "}
              {selectedOrderIds.size > 0 && `(${selectedOrderIds.size})`}
            </Button>
            <Button
              onClick={() => handleOpenModal()}
              variant="primary"
              className="px-4 py-2 text-sm flex items-center gap-2"
            >
              <IconPlus size={16} strokeWidth={2} />
              {t("orders.add_order")}
            </Button>
          </div>
        </motion.div>
        {/* ── Search Bar ── */}
        <motion.div variants={fadeVariants} className="mb-6">
          <div className="flex flex-col lg:flex-row gap-3">
            <div className="flex flex-col md:flex-row gap-3 flex-1">
              <div className="w-full md:w-48">
                <Select
                  options={[
                    {
                      value: "customerName",
                      label: t("orders.search_key_customer_name"),
                    },
                    {
                      value: "orderId",
                      label: t("orders.search_key_order_id"),
                    },
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
                  <IconSearch
                    className="h-4 w-4 text-text-muted"
                    strokeWidth={2}
                  />
                </div>
                <Input
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

            {/* Sorting Controls */}
            <div className="flex items-center gap-3 w-full md:w-auto">
              <div className="w-full md:w-48">
                <Select
                  options={[
                    { value: "order_id", label: "Sort by ID" },
                    { value: "customer_name", label: "Sort by Name" },
                    { value: "created_at", label: "Sort by Date" },
                  ]}
                  value={sortBy}
                  onChange={(value) => {
                    setSortBy(
                      value as "customer_name" | "order_id" | "created_at",
                    );
                    setCurrentPage(1);
                  }}
                />
              </div>
              <button
                onClick={() =>
                  setSortOrder((prev) => (prev === "asc" ? "desc" : "asc"))
                }
                className="p-2.5 rounded-lg bg-glass-white border border-glass-border hover:bg-glass-white-hover transition-colors text-text-secondary shrink-0"
                title={sortOrder === "asc" ? "Ascending" : "Descending"}
              >
                {sortOrder === "asc" ? (
                  <IconSortAsc size={20} strokeWidth={2} />
                ) : (
                  <IconSortDesc size={20} strokeWidth={2} />
                )}
              </button>

              {/* View Mode Toggle */}
              <div className="flex items-center rounded-lg border border-glass-border overflow-hidden bg-glass-white shrink-0">
                <button
                  onClick={() => handleSetViewMode("grid")}
                  title="Grid View"
                  className={`p-2.5 transition-colors ${
                    viewMode === "grid"
                      ? "bg-accent-blue text-white"
                      : "text-text-secondary hover:bg-glass-white-hover"
                  }`}
                >
                  <IconLayoutGrid size={18} strokeWidth={2} />
                </button>
                <button
                  onClick={() => handleSetViewMode("table")}
                  title="Table View"
                  className={`p-2.5 transition-colors ${
                    viewMode === "table"
                      ? "bg-accent-blue text-white"
                      : "text-text-secondary hover:bg-glass-white-hover"
                  }`}
                >
                  <IconTable size={18} strokeWidth={2} />
                </button>
              </div>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {ORDER_STATUS_FILTER_OPTIONS.map((option) => {
              const isActive = statusFilter === option.value;
              const statusDisplay =
                option.value === "all"
                  ? null
                  : getOrderStatusDisplay(option.value);

              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => {
                    if (statusFilter === option.value) {
                      return;
                    }
                    setStatusFilter(option.value);
                    setCurrentPage(1);
                  }}
                  className={`inline-flex items-center rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
                    isActive
                      ? option.value === "all"
                        ? "bg-accent-blue text-white border-accent-blue shadow-md shadow-accent-blue/20"
                        : `${statusDisplay?.className} shadow-md`
                      : "bg-glass-white text-text-secondary border-glass-border hover:bg-glass-white-hover hover:text-text-primary"
                  }`}
                >
                  {t(option.labelKey)}
                </button>
              );
            })}
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
                    <IconPackage size={32} strokeWidth={1.5} />
                  </div>
                  <h3 className="text-lg font-medium text-text-primary">
                    {t("orders.no_orders")}
                  </h3>
                  <p className="text-sm text-text-muted mt-1">
                    {searchInput.trim() || statusFilter !== "all"
                      ? t("orders.no_orders_search")
                      : t("orders.no_orders_create")}
                  </p>
                </div>
              )
            ) : (
              <div className="relative">
                <AnimatePresence mode="wait" initial={false}>
                  {viewMode === "grid" ? (
                    <motion.div
                      key={`grid-${pageTransitionKey}`}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      transition={{ duration: 0.2, ease: "easeOut" }}
                      className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 pb-6"
                    >
                      <AnimatePresence mode="popLayout">
                        {orders.map((order) => {
                          const statusDisplay = getOrderStatusDisplay(
                            order.status,
                          );

                          return (
                            <motion.div
                              key={order.id}
                              layout
                              initial={{ opacity: 0, scale: 0.95 }}
                              animate={{ opacity: 1, scale: 1 }}
                              exit={{ opacity: 0, scale: 0.95 }}
                              className="glass-panel p-5 group hover:border-accent-blue/30 transition-all duration-300 hover:shadow-lg hover:shadow-accent-blue/5 relative overflow-hidden cursor-pointer"
                              onClick={() =>
                                navigate(`/orders/${order.id}`, {
                                  state: {
                                    returnTo: getOrdersListPath(currentPage),
                                  },
                                })
                              }
                            >
                              <div className="relative z-10">
                                <div className="flex justify-between items-start mb-3">
                                  <div className="bg-glass-white px-2 py-1 rounded text-xs font-mono text-text-secondary border border-glass-border">
                                    {order.order_id || t("orders.id_pending")}
                                  </div>

                                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200 -mr-2 -mt-2">
                                    <label
                                      className="p-2 cursor-pointer"
                                      onClick={(e) => e.stopPropagation()}
                                    >
                                      <input
                                        type="checkbox"
                                        checked={selectedOrderIds.has(order.id)}
                                        onChange={() =>
                                          handleToggleOrderSelection(order.id)
                                        }
                                        className="w-4 h-4 text-accent-blue bg-glass-surface border-glass-border rounded focus:ring-accent-blue cursor-pointer"
                                      />
                                    </label>
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleOpenModal(order);
                                      }}
                                      className="p-2 text-text-muted hover:text-accent-blue hover:bg-glass-white-hover rounded-lg transition-colors"
                                    >
                                      <IconEdit size={16} strokeWidth={2} />
                                    </button>
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setOrderToDelete(order);
                                        setIsDeleteModalOpen(true);
                                      }}
                                      className="p-2 text-text-muted hover:text-error hover:bg-red-500/10 rounded-lg transition-colors"
                                    >
                                      <IconTrash size={16} strokeWidth={2} />
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

                                {/* Status Indicator */}
                                <div className="flex gap-2 text-xs">
                                  <span
                                    className={`${statusDisplay.className} px-2 py-0.5 rounded`}
                                  >
                                    {t(statusDisplay.labelKey)}
                                  </span>
                                </div>
                              </div>
                            </motion.div>
                          );
                        })}
                      </AnimatePresence>
                    </motion.div>
                  ) : (
                    /* ── Table View ── */
                    <motion.div
                      key={`table-${pageTransitionKey}`}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      transition={{ duration: 0.2, ease: "easeOut" }}
                      className="glass-panel overflow-hidden pb-2"
                    >
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-glass-border">
                            <th className="px-4 py-3 w-10">
                              <input
                                type="checkbox"
                                checked={
                                  orders.length > 0 &&
                                  selectedOrderIds.size === orders.length
                                }
                                onChange={handleToggleSelectAll}
                                className="w-4 h-4 text-accent-blue bg-glass-surface border-glass-border rounded focus:ring-accent-blue cursor-pointer"
                              />
                            </th>
                            <th className="text-left px-4 py-3 text-xs font-semibold text-text-muted uppercase tracking-wider">
                              {t("orders.order_id") || "Order ID"}
                            </th>
                            <th className="text-left px-4 py-3 text-xs font-semibold text-text-muted uppercase tracking-wider">
                              {t("orders.customer") || "Customer"}
                            </th>
                            <th className="text-left px-4 py-3 text-xs font-semibold text-text-muted uppercase tracking-wider hidden sm:table-cell">
                              {t("orders.status") || "Status"}
                            </th>
                            <th className="text-left px-4 py-3 text-xs font-semibold text-text-muted uppercase tracking-wider hidden md:table-cell">
                              {t("orders.date") || "Date"}
                            </th>
                            <th className="text-right px-4 py-3 text-xs font-semibold text-text-muted uppercase tracking-wider hidden md:table-cell">
                              {t("orders.qty") || "Qty"}
                            </th>
                            <th className="text-right px-4 py-3 text-xs font-semibold text-text-muted uppercase tracking-wider hidden lg:table-cell">
                              {t("orders.total") || "Total"}
                            </th>
                            <th className="text-right px-4 py-3 text-xs font-semibold text-text-muted uppercase tracking-wider hidden lg:table-cell">
                              {t("orders.weight") || "Weight"}
                            </th>
                            <th className="text-right px-4 py-3 text-xs font-semibold text-text-muted uppercase tracking-wider">
                              {t("common.actions") || "Actions"}
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          <AnimatePresence mode="popLayout">
                            {orders.map((order) => {
                              const statusDisplay = getOrderStatusDisplay(
                                order.status,
                              );
                              return (
                                <motion.tr
                                  key={order.id}
                                  layout
                                  initial={{ opacity: 0 }}
                                  animate={{ opacity: 1 }}
                                  exit={{ opacity: 0 }}
                                  onClick={() =>
                                    navigate(`/orders/${order.id}`, {
                                      state: {
                                        returnTo:
                                          getOrdersListPath(currentPage),
                                      },
                                    })
                                  }
                                  className="group border-b border-glass-border/50 last:border-0 hover:bg-glass-white-hover cursor-pointer transition-colors"
                                >
                                  <td
                                    className="px-4 py-3"
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    <input
                                      type="checkbox"
                                      checked={selectedOrderIds.has(order.id)}
                                      onChange={() =>
                                        handleToggleOrderSelection(order.id)
                                      }
                                      className="w-4 h-4 text-accent-blue bg-glass-surface border-glass-border rounded focus:ring-accent-blue cursor-pointer"
                                    />
                                  </td>
                                  <td className="px-4 py-3">
                                    <span className="font-mono text-xs text-text-secondary bg-glass-white-hover px-2 py-0.5 rounded border border-glass-border">
                                      {order.order_id || t("orders.id_pending")}
                                    </span>
                                  </td>
                                  <td className="px-4 py-3">
                                    <div className="flex items-center gap-2.5">
                                      <div className="w-7 h-7 rounded-lg bg-linear-to-br from-glass-white to-glass-white-hover border border-glass-border flex items-center justify-center text-text-primary font-bold text-xs shrink-0">
                                        {(order.customer_name || "?")
                                          .charAt(0)
                                          .toUpperCase()}
                                      </div>
                                      <span className="font-medium text-text-primary group-hover:text-accent-blue transition-colors truncate max-w-[140px]">
                                        {order.customer_name}
                                      </span>
                                    </div>
                                  </td>
                                  <td className="px-4 py-3 hidden sm:table-cell">
                                    <span
                                      className={`${statusDisplay.className} text-xs px-2 py-0.5 rounded font-semibold`}
                                    >
                                      {t(statusDisplay.labelKey)}
                                    </span>
                                  </td>
                                  <td className="px-4 py-3 hidden md:table-cell text-text-secondary">
                                    {formatDate(order.order_date) || (
                                      <span className="text-text-muted">—</span>
                                    )}
                                  </td>
                                  <td className="px-4 py-3 hidden md:table-cell text-right text-text-secondary">
                                    {order.total_qty || 0}
                                  </td>
                                  <td className="px-4 py-3 hidden lg:table-cell text-right text-text-secondary">
                                    {formatPrice(order.total_price || 0)}
                                  </td>
                                  <td className="px-4 py-3 hidden lg:table-cell text-right text-text-secondary">
                                    {order.total_weight || 0} kg
                                  </td>
                                  <td className="px-4 py-3 text-right">
                                    <div className="flex gap-1 justify-end opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          handleOpenModal(order);
                                        }}
                                        className="p-1.5 text-text-muted hover:text-accent-blue hover:bg-glass-white-hover rounded-lg transition-colors"
                                        title="Edit"
                                      >
                                        <IconEdit size={15} strokeWidth={2} />
                                      </button>
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setOrderToDelete(order);
                                          setIsDeleteModalOpen(true);
                                        }}
                                        className="p-1.5 text-text-muted hover:text-error hover:bg-red-500/10 rounded-lg transition-colors"
                                        title="Delete"
                                      >
                                        <IconTrash size={15} strokeWidth={2} />
                                      </button>
                                    </div>
                                  </td>
                                </motion.tr>
                              );
                            })}
                          </AnimatePresence>
                        </tbody>
                      </table>
                    </motion.div>
                  )}
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
                  <Button
                    onClick={() =>
                      setCurrentPage((prev) => Math.max(1, prev - 1))
                    }
                    disabled={
                      isPageTransitioning ||
                      currentPage <= 1 ||
                      totalPages === 0
                    }
                    variant="ghost"
                    className="px-3 py-2 text-sm disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {t("common.previous")}
                  </Button>
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
                  <Button
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
                    variant="ghost"
                    className="px-3 py-2 text-sm disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {t("common.next")}
                  </Button>
                </div>
              </div>
            </div>
          )}
        </motion.div>

        <OrderFormModal
          isOpen={isModalOpen}
          editingOrder={editingOrder}
          customers={customers}
          formData={formData}
          formErrors={formErrors}
          isSubmitting={isSubmitting}
          statusOptions={ORDER_STATUS_OPTIONS}
          onClose={handleCloseModal}
          onSubmit={handleSubmit}
          onFieldChange={handleFormFieldChange}
          onItemChange={handleOrderItemChange}
          onAddItem={handleAddOrderItem}
          onRemoveItem={handleRemoveOrderItem}
        />

        <OrderDeleteModal
          isOpen={isDeleteModalOpen}
          order={orderToDelete}
          onClose={() => {
            setIsDeleteModalOpen(false);
            setOrderToDelete(null);
          }}
          onConfirm={handleConfirmDelete}
        />

        <ParcelPrintModal
          isOpen={isPrintModalOpen}
          onClose={() => setIsPrintModalOpen(false)}
          selectedOrders={orders.filter((o) => selectedOrderIds.has(o.id))}
          onPrint={handleExecutePrint}
        />
      </motion.div>
    </>
  );
}
