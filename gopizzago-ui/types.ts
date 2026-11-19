export type BaseKind = 'rossa' | 'bianca' | 'altro';
export type IngredientRole = 'topping' | 'base-rossa';

export interface Ingredient {
  id: string;
  name: string;
  unit: string;
  qtyPerPizza: number;
  shape: string;
  color: string;
  role: IngredientRole;
  sortOrder: number;
  active: boolean;
}

export interface Half {
  base: BaseKind;
  baseNote: string;
  toppingIds: string[];
}

export interface Pizza {
  id: string;
  label: string;
  split: boolean;
  left: Half;
  right: Half;
  notes: string;
  preset: string | null;
}
