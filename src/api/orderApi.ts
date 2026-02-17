import { invoke } from "@tauri-apps/api/core";
import {
  Order,
  OrderWithCustomer,
  OrderDetail,
  OrderItemPayload,
  PaginatedOrders,
  OrderExportRow,
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
}

export const getOrdersPaginated = async (
  params: OrderSearchParams,
): Promise<PaginatedOrders> => {
  return await invoke("get_orders_paginated", {
    page: clampPage(params.page),
    pageSize: normalizePageSize(params.pageSize),
    searchKey: params.searchKey,
    searchTerm: params.searchTerm,
  });
};

export const getOrderById = async (id: number): Promise<OrderDetail> => {
  return await invoke("get_order", { id });
};

export const createOrder = async (
  order: Omit<Order, "id" | "created_at" | "order_id"> & {
    items: OrderItemPayload[];
  },
): Promise<number> => {
  return await invoke("create_order", {
    customerId: order.customer_id,
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

export const updateOrder = async (
  order: Omit<Order, "created_at" | "order_id"> & { items: OrderItemPayload[] },
): Promise<void> => {
  return await invoke("update_order", {
    id: order.id,
    customerId: order.customer_id,
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
    status: order.status,
  });
};

export const updateOrderStatus = async (
  id: number,
  status: string,
): Promise<void> => {
  // Since we don't have a specific command for status only, we might need to fetch and update
  // OR we can implement a specific command.
  // For now, let's assume we use update_order but we need the full object.
  // actually, the backend update_order replaces everything.
  // It is safer to add a specific command or ensure we pass all data.
  // Given the current backend implementation of update_order, it replaces everything.
  // So strictly speaking, to update status only, we should fetch then update, or add a specific command.
  // However, for the UI, we usually have the order object.
  // Let's rely on updateOrder for now and pass the whole object from the UI.
  // If we really need a status-only update, we should add a backend command.
  // But wait, I added `update_order_status` to the plan but implementation plan said "Add `update_order_status` command ... (optional)".
  // And I didn't implement `update_order_status` in backend.
  // So I will just use `updateOrder` in the UI.
  return Promise.reject("Not implemented, use updateOrder");
};

export const deleteOrder = async (id: number): Promise<void> => {
  return await invoke("delete_order", { id });
};

export const getOrdersForExport = async (): Promise<OrderExportRow[]> => {
  return await invoke("get_orders_for_export");
};
