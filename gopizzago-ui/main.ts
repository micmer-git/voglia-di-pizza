import { DEFAULT_INGREDIENTS, SHAPE_OPTIONS } from './ingredients';
import { renderPizzaSvg, type HalfView, type PizzaView, type ToppingSpec } from './pizza-svg';
import { PRESETS, type Preset } from './presets';
import type { Half, Ingredient, Pizza } from './types';

const TOKEN_KEY = 'gopizzago.token';
const LOCAL_KEY = 'gopizzago.local';
const PIN_KEY = 'gopizzago.pin';

const MSG_CONFIG =
  'Il forno condiviso non è collegato: in config.json manca l’indirizzo del Worker. Puoi comporre la pizza su questo telefono, ma Michele non vede le scelte.';
const MSG_DOWN =
  'Non riesco a raggiungere il forno. Puoi comunque comporre la pizza su questo telefono: Michele la vedrà solo quando il Worker risponde.';

class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

interface ShopLine {
  id: string;
  name: string;
  pizzas: number;
  quantity: number;
  unit: string;
  kind: string;
  detail?: string;
}

interface Overview {
  guests: { id: string; name: string; pizzas: Pizza[] }[];
  ingredients: Ingredient[];
  shopping: {
    guestCount: number;
    pizzaCount: number;
    lines: ShopLine[];
    notes: { guest: string; pizza: string; notes: string }[];
    text: string;
  };
}

interface IngForm {
  id: string | null;
  name: string;
  unit: string;
  qty: string;
  shape: string;
  color: string;
  role: 'topping' | 'base-rossa';
  active: boolean;
}

type Screen = 'loading' | 'gate' | 'builder' | 'admin';

const state: {
  screen: Screen;
  apiBase: string;
  online: boolean;
  banner: string;
  name: string;
  token: string;
  ingredients: Ingredient[];
  pizzas: Pizza[];
  draft: Pizza;
  dirty: boolean;
  freshIds: string[];
  entrance: boolean;
  adminPin: string;
  overview: Overview | null;
  adminError: string;
  ingForm: IngForm;
  busy: boolean;
  toast: string;
  pending: string;
} = {
  screen: 'loading',
  apiBase: '',
  online: false,
  banner: '',
  name: '',
  token: '',
  ingredients: DEFAULT_INGREDIENTS,
  pizzas: [],
  draft: blankPizza(),
  dirty: false,
  freshIds: [],
  entrance: true,
  adminPin: '',
  overview: null,
  adminError: '',
  ingForm: emptyIng(),
  busy: false,
  toast: '',
  pending: '',
};

let frame = { entrance: false, freshIds: [] as string[] };
let toastTimer = 0;
let bound = false;

function blankHalf(base: Half['base'] = 'rossa'): Half {
  return { base, baseNote: '', toppingIds: [] };
}

const SHOWPIECE: Pizza = {
  id: 'showpiece',
  label: 'Capricciosa',
  split: false,
  left: { base: 'rossa', baseNote: '', toppingIds: ['mozzarella', 'prosciutto', 'funghi', 'olive', 'pomodorini', 'salamino'] },
  right: { base: 'bianca', baseNote: '', toppingIds: ['mozzarella'] },
  notes: '',
  preset: null,
};

function blankPizza(): Pizza {
  return {
    id: crypto.randomUUID(),
    label: '',
    split: false,
    left: { base: 'rossa', baseNote: '', toppingIds: ['mozzarella'] },
    right: { base: 'bianca', baseNote: '', toppingIds: ['mozzarella'] },
    notes: '',
    preset: 'margherita',
  };
}

function emptyIng(): IngForm {
  return { id: null, name: '', unit: 'g', qty: '30', shape: 'dot', color: '#c4322a', role: 'topping', active: true };
}

