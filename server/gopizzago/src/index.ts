import { buildShopping, type ShopHalf, type ShopIngredient, type ShopPizza } from './shopping';
import { SCHEMA_STATEMENTS } from './schema';
import { HttpError, cleanName, parseIngredient, parsePizza, slugify, type Half } from './validate';

interface Env {
  DB: D1Database;
  ADMIN_PIN?: string;
  ALLOWED_ORIGINS?: string;
  ALLOW_TEST_IP?: string;
  RATE_WRITE_LIMIT?: string;
  RATE_READ_LIMIT?: string;
  RATE_WINDOW_SEC?: string;
}

interface GuestRow {
  id: string;
  name: string;
  token_hash: string;
  created_at: string;
  updated_at: string;
}

interface PizzaRow {
  id: string;
  guest_id: string;
  label: string;
  split: number;
  left_json: string;
  right_json: string;
  notes: string;
  preset: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

interface IngRow {
  id: string;
  name: string;
  unit: string;
  qty_per_pizza: number;
  shape: string;
  color: string;
  role: string;
  sort_order: number;
  active: number;
}

const MAX_GUESTS = 300;
const MAX_PIZZAS = 8;

let schemaReady: Promise<void> | null = null;

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const origin = resolveOrigin(request, env);
    if (origin === 'deny') {
      return json({ error: 'Origine non consentita' }, 403, null);
    }
    if (request.method === 'OPTIONS') return preflight(origin);
    try {
      await ensureSchema(env);
      const url = new URL(request.url);
      const path = url.pathname.replace(/\/+$/, '') || '/';
      if (path.startsWith('/api/')) {
        const limited = await tooMany(request, env, request.method === 'GET' ? 'read' : 'write');
        if (limited) {
          return json({ error: 'Troppe richieste. Riprova tra un attimo.' }, 429, origin, {
            'retry-after': '30',
          });
        }
      }
      return await route(request, env, origin, path);
    } catch (err) {
      if (err instanceof HttpError) return json({ error: err.message }, err.status, origin);
      console.error(err);
      return json({ error: 'Errore del forno' }, 500, origin);
    }
  },
};

