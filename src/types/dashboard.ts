export interface ShopData {
  shop_name: string;
  phone: string | null;
  address: string | null;
  logo_path: string | null;
  customer_id_prefix: string | null;
  order_id_prefix: string | null;
}

export interface DashboardOrder {
  id: string;
  order_id: string | null;
  customer_id: string | null;
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
  paid_cargo_fee: number;
  unpaid_cargo_fee: number;
  excluded_cargo_total: number;
  total_orders: number;
  total_customers: number;
  recent_orders: DashboardOrder[];
}

export interface DashboardDetailRecord {
  order_id: string | null;
  customer_name: string | null;
  amount: number;
  order_date: string | null;
}

export type DashboardRecordType =
  | "profit"
  | "cargo"
  | "paid_cargo"
  | "unpaid_cargo"
  | "excluded_cargo";
