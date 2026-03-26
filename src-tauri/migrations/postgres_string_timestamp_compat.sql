DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'shop_settings'
      AND column_name = 'created_at'
      AND data_type IN ('text', 'character varying')
  ) THEN
    ALTER TABLE shop_settings ALTER COLUMN created_at DROP DEFAULT;
    ALTER TABLE shop_settings
      ALTER COLUMN created_at TYPE TIMESTAMPTZ
      USING CASE
        WHEN NULLIF(BTRIM(created_at), '') IS NULL THEN NULL
        WHEN created_at ~ '(Z|[+-][0-9]{2}(:?[0-9]{2})?)$' THEN created_at::timestamptz
        ELSE (created_at::timestamp AT TIME ZONE 'UTC')
      END;
    ALTER TABLE shop_settings ALTER COLUMN created_at SET DEFAULT CURRENT_TIMESTAMP;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'shop_settings'
      AND column_name = 'updated_at'
      AND data_type IN ('text', 'character varying')
  ) THEN
    ALTER TABLE shop_settings
      ALTER COLUMN updated_at TYPE TIMESTAMPTZ
      USING CASE
        WHEN NULLIF(BTRIM(updated_at), '') IS NULL THEN NULL
        WHEN updated_at ~ '(Z|[+-][0-9]{2}(:?[0-9]{2})?)$' THEN updated_at::timestamptz
        ELSE (updated_at::timestamp AT TIME ZONE 'UTC')
      END;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'users'
      AND column_name = 'created_at'
      AND data_type IN ('text', 'character varying')
  ) THEN
    ALTER TABLE users ALTER COLUMN created_at DROP DEFAULT;
    ALTER TABLE users
      ALTER COLUMN created_at TYPE TIMESTAMPTZ
      USING CASE
        WHEN NULLIF(BTRIM(created_at), '') IS NULL THEN NULL
        WHEN created_at ~ '(Z|[+-][0-9]{2}(:?[0-9]{2})?)$' THEN created_at::timestamptz
        ELSE (created_at::timestamp AT TIME ZONE 'UTC')
      END;
    ALTER TABLE users ALTER COLUMN created_at SET DEFAULT CURRENT_TIMESTAMP;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'customers'
      AND column_name = 'created_at'
      AND data_type IN ('text', 'character varying')
  ) THEN
    ALTER TABLE customers ALTER COLUMN created_at DROP DEFAULT;
    ALTER TABLE customers
      ALTER COLUMN created_at TYPE TIMESTAMPTZ
      USING CASE
        WHEN NULLIF(BTRIM(created_at), '') IS NULL THEN NULL
        WHEN created_at ~ '(Z|[+-][0-9]{2}(:?[0-9]{2})?)$' THEN created_at::timestamptz
        ELSE (created_at::timestamp AT TIME ZONE 'UTC')
      END;
    ALTER TABLE customers ALTER COLUMN created_at SET DEFAULT CURRENT_TIMESTAMP;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'customers'
      AND column_name = 'updated_at'
      AND data_type IN ('text', 'character varying')
  ) THEN
    ALTER TABLE customers
      ALTER COLUMN updated_at TYPE TIMESTAMPTZ
      USING CASE
        WHEN NULLIF(BTRIM(updated_at), '') IS NULL THEN NULL
        WHEN updated_at ~ '(Z|[+-][0-9]{2}(:?[0-9]{2})?)$' THEN updated_at::timestamptz
        ELSE (updated_at::timestamp AT TIME ZONE 'UTC')
      END;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'customers'
      AND column_name = 'deleted_at'
      AND data_type IN ('text', 'character varying')
  ) THEN
    ALTER TABLE customers
      ALTER COLUMN deleted_at TYPE TIMESTAMPTZ
      USING CASE
        WHEN NULLIF(BTRIM(deleted_at), '') IS NULL THEN NULL
        WHEN deleted_at ~ '(Z|[+-][0-9]{2}(:?[0-9]{2})?)$' THEN deleted_at::timestamptz
        ELSE (deleted_at::timestamp AT TIME ZONE 'UTC')
      END;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'orders'
      AND column_name = 'order_date'
      AND data_type IN ('text', 'character varying')
  ) THEN
    ALTER TABLE orders
      ALTER COLUMN order_date TYPE DATE
      USING CASE
        WHEN NULLIF(BTRIM(order_date), '') IS NULL THEN NULL
        ELSE order_date::date
      END;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'orders'
      AND column_name = 'arrived_date'
      AND data_type IN ('text', 'character varying')
  ) THEN
    ALTER TABLE orders
      ALTER COLUMN arrived_date TYPE DATE
      USING CASE
        WHEN NULLIF(BTRIM(arrived_date), '') IS NULL THEN NULL
        ELSE arrived_date::date
      END;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'orders'
      AND column_name = 'shipment_date'
      AND data_type IN ('text', 'character varying')
  ) THEN
    ALTER TABLE orders
      ALTER COLUMN shipment_date TYPE DATE
      USING CASE
        WHEN NULLIF(BTRIM(shipment_date), '') IS NULL THEN NULL
        ELSE shipment_date::date
      END;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'orders'
      AND column_name = 'user_withdraw_date'
      AND data_type IN ('text', 'character varying')
  ) THEN
    ALTER TABLE orders
      ALTER COLUMN user_withdraw_date TYPE DATE
      USING CASE
        WHEN NULLIF(BTRIM(user_withdraw_date), '') IS NULL THEN NULL
        ELSE user_withdraw_date::date
      END;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'orders'
      AND column_name = 'created_at'
      AND data_type IN ('text', 'character varying')
  ) THEN
    ALTER TABLE orders ALTER COLUMN created_at DROP DEFAULT;
    ALTER TABLE orders
      ALTER COLUMN created_at TYPE TIMESTAMPTZ
      USING CASE
        WHEN NULLIF(BTRIM(created_at), '') IS NULL THEN NULL
        WHEN created_at ~ '(Z|[+-][0-9]{2}(:?[0-9]{2})?)$' THEN created_at::timestamptz
        ELSE (created_at::timestamp AT TIME ZONE 'UTC')
      END;
    ALTER TABLE orders ALTER COLUMN created_at SET DEFAULT CURRENT_TIMESTAMP;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'orders'
      AND column_name = 'updated_at'
      AND data_type IN ('text', 'character varying')
  ) THEN
    ALTER TABLE orders
      ALTER COLUMN updated_at TYPE TIMESTAMPTZ
      USING CASE
        WHEN NULLIF(BTRIM(updated_at), '') IS NULL THEN NULL
        WHEN updated_at ~ '(Z|[+-][0-9]{2}(:?[0-9]{2})?)$' THEN updated_at::timestamptz
        ELSE (updated_at::timestamp AT TIME ZONE 'UTC')
      END;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'orders'
      AND column_name = 'deleted_at'
      AND data_type IN ('text', 'character varying')
  ) THEN
    ALTER TABLE orders
      ALTER COLUMN deleted_at TYPE TIMESTAMPTZ
      USING CASE
        WHEN NULLIF(BTRIM(deleted_at), '') IS NULL THEN NULL
        WHEN deleted_at ~ '(Z|[+-][0-9]{2}(:?[0-9]{2})?)$' THEN deleted_at::timestamptz
        ELSE (deleted_at::timestamp AT TIME ZONE 'UTC')
      END;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'order_items'
      AND column_name = 'created_at'
      AND data_type IN ('text', 'character varying')
  ) THEN
    ALTER TABLE order_items ALTER COLUMN created_at DROP DEFAULT;
    ALTER TABLE order_items
      ALTER COLUMN created_at TYPE TIMESTAMPTZ
      USING CASE
        WHEN NULLIF(BTRIM(created_at), '') IS NULL THEN NULL
        WHEN created_at ~ '(Z|[+-][0-9]{2}(:?[0-9]{2})?)$' THEN created_at::timestamptz
        ELSE (created_at::timestamp AT TIME ZONE 'UTC')
      END;
    ALTER TABLE order_items ALTER COLUMN created_at SET DEFAULT CURRENT_TIMESTAMP;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'order_items'
      AND column_name = 'updated_at'
      AND data_type IN ('text', 'character varying')
  ) THEN
    ALTER TABLE order_items
      ALTER COLUMN updated_at TYPE TIMESTAMPTZ
      USING CASE
        WHEN NULLIF(BTRIM(updated_at), '') IS NULL THEN NULL
        WHEN updated_at ~ '(Z|[+-][0-9]{2}(:?[0-9]{2})?)$' THEN updated_at::timestamptz
        ELSE (updated_at::timestamp AT TIME ZONE 'UTC')
      END;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'order_items'
      AND column_name = 'deleted_at'
      AND data_type IN ('text', 'character varying')
  ) THEN
    ALTER TABLE order_items
      ALTER COLUMN deleted_at TYPE TIMESTAMPTZ
      USING CASE
        WHEN NULLIF(BTRIM(deleted_at), '') IS NULL THEN NULL
        WHEN deleted_at ~ '(Z|[+-][0-9]{2}(:?[0-9]{2})?)$' THEN deleted_at::timestamptz
        ELSE (deleted_at::timestamp AT TIME ZONE 'UTC')
      END;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'expenses'
      AND column_name = 'expense_date'
      AND data_type IN ('text', 'character varying')
  ) THEN
    ALTER TABLE expenses
      ALTER COLUMN expense_date TYPE DATE
      USING CASE
        WHEN NULLIF(BTRIM(expense_date), '') IS NULL THEN NULL
        ELSE expense_date::date
      END;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'expenses'
      AND column_name = 'created_at'
      AND data_type IN ('text', 'character varying')
  ) THEN
    ALTER TABLE expenses ALTER COLUMN created_at DROP DEFAULT;
    ALTER TABLE expenses
      ALTER COLUMN created_at TYPE TIMESTAMPTZ
      USING CASE
        WHEN NULLIF(BTRIM(created_at), '') IS NULL THEN NULL
        WHEN created_at ~ '(Z|[+-][0-9]{2}(:?[0-9]{2})?)$' THEN created_at::timestamptz
        ELSE (created_at::timestamp AT TIME ZONE 'UTC')
      END;
    ALTER TABLE expenses ALTER COLUMN created_at SET DEFAULT CURRENT_TIMESTAMP;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'expenses'
      AND column_name = 'updated_at'
      AND data_type IN ('text', 'character varying')
  ) THEN
    ALTER TABLE expenses
      ALTER COLUMN updated_at TYPE TIMESTAMPTZ
      USING CASE
        WHEN NULLIF(BTRIM(updated_at), '') IS NULL THEN NULL
        WHEN updated_at ~ '(Z|[+-][0-9]{2}(:?[0-9]{2})?)$' THEN updated_at::timestamptz
        ELSE (updated_at::timestamp AT TIME ZONE 'UTC')
      END;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'expenses'
      AND column_name = 'deleted_at'
      AND data_type IN ('text', 'character varying')
  ) THEN
    ALTER TABLE expenses
      ALTER COLUMN deleted_at TYPE TIMESTAMPTZ
      USING CASE
        WHEN NULLIF(BTRIM(deleted_at), '') IS NULL THEN NULL
        WHEN deleted_at ~ '(Z|[+-][0-9]{2}(:?[0-9]{2})?)$' THEN deleted_at::timestamptz
        ELSE (deleted_at::timestamp AT TIME ZONE 'UTC')
      END;
  END IF;
END $$;
