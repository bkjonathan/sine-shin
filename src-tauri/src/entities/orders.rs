use sea_orm::entity::prelude::*;
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, PartialEq, DeriveEntityModel, Serialize, Deserialize)]
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
    pub order_date: Option<String>,
    pub arrived_date: Option<String>,
    pub shipment_date: Option<String>,
    pub user_withdraw_date: Option<String>,
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
    pub created_at: Option<String>,
    pub updated_at: Option<String>,
    pub deleted_at: Option<String>,
    pub synced: Option<i32>,
}

#[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
pub enum Relation {
    #[sea_orm(
        belongs_to = "super::customers::Entity",
        from = "Column::CustomerId",
        to = "super::customers::Column::Id"
    )]
    Customer,
    #[sea_orm(has_many = "super::order_items::Entity")]
    OrderItems,
}

impl Related<super::customers::Entity> for Entity {
    fn to() -> RelationDef {
        Relation::Customer.def()
    }
}

impl Related<super::order_items::Entity> for Entity {
    fn to() -> RelationDef {
        Relation::OrderItems.def()
    }
}

impl ActiveModelBehavior for ActiveModel {}
