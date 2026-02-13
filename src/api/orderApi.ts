import { invoke } from "@tauri-apps/api/core";
import {
  Order,
  OrderWithCustomer,
  OrderDetail,
  OrderItemPayload,
} from "../types/order";

export const getOrders = async (): Promise<OrderWithCustomer[]> => {
  return await invoke("get_orders");
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
  });
};

export const deleteOrder = async (id: number): Promise<void> => {
  return await invoke("delete_order", { id });
};
