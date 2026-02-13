export interface Order {
  id: number;
  order_id?: string;
  customer_id?: number;
  order_from?: string;
  product_url?: string;
  product_qty?: number;
  price?: number;
  exchange_rate?: number;
  shipping_fee?: number;
  delivery_fee?: number;
  cargo_fee?: number;
  product_weight?: number;
  order_date?: string;
  arrived_date?: string;
  shipment_date?: string;
  user_withdraw_date?: string;
  created_at?: string;
}

export interface OrderWithCustomer extends Order {
  customer_name?: string;
}