function esc(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function lsGet(key: string): string {
  try {
    return localStorage.getItem(key) || '';
  } catch {
    return '';
  }
}
function lsSet(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* modalità privata */
  }
}
function lsDel(key: string) {
  try {
    localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

function pageBase(): string {
  const url = new URL(location.href);
  let path = url.pathname;
  if (path.endsWith('/index.html')) path = path.slice(0, -'index.html'.length);
  if (!path.endsWith('/')) path += '/';
  return `${url.origin}${path}`;
}

function safeApiOverride(raw: string): string {
  try {
    const url = new URL(raw);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return '';
    if (url.hostname !== 'localhost' && url.hostname !== '127.0.0.1') return '';
    return url.origin;
  } catch {
    return '';
  }
}

async function loadConfig(): Promise<string> {
  const host = location.hostname;
  const override = new URLSearchParams(location.search).get('api');
  if (override && (host === 'localhost' || host === '127.0.0.1')) {
    const safe = safeApiOverride(override);
    if (safe) return safe;
  }
  try {
    const res = await fetch(new URL('config.json', pageBase()).href, { cache: 'no-store' });
    if (!res.ok) return '';
    const data = (await res.json()) as { apiBase?: unknown };
    return typeof data.apiBase === 'string' ? data.apiBase.replace(/\/$/, '') : '';
  } catch {
    return '';
  }
}

async function api(path: string, opts: { method?: string; body?: unknown; token?: boolean; admin?: boolean } = {}) {
  let res: Response;
  try {
    res = await fetch(`${state.apiBase}${path}`, {
      method: opts.method || 'GET',
      headers: {
        'content-type': 'application/json',
        ...(opts.token && state.token ? { 'x-edit-token': state.token } : {}),
        ...(opts.admin && state.adminPin ? { 'x-admin-pin': state.adminPin } : {}),
      },
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
    });
  } catch {
    throw new ApiError(MSG_DOWN, 0);
  }
  const data = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) throw new ApiError(data.error || 'Errore del forno', res.status);
  return data as Record<string, never>;
}

function normalizeIngredient(raw: Ingredient): Ingredient {
  return {
    id: String(raw.id),
    name: String(raw.name),
    unit: String(raw.unit || 'g'),
    qtyPerPizza: Number(raw.qtyPerPizza) || 0,
    shape: raw.shape || 'dot',
    color: /^#[0-9a-fA-F]{6}$/.test(raw.color) ? raw.color : '#888888',
    role: raw.role === 'base-rossa' ? 'base-rossa' : 'topping',
    sortOrder: Number(raw.sortOrder) || 0,
    active: raw.active !== false,
  };
}

function normalizeHalf(raw: Partial<Half> | undefined, fallback: Half['base']): Half {
  const base = raw?.base === 'bianca' || raw?.base === 'altro' || raw?.base === 'rossa' ? raw.base : fallback;
  return {
    base,
    baseNote: typeof raw?.baseNote === 'string' ? raw.baseNote : '',
    toppingIds: Array.isArray(raw?.toppingIds) ? raw.toppingIds.filter((id) => typeof id === 'string') : [],
  };
}

function normalizePizza(raw: Pizza): Pizza {
  return {
    id: raw.id,
    label: raw.label || '',
    split: Boolean(raw.split),
    left: normalizeHalf(raw.left, 'rossa'),
    right: normalizeHalf(raw.right, 'bianca'),
    notes: raw.notes || '',
    preset: raw.preset ?? null,
  };
}

function readLocal(): { name: string; pizzas: Pizza[] } | null {
  try {
    const raw = JSON.parse(lsGet(LOCAL_KEY) || 'null') as { name?: string; pizzas?: Pizza[] } | null;
    if (!raw?.name) return null;
    return { name: raw.name, pizzas: (raw.pizzas || []).map(normalizePizza) };
  } catch {
    return null;
  }
}

function writeLocal() {
  lsSet(LOCAL_KEY, JSON.stringify({ name: state.name, pizzas: state.pizzas }));
}

function activeToppings(): Ingredient[] {
  const selected = new Set([...state.draft.left.toppingIds, ...state.draft.right.toppingIds]);
  return state.ingredients.filter((i) => i.role === 'topping' && (i.active || selected.has(i.id)));
}

function toppingName(id: string): string {
  return state.ingredients.find((i) => i.id === id)?.name || id;
}

function joinIt(items: string[]): string {
  if (items.length <= 1) return items[0] || '';
  return `${items.slice(0, -1).join(', ')} e ${items[items.length - 1]}`;
}

function halfShort(half: Half): string {
  const base = half.base === 'altro' ? half.baseNote || 'altra' : half.base;
  const names = half.toppingIds.map(toppingName);
  return names.length ? `${base} con ${joinIt(names)}` : base;
}

function describe(pizza: Pizza): string {
  if (!pizza.split) return `Pizza ${halfShort(pizza.left)}`;
  return `Metà ${halfShort(pizza.left)}, metà ${halfShort(pizza.right)}`;
}

function specs(ids: string[]): ToppingSpec[] {
  return ids.map((id) => {
    const ing = state.ingredients.find((item) => item.id === id);
    return { id, shape: ing?.shape || 'dot', color: ing?.color || '#888888' };
  });
}

function viewOf(pizza: Pizza): PizzaView {
  const half = (h: Half): HalfView => ({ base: h.base, baseNote: h.baseNote, toppings: specs(h.toppingIds) });
  return { id: pizza.id, split: pizza.split, left: half(pizza.left), right: half(pizza.right), ariaLabel: describe(pizza) };
}

function svg(pizza: Pizza, uid: string, animate: boolean, decorative = false): string {
  return renderPizzaSvg(viewOf(pizza), {
    uid,
    freshIds: animate ? frame.freshIds : [],
    entrance: animate ? frame.entrance : false,
    decorative,
  });
}

function usablePresets(): Preset[] {
  const active = new Set(state.ingredients.filter((i) => i.active && i.role === 'topping').map((i) => i.id));
  return PRESETS.filter((preset) => preset.toppings.every((id) => active.has(id)));
}

function saved(pizza: Pizza): boolean {
  return state.pizzas.some((item) => item.id === pizza.id);
}

function showToast(message: string) {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = message;
  el.hidden = !message;
}

function spinPizza() {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const el = document.querySelector('.stage .pizza-svg');
  if (!(el instanceof Element)) return;
  el.classList.remove('is-spin');
  void el.getBoundingClientRect();
  el.classList.add('is-spin');
}

function celebrate() {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  document.querySelector('.party')?.remove();
  const layer = document.createElement('div');
  layer.className = 'party';
  layer.setAttribute('aria-hidden', 'true');
  const peel = document.createElement('div');
  peel.className = 'peel';
  layer.appendChild(peel);
  for (let i = 0; i < 18; i++) {
    const leaf = document.createElement('span');
    leaf.className = 'leaf';
    leaf.style.left = `${6 + ((i * 47) % 88)}%`;
    leaf.style.animationDelay = `${i * 35}ms`;
    layer.appendChild(leaf);
  }
  document.body.appendChild(layer);
  window.setTimeout(() => layer.remove(), 1400);
}

function toast(message: string) {
  state.toast = message;
  showToast(message);
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => {
    state.toast = '';
    showToast('');
  }, 2600);
}

function captureFocus() {
  const el = document.activeElement;
  if (!(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)) return null;
  if (!el.id) return null;
  return { id: el.id, start: el.selectionStart ?? 0, end: el.selectionEnd ?? 0 };
}

