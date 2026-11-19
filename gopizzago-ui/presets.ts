import type { BaseKind } from './types';

export interface Preset {
  id: string;
  name: string;
  base: BaseKind;
  baseNote: string;
  toppings: string[];
}

export const PRESETS: Preset[] = [
  { id: 'margherita', name: 'Margherita', base: 'rossa', baseNote: '', toppings: ['mozzarella'] },
  { id: 'marinara', name: 'Marinara', base: 'rossa', baseNote: '', toppings: [] },
  { id: 'diavola', name: 'Diavola', base: 'rossa', baseNote: '', toppings: ['mozzarella', 'salamino'] },
  { id: 'capricciosa', name: 'Capricciosa', base: 'rossa', baseNote: '', toppings: ['mozzarella', 'prosciutto', 'funghi', 'carciofi', 'olive'] },
  { id: 'prosciutto-funghi', name: 'Prosciutto e funghi', base: 'rossa', baseNote: '', toppings: ['mozzarella', 'prosciutto', 'funghi'] },
  { id: 'ortolana', name: 'Ortolana', base: 'rossa', baseNote: '', toppings: ['mozzarella', 'funghi', 'carciofi', 'cipolle', 'pomodorini'] },
  { id: 'quattro', name: '4 formaggi', base: 'bianca', baseNote: '', toppings: ['mozzarella', 'gorgonzola', 'grana'] },
  { id: 'porcini', name: 'Porcini', base: 'bianca', baseNote: '', toppings: ['mozzarella', 'funghi', 'grana'] },
];
