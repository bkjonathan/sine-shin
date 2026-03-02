-- ========================================================
-- Execute this script in your Supabase SQL Editor
-- This adds triggers to automatically update the 'updated_at'
-- column whenever a row is modified directly in Supabase.
-- ========================================================

-- Enable the moddatetime extension
create extension if not exists moddatetime schema extensions;

-- 1. shop_settings
create trigger handle_updated_at before update on shop_settings
  for each row execute procedure moddatetime (updated_at);

-- 2. users
create trigger handle_updated_at before update on users
  for each row execute procedure moddatetime (updated_at);

-- 3. customers
create trigger handle_updated_at before update on customers
  for each row execute procedure moddatetime (updated_at);

-- 4. orders
create trigger handle_updated_at before update on orders
  for each row execute procedure moddatetime (updated_at);

-- 5. order_items
create trigger handle_updated_at before update on order_items
  for each row execute procedure moddatetime (updated_at);

-- 6. expenses
create trigger handle_updated_at before update on expenses
  for each row execute procedure moddatetime (updated_at);

-- You're all set! Now any manual edits in Supabase will automatically update the `updated_at` column.
