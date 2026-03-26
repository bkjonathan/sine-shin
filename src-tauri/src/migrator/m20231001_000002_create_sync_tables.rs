use sea_orm_migration::prelude::*;

pub struct Migration;

impl MigrationName for Migration {
    fn name(&self) -> &str {
        "m20231001_000002_create_sync_tables"
    }
}

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .create_table(
                Table::create()
                    .table(Alias::new("sync_config"))
                    .if_not_exists()
                    .col(
                        ColumnDef::new(Alias::new("id"))
                            .big_integer()
                            .not_null()
                            .auto_increment()
                            .primary_key(),
                    )
                    .col(
                        ColumnDef::new(Alias::new("supabase_url"))
                            .string()
                            .not_null(),
                    )
                    .col(
                        ColumnDef::new(Alias::new("supabase_anon_key"))
                            .string()
                            .not_null(),
                    )
                    .col(
                        ColumnDef::new(Alias::new("supabase_service_key"))
                            .string()
                            .not_null(),
                    )
                    .col(
                        ColumnDef::new(Alias::new("is_active"))
                            .integer()
                            .default(1),
                    )
                    .col(
                        ColumnDef::new(Alias::new("sync_enabled"))
                            .integer()
                            .default(1),
                    )
                    .col(
                        ColumnDef::new(Alias::new("sync_interval"))
                            .integer()
                            .default(30),
                    )
                    .col(ColumnDef::new(Alias::new("created_at")).string())
                    .col(ColumnDef::new(Alias::new("updated_at")).string())
                    .to_owned(),
            )
            .await?;

        manager
            .create_table(
                Table::create()
                    .table(Alias::new("sync_queue"))
                    .if_not_exists()
                    .col(
                        ColumnDef::new(Alias::new("id"))
                            .big_integer()
                            .not_null()
                            .auto_increment()
                            .primary_key(),
                    )
                    .col(
                        ColumnDef::new(Alias::new("table_name"))
                            .string()
                            .not_null(),
                    )
                    .col(
                        ColumnDef::new(Alias::new("operation"))
                            .string()
                            .not_null(),
                    )
                    .col(
                        ColumnDef::new(Alias::new("record_id"))
                            .string()
                            .not_null(),
                    )
                    .col(ColumnDef::new(Alias::new("record_uuid")).string())
                    .col(
                        ColumnDef::new(Alias::new("payload"))
                            .string()
                            .not_null(),
                    )
                    .col(
                        ColumnDef::new(Alias::new("status"))
                            .string()
                            .default("pending"),
                    )
                    .col(
                        ColumnDef::new(Alias::new("retry_count"))
                            .integer()
                            .default(0),
                    )
                    .col(ColumnDef::new(Alias::new("error_message")).string())
                    .col(ColumnDef::new(Alias::new("created_at")).string())
                    .col(ColumnDef::new(Alias::new("synced_at")).string())
                    .to_owned(),
            )
            .await?;

        manager
            .create_table(
                Table::create()
                    .table(Alias::new("sync_sessions"))
                    .if_not_exists()
                    .col(
                        ColumnDef::new(Alias::new("id"))
                            .big_integer()
                            .not_null()
                            .auto_increment()
                            .primary_key(),
                    )
                    .col(ColumnDef::new(Alias::new("started_at")).string())
                    .col(ColumnDef::new(Alias::new("finished_at")).string())
                    .col(
                        ColumnDef::new(Alias::new("total_queued"))
                            .integer()
                            .default(0),
                    )
                    .col(
                        ColumnDef::new(Alias::new("total_synced"))
                            .integer()
                            .default(0),
                    )
                    .col(
                        ColumnDef::new(Alias::new("total_failed"))
                            .integer()
                            .default(0),
                    )
                    .col(
                        ColumnDef::new(Alias::new("status"))
                            .string()
                            .default("running"),
                    )
                    .to_owned(),
            )
            .await?;

        for (name, table, col) in [
            ("idx_sync_queue_status", "sync_queue", "status"),
            ("idx_sync_queue_table", "sync_queue", "table_name"),
            ("idx_sync_queue_created", "sync_queue", "created_at"),
        ] {
            manager
                .create_index(
                    Index::create()
                        .if_not_exists()
                        .name(name)
                        .table(Alias::new(table))
                        .col(Alias::new(col))
                        .to_owned(),
                )
                .await?;
        }

        Ok(())
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        for table in ["sync_sessions", "sync_queue", "sync_config"] {
            manager
                .drop_table(
                    Table::drop()
                        .table(Alias::new(table))
                        .if_exists()
                        .to_owned(),
                )
                .await?;
        }
        Ok(())
    }
}
