export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export type BaseKind = 'rossa' | 'bianca' | 'altro';

export interface Half {
  base: BaseKind;
  baseNote: string;
  toppingIds: string[];
}

export interface PizzaInput {
  id?: string;
  label: string;
  split: boolean;
  left: Half;
  right: Half;
  notes: string;
  preset: string | null;
}

export interface IngredientInput {
  name: string;
  unit: string;
  qtyPerPizza: number;
  shape: string;
  color: string;
  role: 'topping' | 'base-rossa';
  active: boolean;
  sortOrder: number | null;
}

export const SHAPES = new Set([
  'olive',
  'ribbon',
  'mushroom',
  'artichoke',
  'cherry',
  'blue-cheese',
  'coin',
  'shaving',
  'onion',
  'chunk',
  'blob',
  'leaf',
  'dot',
]);

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function cleanText(input: unknown, max: number): string | null {
  if (typeof input !== 'string') return null;
  const t = input.replace(/[\u0000-\u001F\u007F]/g, ' ').trim().replace(/\s+/g, ' ');
  if (t.length > max) return null;
  return t;
}

export function cleanName(input: unknown): string | null {
  const t = cleanText(input, 40);
  if (!t || !/[\p{L}\p{N}]/u.test(t)) return null;
  if (/[<>]/.test(t)) return null;
  return t;
}

export function slugify(name: string): string {
  const s = name
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32);
  return s || 'ingrediente';
}

function emptyHalf(): Half {
  return { base: 'rossa', baseNote: '', toppingIds: [] };
}

export function parseHalf(raw: unknown, allowedIds: Set<string>): Half {
  if (!raw || typeof raw !== 'object') throw new HttpError(400, 'Metà non valida');
  const o = raw as Record<string, unknown>;
  if (o.base !== 'rossa' && o.base !== 'bianca' && o.base !== 'altro') {
    throw new HttpError(400, 'Base non valida: scegli rossa, bianca o altro');
  }
  const baseNote = cleanText(typeof o.baseNote === 'string' ? o.baseNote : '', 40);
  if (baseNote === null) throw new HttpError(400, 'Il nome della base è troppo lungo');
  if (o.base === 'altro' && baseNote.length === 0) {
    throw new HttpError(400, 'Scrivi come si chiama la base');
  }
  if (!Array.isArray(o.toppingIds)) throw new HttpError(400, 'Condimenti non validi');
  if (o.toppingIds.length > 16) throw new HttpError(400, 'Troppi condimenti su una metà');
  const toppingIds: string[] = [];
  for (const id of o.toppingIds) {
    if (typeof id !== 'string' || !allowedIds.has(id)) {
      throw new HttpError(400, 'Condimento sconosciuto');
    }
    if (!toppingIds.includes(id)) toppingIds.push(id);
  }
  return {
    base: o.base,
    baseNote: o.base === 'altro' ? baseNote : '',
    toppingIds,
  };
}

export function parsePizza(body: unknown, allowedIds: Set<string>): PizzaInput {
  if (!body || typeof body !== 'object') throw new HttpError(400, 'Pizza non valida');
  const o = body as Record<string, unknown>;
  const label = cleanText(typeof o.label === 'string' ? o.label : '', 40);
  if (label === null) throw new HttpError(400, 'Nome della variante troppo lungo');
  if (typeof o.split !== 'boolean') throw new HttpError(400, 'Indica se la pizza è metà e metà');
  const notes = cleanText(typeof o.notes === 'string' ? o.notes : '', 280);
  if (notes === null) throw new HttpError(400, 'Note troppo lunghe (massimo 280 caratteri)');
  const left = parseHalf(o.left, allowedIds);
  const right = o.split ? parseHalf(o.right, allowedIds) : parseOptionalHalf(o.right, allowedIds);
  let preset: string | null = null;
  if (typeof o.preset === 'string' && o.preset.trim()) {
    preset = cleanText(o.preset, 40);
    if (preset === null) throw new HttpError(400, 'Preset non valido');
  }
  let id: string | undefined;
  if (typeof o.id === 'string' && o.id.trim()) {
    if (!UUID_RE.test(o.id)) throw new HttpError(400, 'Id pizza non valido');
    id = o.id.toLowerCase();
  }
  return { id, label, split: o.split, left, right, notes, preset };
}

function parseOptionalHalf(raw: unknown, allowedIds: Set<string>): Half {
  if (raw == null) return emptyHalf();
  try {
    return parseHalf(raw, allowedIds);
  } catch {
    return emptyHalf();
  }
}

export function parseIngredient(body: unknown): IngredientInput {
  if (!body || typeof body !== 'object') throw new HttpError(400, 'Ingrediente non valido');
  const o = body as Record<string, unknown>;
  const name = cleanName(o.name);
  if (!name) throw new HttpError(400, 'Nome ingrediente non valido');
  const unit = cleanText(o.unit, 12);
  if (!unit || !/^[\p{L}]+$/u.test(unit)) throw new HttpError(400, 'Unità non valida (es. g o pezzi)');
  const qtyRaw = typeof o.qtyPerPizza === 'number' ? o.qtyPerPizza : Number(o.qtyPerPizza);
  if (!Number.isFinite(qtyRaw) || qtyRaw < 0 || qtyRaw > 2000) {
    throw new HttpError(400, 'Quantità per pizza non valida');
  }
  const shape = typeof o.shape === 'string' ? o.shape : '';
  if (!SHAPES.has(shape)) throw new HttpError(400, 'Forma non valida');
  const color = typeof o.color === 'string' ? o.color : '';
  if (!/^#[0-9a-fA-F]{6}$/.test(color)) throw new HttpError(400, 'Colore non valido');
  if (o.role !== 'topping' && o.role !== 'base-rossa') {
    throw new HttpError(400, 'Uso non valido');
  }
  if (typeof o.active !== 'boolean') throw new HttpError(400, 'Indica se l’ingrediente è attivo');
  let sortOrder: number | null = null;
  if (o.sortOrder != null && o.sortOrder !== '') {
    const n = typeof o.sortOrder === 'number' ? o.sortOrder : Number(o.sortOrder);
    if (!Number.isInteger(n) || n < 0 || n > 10000) throw new HttpError(400, 'Ordine non valido');
    sortOrder = n;
  }
  return {
    name,
    unit,
    qtyPerPizza: Math.round(qtyRaw * 10) / 10,
    shape,
    color: color.toLowerCase(),
    role: o.role,
    active: o.active,
    sortOrder,
  };
}
