use sea_orm_migration::prelude::*;
use sea_orm::Statement;

pub struct Migration;

impl MigrationName for Migration {
    fn name(&self) -> &str {
        "m20231001_000003_add_audit_columns"
    }
}

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        let db = manager.get_connection();
        let backend = db.get_database_backend();

        if backend == sea_orm::DatabaseBackend::Sqlite {
            // Backfill updated_at for rows missing it
            for table in ["customers", "orders", "order_items", "expenses", "shop_settings"] {
                db.execute(Statement::from_string(
                    backend,
                    format!(
                        "UPDATE {} SET updated_at = CURRENT_TIMESTAMP WHERE updated_at IS NULL",
                        table
                    ),
                ))
                .await?;
            }
        }

        Ok(())
    }

    async fn down(&self, _manager: &SchemaManager) -> Result<(), DbErr> {
        Ok(())
    }
}
