import { Customer } from "../types/customer";
import { OrderItemPayload, OrderStatus } from "../types/order";

const ORDER_STATUS_VALUES: readonly OrderStatus[] = [
  "pending",
  "confirmed",
  "shipping",
  "completed",
  "cancelled",
] as const;

const SERVICE_FEE_TYPES = ["fixed", "percent"] as const;

export const ORDER_CSV_HEADERS = [
  "Order Local ID",
  "Order UUID",
  "Order ID",
  "Customer Local ID",
  "Customer UUID",
  "Customer ID",
  "Customer Name",
  "Status",
  "Order From",
  "Exchange Rate",
  "Shipping Fee",
  "Delivery Fee",
  "Cargo Fee",
  "Order Date",
  "Arrived Date",
  "Shipment Date",
  "User Withdraw Date",
  "Service Fee",
  "Product Discount",
  "Service Fee Type",
  "Shipping Fee Paid",
  "Delivery Fee Paid",
  "Cargo Fee Paid",
  "Service Fee Paid",
  "Shipping Fee By Shop",
  "Delivery Fee By Shop",
  "Cargo Fee By Shop",
  "Exclude Cargo Fee",
  "Order Created At",
  "Order Updated At",
  "Order Deleted At",
  "Item Local ID",
  "Item UUID",
  "Product URL",
  "Item Qty",
  "Item Price",
  "Item Weight",
  "Item Created At",
  "Item Updated At",
  "Item Deleted At",
] as const;

type OrderServiceFeeType = (typeof SERVICE_FEE_TYPES)[number];

interface RawGroupedOrder {
  id?: number;
  uuid?: string | null;
  order_id?: string | null;
  customer_id?: number;
  status?: OrderStatus;
  order_from?: string;
  exchange_rate?: number;
  shipping_fee?: number;
  delivery_fee?: number;
  cargo_fee?: number;
  order_date?: string;
  arrived_date?: string;
  shipment_date?: string;
  user_withdraw_date?: string;
  service_fee?: number;
  product_discount?: number;
  service_fee_type?: OrderServiceFeeType;
  shipping_fee_paid?: boolean;
  delivery_fee_paid?: boolean;
  cargo_fee_paid?: boolean;
  service_fee_paid?: boolean;
  shipping_fee_by_shop?: boolean;
  delivery_fee_by_shop?: boolean;
  cargo_fee_by_shop?: boolean;
  exclude_cargo_fee?: boolean;
  items: OrderItemPayload[];
  sourceRows: number[];
}

export interface ParsedOrderImport {
  id?: number;
  uuid?: string | null;
  order_id?: string | null;
  customer_id: number;
  status?: OrderStatus;
  order_from?: string;
  exchange_rate?: number;
  shipping_fee?: number;
  delivery_fee?: number;
  cargo_fee?: number;
  order_date?: string;
  arrived_date?: string;
  shipment_date?: string;
  user_withdraw_date?: string;
  service_fee?: number;
  product_discount?: number;
  service_fee_type?: OrderServiceFeeType;
  shipping_fee_paid?: boolean;
  delivery_fee_paid?: boolean;
  cargo_fee_paid?: boolean;
  service_fee_paid?: boolean;
  shipping_fee_by_shop?: boolean;
  delivery_fee_by_shop?: boolean;
  cargo_fee_by_shop?: boolean;
  exclude_cargo_fee?: boolean;
  items: OrderItemPayload[];
}

const normalizeKey = (value: string): string => value.trim().toLowerCase();

const ORDER_ID_ALIASES = [
  "order local id",
  "order_local_id",
  "local_id",
  "id",
] as const;
const ORDER_UUID_ALIASES = ["order uuid", "order_uuid", "uuid"] as const;
const ORDER_CODE_ALIASES = ["order id", "order_id"] as const;
const CUSTOMER_LOCAL_ID_ALIASES = [
  "customer local id",
  "customer_local_id",
  "customer id local",
] as const;
const CUSTOMER_UUID_ALIASES = ["customer uuid", "customer_uuid"] as const;
const CUSTOMER_CODE_ALIASES = ["customer id", "customer_id"] as const;
const CUSTOMER_NAME_ALIASES = ["customer name", "customer_name"] as const;

