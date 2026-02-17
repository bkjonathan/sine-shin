import { OrderItemPayload, OrderStatus } from "../types/order";
import { Customer } from "../types/customer";

interface UnprocessedOrder {
  customer_id?: number;
  order_id?: string;
  status?: OrderStatus;
  order_from?: string;
  exchange_rate?: number;
  shipping_fee?: number;
  delivery_fee?: number;
  cargo_fee?: number;
  service_fee?: number;
  service_fee_type?: "fixed" | "percent";
  order_date?: string;
  arrived_date?: string;
  shipment_date?: string;
  items: OrderItemPayload[];
  id?: number;
}

export type ParsedOrder = Required<Pick<UnprocessedOrder, "customer_id">> &
  Omit<UnprocessedOrder, "customer_id">;

const parseOrderStatus = (rawStatus: string): OrderStatus | undefined => {
  const normalized = rawStatus.trim().toLowerCase();
  if (!normalized) {
    return undefined;
  }

  if (
    normalized === "pending" ||
    normalized === "confirmed" ||
    normalized === "shipping" ||
    normalized === "completed" ||
    normalized === "cancelled"
  ) {
    return normalized;
  }

  return undefined;
};

export const processOrderCSV = (
  rows: Record<string, string>[],
  customers: Customer[],
): { validOrders: ParsedOrder[]; errors: string[] } => {
  const errors: string[] = [];
  const orderGroups: Map<string, UnprocessedOrder> = new Map();
  let autoIdCounter = 0;

  rows.forEach((row, index) => {
    // Helper to get value case-insensitively
    const getValue = (key: string) => {
      const foundKey = Object.keys(row).find(
        (k) => k.toLowerCase() === key.toLowerCase(),
      );
      return foundKey ? row[foundKey] : "";
    };

    const customerName = getValue("Customer Name");
    if (!customerName) {
      // Skip empty rows often found at end of CSV
      const isEmptyRow = Object.values(row).every((v) => !v || v.trim() === "");
      if (!isEmptyRow) {
        errors.push(`Row ${index + 1}: Missing Customer Name`);
      }
      return;
    }

    // Find Customer
    const customer = customers.find(
      (c) => c.name.toLowerCase() === customerName.toLowerCase(),
    );
    if (!customer) {
      errors.push(
        `Row ${index + 1}: Customer '${customerName}' not found. Please create the customer first.`,
      );
      return;
    }

    const csvOrderId = getValue("Order ID");
    // If Order ID is present, use it as key. Otherwise generate unique key for this row.
    const groupKey = csvOrderId
      ? `ID:${csvOrderId}`
      : `AUTO:${index}:${autoIdCounter++}`;

    let order = orderGroups.get(groupKey);

    if (!order) {
      const orderDate = getValue("Order Date");
      const arrivedDate = getValue("Arrived Date");
      const shipmentDate = getValue("Shipment Date");
      const rawStatus = getValue("Status");
      const status = parseOrderStatus(rawStatus);

      if (rawStatus.trim() && !status) {
        errors.push(
          `Row ${index + 1}: Invalid Status '${rawStatus}'. Allowed values are pending, confirmed, shipping, completed, cancelled.`,
        );
      }

      order = {
        customer_id: customer.id,
        order_id: csvOrderId || undefined,
        status,
        order_from: getValue("Order From") || "Facebook",
        exchange_rate: parseFloat(getValue("Exchange Rate")) || undefined,
        shipping_fee: parseFloat(getValue("Shipping Fee")) || undefined,
        delivery_fee: parseFloat(getValue("Delivery Fee")) || undefined,
        cargo_fee: parseFloat(getValue("Cargo Fee")) || undefined,
        service_fee: parseFloat(getValue("Service Fee")) || undefined,
        service_fee_type: (getValue("Service Fee Type") as any) || "fixed",
        order_date: orderDate || undefined,
        arrived_date: arrivedDate || undefined,
        shipment_date: shipmentDate || undefined,
        items: [],
      };

      // Extract ID if present (for restoration/migration)
      const idStr = getValue("id");
      if (idStr && !isNaN(parseInt(idStr))) {
        order.id = parseInt(idStr);
      }

      orderGroups.set(groupKey, order);
    }

    // Add Item
    const productUrl = getValue("Product URL");
    const qty = parseInt(getValue("Item Qty") || "1");
    const price = parseFloat(getValue("Item Price") || "0");
    const weight = parseFloat(getValue("Item Weight") || "0");

    // Only add item if it has some meaningful data
    if (order && (productUrl || price > 0 || qty > 0)) {
      order.items.push({
        product_url: productUrl,
        product_qty: qty,
        price: price,
        product_weight: weight,
      });
    }
  });

  // Convert map to array and ensure type safety
  const validOrders: ParsedOrder[] = [];
  orderGroups.forEach((order) => {
    if (order.customer_id) {
      validOrders.push(order as ParsedOrder);
    }
  });

  return {
    validOrders,
    errors,
  };
};
