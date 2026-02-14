import { OrderItemPayload } from "../types/order";
import { Customer } from "../types/customer";

interface UnprocessedOrder {
  customer_id?: number;
  order_id?: string;
  order_from?: string;
  exchange_rate?: number;
  shipping_fee?: number;
  delivery_fee?: number;
  cargo_fee?: number;
  service_fee?: number;
  order_date?: string;
  arrived_date?: string;
  shipment_date?: string;
  items: OrderItemPayload[];
}

export type ParsedOrder = Required<Pick<UnprocessedOrder, "customer_id">> &
  Omit<UnprocessedOrder, "customer_id">;

export const processOrderCSV = (
  rows: Record<string, string>[],
  customers: Customer[],
): { validOrders: ParsedOrder[]; errors: string[] } => {
  const errors: string[] = [];
  // Use a map to group orders by a unique key.
  // If "Order ID" is present, use it.
  // If not, treat each row as a new order unless we want to implement consecutive row grouping logic.
  // For simplicity: Rows without Order ID are treated as individual orders.
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
      errors.push(`Row ${index + 1}: Missing Customer Name`);
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

      order = {
        customer_id: customer.id,
        order_id: csvOrderId || undefined,
        order_from: getValue("Order From") || "Facebook",
        exchange_rate: parseFloat(getValue("Exchange Rate")) || undefined,
        shipping_fee: parseFloat(getValue("Shipping Fee")) || undefined,
        delivery_fee: parseFloat(getValue("Delivery Fee")) || undefined,
        cargo_fee: parseFloat(getValue("Cargo Fee")) || undefined,
        service_fee: parseFloat(getValue("Service Fee")) || undefined,
        order_date: orderDate || undefined,
        arrived_date: arrivedDate || undefined,
        shipment_date: shipmentDate || undefined,
        items: [],
      };
      orderGroups.set(groupKey, order);
    }

    // Add Item
    const productUrl = getValue("Product URL");
    const qty = parseInt(getValue("Qty") || "1");
    const price = parseFloat(getValue("Price") || "0");
    const weight = parseFloat(getValue("Weight") || "0");

    // Only add item if it has some meaningful data
    if (productUrl || price > 0 || qty > 0) {
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
