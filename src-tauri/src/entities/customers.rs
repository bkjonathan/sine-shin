use sea_orm::entity::prelude::*;
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, PartialEq, DeriveEntityModel, Serialize, Deserialize)]
#[sea_orm(table_name = "customers")]
pub struct Model {
    #[sea_orm(primary_key, auto_increment = false)]
    pub id: String,
    pub customer_id: Option<String>,
    pub name: String,
    pub phone: Option<String>,
    pub address: Option<String>,
    pub city: Option<String>,
    pub social_media_url: Option<String>,
    pub platform: Option<String>,
    pub created_at: Option<String>,
    pub updated_at: Option<String>,
    pub deleted_at: Option<String>,
    pub synced: Option<i32>,
}

#[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
pub enum Relation {
    #[sea_orm(has_many = "super::orders::Entity")]
    Orders,
}

impl Related<super::orders::Entity> for Entity {
    fn to() -> RelationDef {
        Relation::Orders.def()
    }
}

impl ActiveModelBehavior for ActiveModel {}