const getRecordValue = (
  record: Record<string, string>,
  aliases: readonly string[],
): string | undefined => {
  const aliasSet = new Set(aliases.map(normalizeKey));
  const key = Object.keys(record).find((recordKey) =>
    aliasSet.has(normalizeKey(recordKey)),
  );
  return key ? record[key] : undefined;
};

const parseOptionalString = (
  record: Record<string, string>,
  aliases: readonly string[],
): string | null | undefined => {
  const raw = getRecordValue(record, aliases);
  if (raw === undefined) {
    return undefined;
  }

  const trimmed = raw.trim();
  if (!trimmed || trimmed === "-") {
    return null;
  }
  return trimmed;
};

const parseOptionalNumber = (
  record: Record<string, string>,
  aliases: readonly string[],
): number | undefined => {
  const raw = parseOptionalString(record, aliases);
  if (raw === undefined || raw === null) {
    return undefined;
  }
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) {
    return undefined;
  }
  return parsed;
};

const parseOptionalInt = (
  record: Record<string, string>,
  aliases: readonly string[],
): number | undefined => {
  const raw = parseOptionalString(record, aliases);
  if (raw === undefined || raw === null) {
    return undefined;
  }
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed)) {
    return undefined;
  }
  return parsed;
};

const parseOptionalBoolean = (
  record: Record<string, string>,
  aliases: readonly string[],
): boolean | undefined => {
  const raw = parseOptionalString(record, aliases);
  if (raw === undefined || raw === null) {
    return undefined;
  }

  const normalized = raw.trim().toLowerCase();
  if (["1", "true", "yes", "y"].includes(normalized)) {
    return true;
  }
  if (["0", "false", "no", "n"].includes(normalized)) {
    return false;
  }
  return undefined;
};

const parseOrderStatus = (
  record: Record<string, string>,
): OrderStatus | undefined => {
  const raw = parseOptionalString(record, ["status"]);
  if (raw === undefined || raw === null) {
    return undefined;
  }
  const normalized = raw.toLowerCase();
  return ORDER_STATUS_VALUES.find((value) => value === normalized);
};

const parseServiceFeeType = (
  record: Record<string, string>,
): OrderServiceFeeType | undefined => {
  const raw = parseOptionalString(record, ["service fee type", "service_fee_type"]);
  if (raw === undefined || raw === null) {
    return undefined;
  }
  const normalized = raw.toLowerCase();
  return SERVICE_FEE_TYPES.find((value) => value === normalized);
};

const withStringValue = (value: string | null | undefined): string | undefined => {
  if (value === undefined) {
    return undefined;
  }
  if (value === null) {
    return "";
  }
  return value;
};

const withNullableString = (value: string | null | undefined): string | null | undefined => {
  if (value === undefined) {
    return undefined;
  }
  return value;
};

const mergeIfDefined = <T>(current: T | undefined, incoming: T | undefined): T | undefined => {
  if (incoming === undefined) {
    return current;
  }
  return incoming;
};

const isRowEmpty = (record: Record<string, string>): boolean => {
  return Object.values(record).every((value) => !value || value.trim() === "");
};

const buildOrderGroupKey = (record: Record<string, string>, rowIndex: number): string => {
  const localId = parseOptionalInt(record, ORDER_ID_ALIASES);
  if (localId !== undefined) {
    return `id:${localId}`;
  }

  const uuid = parseOptionalString(record, ORDER_UUID_ALIASES);
  if (uuid) {
    return `uuid:${uuid.toLowerCase()}`;
  }

  const orderCode = parseOptionalString(record, ORDER_CODE_ALIASES);
  if (orderCode) {
    return `order:${orderCode.toLowerCase()}`;
  }

  return `row:${rowIndex}`;
};

