# Rust Backend Structure Guide (`src-tauri/src`)

This project uses **Tauri + Rust** for backend logic and SQLite database access.

If you are new to Rust, read this file as the source-of-truth for where things live and how to add features safely.

## 1) Folder Overview

- `main.rs`
  - Binary entrypoint.
  - Calls `sine_shin_lib::run()`.
- `lib.rs`
  - Composition root.
  - Wires plugins, database pool setup, and registers all Tauri commands.
  - Should stay thin.
- `state.rs`
  - Shared application state (`AppDb`) managed by Tauri.
- `models.rs`
  - Request/response/data structs used across commands.
  - Includes SQL row-mapping structs (`sqlx::FromRow`) and API payload structs.
- `db.rs`
  - Shared database helpers and constants.
  - Includes `init_db()` and logo file copy helper.
- `commands/`
  - Feature-focused command handlers exposed to frontend via `#[tauri::command]`.
  - `auth.rs`, `shop.rs`, `customer.rs`, `order.rs`, `system.rs`.

## 2) High-Level Runtime Flow

1. App starts in `main.rs`.
2. `lib.rs::run()` builds Tauri app.
3. `setup()` creates app data folder and SQLite pool.
4. `db::init_db()` executes migration SQL (idempotent via SQL `IF NOT EXISTS`).
5. Pool is stored into Tauri managed state as `AppDb`.
6. Frontend invokes Rust commands by name through Tauri.

## 3) Command Modules and Responsibilities

## `commands/auth.rs`
- User onboarding/login related commands:
  - `check_is_onboarded`
  - `register_user`
  - `login_user`

## `commands/shop.rs`
- Shop profile/setup commands:
  - `save_shop_setup`
  - `get_shop_settings`
  - `update_shop_settings`
- Uses shared helper in `db.rs` to copy logo into app data directory.

## `commands/customer.rs`
- Customer CRUD:
  - `create_customer`
  - `get_customers`
  - `get_customer`
  - `update_customer`
  - `delete_customer`
- Generates `customer_id` after insert using prefix from `shop_settings`.

## `commands/order.rs`
- Order CRUD + aggregations:
  - `create_order`
  - `get_orders`
  - `get_customer_orders`
  - `get_order`
  - `update_order`
  - `delete_order`
  - `get_dashboard_stats`
- Uses SQL transaction for create/update when writing order + order_items.

## `commands/system.rs`
- Operational commands:
  - `reset_app_data`
  - `backup_database`
  - `get_db_status`

## 4) Shared State (`state.rs`)

`AppDb` holds a shared SQLx pool behind async mutex:

- `AppDb(pub Arc<Mutex<Pool<Sqlite>>>)`

Every command accesses DB like:

```rust
let db = app.state::<AppDb>();
let pool = db.0.lock().await;
```

This gives each command access to the same pool.

## 5) Data Models (`models.rs`)

`models.rs` contains:

- **Database row structs** (`sqlx::FromRow`), e.g. `User`, `Customer`, `OrderWithCustomer`.
- **API payload structs** (request/response), e.g. `OrderItemPayload`, `DashboardStats`, `DbStatus`.

Rule of thumb:
- If a struct maps SQL rows directly, add `sqlx::FromRow`.
- If it is for API response only, `Serialize`/`Deserialize` may be enough.

## 6) DB Helpers and Constants (`db.rs`)

Contains:

- `init_db(pool)`
  - Runs SQL from `migrations/001_init.sql`.
- `copy_logo_to_app_data(app, path)`
  - Copies selected image into app data `logos/`.
- Shared constants:
  - `DEFAULT_CUSTOMER_ID_PREFIX`
  - `DEFAULT_ORDER_ID_PREFIX`
  - order aggregate query fragments for reuse.

Keep repeated SQL fragments/helper logic here instead of duplicating across command files.

## 7) How Frontend Calls Rust Commands

Commands are registered in `lib.rs` inside `tauri::generate_handler![...]`.

Important:
- If you add a new `#[tauri::command]`, you **must**:
  1. Implement it in the right module.
  2. Import it in `lib.rs`.
  3. Add it to `generate_handler![...]`.

If step 3 is missed, frontend cannot invoke the command.

## 8) How to Add a New Feature (Safe Checklist)

1. Pick module:
   - Auth/shop/customer/order/system.
2. Add or update models in `models.rs`.
3. Add helper in `db.rs` only if shared by multiple commands.
4. Implement command in module file.
5. Import + register command in `lib.rs`.
6. Run:
   - `cargo fmt`
   - `cargo check`
7. Test from frontend flow.

## 9) SQL + Error Handling Style

Current style:
- SQL written inline with `sqlx::query(...)` / `query_as(...)`.
- Command return type is usually `Result<T, String>`.
- Errors converted with `.map_err(|e| e.to_string())?`.

Keep consistent unless doing a larger intentional refactor.

## 10) Migrations and Schema

- Base schema file: `src-tauri/migrations/001_init.sql`.
- Loaded in two places:
  - Tauri SQL plugin migration config (`lib.rs`).
  - Manual `init_db()` helper (`db.rs`).

When changing schema:
- Prefer adding a new migration file (e.g., `002_add_x.sql`) instead of editing old migration in production scenarios.

## 11) Common Pitfalls

- Forgetting `use tauri::Manager;` in command/helper modules.
  - Needed for `app.state()` and `app.path()` methods.
- Forgetting to register command in `generate_handler!`.
- Duplicating logic across modules instead of extracting helper to `db.rs`.
- Editing `lib.rs` heavily; keep it as composition/wiring file.

## 12) Suggested Future Improvements

- Replace `Result<T, String>` with typed error enum for better debugging.
- Split `order.rs` into read/write submodules if file grows more.
- Add unit/integration tests for critical command flows.
- Move SQL strings to constants when reused 2+ times.

---

If you are unsure where to put code, default to:
- models -> `models.rs`
- shared DB helper -> `db.rs`
- business command -> `commands/<domain>.rs`
- app wiring -> `lib.rs`
