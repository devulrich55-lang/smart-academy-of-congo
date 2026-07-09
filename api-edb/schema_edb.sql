-- EvoDigitalBooks — à exécuter sur sac.db (SQLite) ou adapter MySQL
-- Intégration : smart-academy-of-congo-API

CREATE TABLE IF NOT EXISTS edb_authors (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  pen_name TEXT NOT NULL,
  mobile_money TEXT NOT NULL,
  bio TEXT DEFAULT '',
  password_hash TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT NOT NULL,
  reviewed_at TEXT,
  reviewed_by TEXT
);

CREATE INDEX IF NOT EXISTS idx_edb_authors_status ON edb_authors(status);

CREATE TABLE IF NOT EXISTS edb_purchases (
  id TEXT PRIMARY KEY,
  book_id TEXT NOT NULL,
  buyer_email TEXT NOT NULL,
  amount REAL NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'USD',
  author_share REAL NOT NULL DEFAULT 0,
  platform_fee REAL NOT NULL DEFAULT 0,
  author_email TEXT,
  author_mobile_money TEXT,
  device_id TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_edb_purchases_buyer ON edb_purchases(buyer_email);
CREATE INDEX IF NOT EXISTS idx_edb_purchases_book ON edb_purchases(book_id);

CREATE TABLE IF NOT EXISTS edb_devices (
  buyer_email TEXT NOT NULL,
  device_id TEXT NOT NULL,
  registered_at TEXT NOT NULL,
  PRIMARY KEY (buyer_email, device_id)
);