function paint(opts?: { restoreFocus?: boolean }) {
  const root = document.getElementById('app');
  if (!root) return;
  const savedFocus = opts?.restoreFocus ? captureFocus() : null;
  const presets = document.querySelector('.presets');
  const presetLeft = presets instanceof HTMLElement ? presets.scrollLeft : 0;
  const y = window.scrollY;
  frame = { entrance: state.entrance, freshIds: state.freshIds.slice() };
  state.entrance = false;
  state.freshIds = [];
  const active = document.activeElement;
  if (active instanceof HTMLElement && active !== document.body) active.blur();
  root.innerHTML = shell();
  showToast(state.toast);
  window.scrollTo(0, y);
  const nextPresets = document.querySelector('.presets');
  if (nextPresets instanceof HTMLElement) nextPresets.scrollLeft = presetLeft;
  if (savedFocus) {
    const el = document.getElementById(savedFocus.id);
    if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
      el.focus();
      try {
        el.setSelectionRange(savedFocus.start, savedFocus.end);
      } catch {
        /* alcuni tipi di input non hanno selezione */
      }
    }
  }
}

function banner(): string {
  return state.banner ? `<p class="banner" role="status">${esc(state.banner)}</p>` : '';
}

function shell(): string {
  return `<div class="wrap">
    <header class="top">
      <div class="brand"><span class="logo-mark">GO</span><span><strong>PizzaGo</strong><em>pizza dell’amicizia</em></span></div>
      <nav class="nav">
        <a href="../">Sito</a>
        ${state.screen === 'admin' ? '<button class="ghost" type="button" data-action="leave-admin">Le pizze</button>' : '<button class="ghost" type="button" data-action="open-admin">Forno</button>'}
        ${state.token || state.name ? '<button class="ghost" type="button" data-action="logout">Esci</button>' : ''}
      </nav>
    </header>
    <div id="view">${view()}</div>
    <p class="foot">Forno di Michele · lancia i condimenti</p>
    <div id="toast" class="toast" role="status" ${state.toast ? '' : 'hidden'}></div>
  </div>`;
}

function view(): string {
  if (state.screen === 'loading') return loadingView();
  if (state.screen === 'gate') return gateView();
  if (state.screen === 'admin') return adminView();
  return builderView();
}

function loadingView(): string {
  return `<section class="gate"><div class="stage">${svg(SHOWPIECE, 'load', false)}</div><p class="lede">Il forno ruggisce…</p></section>`;
}

function gateView(): string {
  return `<section class="gate">
    <div class="stage">${svg(SHOWPIECE, 'gate', true)}<p class="caption">La pizza dell’amicizia è già in pista</p></div>
    ${banner()}
    <div class="gate-card">
      <h1>Chi pizza?</h1>
      <p class="lede">Michele ha acceso il forno. Butta il nome sul bancone e lancia i condimenti, anche in più varianti.</p>
      <form data-action="enter">
        <label class="field"><span>Il tuo nome</span>
          <input id="f-name" data-field="gate-name" name="nome" autocomplete="name" autocapitalize="words" maxlength="40" placeholder="Per esempio Giulia" value="${esc(state.name)}" required>
        </label>
        <button class="btn" type="submit">Si parte</button>
      </form>
    </div>
  </section>`;
}

function builderView(): string {
  const draft = state.draft;
  const exists = saved(draft);
  const saveText = state.busy
    ? 'Inforno…'
    : !state.online
      ? exists
        ? 'Aggiorna sul telefono'
        : 'Salva sul telefono'
      : exists
        ? 'Inforna di nuovo'
        : 'Inforna per Michele';
  return `<section class="builder">
    <div class="stage-wrap">
      <div class="stage">${svg(draft, `live-${draft.id}`, true)}<p class="caption">${esc(describe(draft))}</p></div>
    </div>
    <div class="editor">
      ${banner()}
      <div class="presets" role="list">${usablePresets().map((preset) => `<button type="button" class="preset" role="listitem" data-action="preset" data-id="${esc(preset.id)}" aria-pressed="${draft.preset === preset.id}">${esc(preset.name)}</button>`).join('')}</div>
      <div class="cards">${state.pizzas.map((pizza) => `<button type="button" class="pizza-card ${pizza.id === draft.id ? 'is-current' : ''}" data-action="edit-pizza" data-id="${esc(pizza.id)}">${svg(pizza, `card-${pizza.id}`, false)}<strong>${esc(pizza.label || 'Pizza')}</strong><small>${esc(describe(pizza))}</small></button>`).join('')}${state.pizzas.length === 0 ? '<p class="hint">Il banco è vuoto. Questa è la prima.</p>' : ''}</div>
      <div class="panel">
        <h2>${esc(state.name ? `Banco di ${state.name}` : 'Il tuo banco')}</h2>
        <label class="field"><span>Il tuo nome</span><input id="f-guest-name" data-field="guest-name" maxlength="40" value="${esc(state.name)}"></label>
        <label class="field"><span>Nome della variante</span><input id="f-label" data-field="label" maxlength="40" placeholder="es. senza cipolla" value="${esc(draft.label)}"></label>
        <button type="button" class="split-toggle" data-action="toggle-split" aria-pressed="${draft.split}">Metà e metà</button>
        ${draft.split ? `<div class="halves split">${halfEditor('left', 'Metà A')}${halfEditor('right', 'Metà B')}</div>` : `<div class="halves">${halfEditor('left', 'Lancia i condimenti')}</div>`}
        <label class="field"><span>Urla al forno</span><textarea id="f-notes" data-field="notes" maxlength="280" placeholder="es. ben cotta, taglio a fette">${esc(draft.notes)}</textarea></label>
        <div class="editor-actions">
          <button class="btn" type="button" data-action="save" ${state.busy ? 'disabled' : ''}>${saveText}</button>
          <button class="ghost" type="button" data-action="new-pizza">Un’altra</button>
          ${exists ? '<button class="ghost" type="button" data-action="variant">Fanne una variante</button>' : ''}
          ${exists ? `<button class="ghost" type="button" data-action="delete-pizza" data-id="${esc(draft.id)}">${state.pending === `pizza:${draft.id}` ? 'Confermi?' : 'Elimina'}</button>` : ''}
        </div>
        <div class="link-row">
          ${state.token ? `<button class="ghost" type="button" data-action="copy-link">Copia il link segreto</button><p class="hint">Il link è la tua chiave, senza password. Chi lo ha può modificare le tue pizze.</p>` : '<p class="hint">Resta sul telefono finché il forno comune non si accende.</p>'}
        </div>
      </div>
    </div>
  </section>`;
}

