-- PostgreSQL-compatible schema
-- Uses TEXT for timestamps (compatible with Option<String> Rust types)
-- Uses BIGSERIAL for auto-increment PKs in internal tables
-- TEXT PRIMARY KEY (UUID) for all main data tables

-- Create shop_settings table
CREATE TABLE IF NOT EXISTS shop_settings (
  id TEXT PRIMARY KEY,
  shop_name TEXT NOT NULL,
  phone TEXT,
  address TEXT,
  logo_path TEXT,
  logo_cloud_url TEXT,
  customer_id_prefix TEXT DEFAULT 'SSC-',
  order_id_prefix TEXT DEFAULT 'SSO-',
  created_at TEXT DEFAULT (CURRENT_TIMESTAMP::TEXT),
  updated_at TEXT,
  synced INTEGER DEFAULT 0
);

-- Create users table
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT DEFAULT 'owner',
  created_at TEXT DEFAULT (CURRENT_TIMESTAMP::TEXT),
  master_password_hash TEXT
);

-- Create customers table
CREATE TABLE IF NOT EXISTS customers (
  id TEXT PRIMARY KEY,
  customer_id TEXT,
  name TEXT NOT NULL,
  phone TEXT,
  address TEXT,
  city TEXT,
  social_media_url TEXT,
  platform TEXT,
  created_at TEXT DEFAULT (CURRENT_TIMESTAMP::TEXT),
  updated_at TEXT,
  deleted_at TEXT,
  synced INTEGER DEFAULT 0
);

-- Create orders table
CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,
  order_id TEXT,
  customer_id TEXT,
  status TEXT DEFAULT 'pending',
  order_from TEXT,
  exchange_rate REAL,
  shipping_fee REAL,
  delivery_fee REAL,
  cargo_fee REAL,
  order_date TEXT,
  arrived_date TEXT,
  shipment_date TEXT,
  user_withdraw_date TEXT,
  service_fee REAL,
  product_discount REAL DEFAULT 0,
  service_fee_type TEXT,
  shipping_fee_paid INTEGER DEFAULT 0,
  delivery_fee_paid INTEGER DEFAULT 0,
  cargo_fee_paid INTEGER DEFAULT 0,
  service_fee_paid INTEGER DEFAULT 0,
  shipping_fee_by_shop INTEGER DEFAULT 0,
  delivery_fee_by_shop INTEGER DEFAULT 0,
  cargo_fee_by_shop INTEGER DEFAULT 0,
  exclude_cargo_fee INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (CURRENT_TIMESTAMP::TEXT),
  updated_at TEXT,
  deleted_at TEXT,
  synced INTEGER DEFAULT 0,
  FOREIGN KEY (customer_id) REFERENCES customers (id)
);

-- Create order_items table
CREATE TABLE IF NOT EXISTS order_items (
  id TEXT PRIMARY KEY,
  order_id TEXT,
  product_url TEXT,
  product_qty INTEGER,
  price REAL,
  product_weight REAL,
  created_at TEXT DEFAULT (CURRENT_TIMESTAMP::TEXT),
  updated_at TEXT,
  deleted_at TEXT,
  synced INTEGER DEFAULT 0,
  FOREIGN KEY (order_id) REFERENCES orders (id) ON DELETE CASCADE
);

-- Create expenses table
CREATE TABLE IF NOT EXISTS expenses (
  id TEXT PRIMARY KEY,
  expense_id TEXT,
  title TEXT NOT NULL,
  amount REAL NOT NULL CHECK(amount >= 0),
  category TEXT,
  payment_method TEXT,
  notes TEXT,
  expense_date TEXT,
  created_at TEXT DEFAULT (CURRENT_TIMESTAMP::TEXT),
  updated_at TEXT,
  deleted_at TEXT,
  synced INTEGER DEFAULT 0
);

-- Create sync_config table
CREATE TABLE IF NOT EXISTS sync_config (
  id BIGSERIAL PRIMARY KEY,
  supabase_url TEXT NOT NULL,
  supabase_anon_key TEXT NOT NULL,
  supabase_service_key TEXT NOT NULL,
  is_active INTEGER DEFAULT 1,
  sync_enabled INTEGER DEFAULT 1,
  sync_interval INTEGER DEFAULT 30,
  created_at TEXT DEFAULT (CURRENT_TIMESTAMP::TEXT),
  updated_at TEXT DEFAULT (CURRENT_TIMESTAMP::TEXT)
);

-- Create sync_queue table
CREATE TABLE IF NOT EXISTS sync_queue (
  id BIGSERIAL PRIMARY KEY,
  table_name TEXT NOT NULL,
  operation TEXT NOT NULL CHECK(operation IN ('INSERT','UPDATE','DELETE')),
  record_id TEXT NOT NULL,
  record_uuid TEXT,
  payload TEXT NOT NULL,
  status TEXT DEFAULT 'pending' CHECK(status IN ('pending','syncing','synced','failed')),
  retry_count INTEGER DEFAULT 0,
  error_message TEXT,
  created_at TEXT DEFAULT (CURRENT_TIMESTAMP::TEXT),
  synced_at TEXT
);

-- Create sync_sessions table
CREATE TABLE IF NOT EXISTS sync_sessions (
  id BIGSERIAL PRIMARY KEY,
  started_at TEXT DEFAULT (CURRENT_TIMESTAMP::TEXT),
  finished_at TEXT,
  total_queued INTEGER DEFAULT 0,
  total_synced INTEGER DEFAULT 0,
  total_failed INTEGER DEFAULT 0,
  status TEXT DEFAULT 'running' CHECK(status IN ('running','completed','failed'))
);

CREATE INDEX IF NOT EXISTS idx_sync_queue_status ON sync_queue(status);
CREATE INDEX IF NOT EXISTS idx_sync_queue_table ON sync_queue(table_name);
CREATE INDEX IF NOT EXISTS idx_sync_queue_created ON sync_queue(created_at);
CREATE INDEX IF NOT EXISTS idx_expenses_expense_date ON expenses(expense_date);
CREATE INDEX IF NOT EXISTS idx_expenses_category ON expenses(category);
