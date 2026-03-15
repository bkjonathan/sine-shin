import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { motion } from "framer-motion";
import { getOrderById, getOrders } from "../api/orderApi";
import { getCustomers } from "../api/customerApi";
import { getShopSettings, type ShopSettings } from "../api/settingApi";
import ParcelPrintLayout from "../components/pages/orders/ParcelPrintLayout";
import { Button, Input } from "../components/ui";
import {
  IconMinus,
  IconPackage,
  IconPlus,
  IconPrinter,
  IconSearch,
  IconTrash,
  IconUsers,
} from "../components/icons";
import { useAppSettings } from "../context/AppSettingsContext";
import { useSound } from "../context/SoundContext";
import {
  pageContainerVariants,
  pageItemSoftVariants,
} from "../constants/animations";
import { Customer } from "../types/customer";
import { OrderDetail, OrderWithCustomer } from "../types/order";
import {
  ParcelPrintLabel,
  ParcelPrintOptions,
  ParcelPrintQueueItem,
} from "../types/labelPrint";
import { printElementAsImage } from "../utils/print";
import { useTranslation } from "react-i18next";

type LabelSource = "orders" | "customers";

const DEFAULT_PRINT_OPTIONS: ParcelPrintOptions = {
  showCustomerName: true,
  showCustomerId: false,
  showCustomerPhone: true,
  showCustomerAddress: true,
  showProductDetails: true,
  showOrderId: true,
  showShopName: true,
};

const SOURCE_OPTIONS: Array<{ value: LabelSource; label: string }> = [
  { value: "orders", label: "Orders" },
  { value: "customers", label: "Customers" },
];

const PRINT_OPTION_LABELS: Array<{
  key: keyof ParcelPrintOptions;
  label: string;
}> = [
  { key: "showCustomerName", label: "Customer Name" },
  { key: "showCustomerId", label: "Customer ID" },
  { key: "showCustomerPhone", label: "Customer Phone" },
  { key: "showCustomerAddress", label: "Customer Address" },
  { key: "showProductDetails", label: "Product Details" },
  { key: "showOrderId", label: "Order ID" },
  { key: "showShopName", label: "Shop Name" },
];

const parseSource = (value: string | null): LabelSource =>
  value === "customers" ? "customers" : "orders";

const parseIds = (value: string | null): number[] =>
  (value ?? "")
    .split(",")
    .map((item) => Number.parseInt(item.trim(), 10))
    .filter((item) => Number.isFinite(item) && item > 0);

const clampCopies = (value: number): number => {
  if (!Number.isFinite(value)) {
    return 1;
  }

  return Math.min(99, Math.max(1, Math.trunc(value)));
};

const buildCustomerQueueItem = (customer: Customer): ParcelPrintQueueItem => ({
  key: `customer-${customer.id}`,
  kind: "customer",
  customerId: customer.customer_id || `#${customer.id}`,
  customerName: customer.name,
  customerPhone: customer.phone,
  customerAddress: customer.address,
  customerCity: customer.city,
  copies: 1,
});

const buildOrderQueueItem = (
  detail: OrderDetail,
  customer?: Customer,
): ParcelPrintQueueItem => ({
  key: `order-${detail.order.id}`,
  kind: "order",
  orderId: detail.order.order_id || String(detail.order.id),
  customerId:
    customer?.customer_id ||
    (detail.order.customer_id ? String(detail.order.customer_id) : null),
  customerName: detail.order.customer_name || customer?.name || null,
  customerPhone: customer?.phone || detail.order.customer_phone || null,
  customerAddress: customer?.address || detail.order.customer_address || null,
  customerCity: customer?.city || null,
  items: detail.items.map((item) => ({
    label: item.product_url || "Product",
    qty: item.product_qty,
  })),
  totalQty: detail.order.total_qty,
  totalWeight: detail.order.total_weight,
  copies: 1,
});

