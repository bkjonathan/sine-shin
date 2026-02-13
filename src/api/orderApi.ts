import { invoke } from "@tauri-apps/api/core";
import { OrderWithCustomer } from "../types/order";

export const getOrders = async (): Promise<OrderWithCustomer[]> => {
  return await invoke("get_orders");
};

export const getOrderById = async (id: number): Promise<OrderWithCustomer> => {
  return await invoke("get_order", { id });
};

export const createOrder = async (
  order: Omit<
    OrderWithCustomer,
    "id" | "created_at" | "order_id" | "customer_name"
  >,
): Promise<number> => {
  return await invoke("create_order", {
    customerId: order.customer_id,
    orderFrom: order.order_from,
    productUrl: order.product_url,
    productQty: order.product_qty,
    price: order.price,
    exchangeRate: order.exchange_rate,
    shippingFee: order.shipping_fee,
    deliveryFee: order.delivery_fee,
    cargoFee: order.cargo_fee,
    productWeight: order.product_weight,
    orderDate: order.order_date,
    arrivedDate: order.arrived_date,
    shipmentDate: order.shipment_date,
    userWithdrawDate: order.user_withdraw_date,
  });
};

export const updateOrder = async (
  order: Omit<OrderWithCustomer, "created_at" | "order_id" | "customer_name">,
): Promise<void> => {
  return await invoke("update_order", {
    id: order.id,
    customerId: order.customer_id,
    orderFrom: order.order_from,
    productUrl: order.product_url,
    productQty: order.product_qty,
    price: order.price,
    exchangeRate: order.exchange_rate,
    shippingFee: order.shipping_fee,
    deliveryFee: order.delivery_fee,
    cargoFee: order.cargo_fee,
    productWeight: order.product_weight,
    orderDate: order.order_date,
    arrivedDate: order.arrived_date,
    shipmentDate: order.shipment_date,
    userWithdrawDate: order.user_withdraw_date,
  });
};

export const deleteOrder = async (id: number): Promise<void> => {
  return await invoke("delete_order", { id });
};
