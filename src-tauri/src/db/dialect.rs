use sqlx::any::AnyArguments;
use sqlx::query::{Query, QueryAs, QueryScalar};
use sqlx::Any;

/// Centralizes all SQL syntax differences between SQLite and PostgreSQL.
/// Services use this instead of scattering `if db_type == "postgresql"` checks.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SqlDialect {
    Sqlite,
    Postgres,
}

impl SqlDialect {
    pub fn from_db_type(db_type: &str) -> Self {
        if db_type == "postgresql" {
            Self::Postgres
        } else {
            Self::Sqlite
        }
    }

    pub fn is_postgres(&self) -> bool {
        matches!(self, Self::Postgres)
    }

    /// Positional parameter placeholder for position `pos` (1-indexed).
    /// PostgreSQL: `$1`, `$2`, … — SQLite: `?`
    pub fn p(&self, pos: usize) -> String {
        match self {
            Self::Postgres => format!("${pos}"),
            Self::Sqlite => "?".to_string(),
        }
    }

    /// Comma-separated list of `count` placeholders starting at position `start`.
    /// e.g. `params_list(1, 3)` → `"$1, $2, $3"` (PG) or `"?, ?, ?"` (SQLite)
    pub fn params_list(&self, start: usize, count: usize) -> String {
        (start..start + count)
            .map(|i| self.p(i))
            .collect::<Vec<_>>()
            .join(", ")
    }

    /// Current-timestamp SQL expression.
    /// PostgreSQL: `NOW()` — SQLite: `datetime('now')`
    pub fn now(&self) -> &'static str {
        match self {
            Self::Postgres => "NOW()",
            Self::Sqlite => "datetime('now')",
        }
    }

    /// COALESCE(param, NOW()) with proper type casting per dialect.
    /// PostgreSQL requires explicit `::timestamptz` cast on text parameters.
    pub fn coalesce_or_now(&self, pos: usize) -> String {
        if self.is_postgres() {
            format!("COALESCE({}::timestamptz, NOW())", self.p(pos))
        } else {
            format!("COALESCE({}, datetime('now'))", self.p(pos))
        }
    }

    // ── Query helpers ────────────────────────────────────────────────────────
    // These automatically set `persistent(false)` for PostgreSQL to prevent
    // "prepared statement 'sqlx_s_N' already exists" errors.
    // PostgreSQL's AnyPool does not support disabling its statement cache via
    // pool options, so we use the unnamed statement slot (persistent = false)
    // which is ephemeral and never causes name collisions.

    /// Equivalent to `sqlx::query(sql)` with PostgreSQL prepared-statement safety.
    pub fn query<'q>(&self, sql: &'q str) -> Query<'q, Any, AnyArguments<'q>> {
        sqlx::query(sql).persistent(!self.is_postgres())
    }

    /// Equivalent to `sqlx::query_as::<_, T>(sql)` with PostgreSQL prepared-statement safety.
    pub fn query_as<'q, T>(&self, sql: &'q str) -> QueryAs<'q, Any, T, AnyArguments<'q>>
    where
        T: for<'r> sqlx::FromRow<'r, sqlx::any::AnyRow>,
    {
        sqlx::query_as::<_, T>(sql).persistent(!self.is_postgres())
    }

    /// Equivalent to `sqlx::query_scalar::<_, O>(sql)` with PostgreSQL prepared-statement safety.
    pub fn query_scalar<'q, O>(&self, sql: &'q str) -> QueryScalar<'q, Any, O, AnyArguments<'q>>
    where
        (O,): for<'r> sqlx::FromRow<'r, sqlx::any::AnyRow>,
    {
        sqlx::query_scalar::<_, O>(sql).persistent(!self.is_postgres())
    }
}
