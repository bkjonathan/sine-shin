use std::borrow::Cow;

/// Adapts a query string taking SQLite `?` bind variables into Postgres `$1`, `$2` bind variables.
pub fn adapt_query_for_pg(query: &str) -> Cow<'_, str> {
    let replaced_query = if query.contains(" LIKE ") {
        Cow::Owned(query.replace(" LIKE ", " ILIKE "))
    } else {
        Cow::Borrowed(query)
    };
    
    if !replaced_query.contains('?') {
        return replaced_query;
    }
    
    let mut adapted = String::with_capacity(replaced_query.len() + 10);
    let mut param_index = 1;

    for c in replaced_query.chars() {
        if c == '?' {
            adapted.push('$');
            adapted.push_str(&param_index.to_string());
            param_index += 1;
        } else {
            adapted.push(c);
        }
    }
    Cow::Owned(adapted)
}

#[macro_export]
macro_rules! db_query {
    ($pool:expr, $query:expr $(, $bind:expr)*) => {
        {
            let query_str = $query;
            match $pool {
                $crate::state::Database::Sqlite(sqlite_pool) => {
                    #[allow(unused_mut)]
                let mut q = sqlx::query((&query_str).as_ref());
                    $(
                        q = q.bind($bind);
                    )*
                    q.execute(sqlite_pool).await.map(|_| ())
                },
                $crate::state::Database::Postgres(pg_pool) => {
                    let adapted_query = $crate::db_macros::adapt_query_for_pg((&query_str).as_ref());
                    #[allow(unused_mut)]
                let mut q = sqlx::query(&adapted_query);
                    $(
                        q = q.bind($bind);
                    )*
                    q.execute(pg_pool).await.map(|_| ())
                }
            }
        }
    };
}

#[macro_export]
macro_rules! db_query_as {
    ($result_type:ty, $pool:expr, $query:expr $(, $bind:expr)*) => {
        {
            let query_str = $query;
            match $pool {
                $crate::state::Database::Sqlite(sqlite_pool) => {
                    #[allow(unused_mut)]
                    let mut q = sqlx::query_as::<_, $result_type>((&query_str).as_ref());
                    $(
                        q = q.bind($bind);
                    )*
                    q.fetch_all(sqlite_pool).await
                },
                $crate::state::Database::Postgres(pg_pool) => {
                    let adapted_query = $crate::db_macros::adapt_query_for_pg((&query_str).as_ref());
                    #[allow(unused_mut)]
                    let mut q = sqlx::query_as::<_, $result_type>(&adapted_query);
                    $(
                        q = q.bind($bind);
                    )*
                    q.fetch_all(pg_pool).await
                }
            }
        }
    };
}

#[macro_export]
macro_rules! db_query_as_one {
    ($result_type:ty, $pool:expr, $query:expr $(, $bind:expr)*) => {
        {
            let query_str = $query;
            match $pool {
                $crate::state::Database::Sqlite(sqlite_pool) => {
                    #[allow(unused_mut)]
                    let mut q = sqlx::query_as::<_, $result_type>((&query_str).as_ref());
                    $(
                        q = q.bind($bind);
                    )*
                    q.fetch_one(sqlite_pool).await
                },
                $crate::state::Database::Postgres(pg_pool) => {
                    let adapted_query = $crate::db_macros::adapt_query_for_pg((&query_str).as_ref());
                    #[allow(unused_mut)]
                    let mut q = sqlx::query_as::<_, $result_type>(&adapted_query);
                    $(
                        q = q.bind($bind);
                    )*
                    q.fetch_one(pg_pool).await
                }
            }
        }
    };
}

#[macro_export]
macro_rules! db_query_as_optional {
    ($result_type:ty, $pool:expr, $query:expr $(, $bind:expr)*) => {
        {
            let query_str = $query;
            match $pool {
                $crate::state::Database::Sqlite(sqlite_pool) => {
                    #[allow(unused_mut)]
                    let mut q = sqlx::query_as::<_, $result_type>((&query_str).as_ref());
                    $(
                        q = q.bind($bind);
                    )*
                    q.fetch_optional(sqlite_pool).await
                },
                $crate::state::Database::Postgres(pg_pool) => {
                    let adapted_query = $crate::db_macros::adapt_query_for_pg((&query_str).as_ref());
                    #[allow(unused_mut)]
                    let mut q = sqlx::query_as::<_, $result_type>(&adapted_query);
                    $(
                        q = q.bind($bind);
                    )*
                    q.fetch_optional(pg_pool).await
                }
            }
        }
    };
}

#[macro_export]
macro_rules! db_query_scalar {
    ($result_type:ty, $pool:expr, $query:expr $(, $bind:expr)*) => {
        {
            let query_str = $query;
            match $pool {
                $crate::state::Database::Sqlite(sqlite_pool) => {
                    #[allow(unused_mut)]
                    let mut q = sqlx::query_scalar::<_, $result_type>((&query_str).as_ref());
                    $(
                        q = q.bind($bind);
                    )*
                    q.fetch_one(sqlite_pool).await
                },
                $crate::state::Database::Postgres(pg_pool) => {
                    let adapted_query = $crate::db_macros::adapt_query_for_pg((&query_str).as_ref());
                    #[allow(unused_mut)]
                    let mut q = sqlx::query_scalar::<_, $result_type>(&adapted_query);
                    $(
                        q = q.bind($bind);
                    )*
                    q.fetch_one(pg_pool).await
                }
            }
        }
    };
}

#[macro_export]
macro_rules! db_query_scalar_optional {
    ($result_type:ty, $pool:expr, $query:expr $(, $bind:expr)*) => {
        {
            let query_str = $query;
            match $pool {
                $crate::state::Database::Sqlite(sqlite_pool) => {
                    #[allow(unused_mut)]
                    let mut q = sqlx::query_scalar::<_, $result_type>((&query_str).as_ref());
                    $(
                        q = q.bind($bind);
                    )*
                    q.fetch_optional(sqlite_pool).await
                },
                $crate::state::Database::Postgres(pg_pool) => {
                    let adapted_query = $crate::db_macros::adapt_query_for_pg((&query_str).as_ref());
                    #[allow(unused_mut)]
                    let mut q = sqlx::query_scalar::<_, $result_type>(&adapted_query);
                    $(
                        q = q.bind($bind);
                    )*
                    q.fetch_optional(pg_pool).await
                }
            }
        }
    };
}