async function route(request: Request, env: Env, origin: string | null, path: string): Promise<Response> {
  const method = request.method;

  if (method === 'GET' && path === '/api/health') {
    await env.DB.prepare('SELECT 1 AS ok').first();
    return json({ ok: true, service: 'gopizzago' }, 200, origin);
  }
  if (method === 'GET' && path === '/api/ingredients') {
    return json({ ingredients: (await loadIngredients(env)).map(mapIng) }, 200, origin);
  }
  if (method === 'POST' && path === '/api/guests') {
    return createGuest(request, env, origin);
  }
  if (method === 'GET' && path === '/api/me') {
    const guest = await requireGuest(request, env);
    return json({ guest: mapGuest(guest), pizzas: await pizzasOf(env, guest.id) }, 200, origin);
  }
  if (method === 'PUT' && path === '/api/me') {
    const guest = await requireGuest(request, env);
    const body = await readJson(request);
    const name = cleanName((body as { name?: unknown })?.name);
    if (!name) throw new HttpError(400, 'Nome non valido');
    const now = new Date().toISOString();
    await env.DB.prepare('UPDATE guests SET name = ?, updated_at = ? WHERE id = ?').bind(name, now, guest.id).run();
    return json({ guest: { ...mapGuest(guest), name, updatedAt: now } }, 200, origin);
  }
  if (method === 'POST' && path === '/api/me/pizzas') {
    const guest = await requireGuest(request, env);
    return savePizza(request, env, origin, guest, null);
  }

  const mine = path.match(/^\/api\/me\/pizzas\/([0-9a-f-]{36})$/i);
  if (mine && method === 'PUT') {
    const guest = await requireGuest(request, env);
    return savePizza(request, env, origin, guest, mine[1].toLowerCase());
  }
  if (mine && method === 'DELETE') {
    const guest = await requireGuest(request, env);
    const id = mine[1].toLowerCase();
    const row = await env.DB.prepare('SELECT id FROM pizzas WHERE id = ? AND guest_id = ?').bind(id, guest.id).first();
    if (!row) throw new HttpError(404, 'Pizza non trovata');
    await env.DB.prepare('DELETE FROM pizzas WHERE id = ? AND guest_id = ?').bind(id, guest.id).run();
    return json({ ok: true }, 200, origin);
  }

  if (path.startsWith('/api/admin')) {
    await requireAdmin(request, env);
  }
  if (method === 'GET' && path === '/api/admin/overview') {
    return json(await overview(env), 200, origin);
  }
  if (method === 'POST' && path === '/api/admin/ingredients') {
    return createIngredient(request, env, origin);
  }
  const ing = path.match(/^\/api\/admin\/ingredients\/([a-z0-9-]{1,48})$/);
  if (ing && method === 'PUT') {
    return updateIngredient(request, env, origin, ing[1]);
  }
  const guestDel = path.match(/^\/api\/admin\/guests\/([0-9a-f-]{36})$/i);
  if (guestDel && method === 'DELETE') {
    const id = guestDel[1].toLowerCase();
    const row = await env.DB.prepare('SELECT id FROM guests WHERE id = ?').bind(id).first();
    if (!row) throw new HttpError(404, 'Ospite non trovato');
    await env.DB.prepare('DELETE FROM pizzas WHERE guest_id = ?').bind(id).run();
    await env.DB.prepare('DELETE FROM guests WHERE id = ?').bind(id).run();
    return json({ ok: true }, 200, origin);
  }
  const pizzaDel = path.match(/^\/api\/admin\/pizzas\/([0-9a-f-]{36})$/i);
  if (pizzaDel && method === 'DELETE') {
    const id = pizzaDel[1].toLowerCase();
    const row = await env.DB.prepare('SELECT id FROM pizzas WHERE id = ?').bind(id).first();
    if (!row) throw new HttpError(404, 'Pizza non trovata');
    await env.DB.prepare('DELETE FROM pizzas WHERE id = ?').bind(id).run();
    return json({ ok: true }, 200, origin);
  }

  throw new HttpError(404, 'Non trovato');
}

async function createGuest(request: Request, env: Env, origin: string | null): Promise<Response> {
  const body = await readJson(request);
  const name = cleanName((body as { name?: unknown })?.name);
  if (!name) throw new HttpError(400, 'Come ti chiami? Serve un nome.');
  const count = await env.DB.prepare('SELECT COUNT(*) AS n FROM guests').first<{ n: number }>();
  if ((count?.n ?? 0) >= MAX_GUESTS) throw new HttpError(400, 'Il forno è pieno');
  const id = crypto.randomUUID();
  const token = randomToken();
  const hash = await sha256(token);
  const now = new Date().toISOString();
  await env.DB.prepare(
    'INSERT INTO guests (id, name, token_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
  )
    .bind(id, name, hash, now, now)
    .run();
  return json({ guest: { id, name, createdAt: now, updatedAt: now }, editToken: token, pizzas: [] }, 201, origin);
}

