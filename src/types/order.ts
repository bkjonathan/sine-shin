export interface Order {
  id: number;
  order_id?: string;
  customer_id?: number;
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
  service_fee_type?: "fixed" | "percent";
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
