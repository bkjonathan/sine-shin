use sea_orm::entity::prelude::*;

#[derive(Clone, Debug, PartialEq, DeriveEntityModel, serde::Serialize, serde::Deserialize)]
#[sea_orm(table_name = "orders")]
pub struct Model {
    #[sea_orm(primary_key, auto_increment = false)]
    pub id: String,
    pub order_id: Option<String>,
    pub customer_id: Option<String>,
    pub status: Option<String>,
    pub order_from: Option<String>,
    pub exchange_rate: Option<f64>,
    pub shipping_fee: Option<f64>,
    pub delivery_fee: Option<f64>,
    pub cargo_fee: Option<f64>,
    pub service_fee: Option<f64>,
    pub service_fee_type: Option<String>,
    pub product_discount: Option<f64>,
    pub order_date: Option<String>,
    pub arrived_date: Option<String>,
    pub shipment_date: Option<String>,
    pub user_withdraw_date: Option<String>,
    pub created_at: Option<String>,
    pub updated_at: Option<String>,
    pub deleted_at: Option<String>,
    pub synced: Option<i32>,
    pub shipping_fee_paid: Option<i32>,
    pub delivery_fee_paid: Option<i32>,
    pub cargo_fee_paid: Option<i32>,
    pub service_fee_paid: Option<i32>,
    pub shipping_fee_by_shop: Option<i32>,
    pub delivery_fee_by_shop: Option<i32>,
    pub cargo_fee_by_shop: Option<i32>,
    pub exclude_cargo_fee: Option<i32>,
}

#[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
pub enum Relation {}

impl ActiveModelBehavior for ActiveModel {}