async function savePizza(
  request: Request,
  env: Env,
  origin: string | null,
  guest: GuestRow,
  existingId: string | null,
): Promise<Response> {
  const body = await readJson(request);
  const ingredients = await loadIngredients(env);
  let previous: ReturnType<typeof mapPizza> | null = null;
  if (existingId) {
    const row = await env.DB.prepare('SELECT * FROM pizzas WHERE id = ? AND guest_id = ?')
      .bind(existingId, guest.id)
      .first<PizzaRow>();
    if (!row) throw new HttpError(404, 'Pizza non trovata');
    previous = mapPizza(row);
  } else {
    const count = await env.DB.prepare('SELECT COUNT(*) AS n FROM pizzas WHERE guest_id = ?')
      .bind(guest.id)
      .first<{ n: number }>();
    if ((count?.n ?? 0) >= MAX_PIZZAS) throw new HttpError(400, 'Puoi salvare al massimo 8 pizze');
  }
  const allowed = allowedToppings(ingredients, previous);
  const input = parsePizza(body, allowed);
  if (existingId && input.id && input.id !== existingId) throw new HttpError(400, 'Id pizza non valido');
  const now = new Date().toISOString();
  if (existingId) {
    await env.DB.prepare(
      `UPDATE pizzas
       SET label = ?, split = ?, left_json = ?, right_json = ?, notes = ?, preset = ?, updated_at = ?
       WHERE id = ? AND guest_id = ?`,
    )
      .bind(
        input.label,
        input.split ? 1 : 0,
        JSON.stringify(input.left),
        JSON.stringify(input.right),
        input.notes,
        input.preset,
        now,
        existingId,
        guest.id,
      )
      .run();
    const saved = await env.DB.prepare('SELECT * FROM pizzas WHERE id = ?').bind(existingId).first<PizzaRow>();
    return json({ pizza: saved ? mapPizza(saved) : null }, 200, origin);
  }
  const id = input.id ?? crypto.randomUUID();
  const clash = await env.DB.prepare('SELECT id FROM pizzas WHERE id = ?').bind(id).first();
  if (clash) throw new HttpError(409, 'Pizza già presente');
  const sort = await env.DB.prepare('SELECT COUNT(*) AS n FROM pizzas WHERE guest_id = ?')
    .bind(guest.id)
    .first<{ n: number }>();
  await env.DB.prepare(
    `INSERT INTO pizzas
      (id, guest_id, label, split, left_json, right_json, notes, preset, sort_order, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      id,
      guest.id,
      input.label,
      input.split ? 1 : 0,
      JSON.stringify(input.left),
      JSON.stringify(input.right),
      input.notes,
      input.preset,
      sort?.n ?? 0,
      now,
      now,
    )
    .run();
  const saved = await env.DB.prepare('SELECT * FROM pizzas WHERE id = ?').bind(id).first<PizzaRow>();
  return json({ pizza: saved ? mapPizza(saved) : null }, 201, origin);
}

function allowedToppings(ingredients: IngRow[], previous: { left: Half; right: Half } | null): Set<string> {
  const ids = new Set<string>();
  for (const ing of ingredients) {
    if (ing.role === 'topping' && ing.active === 1) ids.add(ing.id);
  }
  if (previous) {
    for (const id of [...previous.left.toppingIds, ...previous.right.toppingIds]) ids.add(id);
  }
  return ids;
}

async function createIngredient(request: Request, env: Env, origin: string | null): Promise<Response> {
  const input = parseIngredient(await readJson(request));
  let id = slugify(input.name);
  for (let n = 2; n < 40; n++) {
    const clash = await env.DB.prepare('SELECT id FROM ingredients WHERE id = ?').bind(id).first();
    if (!clash) break;
    id = `${slugify(input.name).slice(0, 28)}-${n}`;
  }
  const sort =
    input.sortOrder ??
    ((await env.DB.prepare('SELECT COALESCE(MAX(sort_order), 0) AS n FROM ingredients').first<{ n: number }>())?.n ?? 0) +
      10;
  await env.DB.prepare(
    `INSERT INTO ingredients (id, name, unit, qty_per_pizza, shape, color, role, sort_order, active)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(id, input.name, input.unit, input.qtyPerPizza, input.shape, input.color, input.role, sort, input.active ? 1 : 0)
    .run();
  const row = await env.DB.prepare('SELECT * FROM ingredients WHERE id = ?').bind(id).first<IngRow>();
  return json({ ingredient: row ? mapIng(row) : null }, 201, origin);
}

async function updateIngredient(
  request: Request,
  env: Env,
  origin: string | null,
  id: string,
): Promise<Response> {
  const existing = await env.DB.prepare('SELECT * FROM ingredients WHERE id = ?').bind(id).first<IngRow>();
  if (!existing) throw new HttpError(404, 'Ingrediente non trovato');
  const input = parseIngredient(await readJson(request));
  const sort = input.sortOrder ?? existing.sort_order;
  await env.DB.prepare(
    `UPDATE ingredients
     SET name = ?, unit = ?, qty_per_pizza = ?, shape = ?, color = ?, role = ?, sort_order = ?, active = ?
     WHERE id = ?`,
  )
    .bind(
      input.name,
      input.unit,
      input.qtyPerPizza,
      input.shape,
      input.color,
      input.role,
      sort,
      input.active ? 1 : 0,
      id,
    )
    .run();
  const row = await env.DB.prepare('SELECT * FROM ingredients WHERE id = ?').bind(id).first<IngRow>();
  return json({ ingredient: row ? mapIng(row) : null }, 200, origin);
}

async function overview(env: Env) {
  const ingredients = await loadIngredients(env);
  const guests = await env.DB.prepare('SELECT * FROM guests ORDER BY created_at ASC').all<GuestRow>();
  const pizzas = await env.DB.prepare('SELECT * FROM pizzas ORDER BY created_at ASC').all<PizzaRow>();
  const byGuest = new Map<string, PizzaRow[]>();
  for (const pizza of pizzas.results) {
    const list = byGuest.get(pizza.guest_id) ?? [];
    list.push(pizza);
    byGuest.set(pizza.guest_id, list);
  }
  const guestName = new Map(guests.results.map((g) => [g.id, g.name]));
  const shopPizzas: ShopPizza[] = pizzas.results.map((row) => {
    const pizza = mapPizza(row);
    return {
      id: pizza.id,
      guestId: row.guest_id,
      guestName: guestName.get(row.guest_id) ?? 'Ospite',
      label: pizza.label,
      split: pizza.split,
      left: pizza.left as ShopHalf,
      right: pizza.right as ShopHalf,
      notes: pizza.notes,
    };
  });
  const shopIngredients: ShopIngredient[] = ingredients.map((i) => ({
    id: i.id,
    name: i.name,
    unit: i.unit,
    qtyPerPizza: i.qty_per_pizza,
    role: i.role,
  }));
  return {
    guests: guests.results.map((g) => ({
      ...mapGuest(g),
      pizzas: (byGuest.get(g.id) ?? []).map(mapPizza),
    })),
    ingredients: ingredients.map(mapIng),
    shopping: buildShopping(shopPizzas, shopIngredients, guests.results.length),
  };
}

async function loadIngredients(env: Env): Promise<IngRow[]> {
  const res = await env.DB.prepare('SELECT * FROM ingredients ORDER BY sort_order ASC, name ASC').all<IngRow>();
  return res.results;
}

async function pizzasOf(env: Env, guestId: string) {
  const res = await env.DB.prepare(
    'SELECT * FROM pizzas WHERE guest_id = ? ORDER BY sort_order ASC, created_at ASC',
  )
    .bind(guestId)
    .all<PizzaRow>();
  return res.results.map(mapPizza);
}

function mapGuest(row: GuestRow) {
  return { id: row.id, name: row.name, createdAt: row.created_at, updatedAt: row.updated_at };
}

function mapIng(row: IngRow) {
  return {
    id: row.id,
    name: row.name,
    unit: row.unit,
    qtyPerPizza: row.qty_per_pizza,
    shape: row.shape,
    color: row.color,
    role: row.role === 'base-rossa' ? 'base-rossa' : 'topping',
    sortOrder: row.sort_order,
    active: row.active === 1,
  };
}

function mapPizza(row: PizzaRow) {
  return {
    id: row.id,
    label: row.label,
    split: row.split === 1,
    left: parseHalfJson(row.left_json),
    right: parseHalfJson(row.right_json),
    notes: row.notes,
    preset: row.preset,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function parseHalfJson(raw: string): Half {
  const data = JSON.parse(raw) as Half;
  return {
    base: data.base,
    baseNote: data.baseNote ?? '',
    toppingIds: Array.isArray(data.toppingIds) ? data.toppingIds : [],
  };
}

async function requireGuest(request: Request, env: Env): Promise<GuestRow> {
  const token = request.headers.get('x-edit-token') ?? '';
  if (!/^[a-f0-9]{48}$/.test(token)) throw new HttpError(401, 'Link personale non valido');
  const hash = await sha256(token);
  const row = await env.DB.prepare('SELECT * FROM guests WHERE token_hash = ?').bind(hash).first<GuestRow>();
  if (!row) throw new HttpError(401, 'Link personale non valido');
  return row;
}

async function requireAdmin(request: Request, env: Env): Promise<void> {
  const pin = env.ADMIN_PIN ?? '';
  if (!pin) throw new HttpError(503, 'PIN del forno non configurato');
  const given = request.headers.get('x-admin-pin') ?? '';
  const enc = new TextEncoder();
  const a = new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(pin)));
  const b = new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(given)));
  if (!crypto.subtle.timingSafeEqual(a, b)) throw new HttpError(401, 'PIN non valido');
}