function chipIcon(shape: string, color: string): string {
  const fill = /^#[0-9a-fA-F]{6}$/.test(color) ? color : '#ff2a2a';
  const paths: Record<string, string> = {
    olive: `<ellipse cx="16" cy="16" rx="8" ry="6" fill="${fill}"/><ellipse cx="16" cy="16" rx="2.4" ry="1.8" fill="#e07a62"/>`,
    ribbon: `<path d="M6 20c4-8 8-8 12-2 3 4 6 2 8-1" fill="none" stroke="${fill}" stroke-width="4" stroke-linecap="round"/>`,
    mushroom: `<ellipse cx="16" cy="20" rx="3" ry="6" fill="#f3e2cc"/><ellipse cx="16" cy="13" rx="10" ry="7" fill="${fill}"/>`,
    artichoke: `<ellipse cx="16" cy="16" rx="5" ry="11" fill="${fill}"/><ellipse cx="16" cy="16" rx="5" ry="11" fill="${fill}" transform="rotate(60 16 16)"/><ellipse cx="16" cy="16" rx="5" ry="11" fill="${fill}" transform="rotate(120 16 16)"/>`,
    cherry: `<circle cx="16" cy="18" r="7" fill="${fill}"/><path d="M16 12c2-4 6-5 8-3" fill="none" stroke="#0c6b2e" stroke-width="2"/>`,
    'blue-cheese': `<path d="M8 20c2-8 14-8 16 0" fill="${fill}"/><circle cx="13" cy="16" r="1.4" fill="#6d8eab"/><circle cx="18" cy="18" r="1.2" fill="#6d8eab"/>`,
    coin: `<circle cx="16" cy="16" r="9" fill="#9d2b28"/><circle cx="16" cy="16" r="6" fill="${fill}"/>`,
    shaving: `<ellipse cx="16" cy="16" rx="10" ry="3.5" fill="${fill}" transform="rotate(-20 16 16)"/>`,
    onion: `<path d="M8 18a8 7 0 0 1 16 0" fill="none" stroke="${fill}" stroke-width="3"/><path d="M11 18a5 4 0 0 1 10 0" fill="none" stroke="#f7e4f1" stroke-width="2"/>`,
    leaf: `<path d="M16 26c8-6 8-16 0-20-8 4-8 14 0 20z" fill="${fill}"/>`,
    chunk: `<circle cx="16" cy="16" r="8" fill="${fill}"/>`,
    blob: `<circle cx="16" cy="16" r="8" fill="${fill}" stroke="#140e0c" stroke-width="1"/>`,
    dot: `<circle cx="16" cy="16" r="4" fill="${fill}"/>`,
  };
  return `<svg class="chip-ico" viewBox="0 0 32 32" aria-hidden="true">${paths[shape] || paths.dot}</svg>`;
}

function halfEditor(side: 'left' | 'right', title: string): string {
  const half = state.draft[side];
  const noteId = side === 'left' ? 'f-note-left' : 'f-note-right';
  return `<fieldset class="half"><legend class="legend">${esc(title)}</legend>
    <div class="bases" role="group" aria-label="Base ${esc(title)}">
      ${(['rossa', 'bianca', 'altro'] as const).map((base) => `<button type="button" class="base-btn" data-action="set-base" data-half="${side}" data-base="${base}" aria-pressed="${half.base === base}">${base === 'rossa' ? 'Rossa' : base === 'bianca' ? 'Bianca' : 'Altro'}</button>`).join('')}
    </div>
    ${half.base === 'altro' ? `<label class="field"><span>Quale base?</span><input id="${noteId}" data-field="base-note-${side}" maxlength="40" placeholder="es. pesto" value="${esc(half.baseNote)}"></label>` : ''}
    <div class="chips">${activeToppings().map((ing) => `<button type="button" class="chip" data-action="toggle-topping" data-half="${side}" data-id="${esc(ing.id)}" aria-pressed="${half.toppingIds.includes(ing.id)}">${chipIcon(ing.shape, ing.color)}<span>${esc(ing.name)}</span></button>`).join('')}</div>
  </fieldset>`;
}

