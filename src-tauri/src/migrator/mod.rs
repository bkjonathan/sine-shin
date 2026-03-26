use sea_orm_migration::prelude::*;

mod m20231001_000001_create_core_tables;
mod m20231001_000002_create_sync_tables;
mod m20231001_000003_add_audit_columns;

pub struct Migrator;

#[async_trait::async_trait]
impl MigratorTrait for Migrator {
    fn migrations() -> Vec<Box<dyn MigrationTrait>> {
        vec![
            Box::new(m20231001_000001_create_core_tables::Migration),
            Box::new(m20231001_000002_create_sync_tables::Migration),
            Box::new(m20231001_000003_add_audit_columns::Migration),
        ]
    }
}
