CREATE TABLE IF NOT EXISTS shop_settings (
  id BIGSERIAL PRIMARY KEY,
  shop_name TEXT NOT NULL,
  phone TEXT,
  address TEXT,
  logo_path TEXT,
  customer_id_prefix TEXT DEFAULT 'SSC-',
  order_id_prefix TEXT DEFAULT 'SSO-',
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  synced INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS users (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT DEFAULT 'owner',
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  master_password_hash TEXT
);

CREATE TABLE IF NOT EXISTS customers (
  id BIGSERIAL PRIMARY KEY,
  customer_id TEXT,
  name TEXT NOT NULL,
  phone TEXT,
  address TEXT,
  city TEXT,
  social_media_url TEXT,
  platform TEXT,
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP WITHOUT TIME ZONE,
  synced INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS orders (
  id BIGSERIAL PRIMARY KEY,
  order_id TEXT,
  customer_id BIGINT REFERENCES customers(id),
  status TEXT DEFAULT 'pending',
  order_from TEXT,
  exchange_rate DOUBLE PRECISION,
  shipping_fee DOUBLE PRECISION,
  delivery_fee DOUBLE PRECISION,
  cargo_fee DOUBLE PRECISION,
  order_date TIMESTAMP WITHOUT TIME ZONE,
  arrived_date TIMESTAMP WITHOUT TIME ZONE,
  shipment_date TIMESTAMP WITHOUT TIME ZONE,
  user_withdraw_date TIMESTAMP WITHOUT TIME ZONE,
  service_fee DOUBLE PRECISION,
  product_discount DOUBLE PRECISION DEFAULT 0,
  service_fee_type TEXT,
  shipping_fee_paid INTEGER DEFAULT 0,
  delivery_fee_paid INTEGER DEFAULT 0,
  cargo_fee_paid INTEGER DEFAULT 0,
  service_fee_paid INTEGER DEFAULT 0,
  shipping_fee_by_shop INTEGER DEFAULT 0,
  delivery_fee_by_shop INTEGER DEFAULT 0,
  cargo_fee_by_shop INTEGER DEFAULT 0,
  exclude_cargo_fee INTEGER DEFAULT 0,
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP WITHOUT TIME ZONE,
  synced INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS order_items (
  id BIGSERIAL PRIMARY KEY,
  order_id BIGINT REFERENCES orders(id) ON DELETE CASCADE,
  product_url TEXT,
  product_qty INTEGER,
  price DOUBLE PRECISION,
  product_weight DOUBLE PRECISION,
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP WITHOUT TIME ZONE,
  synced INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS expenses (
  id BIGSERIAL PRIMARY KEY,
  expense_id TEXT,
  title TEXT NOT NULL,
  amount DOUBLE PRECISION NOT NULL CHECK(amount >= 0),
  category TEXT,
  payment_method TEXT,
  notes TEXT,
  expense_date TIMESTAMP WITHOUT TIME ZONE,
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP WITHOUT TIME ZONE,
  synced INTEGER DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_expenses_expense_date ON expenses(expense_date);
CREATE INDEX IF NOT EXISTS idx_expenses_category ON expenses(category);

CREATE TABLE IF NOT EXISTS sync_config (
    id BIGSERIAL PRIMARY KEY,
    supabase_url TEXT NOT NULL,
    supabase_anon_key TEXT NOT NULL,
    supabase_service_key TEXT NOT NULL,
    is_active INTEGER DEFAULT 1,
    sync_enabled INTEGER DEFAULT 1,
    sync_interval INTEGER DEFAULT 30,
    created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS sync_queue (
    id BIGSERIAL PRIMARY KEY,
    table_name TEXT NOT NULL,
    operation TEXT NOT NULL CHECK(operation IN ('INSERT','UPDATE','DELETE')),
    record_id BIGINT NOT NULL,
    payload TEXT NOT NULL,
    status TEXT DEFAULT 'pending' CHECK(status IN ('pending','syncing','synced','failed')),
    retry_count INTEGER DEFAULT 0,
    error_message TEXT,
    created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    synced_at TIMESTAMP WITHOUT TIME ZONE
);

CREATE TABLE IF NOT EXISTS sync_sessions (
    id BIGSERIAL PRIMARY KEY,
    started_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    finished_at TIMESTAMP WITHOUT TIME ZONE,
    total_queued INTEGER DEFAULT 0,
    total_synced INTEGER DEFAULT 0,
    total_failed INTEGER DEFAULT 0,
    status TEXT DEFAULT 'running' CHECK(status IN ('running','completed','failed'))
);

CREATE INDEX IF NOT EXISTS idx_sync_queue_status ON sync_queue(status);
CREATE INDEX IF NOT EXISTS idx_sync_queue_table ON sync_queue(table_name);
CREATE INDEX IF NOT EXISTS idx_sync_queue_created ON sync_queue(created_at);
