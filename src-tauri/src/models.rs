use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, sqlx::FromRow)]
pub struct ShopSettings {
    pub id: i64,
    pub shop_name: String,
    pub phone: Option<String>,
    pub address: Option<String>,
    pub logo_path: Option<String>,
    pub customer_id_prefix: Option<String>,
    pub order_id_prefix: Option<String>,
    pub created_at: Option<String>,
    #[sqlx(default)]
    pub updated_at: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, sqlx::FromRow)]
pub struct User {
    pub id: i64,
    pub name: String,
    pub password_hash: String,
    pub role: String,
    pub created_at: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, sqlx::FromRow)]
pub struct Customer {
    pub id: i64,
    pub customer_id: Option<String>,
    pub name: String,
    pub phone: Option<String>,
    pub address: Option<String>,
    pub city: Option<String>,
    pub social_media_url: Option<String>,
    pub platform: Option<String>,
    pub created_at: Option<String>,
    #[sqlx(default)]
    pub updated_at: Option<String>,
    #[sqlx(default)]
    pub deleted_at: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct PaginatedCustomers {
    pub customers: Vec<Customer>,
    pub total: i64,
    pub page: i64,
    pub page_size: i64,
    pub total_pages: i64,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct PaginatedOrders {
    pub orders: Vec<OrderWithCustomer>,
    pub total: i64,
    pub page: i64,
    pub page_size: i64,
    pub total_pages: i64,
}

#[derive(Debug, Serialize, Deserialize, sqlx::FromRow)]
pub struct Expense {
    pub id: i64,
    pub expense_id: Option<String>,
    pub title: String,
    pub amount: f64,
    pub category: Option<String>,
    pub payment_method: Option<String>,
    pub notes: Option<String>,
    pub expense_date: Option<String>,
    pub created_at: Option<String>,
    #[sqlx(default)]
    pub updated_at: Option<String>,
    #[sqlx(default)]
    pub deleted_at: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct PaginatedExpenses {
    pub expenses: Vec<Expense>,
    pub total: i64,
    pub page: i64,
    pub page_size: i64,
    pub total_pages: i64,
}

#[derive(Debug, Serialize, Deserialize, sqlx::FromRow)]
pub struct Order {
    pub id: i64,
    pub order_id: Option<String>,
    pub customer_id: Option<i64>,
    pub status: Option<String>,
    pub order_from: Option<String>,
    pub exchange_rate: Option<f64>,
    pub shipping_fee: Option<f64>,
    pub delivery_fee: Option<f64>,
    pub cargo_fee: Option<f64>,
    pub order_date: Option<String>,
    pub arrived_date: Option<String>,
    pub shipment_date: Option<String>,
    pub user_withdraw_date: Option<String>,
    pub created_at: Option<String>,
    pub service_fee: Option<f64>,
    pub product_discount: Option<f64>,
    pub service_fee_type: Option<String>,
    pub shipping_fee_paid: Option<bool>,
    pub delivery_fee_paid: Option<bool>,
    pub cargo_fee_paid: Option<bool>,
    pub service_fee_paid: Option<bool>,
    pub shipping_fee_by_shop: Option<bool>,
    pub delivery_fee_by_shop: Option<bool>,
    pub cargo_fee_by_shop: Option<bool>,
    pub exclude_cargo_fee: Option<bool>,
    #[sqlx(default)]
    pub updated_at: Option<String>,
    #[sqlx(default)]
    pub deleted_at: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, sqlx::FromRow)]
pub struct OrderItem {
    pub id: i64,
    pub order_id: i64,
    pub product_url: Option<String>,
    pub product_qty: Option<i64>,
    pub price: Option<f64>,
    pub product_weight: Option<f64>,
    pub created_at: Option<String>,
    #[sqlx(default)]
    pub updated_at: Option<String>,
    #[sqlx(default)]
    pub deleted_at: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct OrderItemPayload {
    pub product_url: Option<String>,
    pub product_qty: Option<i64>,
    pub price: Option<f64>,
    pub product_weight: Option<f64>,
}

#[derive(Debug, Serialize, Deserialize, sqlx::FromRow)]
pub struct OrderWithCustomer {
    pub id: i64,
    pub order_id: Option<String>,
    pub customer_id: Option<i64>,
    pub status: Option<String>,
    pub customer_name: Option<String>,
    pub order_from: Option<String>,
    pub exchange_rate: Option<f64>,
    pub shipping_fee: Option<f64>,
    pub delivery_fee: Option<f64>,
    pub cargo_fee: Option<f64>,
    pub order_date: Option<String>,
    pub arrived_date: Option<String>,
    pub shipment_date: Option<String>,
    pub user_withdraw_date: Option<String>,
    pub created_at: Option<String>,
    pub service_fee: Option<f64>,
    pub product_discount: Option<f64>,
    pub service_fee_type: Option<String>,
    pub shipping_fee_paid: Option<bool>,
    pub delivery_fee_paid: Option<bool>,
    pub cargo_fee_paid: Option<bool>,
    pub service_fee_paid: Option<bool>,
    pub total_price: Option<f64>,
    pub total_qty: Option<i64>,
    pub total_weight: Option<f64>,
    pub first_product_url: Option<String>,
    pub shipping_fee_by_shop: Option<bool>,
    pub delivery_fee_by_shop: Option<bool>,
    pub cargo_fee_by_shop: Option<bool>,
    pub exclude_cargo_fee: Option<bool>,
    #[sqlx(default)]
    pub updated_at: Option<String>,
    #[sqlx(default)]
    pub deleted_at: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct OrderDetail {
    pub order: OrderWithCustomer,
    pub items: Vec<OrderItem>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct DashboardStats {
    pub total_revenue: f64,
    pub total_profit: f64,
    pub total_cargo_fee: f64,
    pub total_orders: i64,
    pub total_customers: i64,
    pub recent_orders: Vec<OrderWithCustomer>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct AccountSummary {
    pub total_income: f64,
    pub total_expenses: f64,
    pub net_balance: f64,
    pub total_orders: i64,
    pub total_expense_records: i64,
    pub this_month_income: f64,
    pub this_month_expenses: f64,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct TableStatus {
    pub name: String,
    pub row_count: i64,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct DbStatus {
    pub total_tables: i64,
    pub tables: Vec<TableStatus>,
    pub size_bytes: Option<u64>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct TableSequenceResetStatus {
    pub table_name: String,
    pub max_id: i64,
    pub sequence_value: i64,
}

#[derive(Debug, Serialize, Deserialize, sqlx::FromRow)]
pub struct OrderExportRow {
    pub order_id: Option<String>,
    pub customer_name: Option<String>,
    pub customer_phone: Option<String>,
    pub status: Option<String>,
    pub order_from: Option<String>,
    pub order_date: Option<String>,
    pub arrived_date: Option<String>,
    pub shipment_date: Option<String>,
    pub service_fee: Option<f64>,
    pub product_discount: Option<f64>,
    pub service_fee_type: Option<String>,
    pub exchange_rate: Option<f64>,
    pub shipping_fee: Option<f64>,
    pub delivery_fee: Option<f64>,
    pub cargo_fee: Option<f64>,
    pub product_url: Option<String>,
    pub product_qty: Option<i64>,
    pub product_price: Option<f64>,
    pub product_weight: Option<f64>,
    pub created_at: Option<String>,
    pub shipping_fee_by_shop: Option<bool>,
    pub delivery_fee_by_shop: Option<bool>,
    pub cargo_fee_by_shop: Option<bool>,
}
