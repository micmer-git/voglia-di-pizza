import type { Ingredient } from './types';

/** Stessi id, forme e quantità del seed in server/gopizzago/src/schema.ts. */
export const DEFAULT_INGREDIENTS: Ingredient[] = [
  { id: 'pomodoro', name: 'Pomodoro', unit: 'g', qtyPerPizza: 80, shape: 'chunk', color: '#c4322a', role: 'base-rossa', sortOrder: 10, active: true },
  { id: 'mozzarella', name: 'Mozzarella', unit: 'g', qtyPerPizza: 100, shape: 'blob', color: '#fff6e8', role: 'topping', sortOrder: 20, active: true },
  { id: 'olive', name: 'Olive', unit: 'pezzi', qtyPerPizza: 8, shape: 'olive', color: '#2a2420', role: 'topping', sortOrder: 30, active: true },
  { id: 'prosciutto', name: 'Prosciutto', unit: 'g', qtyPerPizza: 50, shape: 'ribbon', color: '#e7a598', role: 'topping', sortOrder: 40, active: true },
  { id: 'funghi', name: 'Funghi porcini', unit: 'g', qtyPerPizza: 40, shape: 'mushroom', color: '#c49a6a', role: 'topping', sortOrder: 50, active: true },
  { id: 'carciofi', name: 'Carciofi', unit: 'g', qtyPerPizza: 40, shape: 'artichoke', color: '#6a8f45', role: 'topping', sortOrder: 60, active: true },
  { id: 'pomodorini', name: 'Pomodorini', unit: 'g', qtyPerPizza: 50, shape: 'cherry', color: '#e23b2b', role: 'topping', sortOrder: 70, active: true },
  { id: 'gorgonzola', name: 'Zola', unit: 'g', qtyPerPizza: 40, shape: 'blue-cheese', color: '#d9d3c4', role: 'topping', sortOrder: 80, active: true },
  { id: 'salamino', name: 'Salamino', unit: 'g', qtyPerPizza: 40, shape: 'coin', color: '#d6453d', role: 'topping', sortOrder: 90, active: true },
  { id: 'grana', name: 'Grana', unit: 'g', qtyPerPizza: 15, shape: 'shaving', color: '#f0d78c', role: 'topping', sortOrder: 100, active: true },
  { id: 'cipolle', name: 'Cipolle', unit: 'g', qtyPerPizza: 30, shape: 'onion', color: '#c45c9a', role: 'topping', sortOrder: 110, active: true },
];

export const SHAPE_OPTIONS: { id: string; label: string }[] = [
  { id: 'olive', label: 'Olive' },
  { id: 'ribbon', label: 'Nastro' },
  { id: 'mushroom', label: 'Fungo' },
  { id: 'artichoke', label: 'Carciofo' },
  { id: 'cherry', label: 'Pomodorino' },
  { id: 'blue-cheese', label: 'Zola' },
  { id: 'coin', label: 'Salamino' },
  { id: 'shaving', label: 'Scaglia' },
  { id: 'onion', label: 'Cipolla' },
  { id: 'chunk', label: 'Pezzo' },
  { id: 'blob', label: 'Goccia' },
  { id: 'leaf', label: 'Foglia' },
  { id: 'dot', label: 'Punto' },
];
