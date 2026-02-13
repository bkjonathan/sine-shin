-- Create shop_settings table
CREATE TABLE IF NOT EXISTS shop_settings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  shop_name TEXT NOT NULL,
  phone TEXT,
  address TEXT,
  logo_path TEXT,
  customer_id_prefix TEXT DEFAULT 'SSC-',
  order_id_prefix TEXT DEFAULT 'SSO0-',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Create users table
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT DEFAULT 'owner',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Create customers table
CREATE TABLE IF NOT EXISTS customers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id TEXT,
  name TEXT NOT NULL,
  phone TEXT,
  address TEXT,
  city TEXT,
  social_media_url TEXT,
  platform TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Create orders table
CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id TEXT,
  customer_id INTEGER,
  order_from TEXT,
  product_qty INTEGER,
  price REAL,
  exchange_rate REAL,
  shipping_fee REAL,
  delivery_fee REAL,
  cargo_fee REAL,
  product_weight REAL,
  order_date DATETIME,
  arrived_date DATETIME,
  shipment_date DATETIME,
  user_withdraw_date DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (customer_id) REFERENCES customers (id)
);