const resolveCustomerId = (
  record: Record<string, string>,
  customersById: Map<number, Customer>,
  customersByUuid: Map<string, Customer>,
  customersByCode: Map<string, Customer>,
  customersByName: Map<string, Customer>,
): number | undefined => {
  const customerLocalId = parseOptionalInt(record, CUSTOMER_LOCAL_ID_ALIASES);
  if (customerLocalId !== undefined) {
    const byLocalId = customersById.get(customerLocalId);
    if (byLocalId) {
      return byLocalId.id;
    }
  }

  const customerUuid = parseOptionalString(record, CUSTOMER_UUID_ALIASES);
  if (customerUuid) {
    const byUuid = customersByUuid.get(customerUuid.toLowerCase());
    if (byUuid) {
      return byUuid.id;
    }
  }

  const customerCode = parseOptionalString(record, CUSTOMER_CODE_ALIASES);
  if (customerCode) {
    const byCode = customersByCode.get(customerCode.toLowerCase());
    if (byCode) {
      return byCode.id;
    }
  }

  const customerName = parseOptionalString(record, CUSTOMER_NAME_ALIASES);
  if (customerName) {
    const byName = customersByName.get(customerName.toLowerCase());
    if (byName) {
      return byName.id;
    }
  }

  return undefined;
};