async function ensureSchema(env: Env): Promise<void> {
  if (!schemaReady) {
    schemaReady = (async () => {
      for (const sql of SCHEMA_STATEMENTS) {
        await env.DB.prepare(sql).run();
      }
    })().catch((err) => {
      schemaReady = null;
      throw err;
    });
  }
  await schemaReady;
}

async function tooMany(request: Request, env: Env, kind: 'read' | 'write'): Promise<boolean> {
  const limit = positiveInt(kind === 'write' ? env.RATE_WRITE_LIMIT : env.RATE_READ_LIMIT, kind === 'write' ? 40 : 180);
  const windowSec = positiveInt(env.RATE_WINDOW_SEC, 600);
  const now = Math.floor(Date.now() / 1000);
  const windowStart = now - (now % windowSec);
  const key = `${clientIp(request, env)}:${kind}`;
  const row = await env.DB.prepare('SELECT hits, window_start FROM rate_limits WHERE key = ?')
    .bind(key)
    .first<{ hits: number; window_start: number }>();
  if (!row || row.window_start !== windowStart) {
    await env.DB.prepare(
      `INSERT INTO rate_limits (key, hits, window_start) VALUES (?, 1, ?)
       ON CONFLICT(key) DO UPDATE SET hits = 1, window_start = excluded.window_start`,
    )
      .bind(key, windowStart)
      .run();
    return false;
  }
  if (row.hits >= limit) return true;
  await env.DB.prepare('UPDATE rate_limits SET hits = hits + 1 WHERE key = ?').bind(key).run();
  return false;
}

