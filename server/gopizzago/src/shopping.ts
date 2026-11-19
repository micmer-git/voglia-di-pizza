export interface ShopHalf {
  base: 'rossa' | 'bianca' | 'altro';
  baseNote: string;
  toppingIds: string[];
}

export interface ShopPizza {
  id: string;
  guestId: string;
  guestName: string;
  label: string;
  split: boolean;
  left: ShopHalf;
  right: ShopHalf;
  notes: string;
}

export interface ShopIngredient {
  id: string;
  name: string;
  unit: string;
  qtyPerPizza: number;
  role: string;
}

export interface ShopLine {
  id: string;
  name: string;
  pizzas: number;
  quantity: number;
  unit: string;
  kind: 'ingredient' | 'base';
  detail?: string;
}

export interface ShopNote {
  guest: string;
  pizza: string;
  notes: string;
}

export interface ShoppingList {
  guestCount: number;
  pizzaCount: number;
  lines: ShopLine[];
  notes: ShopNote[];
  text: string;
}

const PESTO_GRAMS = 40;

function roundQty(n: number): number {
  return Math.round(n * 10) / 10;
}

export function formatNum(n: number): string {
  const rounded = Math.round(n * 10) / 10;
  if (Math.abs(rounded - Math.round(rounded)) < 1e-9) return String(Math.round(rounded));
  return rounded.toFixed(1).replace('.', ',');
}

function pizzaWord(n: number): string {
  return n === 1 ? '1 pizza' : `${n} pizze`;
}

function formatLine(line: ShopLine): string {
  if (line.kind === 'base' && line.unit === 'pizze') {
    const word = line.quantity === 1 ? 'pizza' : 'pizze';
    const detail = line.detail ? ` · ${line.detail}` : '';
    return `${line.name} — ${formatNum(line.quantity)} ${word}${detail}`;
  }
  return `${line.name} — ${pizzaWord(line.pizzas)} · circa ${formatNum(line.quantity)} ${line.unit}`;
}

export function formatShopping(list: Omit<ShoppingList, 'text'>): string {
  if (list.pizzaCount === 0) {
    return 'Lista della spesa — GoPizzaGo\nNessuna pizza ancora. Il forno è acceso.\n';
  }
  const people = list.guestCount === 1 ? '1 persona' : `${list.guestCount} persone`;
  const pizzas = list.pizzaCount === 1 ? '1 pizza' : `${list.pizzaCount} pizze`;
  const rows = list.lines.map(formatLine).join('\n');
  const noteBlock = list.notes.length
    ? `\nNote\n${list.notes.map((n) => `- ${n.guest}, ${n.pizza}: ${n.notes}`).join('\n')}\n`
    : '';
  return `Lista della spesa — GoPizzaGo\n${people} · ${pizzas}\n\n${rows}\n${noteBlock}`;
}

interface Acc {
  pizzas: Set<string>;
  qty: number;
}

function add(map: Map<string, Acc>, id: string, pizzaId: string, qty: number) {
  const cur = map.get(id) ?? { pizzas: new Set<string>(), qty: 0 };
  cur.pizzas.add(pizzaId);
  cur.qty += qty;
  map.set(id, cur);
}

export function buildShopping(
  pizzas: ShopPizza[],
  ingredients: ShopIngredient[],
  guestCount: number,
): ShoppingList {
  const byId = new Map(ingredients.map((i) => [i.id, i]));
  const portions = new Map<string, Acc>();
  const bianco: Acc = { pizzas: new Set(), qty: 0 };
  const altro = new Map<string, { label: string; pizzas: Set<string>; qty: number }>();
  const notes: ShopNote[] = [];
  const sauces = ingredients.filter((i) => i.role === 'base-rossa');

  for (const pizza of pizzas) {
    const halves = pizza.split ? [pizza.left, pizza.right] : [pizza.left];
    const weight = pizza.split ? 0.5 : 1;
    for (const half of halves) {
      if (half.base === 'rossa') {
        for (const sauce of sauces) add(portions, sauce.id, pizza.id, weight * sauce.qtyPerPizza);
      } else if (half.base === 'bianca') {
        bianco.pizzas.add(pizza.id);
        bianco.qty += weight;
      } else {
        const key = (half.baseNote || 'altro').trim().toLowerCase();
        const cur = altro.get(key) ?? {
          label: (half.baseNote || 'Altro').trim() || 'Altro',
          pizzas: new Set<string>(),
          qty: 0,
        };
        cur.pizzas.add(pizza.id);
        cur.qty += weight;
        altro.set(key, cur);
      }
      for (const id of half.toppingIds) {
        const ing = byId.get(id);
        if (!ing || ing.role === 'base-rossa') continue;
        add(portions, id, pizza.id, weight * ing.qtyPerPizza);
      }
    }
    if (pizza.notes.trim()) {
      notes.push({
        guest: pizza.guestName,
        pizza: pizza.label.trim() || 'Pizza',
        notes: pizza.notes.trim(),
      });
    }
  }

  const lines: ShopLine[] = [];
  for (const ing of ingredients) {
    const acc = portions.get(ing.id);
    if (!acc || acc.qty <= 0) continue;
    lines.push({
      id: ing.id,
      name: ing.name,
      pizzas: acc.pizzas.size,
      quantity: roundQty(acc.qty),
      unit: ing.unit,
      kind: 'ingredient',
    });
  }
  if (bianco.qty > 0) {
    lines.push({
      id: 'base-bianca',
      name: 'Base bianca',
      pizzas: bianco.pizzas.size,
      quantity: roundQty(bianco.qty),
      unit: 'pizze',
      kind: 'base',
      detail: 'olio extravergine, a occhio',
    });
  }
  for (const [key, cur] of altro) {
    const pesto = key.includes('pesto');
    lines.push({
      id: `altro:${key}`,
      name: `Base ${cur.label}`,
      pizzas: cur.pizzas.size,
      quantity: roundQty(pesto ? cur.qty * PESTO_GRAMS : cur.qty),
      unit: pesto ? 'g' : 'pizze',
      kind: 'base',
      detail: pesto ? undefined : 'quantità a occhio',
    });
  }

  const list = { guestCount, pizzaCount: pizzas.length, lines, notes };
  return { ...list, text: formatShopping(list) };
}
