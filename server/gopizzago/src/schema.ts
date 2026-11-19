/** Schema idempotente. Tenere allineato a migrations/0001_init.sql. */
export const SCHEMA_STATEMENTS: string[] = [
  `CREATE TABLE IF NOT EXISTS ingredients (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    unit TEXT NOT NULL,
    qty_per_pizza REAL NOT NULL,
    shape TEXT NOT NULL,
    color TEXT NOT NULL,
    role TEXT NOT NULL,
    sort_order INTEGER NOT NULL,
    active INTEGER NOT NULL DEFAULT 1
  )`,
  `CREATE TABLE IF NOT EXISTS guests (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    token_hash TEXT NOT NULL UNIQUE,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS pizzas (
    id TEXT PRIMARY KEY,
    guest_id TEXT NOT NULL,
    label TEXT NOT NULL DEFAULT '',
    split INTEGER NOT NULL DEFAULT 0,
    left_json TEXT NOT NULL,
    right_json TEXT NOT NULL,
    notes TEXT NOT NULL DEFAULT '',
    preset TEXT,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_pizzas_guest ON pizzas(guest_id)`,
  `CREATE TABLE IF NOT EXISTS rate_limits (
    key TEXT PRIMARY KEY,
    hits INTEGER NOT NULL,
    window_start INTEGER NOT NULL
  )`,
  `INSERT OR IGNORE INTO ingredients
    (id, name, unit, qty_per_pizza, shape, color, role, sort_order, active) VALUES
    ('pomodoro', 'Pomodoro (pelati)', 'g', 80, 'chunk', '#c4322a', 'base-rossa', 10, 1),
    ('mozzarella', 'Mozzarella', 'g', 100, 'blob', '#fff6e8', 'topping', 20, 1),
    ('olive', 'Olive', 'pezzi', 8, 'olive', '#2a2420', 'topping', 30, 1),
    ('prosciutto', 'Prosciutto', 'g', 50, 'ribbon', '#e7a598', 'topping', 40, 1),
    ('funghi', 'Funghi porcini', 'g', 40, 'mushroom', '#c49a6a', 'topping', 50, 1),
    ('carciofi', 'Carciofi', 'g', 40, 'artichoke', '#6a8f45', 'topping', 60, 1),
    ('pomodorini', 'Pomodorini', 'g', 50, 'cherry', '#e23b2b', 'topping', 70, 1),
    ('gorgonzola', 'Gorgonzola (zola)', 'g', 40, 'blue-cheese', '#d9d3c4', 'topping', 80, 1),
    ('salamino', 'Salamino piccante', 'g', 40, 'coin', '#d6453d', 'topping', 90, 1),
    ('grana', 'Grana', 'g', 15, 'shaving', '#f0d78c', 'topping', 100, 1),
    ('cipolle', 'Cipolle', 'g', 30, 'onion', '#c45c9a', 'topping', 110, 1)`,
  `UPDATE ingredients SET name = 'Pomodoro' WHERE id = 'pomodoro'`,
  `UPDATE ingredients SET name = 'Zola' WHERE id = 'gorgonzola'`,
  `UPDATE ingredients SET name = 'Salamino' WHERE id = 'salamino'`,
  `DELETE FROM guests WHERE name = 'TEST agente' AND id NOT IN (SELECT guest_id FROM pizzas)`,
];
