export type OrderStatus =
  | "pending"
  | "confirmed"
  | "shipping"
  | "completed"
  | "cancelled";

export interface Order {
  id: number;
  order_id?: string;
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
  created_at?: string;
  service_fee?: number;
  product_discount?: number;
  service_fee_type?: "fixed" | "percent";
  shipping_fee_paid?: boolean;
  delivery_fee_paid?: boolean;
  cargo_fee_paid?: boolean;
  service_fee_paid?: boolean;
}

export interface OrderItem {
  id: number;
  order_id: number;
  product_url?: string;
  product_qty?: number;
  price?: number;
  product_weight?: number;
  created_at?: string;
}

export interface OrderItemPayload {
  product_url?: string;
  product_qty?: number;
  price?: number;
  product_weight?: number;
}

export interface OrderFormItemData {
  product_url: string;
  product_qty: number;
  price: number;
  product_weight: number;
}

export interface OrderFormData {
  customer_id: string;
  status: OrderStatus;
  order_from: string;
  items: OrderFormItemData[];
  exchange_rate: string;
  shipping_fee: string;
  delivery_fee: string;
  cargo_fee: string;
  order_date: string;
  arrived_date: string;
  shipment_date: string;
  user_withdraw_date: string;
  service_fee: string;
  product_discount: string;
  service_fee_type: "fixed" | "percent";
}

export interface OrderFormItemErrors {
  product_url?: string;
  product_qty?: string;
  price?: string;
  product_weight?: string;
}

export interface OrderFormErrors {
  customer_id?: string;
  items?: string;
  exchange_rate?: string;
  shipping_fee?: string;
  delivery_fee?: string;
  cargo_fee?: string;
  service_fee?: string;
  product_discount?: string;
  itemErrors?: OrderFormItemErrors[];
}

export const createEmptyOrderFormItem = (): OrderFormItemData => ({
  product_url: "",
  product_qty: 1,
  price: 0,
  product_weight: 0,
});

export const createEmptyOrderFormData = (): OrderFormData => ({
  customer_id: "",
  status: "pending",
  order_from: "Facebook",
  items: [createEmptyOrderFormItem()],
  exchange_rate: "",
  shipping_fee: "",
  delivery_fee: "",
  cargo_fee: "",
  order_date: "",
  arrived_date: "",
  shipment_date: "",
  user_withdraw_date: "",
  service_fee: "",
  product_discount: "",
  service_fee_type: "fixed",
});

export interface OrderWithCustomer extends Order {
  customer_name?: string;
  total_price?: number;
  total_qty?: number;
  total_weight?: number;
  first_product_url?: string;
}

export interface OrderDetail {
  order: OrderWithCustomer;
  items: OrderItem[];
}

export interface PaginatedOrders {
  orders: OrderWithCustomer[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}

export interface OrderExportRow {
  order_id?: string;
  customer_name?: string;
  customer_phone?: string;
  status?: OrderStatus;
  order_from?: string;
  order_date?: string;
  arrived_date?: string;
  shipment_date?: string;
  service_fee?: number;
  product_discount?: number;
  service_fee_type?: string;
  exchange_rate?: number;
  shipping_fee?: number;
  delivery_fee?: number;
  cargo_fee?: number;
  product_url?: string;
  product_qty?: number;
  product_price?: number;
  product_weight?: number;
  created_at?: string;
}
