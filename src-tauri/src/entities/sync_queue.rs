use sea_orm::entity::prelude::*;

#[derive(Clone, Debug, PartialEq, DeriveEntityModel, serde::Serialize, serde::Deserialize)]
#[sea_orm(table_name = "sync_queue")]
pub struct Model {
    #[sea_orm(primary_key)]
    pub id: i64,
    pub table_name: String,
    pub operation: String,
    pub record_id: String,
    pub record_uuid: Option<String>,
    pub payload: String,
    pub status: Option<String>,
    pub retry_count: Option<i32>,
    pub error_message: Option<String>,
    pub created_at: Option<String>,
    pub synced_at: Option<String>,
}

#[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
pub enum Relation {}

impl ActiveModelBehavior for ActiveModel {}
