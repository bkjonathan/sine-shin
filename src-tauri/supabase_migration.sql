-- =============================================================
-- Supabase Migration: Unified Schema + Sync Helpers
-- Authoritative single-file migration for this project.
-- =============================================================

-- -------------------------------------------------------------
-- EXTENSIONS
-- -------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS moddatetime SCHEMA extensions;

-- -------------------------------------------------------------
-- TABLES
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS shop_settings (
  id SERIAL PRIMARY KEY,
  shop_name TEXT NOT NULL,
  phone TEXT,
  address TEXT,
  logo_path TEXT,
  customer_id_prefix TEXT DEFAULT 'SSC-',
  order_id_prefix TEXT DEFAULT 'SSO-',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  synced_from_device_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT DEFAULT 'owner',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  synced_from_device_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS customers (
  id SERIAL PRIMARY KEY,
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
  id SERIAL PRIMARY KEY,
  order_id TEXT,
  customer_id INTEGER,
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
  FOREIGN KEY (customer_id) REFERENCES customers (id)
);

CREATE TABLE IF NOT EXISTS order_items (
  id SERIAL PRIMARY KEY,
  order_id INTEGER,
  product_url TEXT,
  product_qty INTEGER,
  price DOUBLE PRECISION,
  product_weight DOUBLE PRECISION,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  synced_from_device_at TIMESTAMPTZ,
  FOREIGN KEY (order_id) REFERENCES orders (id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS expenses (
  id SERIAL PRIMARY KEY,
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
  id SERIAL PRIMARY KEY,
  table_name TEXT,
  operation TEXT,
  record_id INTEGER,
  received_at TIMESTAMPTZ DEFAULT NOW()
);

-- -------------------------------------------------------------
-- INDEXES
-- -------------------------------------------------------------
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

-- -------------------------------------------------------------
-- FUNCTIONS: customers.customer_id auto-generation + sequence safety
-- -------------------------------------------------------------
DO $$
DECLARE
  v_seq_name TEXT;
  v_max_id BIGINT;
BEGIN
  v_seq_name := pg_get_serial_sequence('customers', 'id');
  SELECT COALESCE(MAX(id), 0) INTO v_max_id FROM customers;

  IF v_seq_name IS NOT NULL THEN
    IF v_max_id = 0 THEN
      PERFORM setval(v_seq_name, 1, false);
    ELSE
      PERFORM setval(v_seq_name, v_max_id, true);
    END IF;
  END IF;
END
$$;

CREATE OR REPLACE FUNCTION assign_customer_code()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_prefix TEXT;
  v_seq_name TEXT;
  v_seq_last BIGINT;
BEGIN
  v_seq_name := pg_get_serial_sequence('customers', 'id');

  -- Allocate a safe id if missing or already used.
  IF NEW.id IS NULL OR EXISTS (SELECT 1 FROM customers WHERE id = NEW.id) THEN
    IF v_seq_name IS NULL THEN
      RAISE EXCEPTION 'Sequence not found for customers.id';
    END IF;

    LOOP
      NEW.id := nextval(v_seq_name);
      EXIT WHEN NOT EXISTS (SELECT 1 FROM customers WHERE id = NEW.id);
    END LOOP;
  ELSIF v_seq_name IS NOT NULL THEN
    -- Keep sequence aligned when explicit ids are inserted.
    EXECUTE format('SELECT last_value FROM %s', v_seq_name) INTO v_seq_last;
    IF NEW.id > v_seq_last THEN
      PERFORM setval(v_seq_name, NEW.id, true);
    END IF;
  END IF;

  IF NEW.customer_id IS NULL OR btrim(NEW.customer_id) = '' THEN
    SELECT COALESCE(customer_id_prefix, 'SSC-')
    INTO v_prefix
    FROM shop_settings
    ORDER BY id DESC
    LIMIT 1;

    NEW.customer_id := COALESCE(v_prefix, 'SSC-') || lpad(NEW.id::TEXT, 5, '0');
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_customers_assign_customer_code ON customers;
CREATE TRIGGER trg_customers_assign_customer_code
BEFORE INSERT ON customers
FOR EACH ROW
EXECUTE FUNCTION assign_customer_code();

WITH latest_prefix AS (
  SELECT COALESCE(
    (SELECT customer_id_prefix FROM shop_settings ORDER BY id DESC LIMIT 1),
    'SSC-'
  ) AS prefix
)
UPDATE customers c
SET customer_id = latest_prefix.prefix || lpad(c.id::TEXT, 5, '0')
FROM latest_prefix
WHERE c.customer_id IS NULL OR btrim(c.customer_id) = '';

-- -------------------------------------------------------------
-- FUNCTIONS: orders.order_id auto-generation + sequence safety
-- -------------------------------------------------------------
DO $$
DECLARE
  v_seq_name TEXT;
  v_max_id BIGINT;
BEGIN
  v_seq_name := pg_get_serial_sequence('orders', 'id');
  SELECT COALESCE(MAX(id), 0) INTO v_max_id FROM orders;

  IF v_seq_name IS NOT NULL THEN
    IF v_max_id = 0 THEN
      PERFORM setval(v_seq_name, 1, false);
    ELSE
      PERFORM setval(v_seq_name, v_max_id, true);
    END IF;
  END IF;
END
$$;

CREATE OR REPLACE FUNCTION assign_order_code()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_prefix TEXT;
  v_seq_name TEXT;
  v_seq_last BIGINT;
BEGIN
  v_seq_name := pg_get_serial_sequence('orders', 'id');

  -- Allocate a safe id if missing or already used.
  IF NEW.id IS NULL OR EXISTS (SELECT 1 FROM orders WHERE id = NEW.id) THEN
    IF v_seq_name IS NULL THEN
      RAISE EXCEPTION 'Sequence not found for orders.id';
    END IF;

    LOOP
      NEW.id := nextval(v_seq_name);
      EXIT WHEN NOT EXISTS (SELECT 1 FROM orders WHERE id = NEW.id);
    END LOOP;
  ELSIF v_seq_name IS NOT NULL THEN
    -- Keep sequence aligned when explicit ids are inserted.
    EXECUTE format('SELECT last_value FROM %s', v_seq_name) INTO v_seq_last;
    IF NEW.id > v_seq_last THEN
      PERFORM setval(v_seq_name, NEW.id, true);
    END IF;
  END IF;

  IF NEW.order_id IS NULL OR btrim(NEW.order_id) = '' THEN
    SELECT COALESCE(order_id_prefix, 'SSO-')
    INTO v_prefix
    FROM shop_settings
    ORDER BY id DESC
    LIMIT 1;

    NEW.order_id := COALESCE(v_prefix, 'SSO-') || lpad(NEW.id::TEXT, 5, '0');
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_orders_assign_order_code ON orders;
CREATE TRIGGER trg_orders_assign_order_code
BEFORE INSERT ON orders
FOR EACH ROW
EXECUTE FUNCTION assign_order_code();

WITH latest_prefix AS (
  SELECT COALESCE(
    (SELECT order_id_prefix FROM shop_settings ORDER BY id DESC LIMIT 1),
    'SSO-'
  ) AS prefix
)
UPDATE orders o
SET order_id = latest_prefix.prefix || lpad(o.id::TEXT, 5, '0')
FROM latest_prefix
WHERE o.order_id IS NULL OR btrim(o.order_id) = '';

-- -------------------------------------------------------------
-- FUNCTIONS: dashboard stats RPC
-- -------------------------------------------------------------
CREATE OR REPLACE FUNCTION get_dashboard_stats(
  p_date_from TIMESTAMPTZ DEFAULT NULL,
  p_date_to TIMESTAMPTZ DEFAULT NULL,
  p_date_field TEXT DEFAULT 'order_date',
  p_status TEXT DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total_revenue DOUBLE PRECISION := 0;
  v_total_profit DOUBLE PRECISION := 0;
  v_total_orders BIGINT := 0;
  v_total_customers BIGINT := 0;
  v_total_cargo_fee DOUBLE PRECISION := 0;
  v_recent_orders JSON := '[]'::json;

  v_cond TEXT := '1=1';
  v_cond_o TEXT := '1=1';
  v_date_col TEXT := 'order_date';
BEGIN
  IF p_date_field = 'created_at' THEN
    v_date_col := 'created_at';
  ELSE
    v_date_col := 'order_date';
  END IF;

  IF p_date_from IS NOT NULL AND p_date_to IS NOT NULL THEN
    v_cond := format('%s >= %L AND %s <= %L', v_date_col, p_date_from, v_date_col, p_date_to);
    v_cond_o := format('o.%s >= %L AND o.%s <= %L', v_date_col, p_date_from, v_date_col, p_date_to);
  ELSIF p_date_from IS NOT NULL THEN
    v_cond := format('%s >= %L', v_date_col, p_date_from);
    v_cond_o := format('o.%s >= %L', v_date_col, p_date_from);
  ELSIF p_date_to IS NOT NULL THEN
    v_cond := format('%s <= %L', v_date_col, p_date_to);
    v_cond_o := format('o.%s <= %L', v_date_col, p_date_to);
  END IF;

  IF p_status IS NOT NULL THEN
    v_cond := v_cond || format(' AND status = %L', p_status);
    v_cond_o := v_cond_o || format(' AND o.status = %L', p_status);
  END IF;

  v_cond := v_cond || ' AND deleted_at IS NULL';
  v_cond_o := v_cond_o || ' AND o.deleted_at IS NULL';

  EXECUTE format('
    SELECT COALESCE(SUM(oi.price * oi.product_qty), 0.0)
    FROM order_items oi
    INNER JOIN orders o ON oi.order_id = o.id
    WHERE %s AND oi.deleted_at IS NULL
  ', v_cond_o) INTO v_total_revenue;

  EXECUTE format('
    SELECT COALESCE(SUM(
      CASE
        WHEN service_fee_type = ''percent'' THEN
          (SELECT COALESCE(SUM(price * product_qty), 0)
           FROM order_items
           WHERE order_id = orders.id AND deleted_at IS NULL) * (COALESCE(service_fee, 0) / 100.0)
        ELSE
          COALESCE(service_fee, 0)
      END
      - COALESCE(product_discount, 0)
      - CASE WHEN shipping_fee_by_shop = TRUE THEN COALESCE(shipping_fee, 0) ELSE 0 END
      - CASE WHEN delivery_fee_by_shop = TRUE THEN COALESCE(delivery_fee, 0) ELSE 0 END
      - CASE WHEN cargo_fee_by_shop = TRUE AND exclude_cargo_fee != TRUE THEN COALESCE(cargo_fee, 0) ELSE 0 END
    ), 0.0)
    FROM orders
    WHERE %s
  ', v_cond) INTO v_total_profit;

  EXECUTE format('SELECT COUNT(*) FROM orders WHERE %s', v_cond) INTO v_total_orders;

  EXECUTE format('SELECT COUNT(DISTINCT customer_id) FROM orders WHERE %s', v_cond) INTO v_total_customers;

  EXECUTE format('
    SELECT COALESCE(
      SUM(CASE WHEN exclude_cargo_fee != TRUE THEN COALESCE(cargo_fee, 0) ELSE 0 END),
      0.0
    )
    FROM orders
    WHERE %s
  ', v_cond) INTO v_total_cargo_fee;

  EXECUTE format('
    SELECT COALESCE(json_agg(row_to_json(t)), ''[]''::json)
    FROM (
      SELECT
        o.id,
        o.order_id,
        o.customer_id,
        c.name AS customer_name,
        COALESCE((
          SELECT SUM(oi.price * oi.product_qty)
          FROM order_items oi
          WHERE oi.order_id = o.id AND oi.deleted_at IS NULL
        ), 0) AS total_price,
        o.created_at,
        (
          SELECT oi.product_url
          FROM order_items oi
          WHERE oi.order_id = o.id AND oi.deleted_at IS NULL
          LIMIT 1
        ) AS first_product_url,
        COALESCE(o.service_fee, 0) AS service_fee,
        o.service_fee_type
      FROM orders o
      LEFT JOIN customers c ON o.customer_id = c.id
      WHERE %s
      ORDER BY o.created_at DESC
      LIMIT 5
    ) t
  ', v_cond_o) INTO v_recent_orders;

  RETURN json_build_object(
    'total_revenue', v_total_revenue,
    'total_profit', v_total_profit,
    'total_cargo_fee', v_total_cargo_fee,
    'total_orders', v_total_orders,
    'total_customers', v_total_customers,
    'recent_orders', v_recent_orders
  );
END;
$$;

GRANT EXECUTE ON FUNCTION get_dashboard_stats(TIMESTAMPTZ, TIMESTAMPTZ, TEXT, TEXT)
TO authenticated, anon, service_role;

-- -------------------------------------------------------------
-- TRIGGERS: auto-update updated_at on row updates
-- -------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_shop_settings_updated_at ON shop_settings;
CREATE TRIGGER trg_shop_settings_updated_at
BEFORE UPDATE ON shop_settings
FOR EACH ROW
EXECUTE FUNCTION extensions.moddatetime(updated_at);

DROP TRIGGER IF EXISTS trg_users_updated_at ON users;
CREATE TRIGGER trg_users_updated_at
BEFORE UPDATE ON users
FOR EACH ROW
EXECUTE FUNCTION extensions.moddatetime(updated_at);

DROP TRIGGER IF EXISTS trg_customers_updated_at ON customers;
CREATE TRIGGER trg_customers_updated_at
BEFORE UPDATE ON customers
FOR EACH ROW
EXECUTE FUNCTION extensions.moddatetime(updated_at);

DROP TRIGGER IF EXISTS trg_orders_updated_at ON orders;
CREATE TRIGGER trg_orders_updated_at
BEFORE UPDATE ON orders
FOR EACH ROW
EXECUTE FUNCTION extensions.moddatetime(updated_at);

DROP TRIGGER IF EXISTS trg_order_items_updated_at ON order_items;
CREATE TRIGGER trg_order_items_updated_at
BEFORE UPDATE ON order_items
FOR EACH ROW
EXECUTE FUNCTION extensions.moddatetime(updated_at);

DROP TRIGGER IF EXISTS trg_expenses_updated_at ON expenses;
CREATE TRIGGER trg_expenses_updated_at
BEFORE UPDATE ON expenses
FOR EACH ROW
EXECUTE FUNCTION extensions.moddatetime(updated_at);

-- -------------------------------------------------------------
-- ROW LEVEL SECURITY + POLICIES
-- -------------------------------------------------------------
ALTER TABLE shop_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE sync_log ENABLE ROW LEVEL SECURITY;

-- Clean up existing policies so this script is re-runnable.
DROP POLICY IF EXISTS "Authenticated users read shop_settings" ON shop_settings;
DROP POLICY IF EXISTS "Authenticated users read users" ON users;
DROP POLICY IF EXISTS "Authenticated users read customers" ON customers;
DROP POLICY IF EXISTS "Authenticated users read orders" ON orders;
DROP POLICY IF EXISTS "Authenticated users read order_items" ON order_items;
DROP POLICY IF EXISTS "Authenticated users read expenses" ON expenses;
DROP POLICY IF EXISTS "Authenticated users read sync_log" ON sync_log;

DROP POLICY IF EXISTS "Authenticated users insert orders" ON orders;
DROP POLICY IF EXISTS "Authenticated users update orders" ON orders;
DROP POLICY IF EXISTS "Authenticated users delete orders" ON orders;
DROP POLICY IF EXISTS "Authenticated users insert order_items" ON order_items;
DROP POLICY IF EXISTS "Authenticated users update order_items" ON order_items;
DROP POLICY IF EXISTS "Authenticated users delete order_items" ON order_items;
DROP POLICY IF EXISTS "Authenticated users insert expenses" ON expenses;
DROP POLICY IF EXISTS "Authenticated users update expenses" ON expenses;
DROP POLICY IF EXISTS "Authenticated users delete expenses" ON expenses;

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

-- Authenticated users: read all sync tables.
CREATE POLICY "Authenticated users read shop_settings" ON shop_settings FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users read users" ON users FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users read customers" ON customers FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users read orders" ON orders FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users read order_items" ON order_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users read expenses" ON expenses FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users read sync_log" ON sync_log FOR SELECT TO authenticated USING (true);

-- Authenticated users (PWA): allow order/expense write flow.
CREATE POLICY "Authenticated users insert orders" ON orders FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users update orders" ON orders FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated users delete orders" ON orders FOR DELETE TO authenticated USING (true);

CREATE POLICY "Authenticated users insert order_items" ON order_items FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users update order_items" ON order_items FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated users delete order_items" ON order_items FOR DELETE TO authenticated USING (true);

CREATE POLICY "Authenticated users insert expenses" ON expenses FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users update expenses" ON expenses FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated users delete expenses" ON expenses FOR DELETE TO authenticated USING (true);

-- Service role: full CRUD (desktop sync engine).
CREATE POLICY "Service role manage shop_settings" ON shop_settings FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role manage users" ON users FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role manage customers" ON customers FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role manage orders" ON orders FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role manage order_items" ON order_items FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role manage expenses" ON expenses FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role manage sync_log" ON sync_log FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Anon: full CRUD (legacy compatibility with existing setup).
CREATE POLICY "Anon manage shop_settings" ON shop_settings FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Anon manage users" ON users FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Anon manage customers" ON customers FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Anon manage orders" ON orders FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Anon manage order_items" ON order_items FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Anon manage expenses" ON expenses FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Anon manage sync_log" ON sync_log FOR ALL TO anon USING (true) WITH CHECK (true);