function adminView(): string {
  if (!state.online) {
    return `<section class="admin-lock">${banner()}<div class="panel"><h2>Forno spento</h2><p class="hint">${esc(state.adminError || MSG_CONFIG)}</p><button class="btn" type="button" data-action="leave-admin">Torna alle pizze</button></div></section>`;
  }
  if (!state.overview) {
    return `<section class="admin-lock">${banner()}<form class="panel" data-action="admin-login">
      <h2>Il forno di Michele</h2>
      <p class="hint">Qui esplodono tutte le pizze e lo scontrino della spesa. Serve il PIN.</p>
      <label class="field"><span>PIN</span><input id="f-pin" data-field="pin" type="password" autocomplete="off" value="${esc(state.adminPin)}"></label>
      ${state.adminError ? `<p class="banner">${esc(state.adminError)}</p>` : ''}
      <button class="btn" type="submit">Entra nel forno</button>
    </form></section>`;
  }
  const shop = state.overview.shopping;
  return `<section class="admin">
    ${banner()}
    <div class="panel">
      <div class="receipt-top"><h2>Scontrino</h2><span class="stamp">SPESA</span></div>
      <div class="mega">
        <div><strong>${shop.pizzaCount}</strong><span>${shop.pizzaCount === 1 ? 'pizza' : 'pizze'}</span></div>
        <div><strong>${shop.guestCount}</strong><span>${shop.guestCount === 1 ? 'amico' : 'amici'}</span></div>
      </div>
      <div class="receipt">
        <p class="receipt-end">FORNO DI MICHELE</p>
        ${shop.lines.length ? `<ul class="shop">${shop.lines.map((line) => `<li><strong>${esc(line.name)}</strong><span>${esc(lineMeta(line))}</span></li>`).join('')}</ul>` : '<p class="hint">Nessuno ha ordinato. Il forno fischia da solo.</p>'}
        ${shop.notes.length ? `<ul class="shop">${shop.notes.map((note) => `<li><strong>${esc(note.guest)}</strong><span>${esc(`${note.pizza}: ${note.notes}`)}</span></li>`).join('')}</ul>` : ''}
        <p class="receipt-end">grazie · il forno è caldo</p>
      </div>
      <div class="row-actions">
        <button class="btn" type="button" data-action="copy-shop">Copia lista</button>
        <button class="ghost" type="button" data-action="download-shop">Scarica .txt</button>
        <button class="ghost" type="button" data-action="refresh">Aggiorna</button>
      </div>
    </div>
    <div class="panel">
      <h2>Ospiti</h2>
      ${state.overview.guests.map((guest) => `<article class="guest">
        <div class="guest-head"><strong>${esc(guest.name)}</strong><button class="ghost" type="button" data-action="delete-guest" data-id="${esc(guest.id)}">${state.pending === `guest:${guest.id}` ? 'Confermi?' : 'Elimina ospite'}</button></div>
        ${guest.pizzas.length === 0 ? '<p class="hint">Nessuna pizza.</p>' : guest.pizzas.map((pizza) => `<div class="mini-pizza">${svg(normalizePizza(pizza), `adm-${pizza.id}`, false)}<div><strong>${esc(pizza.label || 'Pizza')}</strong><p class="hint">${esc(describe(normalizePizza(pizza)))}</p>${pizza.notes ? `<p class="hint">${esc(pizza.notes)}</p>` : ''}<button class="ghost" type="button" data-action="delete-admin-pizza" data-id="${esc(pizza.id)}">${state.pending === `apizza:${pizza.id}` ? 'Confermi?' : 'Elimina pizza'}</button></div></div>`).join('')}
      </article>`).join('') || '<p class="hint">Nessun ospite.</p>'}
    </div>
    <div class="panel span">
      <h2>Ingredienti</h2>
      <p class="hint">I pelati della base rossa non stanno tra i condimenti: entrano da soli quando la base è rossa. Puoi cambiarne i grammi.</p>
      ${state.overview.ingredients.map((ing) => `<div class="ing-row"><div><strong>${esc(ing.name)}</strong><br><small>${esc(String(ing.qtyPerPizza))} ${esc(ing.unit)} a pizza · ${ing.active ? 'attivo' : 'nascosto'}</small></div><div class="row-actions"><button class="ghost" type="button" data-action="edit-ing" data-id="${esc(ing.id)}">Modifica</button><button class="ghost" type="button" data-action="toggle-ing" data-id="${esc(ing.id)}">${ing.active ? 'Nascondi' : 'Rimetti'}</button></div></div>`).join('')}
      <h3>${state.ingForm.id ? 'Modifica ingrediente' : 'Aggiungi un ingrediente'}</h3>
      <form data-action="save-ing">
        <label class="field"><span>Nome</span><input id="f-ing-name" data-field="ing-name" maxlength="40" value="${esc(state.ingForm.name)}" required></label>
        <label class="field"><span>Quantità per pizza</span><input id="f-ing-qty" data-field="ing-qty" inputmode="decimal" value="${esc(state.ingForm.qty)}" required></label>
        <label class="field"><span>Unità</span><input id="f-ing-unit" data-field="ing-unit" maxlength="12" value="${esc(state.ingForm.unit)}" required></label>
        <label class="field"><span>Forma</span><select id="f-ing-shape" data-field="ing-shape">${SHAPE_OPTIONS.map((shape) => `<option value="${shape.id}" ${state.ingForm.shape === shape.id ? 'selected' : ''}>${esc(shape.label)}</option>`).join('')}</select></label>
        <label class="field"><span>Uso</span><select id="f-ing-role" data-field="ing-role"><option value="topping" ${state.ingForm.role === 'topping' ? 'selected' : ''}>Condimento</option><option value="base-rossa" ${state.ingForm.role === 'base-rossa' ? 'selected' : ''}>Pelati per la base rossa</option></select></label>
        <label class="field color-field"><span>Colore</span><input id="f-ing-color" data-field="ing-color" type="color" value="${esc(state.ingForm.color)}"></label>
        <label class="check"><input data-field="ing-active" type="checkbox" ${state.ingForm.active ? 'checked' : ''}> Attivo</label>
        <div class="row-actions"><button class="btn" type="submit">${state.ingForm.id ? 'Salva modifiche' : 'Aggiungi'}</button><button class="ghost" type="button" data-action="reset-ing">Nuovo</button></div>
      </form>
    </div>
  </section>`;
}

function lineMeta(line: ShopLine): string {
  const qty = String(line.quantity).replace('.', ',');
  if (line.kind === 'base' && line.unit === 'pizze') {
    const word = line.quantity === 1 ? 'pizza' : 'pizze';
    return `${qty} ${word}${line.detail ? ` · ${line.detail}` : ''}`;
  }
  const pizzas = line.pizzas === 1 ? '1 pizza' : `${line.pizzas} pizze`;
  return `${pizzas} · circa ${qty} ${line.unit}`;
}

