export interface ShopData {
  shop_name: string;
  phone: string | null;
  address: string | null;
  logo_path: string | null;
  customer_id_prefix: string | null;
}

export interface DashboardOrder {
  id: number;
  order_id: string | null;
  customer_id: number | null;
  customer_name: string | null;
  total_price: number;
  created_at: string | null;
  first_product_url: string | null;
  service_fee: number;
  service_fee_type: string;
}

export interface DashboardStats {
  total_revenue: number;
  total_profit: number;
  total_cargo_fee: number;
  total_orders: number;
  total_customers: number;
  recent_orders: DashboardOrder[];
}
