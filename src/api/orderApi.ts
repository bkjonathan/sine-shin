import { invoke } from "@tauri-apps/api/core";
import {
  Order,
  OrderWithCustomer,
  OrderDetail,
  OrderItemPayload,
  PaginatedOrders,
  OrderExportRow,
  OrderStatus,
} from "../types/order";

export const ORDER_PAGE_SIZE_LIMITS = {
  min: 5,
  max: 100,
  default: 10,
} as const;

const normalizePageSize = (pageSize?: number | "all"): number => {
  if (pageSize === "all") {
    return -1;
  }

  const requested = pageSize ?? ORDER_PAGE_SIZE_LIMITS.default;
  return Math.min(
    ORDER_PAGE_SIZE_LIMITS.max,
    Math.max(ORDER_PAGE_SIZE_LIMITS.min, requested),
  );
};

const clampPage = (page?: number): number => {
  return Math.max(1, page ?? 1);
};

export const getOrders = async (): Promise<OrderWithCustomer[]> => {
  return await invoke("get_orders");
};

export interface OrderSearchParams {
  page?: number;
  pageSize?: number | "all";
  searchKey?: "customerName" | "orderId" | "customerId" | "customerPhone";
  searchTerm?: string;
  statusFilter?: OrderStatus | "all";
  sortBy?: "customer_name" | "order_id" | "created_at";
  sortOrder?: "asc" | "desc";
}

export const getOrdersPaginated = async (
  params: OrderSearchParams,
): Promise<PaginatedOrders> => {
  return await invoke("get_orders_paginated", {
    page: clampPage(params.page),
    pageSize: normalizePageSize(params.pageSize),
    searchKey: params.searchKey,
    searchTerm: params.searchTerm,
    statusFilter:
      params.statusFilter && params.statusFilter !== "all"
        ? params.statusFilter
        : undefined,
    sortBy: params.sortBy,
    sortOrder: params.sortOrder,
  });
};

export const getOrderById = async (id: number): Promise<OrderDetail> => {
  return await invoke("get_order", { id });
};

export const createOrder = async (
  order: Omit<Order, "id" | "created_at"> & {
    items: OrderItemPayload[];
    id?: number;
  },
): Promise<number> => {
  return await invoke("create_order", {
    customerId: order.customer_id,
    status: order.status,
    orderFrom: order.order_from,
    items: order.items,
    exchangeRate: order.exchange_rate,
    shippingFee: order.shipping_fee,
    deliveryFee: order.delivery_fee,
    cargoFee: order.cargo_fee,
    orderDate: order.order_date,
    arrivedDate: order.arrived_date,
    shipmentDate: order.shipment_date,
    userWithdrawDate: order.user_withdraw_date,
    serviceFee: order.service_fee,
    serviceFeeType: order.service_fee_type,
    id: order.id,
    orderId: order.order_id,
  });
};

export const updateOrder = async (
  order: Omit<Order, "created_at" | "order_id"> & { items: OrderItemPayload[] },
): Promise<void> => {
  return await invoke("update_order", {
    id: order.id,
    customerId: order.customer_id,
    status: order.status,
    orderFrom: order.order_from,
    items: order.items,
    exchangeRate: order.exchange_rate,
    shippingFee: order.shipping_fee,
    deliveryFee: order.delivery_fee,
    cargoFee: order.cargo_fee,
    orderDate: order.order_date,
    arrivedDate: order.arrived_date,
    shipmentDate: order.shipment_date,
    userWithdrawDate: order.user_withdraw_date,
    serviceFee: order.service_fee,
    serviceFeeType: order.service_fee_type,
  });
};

export const deleteOrder = async (id: number): Promise<void> => {
  return await invoke("delete_order", { id });
};

export const getOrdersForExport = async (): Promise<OrderExportRow[]> => {
  return await invoke("get_orders_for_export");
};