function payload(pizza: Pizza) {
  return {
    id: pizza.id,
    label: pizza.label.trim(),
    split: pizza.split,
    left: pizza.left,
    right: pizza.right,
    notes: pizza.notes.trim(),
    preset: pizza.preset,
  };
}

async function enter(name: string) {
  state.name = name;
  if (!state.online) {
    state.pizzas = readLocal()?.name === name ? readLocal()!.pizzas : [];
    state.draft = state.pizzas[0] ? structuredClone(state.pizzas[0]) : blankPizza();
    writeLocal();
    state.screen = 'builder';
    state.entrance = true;
    state.dirty = false;
    paint();
    return;
  }
  state.busy = true;
  try {
    const data = (await api('/api/guests', { method: 'POST', body: { name } })) as { editToken: string; guest: { name: string } };
    state.token = data.editToken;
    lsSet(TOKEN_KEY, state.token);
    state.pizzas = [];
    state.draft = blankPizza();
    state.screen = 'builder';
    state.entrance = true;
    state.dirty = false;
    toast('Benvenuto nel forno');
  } catch (err) {
    toast(err instanceof Error ? err.message : 'Errore');
  } finally {
    state.busy = false;
    paint();
  }
}

async function persistName() {
  if (!state.name.trim()) return;
  if (!state.online) {
    writeLocal();
    return;
  }
  if (!state.token) return;
  try {
    await api('/api/me', { method: 'PUT', token: true, body: { name: state.name.trim() } });
  } catch (err) {
    toast(err instanceof Error ? err.message : 'Non ho aggiornato il nome');
  }
}

async function saveDraft(asVariant: boolean) {
  if (state.draft.left.base === 'altro' && !state.draft.left.baseNote.trim()) {
    toast('Scrivi la base, per esempio pesto');
    return;
  }
  if (state.draft.split && state.draft.right.base === 'altro' && !state.draft.right.baseNote.trim()) {
    toast('Scrivi anche la seconda base');
    return;
  }
  const pizza = structuredClone(state.draft);
  if (asVariant) {
    pizza.id = crypto.randomUUID();
    if (!pizza.label) pizza.label = 'Variante';
  }
  if (!state.online) {
    const idx = state.pizzas.findIndex((item) => item.id === pizza.id);
    if (idx >= 0) state.pizzas[idx] = pizza;
    else state.pizzas.push(pizza);
    state.draft = structuredClone(pizza);
    state.dirty = false;
    writeLocal();
    toast('Infornata sul telefono');
    paint();
    celebrate();
    return;
  }
  state.busy = true;
  paint();
  let cheered = false;
  try {
    if (!state.token) {
      const created = (await api('/api/guests', { method: 'POST', body: { name: state.name || 'Ospite' } })) as { editToken: string };
      state.token = created.editToken;
      lsSet(TOKEN_KEY, state.token);
    }
    const exists = !asVariant && state.pizzas.some((item) => item.id === pizza.id);
    const data = (await api(exists ? `/api/me/pizzas/${pizza.id}` : '/api/me/pizzas', {
      method: exists ? 'PUT' : 'POST',
      token: true,
      body: payload(pizza),
    })) as { pizza: Pizza };
    const savedPizza = normalizePizza(data.pizza);
    const idx = state.pizzas.findIndex((item) => item.id === savedPizza.id);
    if (idx >= 0) state.pizzas[idx] = savedPizza;
    else state.pizzas.push(savedPizza);
    state.draft = structuredClone(savedPizza);
    state.dirty = false;
    cheered = true;
    toast(asVariant ? 'Variante infornata' : 'Infornata per Michele');
  } catch (err) {
    toast(err instanceof Error ? err.message : 'Non sono riuscito a salvare');
  } finally {
    state.busy = false;
    paint();
    if (cheered) celebrate();
  }
}

async function removePizza(id: string) {
  if (!state.online) {
    state.pizzas = state.pizzas.filter((pizza) => pizza.id !== id);
    if (state.draft.id === id) state.draft = state.pizzas[0] ? structuredClone(state.pizzas[0]) : blankPizza();
    writeLocal();
    toast('Eliminata');
    paint();
    return;
  }
  try {
    await api(`/api/me/pizzas/${id}`, { method: 'DELETE', token: true });
    state.pizzas = state.pizzas.filter((pizza) => pizza.id !== id);
    if (state.draft.id === id) state.draft = state.pizzas[0] ? structuredClone(state.pizzas[0]) : blankPizza();
    state.dirty = false;
    toast('Eliminata');
  } catch (err) {
    toast(err instanceof Error ? err.message : 'Non sono riuscito a eliminare');
  }
  paint();
}

async function loadOverview() {
  try {
    const data = (await api('/api/admin/overview', { admin: true })) as unknown as Overview;
    state.overview = {
      ...data,
      ingredients: data.ingredients.map(normalizeIngredient),
      guests: data.guests.map((guest) => ({ ...guest, pizzas: guest.pizzas.map(normalizePizza) })),
    };
    state.ingredients = state.overview.ingredients;
    state.adminError = '';
    sessionStorage.setItem(PIN_KEY, state.adminPin);
  } catch (err) {
    state.overview = null;
    if (err instanceof ApiError && err.status === 401) {
      state.adminPin = '';
      sessionStorage.removeItem(PIN_KEY);
      state.adminError = 'PIN non valido';
    } else {
      state.adminError = err instanceof Error ? err.message : 'Errore';
    }
  }
  paint();
}

function applyPreset(id: string) {
  const preset = PRESETS.find((item) => item.id === id);
  if (!preset) return;
  state.draft.preset = preset.id;
  state.draft.left = { base: preset.base, baseNote: preset.baseNote, toppingIds: [...preset.toppings] };
  state.draft.split = false;
  if (!state.draft.label) state.draft.label = preset.name;
  state.freshIds = [...preset.toppings];
  state.dirty = true;
  paint();
  spinPizza();
}