export default function LabelPrint() {
  const { t } = useTranslation();
  const { playSound } = useSound();
  const { invoice_printer_name } = useAppSettings();
  const [searchParams] = useSearchParams();
  const printRef = useRef<HTMLDivElement>(null);
  const lastPrefillKeyRef = useRef<string>("");
  const orderDetailsCacheRef = useRef<Map<number, OrderDetail>>(new Map());

  const [source, setSource] = useState<LabelSource>(() =>
    parseSource(searchParams.get("source")),
  );
  const [searchTerm, setSearchTerm] = useState("");
  const [orders, setOrders] = useState<OrderWithCustomer[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [shopSettings, setShopSettings] = useState<ShopSettings | null>(null);
  const [queue, setQueue] = useState<ParcelPrintQueueItem[]>([]);
  const [printOptions, setPrintOptions] =
    useState<ParcelPrintOptions>(DEFAULT_PRINT_OPTIONS);
  const [isLoading, setIsLoading] = useState(true);
  const [isApplyingPrefill, setIsApplyingPrefill] = useState(false);
  const [isPrinting, setIsPrinting] = useState(false);
  const [pendingQueueKey, setPendingQueueKey] = useState<string | null>(null);

  const customersById = useMemo(
    () => new Map(customers.map((customer) => [customer.id, customer])),
    [customers],
  );

  const filteredOrders = useMemo(() => {
    const normalized = searchTerm.trim().toLowerCase();
    const items = normalized
      ? orders.filter((order) =>
          [
            order.order_id,
            order.customer_name,
            order.customer_phone,
            order.customer_id?.toString(),
          ]
            .filter(Boolean)
            .join(" ")
            .toLowerCase()
            .includes(normalized),
        )
      : orders;

    return items.slice(0, 12);
  }, [orders, searchTerm]);

  const filteredCustomers = useMemo(() => {
    const normalized = searchTerm.trim().toLowerCase();
    const items = normalized
      ? customers.filter((customer) =>
          [customer.name, customer.customer_id, customer.phone, customer.city]
            .filter(Boolean)
            .join(" ")
            .toLowerCase()
            .includes(normalized),
        )
      : customers;

    return items.slice(0, 12);
  }, [customers, searchTerm]);

  const expandedLabels = useMemo<ParcelPrintLabel[]>(
    () =>
      queue.flatMap(({ copies, ...item }) =>
        Array.from({ length: copies }, (_, index) => ({
          ...item,
          key: `${item.key}-copy-${index + 1}`,
        })),
      ),
    [queue],
  );

  useEffect(() => {
    const loadCatalog = async () => {
      try {
        setIsLoading(true);
        const [orderData, customerData, shopData] = await Promise.all([
          getOrders(),
          getCustomers(),
          getShopSettings(),
        ]);
        setOrders(orderData);
        setCustomers(customerData);
        setShopSettings(shopData);
      } catch (error) {
        console.error("Failed to load label print data:", error);
      } finally {
        setIsLoading(false);
      }
    };

    void loadCatalog();
  }, []);

  const upsertQueueItem = (item: ParcelPrintQueueItem) => {
    setQueue((current) => {
      const existingIndex = current.findIndex(
        (queueItem) => queueItem.key === item.key,
      );
      if (existingIndex === -1) {
        return [...current, item];
      }

      return current.map((queueItem, index) =>
        index === existingIndex
          ? { ...queueItem, copies: clampCopies(queueItem.copies + 1) }
          : queueItem,
      );
    });
  };

  const getOrderQueueItem = async (
    order: OrderWithCustomer,
  ): Promise<ParcelPrintQueueItem> => {
    const cached = orderDetailsCacheRef.current.get(order.id);
    const detail = cached ?? (await getOrderById(order.id));

    if (!cached) {
      orderDetailsCacheRef.current.set(order.id, detail);
    }

    const customer = detail.order.customer_id
      ? customersById.get(detail.order.customer_id)
      : undefined;

    return buildOrderQueueItem(detail, customer);
  };

  const handleAddOrder = async (order: OrderWithCustomer) => {
    const queueKey = `order-${order.id}`;

    try {
      setPendingQueueKey(queueKey);
      const item = await getOrderQueueItem(order);
      upsertQueueItem(item);
      playSound("click");
    } catch (error) {
      console.error("Failed to add order label:", error);
      playSound("error");
    } finally {
      setPendingQueueKey(null);
    }
  };

  const handleAddCustomer = (customer: Customer) => {
    upsertQueueItem(buildCustomerQueueItem(customer));
    playSound("click");
  };

  useEffect(() => {
    if (isLoading) {
      return;
    }

    const querySource = parseSource(searchParams.get("source"));
    const ids = parseIds(searchParams.get("ids"));
    const nextPrefillKey = `${querySource}:${ids.join(",")}`;

    if (nextPrefillKey === lastPrefillKeyRef.current) {
      return;
    }

    lastPrefillKeyRef.current = nextPrefillKey;
    setSource(querySource);

    if (ids.length === 0) {
      return;
    }

    const applyPrefill = async () => {
      try {
        setIsApplyingPrefill(true);

        if (querySource === "customers") {
          const nextQueue = ids
            .map((id) => customersById.get(id))
            .filter((customer): customer is Customer => Boolean(customer))
            .map((customer) => buildCustomerQueueItem(customer));

          setQueue(nextQueue);
          return;
        }

        const nextQueue = await Promise.all(
          ids.map(async (id) => {
            const order = orders.find((item) => item.id === id);
            if (!order) {
              return null;
            }

            return getOrderQueueItem(order);
          }),
        );

        setQueue(
          nextQueue.filter(
            (item): item is ParcelPrintQueueItem => Boolean(item),
          ),
        );
      } catch (error) {
        console.error("Failed to apply label print prefill:", error);
      } finally {
        setIsApplyingPrefill(false);
      }
    };

    void applyPrefill();
  }, [customersById, isLoading, orders, searchParams]);

  const handleUpdateCopies = (queueKey: string, nextValue: number) => {
    setQueue((current) =>
      current.map((item) =>
        item.key === queueKey
          ? { ...item, copies: clampCopies(nextValue) }
          : item,
      ),
    );
  };

  const handleRemoveQueueItem = (queueKey: string) => {
    setQueue((current) => current.filter((item) => item.key !== queueKey));
  };

  const handleToggleOption = (key: keyof ParcelPrintOptions) => {
    setPrintOptions((current) => ({
      ...current,
      [key]: !current[key],
    }));
  };

  const handlePrint = async () => {
    if (!printRef.current || expandedLabels.length === 0) {
      return;
    }

    try {
      setIsPrinting(true);
      await printElementAsImage(printRef.current, invoice_printer_name);
      playSound("success");
    } catch (error) {
      console.error("Failed to print labels:", error);
      playSound("error");
    } finally {
      setIsPrinting(false);
    }
  };

  const resolvedShopName = shopSettings?.shop_name?.trim() || t("app.title");

  return (
    <>
      <ParcelPrintLayout
        ref={printRef}
        labels={expandedLabels}
        options={printOptions}
        shopName={resolvedShopName}
      />
      <motion.div
        initial="hidden"
        animate="show"
        variants={pageContainerVariants}
        className="max-w-7xl mx-auto h-full flex flex-col"
      >
        <motion.div
          variants={pageItemSoftVariants}
          className="flex flex-wrap items-start justify-between gap-4 mb-6"
        >
          <div>
            <h1 className="text-2xl font-bold text-text-primary tracking-tight">
              {t("nav.label_print", "Label Print")}
            </h1>
            <p className="text-sm text-text-muted mt-1">
              Print parcel labels from orders or customers and set how many
              copies you need.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="ghost"
              onClick={() => setQueue([])}
              disabled={queue.length === 0 || isPrinting}
              className="px-4 py-2 text-sm flex items-center gap-2"
            >
              <IconTrash size={16} strokeWidth={2} />
              Clear
            </Button>
            <Button
              variant="primary"
              onClick={handlePrint}
              disabled={expandedLabels.length === 0 || isPrinting}
              className="px-4 py-2 text-sm flex items-center gap-2"
            >
              {isPrinting ? (
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <IconPrinter size={16} strokeWidth={2} />
              )}
              {isPrinting
                ? "Printing..."
                : `Print Labels (${expandedLabels.length})`}
            </Button>
          </div>
        </motion.div>

        <div className="grid grid-cols-1 xl:grid-cols-[340px_minmax(0,1fr)] gap-6 flex-1 min-h-0">
          <motion.div
            variants={pageItemSoftVariants}
            className="glass-panel p-4 flex flex-col gap-4 min-h-0"
          >
            <div className="flex items-center gap-2 rounded-xl border border-glass-border bg-glass-white p-1">
              {SOURCE_OPTIONS.map((option) => {
                const isActive = option.value === source;
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setSource(option.value)}
                    className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                      isActive
                        ? "bg-accent-blue text-white shadow-md"
                        : "text-text-secondary hover:bg-glass-white-hover"
                    }`}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>

            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <IconSearch className="w-4 h-4 text-text-muted" strokeWidth={2} />
              </div>
              <Input
                type="text"
                className="input-liquid pl-10 w-full"
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder={
                  source === "orders"
                    ? "Search by order, customer, or phone"
                    : "Search customer by name, ID, or phone"
                }
              />
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto pr-1">
              {isLoading || isApplyingPrefill ? (
                <div className="h-full flex items-center justify-center">
                  <div className="w-7 h-7 border-2 border-glass-border border-t-accent-blue rounded-full animate-spin" />
                </div>
              ) : source === "orders" ? (
                <div className="space-y-3">
                  {filteredOrders.map((order) => {
                    const queueKey = `order-${order.id}`;
                    const existing = queue.find((item) => item.key === queueKey);

                    return (
                      <button
                        key={order.id}
                        type="button"
                        onClick={() => void handleAddOrder(order)}
                        disabled={pendingQueueKey === queueKey}
                        className="w-full text-left rounded-xl border border-glass-border bg-glass-white/70 hover:bg-glass-white-hover transition-colors p-3"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-text-primary">
                              #{order.order_id || order.id}
                            </p>
                            <p className="text-sm text-text-secondary truncate">
                              {order.customer_name || "Unknown customer"}
                            </p>
                            <p className="text-xs text-text-muted mt-1 truncate">
                              {order.customer_phone || order.order_from || "-"}
                            </p>
                          </div>
                          <div className="text-right shrink-0">
                            <div className="inline-flex items-center gap-1 rounded-full border border-glass-border bg-glass-white px-2 py-1 text-[11px] font-medium text-text-secondary">
                              {existing ? `${existing.copies} copies` : "Add"}
                            </div>
                            {pendingQueueKey === queueKey && (
                              <div className="mt-2 w-4 h-4 ml-auto border-2 border-glass-border border-t-accent-blue rounded-full animate-spin" />
                            )}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                  {filteredOrders.length === 0 && (
                    <div className="text-sm text-text-muted py-8 text-center">
                      No matching orders found.
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-3">
                  {filteredCustomers.map((customer) => {
                    const queueKey = `customer-${customer.id}`;
                    const existing = queue.find((item) => item.key === queueKey);

                    return (
                      <button
                        key={customer.id}
                        type="button"
                        onClick={() => handleAddCustomer(customer)}
                        className="w-full text-left rounded-xl border border-glass-border bg-glass-white/70 hover:bg-glass-white-hover transition-colors p-3"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-text-primary">
                              {customer.name}
                            </p>
                            <p className="text-sm text-text-secondary truncate">
                              {customer.customer_id || `#${customer.id}`}
                            </p>
                            <p className="text-xs text-text-muted mt-1 truncate">
                              {customer.phone || customer.city || "-"}
                            </p>
                          </div>
                          <div className="inline-flex items-center gap-1 rounded-full border border-glass-border bg-glass-white px-2 py-1 text-[11px] font-medium text-text-secondary shrink-0">
                            {existing ? `${existing.copies} copies` : "Add"}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                  {filteredCustomers.length === 0 && (
                    <div className="text-sm text-text-muted py-8 text-center">
                      No matching customers found.
                    </div>
                  )}
                </div>
              )}
            </div>
          </motion.div>

          <div className="min-h-0 flex flex-col gap-6">
            <motion.div
              variants={pageItemSoftVariants}
              className="glass-panel p-4"
            >
              <div className="flex items-center justify-between gap-4 mb-4">
                <div>
                  <h2 className="text-lg font-semibold text-text-primary">
                    Selected Labels
                  </h2>
                  <p className="text-sm text-text-muted">
                    Adjust copies for each order or customer before printing.
                  </p>
                </div>
                <div className="rounded-full border border-glass-border bg-glass-white px-3 py-1 text-sm text-text-secondary">
                  {expandedLabels.length} total labels
                </div>
              </div>

              {queue.length === 0 ? (
                <div className="rounded-xl border border-dashed border-glass-border p-8 text-center text-text-muted">
                  Add an order or customer to start building the print sheet.
                </div>
              ) : (
                <div className="space-y-3 max-h-72 overflow-y-auto pr-1">
                  {queue.map((item) => (
                    <div
                      key={item.key}
                      className="rounded-xl border border-glass-border bg-glass-white/60 p-3 flex flex-wrap items-center justify-between gap-3"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="inline-flex rounded-full bg-glass-white px-2 py-1 text-[10px] uppercase tracking-[0.12em] text-text-muted border border-glass-border">
                            {item.kind}
                          </span>
                          {item.orderId ? (
                            <span className="font-mono text-xs text-text-secondary">
                              #{item.orderId}
                            </span>
                          ) : (
                            <span className="font-mono text-xs text-text-secondary">
                              {item.customerId}
                            </span>
                          )}
                        </div>
                        <p className="text-sm font-semibold text-text-primary mt-1">
                          {item.customerName || "Unnamed"}
                        </p>
                        <p className="text-xs text-text-muted mt-1 truncate">
                          {[item.customerPhone, item.customerAddress, item.customerCity]
                            .filter(Boolean)
                            .join(" · ") || "-"}
                        </p>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() =>
                            handleUpdateCopies(item.key, item.copies - 1)
                          }
                          className="p-2 rounded-lg border border-glass-border bg-glass-white text-text-secondary hover:text-text-primary"
                        >
                          <IconMinus size={14} strokeWidth={2} />
                        </button>
                        <input
                          type="number"
                          min={1}
                          max={99}
                          value={item.copies}
                          onChange={(event) =>
                            handleUpdateCopies(
                              item.key,
                              Number.parseInt(event.target.value, 10),
                            )
                          }
                          className="w-20 rounded-lg border border-glass-border bg-glass-white px-3 py-2 text-sm text-center text-text-primary outline-none"
                        />
                        <button
                          type="button"
                          onClick={() =>
                            handleUpdateCopies(item.key, item.copies + 1)
                          }
                          className="p-2 rounded-lg border border-glass-border bg-glass-white text-text-secondary hover:text-text-primary"
                        >
                          <IconPlus size={14} strokeWidth={2} />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleRemoveQueueItem(item.key)}
                          className="p-2 rounded-lg border border-glass-border bg-glass-white text-text-secondary hover:text-error"
                        >
                          <IconTrash size={14} strokeWidth={2} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </motion.div>

            <motion.div
              variants={pageItemSoftVariants}
              className="glass-panel p-4"
            >
              <h2 className="text-lg font-semibold text-text-primary mb-4">
                Label Options
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                {PRINT_OPTION_LABELS.map((option) => (
                  <label
                    key={option.key}
                    className="flex items-center gap-3 rounded-xl border border-glass-border bg-glass-white/60 px-3 py-3 cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={printOptions[option.key]}
                      onChange={() => handleToggleOption(option.key)}
                      className="w-4 h-4 text-accent-blue bg-glass-surface border-glass-border rounded focus:ring-accent-blue"
                    />
                    <span className="text-sm text-text-primary">
                      {option.label}
                    </span>
                  </label>
                ))}
              </div>
            </motion.div>

            <motion.div
              variants={pageItemSoftVariants}
              className="glass-panel p-4 min-h-0 flex flex-col"
            >
              <div className="flex items-center justify-between gap-4 mb-4">
                <div>
                  <h2 className="text-lg font-semibold text-text-primary">
                    Preview
                  </h2>
                  <p className="text-sm text-text-muted">
                    This is the exact label layout that will be printed.
                  </p>
                </div>
                <div className="flex items-center gap-2 text-sm text-text-muted">
                  {source === "orders" ? (
                    <IconPackage size={16} strokeWidth={2} />
                  ) : (
                    <IconUsers size={16} strokeWidth={2} />
                  )}
                  {expandedLabels.length} labels
                </div>
              </div>

              <div className="flex-1 overflow-y-auto pr-1">
                {expandedLabels.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-glass-border p-8 text-center text-text-muted">
                    Your label preview will appear here.
                  </div>
                ) : (
                  <ParcelPrintLayout
                    labels={expandedLabels}
                    options={printOptions}
                    shopName={resolvedShopName}
                    mode="preview"
                  />
                )}
              </div>
            </motion.div>
          </div>
        </div>
      </motion.div>
    </>
  );
}
