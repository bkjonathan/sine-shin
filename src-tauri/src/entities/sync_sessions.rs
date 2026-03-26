use sea_orm::entity::prelude::*;

#[derive(Clone, Debug, PartialEq, DeriveEntityModel, serde::Serialize, serde::Deserialize)]
#[sea_orm(table_name = "sync_sessions")]
pub struct Model {
    #[sea_orm(primary_key)]
    pub id: i64,
    pub started_at: Option<String>,
    pub finished_at: Option<String>,
    pub total_queued: Option<i32>,
    pub total_synced: Option<i32>,
    pub total_failed: Option<i32>,
    pub status: Option<String>,
}

#[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
pub enum Relation {}

impl ActiveModelBehavior for ActiveModel {}