function toggleTopping(side: 'left' | 'right', id: string) {
  const half = state.draft[side];
  if (half.toppingIds.includes(id)) half.toppingIds = half.toppingIds.filter((item) => item !== id);
  else {
    half.toppingIds = [...half.toppingIds, id];
    state.freshIds = [id];
  }
  state.draft.preset = null;
  state.dirty = true;
  paint();
}

function confirmPending(key: string): boolean {
  if (state.pending === key) {
    state.pending = '';
    return true;
  }
  state.pending = key;
  paint();
  return false;
}

async function onClick(ev: Event) {
  const target = ev.target;
  if (!(target instanceof Element)) return;
  const button = target.closest<HTMLElement>('[data-action]');
  if (!button) return;
  const action = button.dataset.action || '';
  const id = button.dataset.id || '';
  if (action !== 'delete-pizza' && action !== 'delete-guest' && action !== 'delete-admin-pizza') state.pending = '';
  if (action === 'open-admin') {
    state.screen = 'admin';
    state.adminPin = sessionStorage.getItem(PIN_KEY) || '';
    state.overview = null;
    if (!state.online) {
      state.adminError = MSG_CONFIG;
      paint();
      return;
    }
    if (state.adminPin) await loadOverview();
    else paint();
    return;
  }
  if (action === 'leave-admin') {
    state.screen = state.name ? 'builder' : 'gate';
    state.entrance = true;
    paint();
    return;
  }
  if (action === 'logout') {
    if (!window.confirm('Questo telefono dimentica il link. Se non l’hai copiato, non potrai più modificare le pizze.')) return;
    lsDel(TOKEN_KEY);
    lsDel(LOCAL_KEY);
    state.token = '';
    state.name = '';
    state.pizzas = [];
    state.draft = blankPizza();
    state.screen = 'gate';
    paint();
    return;
  }
  if (action === 'new-pizza') {
    if (state.dirty && !window.confirm('Hai modifiche non salvate. Le lascio?')) return;
    state.draft = blankPizza();
    state.dirty = false;
    state.entrance = true;
    state.freshIds = ['mozzarella'];
    paint();
    return;
  }
  if (action === 'edit-pizza') {
    if (state.dirty && id !== state.draft.id && !window.confirm('Hai modifiche non salvate. Le lascio?')) return;
    const pizza = state.pizzas.find((item) => item.id === id);
    if (!pizza) return;
    state.draft = structuredClone(pizza);
    state.dirty = false;
    state.entrance = true;
    paint();
    return;
  }
  if (action === 'preset') {
    applyPreset(id);
    return;
  }
  if (action === 'toggle-split') {
    state.draft.split = !state.draft.split;
    state.dirty = true;
    state.draft.preset = null;
    paint();
    spinPizza();
    return;
  }
  if (action === 'set-base') {
    const side = button.dataset.half === 'right' ? 'right' : 'left';
    const base = button.dataset.base;
    if (base !== 'rossa' && base !== 'bianca' && base !== 'altro') return;
    state.draft[side].base = base;
    if (base !== 'altro') state.draft[side].baseNote = '';
    state.dirty = true;
    state.draft.preset = null;
    paint();
    spinPizza();
    return;
  }
  if (action === 'toggle-topping') {
    toggleTopping(button.dataset.half === 'right' ? 'right' : 'left', id);
    return;
  }
  if (action === 'save') {
    await saveDraft(false);
    return;
  }
  if (action === 'variant') {
    await saveDraft(true);
    return;
  }
  if (action === 'delete-pizza') {
    if (!confirmPending(`pizza:${id}`)) return;
    await removePizza(id);
    return;
  }
  if (action === 'copy-link') {
    const link = `${pageBase()}?t=${state.token}`;
    try {
      await navigator.clipboard.writeText(link);
      toast('Link copiato. Tienilo: è la tua chiave.');
    } catch {
      toast(link);
    }
    return;
  }
  if (action === 'copy-shop' && state.overview) {
    try {
      await navigator.clipboard.writeText(state.overview.shopping.text);
      toast('Lista copiata');
    } catch {
      toast('Non riesco a copiare: scarica il file');
    }
    return;
  }
  if (action === 'download-shop' && state.overview) {
    const blob = new Blob([state.overview.shopping.text], { type: 'text/plain;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'lista-spesa-gopizzago.txt';
    a.click();
    URL.revokeObjectURL(a.href);
    return;
  }
  if (action === 'refresh') {
    await loadOverview();
    return;
  }
  if (action === 'delete-guest') {
    if (!confirmPending(`guest:${id}`)) return;
    try {
      await api(`/api/admin/guests/${id}`, { method: 'DELETE', admin: true });
      toast('Ospite eliminato');
      await loadOverview();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Errore');
    }
    return;
  }
  if (action === 'delete-admin-pizza') {
    if (!confirmPending(`apizza:${id}`)) return;
    try {
      await api(`/api/admin/pizzas/${id}`, { method: 'DELETE', admin: true });
      toast('Pizza eliminata');
      await loadOverview();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Errore');
    }
    return;
  }
  if (action === 'edit-ing') {
    const ing = state.ingredients.find((item) => item.id === id);
    if (!ing) return;
    state.ingForm = {
      id: ing.id,
      name: ing.name,
      unit: ing.unit,
      qty: String(ing.qtyPerPizza),
      shape: ing.shape,
      color: ing.color,
      role: ing.role,
      active: ing.active,
    };
    paint();
    return;
  }
  if (action === 'toggle-ing') {
    const ing = state.ingredients.find((item) => item.id === id);
    if (!ing) return;
    try {
      await api(`/api/admin/ingredients/${id}`, {
        method: 'PUT',
        admin: true,
        body: { ...ing, active: !ing.active },
      });
      await loadOverview();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Errore');
    }
    return;
  }
  if (action === 'reset-ing') {
    state.ingForm = emptyIng();
    paint();
  }
}

function onInput(ev: Event) {
  const el = ev.target;
  if (!(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement)) return;
  const field = el.dataset.field;
  if (!field) return;
  const value = el.value;
  if (field === 'gate-name' || field === 'guest-name') state.name = value;
  else if (field === 'label') {
    state.draft.label = value;
    state.dirty = true;
  } else if (field === 'notes') {
    state.draft.notes = value;
    state.dirty = true;
  } else if (field === 'base-note-left' || field === 'base-note-right') {
    const side = field.endsWith('right') ? 'right' : 'left';
    state.draft[side].baseNote = value;
    state.dirty = true;
    state.draft.preset = null;
  } else if (field === 'pin') state.adminPin = value;
  else if (field === 'ing-name') state.ingForm.name = value;
  else if (field === 'ing-unit') state.ingForm.unit = value;
  else if (field === 'ing-qty') state.ingForm.qty = value;
  else if (field === 'ing-shape') state.ingForm.shape = value;
  else if (field === 'ing-color') state.ingForm.color = value;
  else if (field === 'ing-role' && (value === 'topping' || value === 'base-rossa')) state.ingForm.role = value;
  else if (field === 'ing-active' && el instanceof HTMLInputElement) state.ingForm.active = el.checked;
  if (field === 'guest-name') {
    const title = document.querySelector('.editor h2');
    if (title) title.textContent = value.trim() ? `Banco di ${value.trim()}` : 'Il tuo banco';
  }
  if (field.startsWith('base-note')) paint({ restoreFocus: true });
}

async function onSubmit(ev: Event) {
  const form = ev.target;
  if (!(form instanceof HTMLFormElement)) return;
  ev.preventDefault();
  const action = form.dataset.action;
  if (action === 'enter') {
    const name = state.name.trim();
    if (!name) {
      toast('Come ti chiami?');
      return;
    }
    await enter(name);
    return;
  }
  if (action === 'admin-login') {
    if (!state.adminPin.trim()) {
      toast('Scrivi il PIN');
      return;
    }
    await loadOverview();
    return;
  }
  if (action === 'save-ing') {
    const qty = Number(state.ingForm.qty.replace(',', '.'));
    const body = {
      name: state.ingForm.name.trim(),
      unit: state.ingForm.unit.trim(),
      qtyPerPizza: qty,
      shape: state.ingForm.shape,
      color: state.ingForm.color,
      role: state.ingForm.role,
      active: state.ingForm.active,
    };
    try {
      if (state.ingForm.id) {
        await api(`/api/admin/ingredients/${state.ingForm.id}`, { method: 'PUT', admin: true, body });
        toast('Ingrediente aggiornato');
      } else {
        await api('/api/admin/ingredients', { method: 'POST', admin: true, body });
        toast('Ingrediente aggiunto');
        state.ingForm = emptyIng();
      }
      await loadOverview();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Errore');
    }
  }
}

function bind() {
  if (bound) return;
  bound = true;
  const root = document.getElementById('app');
  root?.addEventListener('click', (ev) => void onClick(ev));
  root?.addEventListener('input', onInput);
  root?.addEventListener('change', onInput);
  root?.addEventListener('submit', (ev) => void onSubmit(ev));
  root?.addEventListener('focusout', (ev) => {
    const el = ev.target;
    if (el instanceof HTMLElement && el.dataset.field === 'guest-name') void persistName();
  });
}

async function init() {
  bind();
  paint();
  state.apiBase = await loadConfig();
  state.ingredients = DEFAULT_INGREDIENTS.map((item) => ({ ...item }));
  if (state.apiBase) {
    try {
      const data = (await api('/api/ingredients')) as { ingredients: Ingredient[] };
      state.ingredients = data.ingredients.map(normalizeIngredient);
      state.online = true;
      state.banner = '';
    } catch {
      state.online = false;
      state.banner = MSG_DOWN;
    }
  } else {
    state.online = false;
    state.banner = MSG_CONFIG;
  }
  const fromUrl = new URLSearchParams(location.search).get('t') || '';
  if (/^[a-f0-9]{48}$/.test(fromUrl)) {
    state.token = fromUrl;
    lsSet(TOKEN_KEY, fromUrl);
  } else state.token = lsGet(TOKEN_KEY);
  if (state.online && state.token) {
    try {
      const me = (await api('/api/me', { token: true })) as { guest: { name: string }; pizzas: Pizza[] };
      state.name = me.guest.name;
      state.pizzas = me.pizzas.map(normalizePizza);
      state.draft = state.pizzas[0] ? structuredClone(state.pizzas[0]) : blankPizza();
      state.screen = 'builder';
      state.entrance = true;
      state.dirty = false;
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        lsDel(TOKEN_KEY);
        state.token = '';
        state.banner = 'Il link personale non è più valido. Entra di nuovo con il tuo nome.';
        state.screen = 'gate';
      } else {
        state.online = false;
        state.banner = MSG_DOWN;
        const local = readLocal();
        state.name = local?.name || '';
        state.pizzas = local?.pizzas || [];
        state.screen = state.name ? 'builder' : 'gate';
        state.draft = state.pizzas[0] ? structuredClone(state.pizzas[0]) : blankPizza();
      }
    }
  } else if (!state.online) {
    const local = readLocal();
    if (local) {
      state.name = local.name;
      state.pizzas = local.pizzas;
      state.draft = local.pizzas[0] ? structuredClone(local.pizzas[0]) : blankPizza();
      state.screen = 'builder';
      state.entrance = true;
    } else state.screen = 'gate';
  } else state.screen = 'gate';
  paint();
}

void init();
