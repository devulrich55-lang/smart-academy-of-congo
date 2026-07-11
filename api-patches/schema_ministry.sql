-- Extension MESU + Evo Finance — à exécuter sur sac.db (Render: /data/sac.db)

ALTER TABLE institutional_admins ADD COLUMN ministry_status TEXT DEFAULT 'approved';
ALTER TABLE institutional_admins ADD COLUMN ministry_status_at TEXT;

CREATE TABLE IF NOT EXISTS finance_payroll (
  email TEXT PRIMARY KEY,
  salary REAL DEFAULT 0,
  bonus REAL DEFAULT 0,
  deduction REAL DEFAULT 0,
  auto_pay INTEGER DEFAULT 0,
  updated_at TEXT NOT NULL
);
