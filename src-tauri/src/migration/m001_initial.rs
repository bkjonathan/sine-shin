use sea_orm::{ConnectionTrait, DatabaseBackend, Statement};
use sea_orm_migration::prelude::*;

pub struct Migration;

impl MigrationName for Migration {
    fn name(&self) -> &str {
        "m001_initial"
    }
}

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        let db = manager.get_connection();

        // Create all tables with the full final schema
        db.execute_unprepared(include_str!("../../migrations/full_schema.sql"))
            .await?;

        // Backward-compat: add columns that may be missing in databases created
        // before this consolidated schema was introduced.
        let compat_columns: &[(&str, &str, &str)] = &[
            ("orders", "status", "TEXT DEFAULT 'pending'"),
            ("orders", "product_discount", "REAL DEFAULT 0"),
            ("orders", "shipping_fee_paid", "INTEGER DEFAULT 0"),
            ("orders", "delivery_fee_paid", "INTEGER DEFAULT 0"),
            ("orders", "cargo_fee_paid", "INTEGER DEFAULT 0"),
            ("orders", "service_fee_paid", "INTEGER DEFAULT 0"),
            ("orders", "shipping_fee_by_shop", "INTEGER DEFAULT 0"),
            ("orders", "delivery_fee_by_shop", "INTEGER DEFAULT 0"),
            ("orders", "cargo_fee_by_shop", "INTEGER DEFAULT 0"),
            ("orders", "exclude_cargo_fee", "INTEGER DEFAULT 0"),
            ("orders", "updated_at", "DATETIME"),
            ("orders", "deleted_at", "DATETIME"),
            ("orders", "synced", "INTEGER DEFAULT 0"),
            ("customers", "updated_at", "DATETIME"),
            ("customers", "deleted_at", "DATETIME"),
            ("customers", "synced", "INTEGER DEFAULT 0"),
            ("order_items", "updated_at", "DATETIME"),
            ("order_items", "deleted_at", "DATETIME"),
            ("order_items", "synced", "INTEGER DEFAULT 0"),
            ("expenses", "updated_at", "DATETIME"),
            ("expenses", "deleted_at", "DATETIME"),
            ("expenses", "synced", "INTEGER DEFAULT 0"),
            ("shop_settings", "updated_at", "DATETIME"),
            ("shop_settings", "synced", "INTEGER DEFAULT 0"),
            ("shop_settings", "logo_cloud_url", "TEXT"),
            ("users", "master_password_hash", "TEXT"),
            ("sync_config", "sync_interval", "INTEGER DEFAULT 30"),
            ("sync_queue", "record_uuid", "TEXT"),
        ];

        for (table, col, col_type) in compat_columns {
            let check_sql = format!(
                "SELECT 1 FROM pragma_table_info('{}') WHERE name = '{}' LIMIT 1",
                table, col
            );
            let exists = db
                .query_one(Statement::from_string(DatabaseBackend::Sqlite, check_sql))
                .await?
                .is_some();

            if !exists {
                db.execute(Statement::from_string(
                    DatabaseBackend::Sqlite,
                    format!("ALTER TABLE {} ADD COLUMN {} {}", table, col, col_type),
                ))
                .await?;
            }
        }

        // Backfill updated_at for rows that have NULL
        for table in &[
            "customers",
            "orders",
            "order_items",
            "expenses",
            "shop_settings",
        ] {
            db.execute(Statement::from_string(
                DatabaseBackend::Sqlite,
                format!(
                    "UPDATE {} SET updated_at = CURRENT_TIMESTAMP WHERE updated_at IS NULL",
                    table
                ),
            ))
            .await?;
        }

        // Ensure orders have a status
        db.execute(Statement::from_string(
            DatabaseBackend::Sqlite,
            "UPDATE orders SET status = 'pending' WHERE status IS NULL OR TRIM(status) = ''"
                .to_string(),
        ))
        .await?;

        Ok(())
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        let db = manager.get_connection();
        for table in &[
            "sync_sessions",
            "sync_queue",
            "sync_config",
            "expenses",
            "order_items",
            "orders",
            "customers",
            "users",
            "shop_settings",
        ] {
            db.execute(Statement::from_string(
                DatabaseBackend::Sqlite,
                format!("DROP TABLE IF EXISTS {}", table),
            ))
            .await?;
        }
        Ok(())
    }
}