export const processOrderCSV = (
  rows: Record<string, string>[],
  customers: Customer[],
): { validOrders: ParsedOrderImport[]; errors: string[] } => {
  const errors: string[] = [];
  const groups = new Map<string, RawGroupedOrder>();

  const customersById = new Map<number, Customer>();
  const customersByUuid = new Map<string, Customer>();
  const customersByCode = new Map<string, Customer>();
  const customersByName = new Map<string, Customer>();

  for (const customer of customers) {
    customersById.set(customer.id, customer);
    if (customer.uuid?.trim()) {
      customersByUuid.set(customer.uuid.trim().toLowerCase(), customer);
    }
    if (customer.customer_id?.trim()) {
      customersByCode.set(customer.customer_id.trim().toLowerCase(), customer);
    }
    if (customer.name.trim()) {
      customersByName.set(customer.name.trim().toLowerCase(), customer);
    }
  }

  rows.forEach((record, index) => {
    const rowNumber = index + 2;
    if (isRowEmpty(record)) {
      return;
    }

    const groupKey = buildOrderGroupKey(record, index);
    const existing = groups.get(groupKey);
    const currentGroup: RawGroupedOrder = existing ?? {
      items: [],
      sourceRows: [],
    };
    currentGroup.sourceRows.push(rowNumber);

    const parsedStatus = parseOrderStatus(record);
    const rawStatus = parseOptionalString(record, ["status"]);
    if (rawStatus && !parsedStatus) {
      errors.push(
        `Row ${rowNumber}: Invalid status '${rawStatus}'. Allowed values: ${ORDER_STATUS_VALUES.join(", ")}.`,
      );
    }

    const parsedServiceFeeType = parseServiceFeeType(record);
    const rawServiceFeeType = parseOptionalString(record, [
      "service fee type",
      "service_fee_type",
    ]);
    if (rawServiceFeeType && !parsedServiceFeeType) {
      errors.push(
        `Row ${rowNumber}: Invalid service_fee_type '${rawServiceFeeType}'. Allowed values: fixed, percent.`,
      );
    }

    const resolvedCustomerId = resolveCustomerId(
      record,
      customersById,
      customersByUuid,
      customersByCode,
      customersByName,
    );

    const hasAnyCustomerReference = Boolean(
      parseOptionalString(record, CUSTOMER_LOCAL_ID_ALIASES) ||
        parseOptionalString(record, CUSTOMER_UUID_ALIASES) ||
        parseOptionalString(record, CUSTOMER_CODE_ALIASES) ||
        parseOptionalString(record, CUSTOMER_NAME_ALIASES),
    );

    if (hasAnyCustomerReference && resolvedCustomerId === undefined) {
      errors.push(
        `Row ${rowNumber}: Customer not found. Match by Customer Local ID, UUID, Customer ID, or Customer Name failed.`,
      );
    }

    const rawQty = parseOptionalString(record, [
      "item qty",
      "item_qty",
      "product_qty",
      "qty",
    ]);
    let itemQty: number | undefined;
    if (rawQty === undefined || rawQty === null || rawQty === "") {
      itemQty = 1;
    } else {
      const parsedQty = Number.parseInt(rawQty, 10);
      if (!Number.isFinite(parsedQty) || parsedQty < 1) {
        errors.push(`Row ${rowNumber}: Item Qty must be an integer >= 1.`);
      } else {
        itemQty = parsedQty;
      }
    }

    const rawPrice = parseOptionalString(record, [
      "item price",
      "item_price",
      "product_price",
      "price",
    ]);
    let itemPrice: number | undefined;
    if (rawPrice === undefined || rawPrice === null || rawPrice === "") {
      itemPrice = 0;
    } else {
      const parsedPrice = Number(rawPrice);
      if (!Number.isFinite(parsedPrice) || parsedPrice < 0) {
        errors.push(`Row ${rowNumber}: Item Price must be a non-negative number.`);
      } else {
        itemPrice = parsedPrice;
      }
    }

    const rawWeight = parseOptionalString(record, [
      "item weight",
      "item_weight",
      "product_weight",
      "weight",
    ]);
    let itemWeight: number | undefined;
    if (rawWeight === undefined || rawWeight === null || rawWeight === "") {
      itemWeight = 0;
    } else {
      const parsedWeight = Number(rawWeight);
      if (!Number.isFinite(parsedWeight) || parsedWeight < 0) {
        errors.push(`Row ${rowNumber}: Item Weight must be a non-negative number.`);
      } else {
        itemWeight = parsedWeight;
      }
    }

    currentGroup.id = mergeIfDefined(
      currentGroup.id,
      parseOptionalInt(record, ORDER_ID_ALIASES),
    );
    currentGroup.uuid = mergeIfDefined(
      currentGroup.uuid,
      withNullableString(parseOptionalString(record, ORDER_UUID_ALIASES)),
    );
    currentGroup.order_id = mergeIfDefined(
      currentGroup.order_id,
      withNullableString(parseOptionalString(record, ORDER_CODE_ALIASES)),
    );
    currentGroup.customer_id = mergeIfDefined(currentGroup.customer_id, resolvedCustomerId);
    currentGroup.status = mergeIfDefined(currentGroup.status, parsedStatus);
    currentGroup.order_from = mergeIfDefined(
      currentGroup.order_from,
      withStringValue(parseOptionalString(record, ["order from", "order_from"])),
    );
    currentGroup.exchange_rate = mergeIfDefined(
      currentGroup.exchange_rate,
      parseOptionalNumber(record, ["exchange rate", "exchange_rate"]),
    );
    currentGroup.shipping_fee = mergeIfDefined(
      currentGroup.shipping_fee,
      parseOptionalNumber(record, ["shipping fee", "shipping_fee"]),
    );
    currentGroup.delivery_fee = mergeIfDefined(
      currentGroup.delivery_fee,
      parseOptionalNumber(record, ["delivery fee", "delivery_fee"]),
    );
    currentGroup.cargo_fee = mergeIfDefined(
      currentGroup.cargo_fee,
      parseOptionalNumber(record, ["cargo fee", "cargo_fee"]),
    );
    currentGroup.order_date = mergeIfDefined(
      currentGroup.order_date,
      withStringValue(parseOptionalString(record, ["order date", "order_date"])),
    );
    currentGroup.arrived_date = mergeIfDefined(
      currentGroup.arrived_date,
      withStringValue(parseOptionalString(record, ["arrived date", "arrived_date"])),
    );
    currentGroup.shipment_date = mergeIfDefined(
      currentGroup.shipment_date,
      withStringValue(parseOptionalString(record, ["shipment date", "shipment_date"])),
    );
    currentGroup.user_withdraw_date = mergeIfDefined(
      currentGroup.user_withdraw_date,
      withStringValue(
        parseOptionalString(record, ["user withdraw date", "user_withdraw_date"]),
      ),
    );
    currentGroup.service_fee = mergeIfDefined(
      currentGroup.service_fee,
      parseOptionalNumber(record, ["service fee", "service_fee"]),
    );
    currentGroup.product_discount = mergeIfDefined(
      currentGroup.product_discount,
      parseOptionalNumber(record, ["product discount", "product_discount"]),
    );
    currentGroup.service_fee_type = mergeIfDefined(
      currentGroup.service_fee_type,
      parsedServiceFeeType,
    );
    currentGroup.shipping_fee_paid = mergeIfDefined(
      currentGroup.shipping_fee_paid,
      parseOptionalBoolean(record, ["shipping fee paid", "shipping_fee_paid"]),
    );
    currentGroup.delivery_fee_paid = mergeIfDefined(
      currentGroup.delivery_fee_paid,
      parseOptionalBoolean(record, ["delivery fee paid", "delivery_fee_paid"]),
    );
    currentGroup.cargo_fee_paid = mergeIfDefined(
      currentGroup.cargo_fee_paid,
      parseOptionalBoolean(record, ["cargo fee paid", "cargo_fee_paid"]),
    );
    currentGroup.service_fee_paid = mergeIfDefined(
      currentGroup.service_fee_paid,
      parseOptionalBoolean(record, ["service fee paid", "service_fee_paid"]),
    );
    currentGroup.shipping_fee_by_shop = mergeIfDefined(
      currentGroup.shipping_fee_by_shop,
      parseOptionalBoolean(record, ["shipping fee by shop", "shipping_fee_by_shop"]),
    );
    currentGroup.delivery_fee_by_shop = mergeIfDefined(
      currentGroup.delivery_fee_by_shop,
      parseOptionalBoolean(record, ["delivery fee by shop", "delivery_fee_by_shop"]),
    );
    currentGroup.cargo_fee_by_shop = mergeIfDefined(
      currentGroup.cargo_fee_by_shop,
      parseOptionalBoolean(record, ["cargo fee by shop", "cargo_fee_by_shop"]),
    );
    currentGroup.exclude_cargo_fee = mergeIfDefined(
      currentGroup.exclude_cargo_fee,
      parseOptionalBoolean(record, ["exclude cargo fee", "exclude_cargo_fee"]),
    );

    const productUrl = withStringValue(
      parseOptionalString(record, ["product url", "product_url"]),
    );

    if (itemQty !== undefined && itemPrice !== undefined && itemWeight !== undefined) {
      currentGroup.items.push({
        product_url: productUrl,
        product_qty: itemQty,
        price: itemPrice,
        product_weight: itemWeight,
      });
    }

    groups.set(groupKey, currentGroup);
  });

  const validOrders: ParsedOrderImport[] = [];

  groups.forEach((group) => {
    const firstRow = group.sourceRows[0];
    if (group.customer_id === undefined) {
      errors.push(`Row ${firstRow}: Missing or unresolved customer.`);
      return;
    }

    if (group.items.length === 0) {
      errors.push(`Row ${firstRow}: Order has no valid item rows.`);
      return;
    }

    validOrders.push({
      id: group.id,
      uuid: group.uuid,
      order_id: group.order_id,
      customer_id: group.customer_id,
      status: group.status,
      order_from: group.order_from,
      exchange_rate: group.exchange_rate,
      shipping_fee: group.shipping_fee,
      delivery_fee: group.delivery_fee,
      cargo_fee: group.cargo_fee,
      order_date: group.order_date,
      arrived_date: group.arrived_date,
      shipment_date: group.shipment_date,
      user_withdraw_date: group.user_withdraw_date,
      service_fee: group.service_fee,
      product_discount: group.product_discount,
      service_fee_type: group.service_fee_type,
      shipping_fee_paid: group.shipping_fee_paid,
      delivery_fee_paid: group.delivery_fee_paid,
      cargo_fee_paid: group.cargo_fee_paid,
      service_fee_paid: group.service_fee_paid,
      shipping_fee_by_shop: group.shipping_fee_by_shop,
      delivery_fee_by_shop: group.delivery_fee_by_shop,
      cargo_fee_by_shop: group.cargo_fee_by_shop,
      exclude_cargo_fee: group.exclude_cargo_fee,
      items: group.items,
    });
  });

  return { validOrders, errors };
};
