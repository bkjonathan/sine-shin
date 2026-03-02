-- =============================================================
-- Supabase Migration: UUID primary keys + local_id sync mapping
-- =============================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Rebuild schema so UUID primary keys are guaranteed even on existing projects.
DROP TABLE IF EXISTS sync_log CASCADE;
DROP TABLE IF EXISTS order_items CASCADE;
DROP TABLE IF EXISTS orders CASCADE;
DROP TABLE IF EXISTS expenses CASCADE;
DROP TABLE IF EXISTS customers CASCADE;
DROP TABLE IF EXISTS users CASCADE;
DROP TABLE IF EXISTS shop_settings CASCADE;

-- =============================================================
-- TABLES
-- =============================================================
CREATE TABLE IF NOT EXISTS shop_settings (
  uuid UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  local_id BIGINT UNIQUE NOT NULL,
  shop_name TEXT NOT NULL,
  phone TEXT,
  address TEXT,
  logo_path TEXT,
  logo_cloud_url TEXT,
  customer_id_prefix TEXT DEFAULT 'SSC-',
  order_id_prefix TEXT DEFAULT 'SSO-',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  synced_from_device_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS users (
  uuid UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  local_id BIGINT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT DEFAULT 'owner',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  synced_from_device_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS customers (
  uuid UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  local_id BIGINT UNIQUE NOT NULL,
  customer_id TEXT,
  name TEXT NOT NULL,
  phone TEXT,
  address TEXT,
  city TEXT,
  social_media_url TEXT,
  platform TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  synced_from_device_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS orders (
  uuid UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  local_id BIGINT UNIQUE NOT NULL,
  order_id TEXT,
  customer_id BIGINT,
  status TEXT DEFAULT 'pending',
  order_from TEXT,
  exchange_rate DOUBLE PRECISION,
  shipping_fee DOUBLE PRECISION,
  delivery_fee DOUBLE PRECISION,
  cargo_fee DOUBLE PRECISION,
  order_date TIMESTAMPTZ,
  arrived_date TIMESTAMPTZ,
  shipment_date TIMESTAMPTZ,
  user_withdraw_date TIMESTAMPTZ,
  service_fee DOUBLE PRECISION,
  product_discount DOUBLE PRECISION DEFAULT 0,
  service_fee_type TEXT,
  shipping_fee_paid BOOLEAN DEFAULT FALSE,
  delivery_fee_paid BOOLEAN DEFAULT FALSE,
  cargo_fee_paid BOOLEAN DEFAULT FALSE,
  service_fee_paid BOOLEAN DEFAULT FALSE,
  shipping_fee_by_shop BOOLEAN DEFAULT FALSE,
  delivery_fee_by_shop BOOLEAN DEFAULT FALSE,
  cargo_fee_by_shop BOOLEAN DEFAULT FALSE,
  exclude_cargo_fee BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  synced_from_device_at TIMESTAMPTZ,
  CONSTRAINT orders_customer_id_fkey
    FOREIGN KEY (customer_id)
    REFERENCES customers(local_id)
);

CREATE TABLE IF NOT EXISTS order_items (
  uuid UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  local_id BIGINT UNIQUE NOT NULL,
  order_id BIGINT,
  product_url TEXT,
  product_qty INTEGER,
  price DOUBLE PRECISION,
  product_weight DOUBLE PRECISION,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  synced_from_device_at TIMESTAMPTZ,
  CONSTRAINT order_items_order_id_fkey
    FOREIGN KEY (order_id)
    REFERENCES orders(local_id)
    ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS expenses (
  uuid UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  local_id BIGINT UNIQUE NOT NULL,
  expense_id TEXT,
  title TEXT NOT NULL,
  amount DOUBLE PRECISION NOT NULL CHECK(amount >= 0),
  category TEXT,
  payment_method TEXT,
  notes TEXT,
  expense_date TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  synced_from_device_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS sync_log (
  uuid UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  table_name TEXT NOT NULL,
  operation TEXT NOT NULL,
  record_uuid UUID,
  local_id BIGINT,
  payload JSONB,
  received_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================================
-- INDEXES
-- =============================================================
CREATE INDEX IF NOT EXISTS idx_shop_settings_local_id ON shop_settings(local_id);
CREATE INDEX IF NOT EXISTS idx_users_local_id ON users(local_id);
CREATE INDEX IF NOT EXISTS idx_customers_local_id ON customers(local_id);
CREATE INDEX IF NOT EXISTS idx_orders_local_id ON orders(local_id);
CREATE INDEX IF NOT EXISTS idx_order_items_local_id ON order_items(local_id);
CREATE INDEX IF NOT EXISTS idx_expenses_local_id ON expenses(local_id);

CREATE INDEX IF NOT EXISTS idx_customers_customer_id ON customers(customer_id);
CREATE INDEX IF NOT EXISTS idx_customers_created_at ON customers(created_at);
CREATE INDEX IF NOT EXISTS idx_customers_updated_at ON customers(updated_at);
CREATE INDEX IF NOT EXISTS idx_customers_deleted_at ON customers(deleted_at);

CREATE INDEX IF NOT EXISTS idx_orders_order_id ON orders(order_id);
CREATE INDEX IF NOT EXISTS idx_orders_customer_id ON orders(customer_id);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at);
CREATE INDEX IF NOT EXISTS idx_orders_updated_at ON orders(updated_at);
CREATE INDEX IF NOT EXISTS idx_orders_deleted_at ON orders(deleted_at);

CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_order_items_created_at ON order_items(created_at);
CREATE INDEX IF NOT EXISTS idx_order_items_updated_at ON order_items(updated_at);
CREATE INDEX IF NOT EXISTS idx_order_items_deleted_at ON order_items(deleted_at);

CREATE INDEX IF NOT EXISTS idx_expenses_expense_date ON expenses(expense_date);
CREATE INDEX IF NOT EXISTS idx_expenses_category ON expenses(category);
CREATE INDEX IF NOT EXISTS idx_expenses_created_at ON expenses(created_at);
CREATE INDEX IF NOT EXISTS idx_expenses_updated_at ON expenses(updated_at);
CREATE INDEX IF NOT EXISTS idx_expenses_deleted_at ON expenses(deleted_at);

-- =============================================================
-- ROW LEVEL SECURITY
-- =============================================================
ALTER TABLE shop_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE sync_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users read shop_settings" ON shop_settings;
DROP POLICY IF EXISTS "Authenticated users read users" ON users;
DROP POLICY IF EXISTS "Authenticated users read customers" ON customers;
DROP POLICY IF EXISTS "Authenticated users read orders" ON orders;
DROP POLICY IF EXISTS "Authenticated users read order_items" ON order_items;
DROP POLICY IF EXISTS "Authenticated users read expenses" ON expenses;
DROP POLICY IF EXISTS "Authenticated users read sync_log" ON sync_log;

DROP POLICY IF EXISTS "Service role manage shop_settings" ON shop_settings;
DROP POLICY IF EXISTS "Service role manage users" ON users;
DROP POLICY IF EXISTS "Service role manage customers" ON customers;
DROP POLICY IF EXISTS "Service role manage orders" ON orders;
DROP POLICY IF EXISTS "Service role manage order_items" ON order_items;
DROP POLICY IF EXISTS "Service role manage expenses" ON expenses;
DROP POLICY IF EXISTS "Service role manage sync_log" ON sync_log;

DROP POLICY IF EXISTS "Anon manage shop_settings" ON shop_settings;
DROP POLICY IF EXISTS "Anon manage users" ON users;
DROP POLICY IF EXISTS "Anon manage customers" ON customers;
DROP POLICY IF EXISTS "Anon manage orders" ON orders;
DROP POLICY IF EXISTS "Anon manage order_items" ON order_items;
DROP POLICY IF EXISTS "Anon manage expenses" ON expenses;
DROP POLICY IF EXISTS "Anon manage sync_log" ON sync_log;

CREATE POLICY "Authenticated users read shop_settings" ON shop_settings FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users read users" ON users FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users read customers" ON customers FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users read orders" ON orders FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users read order_items" ON order_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users read expenses" ON expenses FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users read sync_log" ON sync_log FOR SELECT TO authenticated USING (true);

CREATE POLICY "Service role manage shop_settings" ON shop_settings FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role manage users" ON users FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role manage customers" ON customers FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role manage orders" ON orders FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role manage order_items" ON order_items FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role manage expenses" ON expenses FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role manage sync_log" ON sync_log FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "Anon manage shop_settings" ON shop_settings FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Anon manage users" ON users FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Anon manage customers" ON customers FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Anon manage orders" ON orders FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Anon manage order_items" ON order_items FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Anon manage expenses" ON expenses FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Anon manage sync_log" ON sync_log FOR ALL TO anon USING (true) WITH CHECK (true);
