export interface PizzaStyle {
  id: string;
  name: string;
  vibe: string;
  primary: string;
  primaryLight: string;
  accent: string;
  bg: string;
  text: string;
}

export const STYLES: PizzaStyle[] = [
  {
    id: 'napoletana',
    name: 'Napoletana',
    vibe: 'Classica, calda, autentica',
    primary: '#c8553d',
    primaryLight: '#e8745c',
    accent: '#d4a039',
    bg: '#faf8f5',
    text: '#1a1a1a',
  },
  {
    id: 'oliva',
    name: 'Oliva',
    vibe: 'Verde, naturale, fresca',
    primary: '#5a6e3c',
    primaryLight: '#7a9454',
    accent: '#c8a951',
    bg: '#f5f7f0',
    text: '#1a2e0a',
  },
  {
    id: 'notte',
    name: 'Notte',
    vibe: 'Dark, elegante, moderna',
    primary: '#e8745c',
    primaryLight: '#ff9a80',
    accent: '#f0c960',
    bg: '#1a1a1a',
    text: '#faf8f5',
  },
  {
    id: 'marina',
    name: 'Marina',
    vibe: 'Blu, mediterranea, fresca',
    primary: '#2563a0',
    primaryLight: '#4a8fd0',
    accent: '#e8a84c',
    bg: '#f0f5fa',
    text: '#1a2a3a',
  },
  {
    id: 'tramonto',
    name: 'Tramonto',
    vibe: 'Arancione, caldo, vivace',
    primary: '#d4652a',
    primaryLight: '#e8854a',
    accent: '#8b3a62',
    bg: '#fdf6f0',
    text: '#2a1a0a',
  },
  {
    id: 'crema',
    name: 'Crema',
    vibe: 'Minimal, raffinata, pulita',
    primary: '#8a7060',
    primaryLight: '#a89080',
    accent: '#c49a6c',
    bg: '#f8f5f0',
    text: '#3a3028',
  },
  {
    id: 'fuoco',
    name: 'Fuoco',
    vibe: 'Rosso, passionale, potente',
    primary: '#b91c1c',
    primaryLight: '#dc2626',
    accent: '#fbbf24',
    bg: '#fef2f2',
    text: '#1a0a0a',
  },
  {
    id: 'limone',
    name: 'Limone',
    vibe: 'Giallo, solare, Amalfi',
    primary: '#a08520',
    primaryLight: '#c0a530',
    accent: '#3a7a5a',
    bg: '#fdfcf0',
    text: '#2a2a0a',
  },
  {
    id: 'lavanda',
    name: 'Lavanda',
    vibe: 'Lilla, sofisticata, unica',
    primary: '#7c3aed',
    primaryLight: '#a78bfa',
    accent: '#ec4899',
    bg: '#faf5ff',
    text: '#1a0a2e',
  },
  {
    id: 'carbone',
    name: 'Carbone',
    vibe: 'Nero, industrial, bold',
    primary: '#f5f5f5',
    primaryLight: '#ffffff',
    accent: '#c8553d',
    bg: '#0a0a0a',
    text: '#e5e5e5',
  },
];