function clientIp(request: Request, env: Env): string {
  if (env.ALLOW_TEST_IP === '1') {
    const testIp = request.headers.get('x-test-ip') ?? '';
    if (/^[a-zA-Z0-9.:_-]{1,64}$/.test(testIp)) return testIp;
  }
  return request.headers.get('cf-connecting-ip') || 'local';
}

function positiveInt(raw: string | undefined, fallback: number): number {
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 && n < 100000 ? n : fallback;
}

function resolveOrigin(request: Request, env: Env): string | null | 'deny' {
  const origin = request.headers.get('origin');
  if (!origin) return null;
  const allowed = (env.ALLOWED_ORIGINS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return allowed.includes(origin) ? origin : 'deny';
}

function preflight(origin: string | null): Response {
  const headers = new Headers();
  if (origin) {
    headers.set('access-control-allow-origin', origin);
    headers.set('vary', 'Origin');
  }
  headers.set('access-control-allow-methods', 'GET,POST,PUT,DELETE,OPTIONS');
  headers.set('access-control-allow-headers', 'Content-Type, X-Edit-Token, X-Admin-Pin');
  headers.set('access-control-max-age', '86400');
  return new Response(null, { status: 204, headers });
}

function json(data: unknown, status: number, origin: string | null, extra?: Record<string, string>): Response {
  const headers = new Headers(extra);
  headers.set('content-type', 'application/json; charset=utf-8');
  headers.set('cache-control', 'no-store');
  if (origin) {
    headers.set('access-control-allow-origin', origin);
    headers.set('vary', 'Origin');
  }
  return new Response(JSON.stringify(data), { status, headers });
}

async function readJson(request: Request): Promise<unknown> {
  const len = Number(request.headers.get('content-length') || 0);
  if (len > 32000) throw new HttpError(413, 'Richiesta troppo grande');
  const text = await request.text();
  if (text.length > 32000) throw new HttpError(413, 'Richiesta troppo grande');
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    throw new HttpError(400, 'JSON non valido');
  }
}

function randomToken(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function sha256(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
