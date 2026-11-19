export interface ToppingSpec {
  id: string;
  shape: string;
  color: string;
}

export interface HalfView {
  base: 'rossa' | 'bianca' | 'altro';
  baseNote: string;
  toppings: ToppingSpec[];
}

export interface PizzaView {
  id: string;
  split: boolean;
  left: HalfView;
  right: HalfView;
  ariaLabel?: string;
}

export interface RenderOpts {
  uid?: string;
  freshIds?: string[];
  entrance?: boolean;
  decorative?: boolean;
}

type Rng = () => number;
type Side = 'full' | 'left' | 'right';

const PESTO = '#4f7d32';
const COUNTS: Record<string, number> = {
  olive: 8,
  ribbon: 5,
  mushroom: 5,
  artichoke: 4,
  cherry: 7,
  'blue-cheese': 5,
  coin: 8,
  shaving: 11,
  onion: 6,
  chunk: 5,
  blob: 6,
  leaf: 5,
  dot: 12,
};

function hash(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function n(value: number): string {
  return value.toFixed(2);
}

function safeId(value: string): string {
  const clean = value.replace(/[^a-zA-Z0-9_-]/g, '');
  return clean || 'pizza';
}

function safeColor(value: string): string {
  return /^#[0-9a-fA-F]{6}$/.test(value) ? value : '#888888';
}

function xml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function ringPath(rng: Rng, cx: number, cy: number, radius: number, wobble: number, steps: number): string {
  let d = '';
  for (let i = 0; i <= steps; i++) {
    const a = (i / steps) * Math.PI * 2;
    const rr = radius * (1 + Math.sin(a * 5) * wobble * 0.4 + (rng() - 0.5) * wobble);
    const x = cx + Math.cos(a) * rr;
    const y = cy + Math.sin(a) * rr;
    d += `${i === 0 ? 'M' : 'L'}${n(x)} ${n(y)} `;
  }
  return `${d}Z`;
}

function blobPath(rng: Rng, radius: number): string {
  const points: [number, number][] = [];
  const count = 7;
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2;
    const rr = radius * (0.72 + rng() * 0.42);
    points.push([Math.cos(a) * rr, Math.sin(a) * rr * 0.9]);
  }
  const mid = (i: number) => {
    const p = points[i % count];
    const q = points[(i + 1) % count];
    return [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
  };
  const start = mid(0);
  let d = `M${n(start[0])} ${n(start[1])}`;
  for (let i = 1; i <= count; i++) {
    const p = points[i % count];
    const m = mid(i);
    d += ` Q${n(p[0])} ${n(p[1])} ${n(m[0])} ${n(m[1])}`;
  }
  return `${d}Z`;
}

interface Spot {
  x: number;
  y: number;
  rot: number;
  s: number;
}

function scatter(rng: Rng, count: number, side: Side, minDist: number): Spot[] {
  const spots: Spot[] = [];
  let guard = 0;
  while (spots.length < count && guard < 700) {
    guard += 1;
    const ang = rng() * Math.PI * 2;
    const rad = 6 + Math.sqrt(rng()) * 52;
    const x = Math.cos(ang) * rad;
    const y = Math.sin(ang) * rad;
    if (side === 'left' && x > -1) continue;
    if (side === 'right' && x < 1) continue;
    if (spots.some((p) => (p.x - x) ** 2 + (p.y - y) ** 2 < minDist ** 2)) continue;
    spots.push({ x, y, rot: (rng() - 0.5) * 70, s: 0.82 + rng() * 0.36 });
  }
  return spots;
}

function minDist(shape: string): number {
  if (shape === 'shaving' || shape === 'dot') return 7;
  if (shape === 'coin' || shape === 'olive' || shape === 'cherry') return 11;
  if (shape === 'ribbon') return 16;
  return 13;
}

function shapeMarkup(shape: string, color: string, rng: Rng): string {
  const fill = safeColor(color);
  if (shape === 'olive') {
    return `<ellipse rx="7" ry="5.2" fill="#1a1412"/><ellipse rx="6.2" ry="4.6" fill="${fill}"/><ellipse rx="5.2" ry="3.6" fill="#3a312c"/><ellipse cx="-1.6" cy="-1.3" rx="2.2" ry="1.1" fill="#fff" opacity="0.28"/><ellipse rx="2.1" ry="1.55" fill="#c4483c"/><ellipse cx="-0.5" cy="-0.4" rx="0.7" ry="0.4" fill="#f3c2b4" opacity="0.8"/>`;
  }
  if (shape === 'ribbon') {
    const bend = (rng() - 0.5) * 3;
    return `<path d="M-14,${n(3 + bend)} C-8,-7 -1,-5 6,${n(bend)} C11,4 14,1 16,-2 C12,3 8,2 4,${n(1 + bend)} C-2,-2 -8,-1 -14,${n(4 + bend)} Z" fill="${fill}"/><path d="M-12,${n(2 + bend)} C-6,-4 2,-2 8,1" fill="none" stroke="#f7d2c8" stroke-width="1.4" stroke-linecap="round" opacity="0.85"/><path d="M-10,${n(4 + bend)} C-4,-1 3,0 9,3" fill="none" stroke="#a85a68" stroke-width="0.7" opacity="0.45"/>`;
  }
  if (shape === 'mushroom') {
    return `<ellipse cx="0" cy="4" rx="2.4" ry="5.2" fill="#f4e4cf"/><ellipse cx="0.4" cy="4" rx="1" ry="4" fill="#e4c9a4" opacity="0.7"/><path d="M-9,-1 C-8,-7 8,-8 9,-1 C8,3 -8,3 -9,-1 Z" fill="${fill}"/><path d="M-7,-2 C-4,-6 5,-6 7,-1" fill="none" stroke="#fff" stroke-width="1.1" opacity="0.35" stroke-linecap="round"/><ellipse cx="-3" cy="-2" rx="1.3" ry="0.8" fill="#6a432c"/><ellipse cx="2.6" cy="-0.6" rx="1" ry="0.65" fill="#5c3a28" opacity="0.8"/><ellipse cx="0" cy="-3.2" rx="1.5" ry="0.7" fill="#6a432c" opacity="0.55"/>`;
  }
  if (shape === 'artichoke') {
    const leaf = (rot: number, shade: string) => `<ellipse rx="3.1" ry="7.4" fill="${shade}" transform="rotate(${rot})" stroke="#245c30" stroke-width="0.25"/>`;
    return `${leaf(0, fill)}${leaf(55, '#7ea84e')}${leaf(110, fill)}${leaf(170, '#5f8a38')}${leaf(230, fill)}${leaf(290, '#8fb85a')}<ellipse rx="2.4" ry="3.2" fill="#e4efb8"/><ellipse cx="-0.6" cy="-0.8" rx="1" ry="1.4" fill="#fff" opacity="0.35"/>`;
  }
  if (shape === 'cherry') {
    return `<circle r="5.6" fill="#9d1c18"/><circle r="5.1" fill="${fill}"/><circle cx="-1.7" cy="-1.8" r="1.7" fill="#fff" opacity="0.42"/><ellipse cx="1.2" cy="1.4" rx="1.6" ry="1" fill="#8d1a16" opacity="0.35"/><ellipse cx="0.2" cy="-5.4" rx="1.2" ry="1.8" fill="#2f6b38"/><path d="M0.4,-5.2 C2.2,-9 5.5,-9 6.4,-6.2" fill="none" stroke="#246b32" stroke-width="0.8" stroke-linecap="round"/>`;
  }
  if (shape === 'blue-cheese') {
    const body = blobPath(rng, 8.2);
    return `<path d="${body}" fill="#f4efe2"/><path d="${body}" fill="${fill}" opacity="0.88"/><path d="M-3,-2 C-1,0 1,2 3,1" fill="none" stroke="#6d8eab" stroke-width="1.3" stroke-linecap="round"/><path d="M-1,2 C1,3 2,1 4,2" fill="none" stroke="#8fb0c8" stroke-width="0.8"/><circle cx="-2.2" cy="-0.4" r="1.05" fill="#5f86a8"/><circle cx="2.4" cy="1.5" r="0.85" fill="#6d8eab"/><circle cx="0.2" cy="2.1" r="0.55" fill="#9ec0d4"/><ellipse cx="-1" cy="-2" rx="1.6" ry="0.7" fill="#fff" opacity="0.35"/>`;
  }
  if (shape === 'coin') {
    return `<circle r="7.4" fill="#7d1e1c"/><circle r="6.5" fill="${fill}"/><circle r="5.2" fill="#e25548"/><circle cx="-2.1" cy="-1.2" r="0.85" fill="#f6d7b0"/><circle cx="1.7" cy="1.4" r="0.7" fill="#f3d2a8"/><circle cx="0.6" cy="-2.2" r="0.5" fill="#fff1dc"/><circle cx="-1.4" cy="1.8" r="0.45" fill="#f8e2cc" opacity="0.9"/><ellipse cx="-1.8" cy="-2" rx="2" ry="1" fill="#fff" opacity="0.22"/>`;
  }
  if (shape === 'shaving') {
    const rot = (rng() - 0.5) * 40;
    return `<ellipse rx="8" ry="2.1" fill="#e6c56a" transform="rotate(${n(rot)})"/><ellipse rx="6.4" ry="1.15" fill="${fill}" transform="rotate(${n(rot)})"/><ellipse rx="3.2" ry="0.45" fill="#fff6d0" opacity="0.8" transform="rotate(${n(rot)}) translate(0 -0.4)"/>`;
  }
  if (shape === 'onion') {
    return `<path d="M-9,2 a9,7.2 0 0 1 18,0" fill="#f6e4f2"/><path d="M-9,2 a9,7.2 0 0 1 18,0" fill="none" stroke="${fill}" stroke-width="2.4"/><path d="M-6,2.2 a6,4.6 0 0 1 12,0" fill="none" stroke="#c45c9a" stroke-width="1.5"/><path d="M-3.2,2.3 a3.2,2.3 0 0 1 6.4,0" fill="none" stroke="#f7e6f4" stroke-width="1.2"/><ellipse cx="-2" cy="-1" rx="2" ry="0.7" fill="#fff" opacity="0.35"/>`;
  }
  if (shape === 'chunk') {
    return `<path d="${blobPath(rng, 6.6)}" fill="#b42318"/><path d="${blobPath(rng, 6.2)}" fill="${fill}"/><ellipse cx="-1.6" cy="-1.4" rx="1.6" ry="0.9" fill="#fff" opacity="0.28"/>`;
  }
  if (shape === 'leaf') {
    return `<path d="M0,8 C6,2 5,-6 0,-8 C-5,-6 -6,2 0,8 Z" fill="${fill}"/><path d="M0,6 V-6" stroke="#245c30" stroke-width="0.6" fill="none"/>`;
  }
  if (shape === 'dot') return `<circle r="2.2" fill="${fill}"/>`;
  return `<path d="${blobPath(rng, 6)}" fill="${fill}"/>`;
}

function sauceStops(base: HalfView['base'], note: string): [string, string] {
  if (base === 'rossa') return ['#ef5a42', '#b42318'];
  if (base === 'bianca') return ['#fffaf3', '#f3e6d2'];
  if (note.toLowerCase().includes('pesto')) return ['#8fb85a', PESTO];
  if (/zucca|crema/.test(note.toLowerCase())) return ['#f0c27a', '#d0893c'];
  return ['#f6e2b8', '#e2b15c'];
}

function popWrap(inner: string, animate: boolean, delay: number): string {
  if (!animate) return `<g>${inner}</g>`;
  return `<g class="pop" style="animation-delay:${delay}ms"><g class="canopy"><path d="M-11,-20 C-6,-34 6,-34 11,-20 C6,-26 -6,-26 -11,-20 Z" fill="#ffc83d" stroke="#140e0c" stroke-width="0.45"/><path d="M-8,-20 L-1,-1 M8,-20 L1,-1 M0,-24 L0,-2" stroke="#fff6e4" stroke-width="0.35" fill="none"/></g><g class="payload">${inner}</g></g>`;
}

function placed(
  spots: Spot[],
  shape: string,
  color: string,
  rng: Rng,
  toppingId: string | null,
  side: Side,
  animate: boolean,
  part: string | null,
): string {
  return spots
    .map((spot, index) => {
      const x = 100 + spot.x;
      const y = 100 + spot.y;
      const attrs = [
        toppingId ? `data-topping="${xml(toppingId)}"` : '',
        part ? `data-part="${part}"` : '',
        `data-half="${side}"`,
        `transform="translate(${n(x)} ${n(y)}) rotate(${n(spot.rot)}) scale(${n(spot.s)})"`,
      ]
        .filter(Boolean)
        .join(' ');
      return `<g ${attrs}>${popWrap(shapeMarkup(shape, color, rng), animate, index * 42)}</g>`;
    })
    .join('');
}

function drawHalf(
  half: HalfView,
  side: Side,
  pizzaId: string,
  uid: string,
  fresh: Set<string>,
  entrance: boolean,
): string {
  const sauceRng = mulberry32(hash(`${pizzaId}:${side}:sauce`));
  const [inner, edge] = sauceStops(half.base, half.baseNote);
  const grad = `${uid}-sauce-${side}`;
  const sauce = `<circle data-sauce="${half.base}" data-half="${side}" cx="100" cy="100" r="74" fill="url(#${grad})"/>`;
  const pulp =
    half.base === 'rossa'
      ? scatter(sauceRng, 7, side, 12)
          .map(
            (p) =>
              `<circle data-part="pulp" cx="${n(100 + p.x)}" cy="${n(100 + p.y)}" r="${n(1.2 + p.s)}" fill="#8f1d16" opacity="0.28"/>`,
          )
          .join('')
      : '';
  const oil =
    half.base === 'bianca'
      ? `<path data-part="oil" d="M100,100 m-26,2 a26,22 0 1 1 18,10 a14,12 0 1 1 6,-12" fill="none" stroke="#e2b84a" stroke-width="1.7" stroke-linecap="round" opacity="0.55"/>`
      : '';
  const pestoFlecks =
    half.base === 'altro' && half.baseNote.toLowerCase().includes('pesto')
      ? scatter(sauceRng, 8, side, 10)
          .map(
            (p) =>
              `<circle cx="${n(100 + p.x)}" cy="${n(100 + p.y)}" r="${n(0.8 + p.s * 0.4)}" fill="#2f5a22" opacity="0.35"/>`,
          )
          .join('')
      : '';
  const cheese = half.toppings.some((t) => t.id === 'mozzarella')
    ? cheeseLayer(pizzaId, side, fresh.has('mozzarella') || entrance)
    : '';
  const toppings = half.toppings
    .filter((t) => t.id !== 'mozzarella')
    .map((topping) => {
      const rng = mulberry32(hash(`${pizzaId}:${side}:${topping.id}`));
      const count = COUNTS[topping.shape] ?? 6;
      const pieces = side === 'full' ? count : Math.max(2, Math.round(count * 0.55));
      const dist = minDist(topping.shape) * (side === 'full' ? 1 : 0.78);
      const spots = scatter(rng, pieces, side, dist);
      const animate = entrance || fresh.has(topping.id);
      return placed(spots, topping.shape, topping.color, rng, topping.id, side, animate, null);
    })
    .join('');
  return `<linearGradient id="${grad}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${inner}"/><stop offset="1" stop-color="${edge}"/></linearGradient><!--half-->${sauce}${pulp}${oil}${pestoFlecks}${cheese}${toppings}`;
}

function cheeseLayer(pizzaId: string, side: Side, animate: boolean): string {
  const rng = mulberry32(hash(`${pizzaId}:${side}:cheese`));
  const count = side === 'full' ? 9 : 5;
  const spots = scatter(rng, count, side, side === 'full' ? 14 : 11);
  return spots
    .map((spot, index) => {
      const body = blobPath(rng, 13 + rng() * 6);
      const gloss = blobPath(rng, 5);
      const x = 100 + spot.x;
      const y = 100 + spot.y;
      const inner = `<path d="${body}" fill="#e7c48a"/><path d="${body}" fill="#fff6e4" transform="translate(-1.1 -1.3)"/><path d="${gloss}" fill="#fff" opacity="0.55" transform="translate(-3 -3)"/><circle cx="3" cy="2" r="1.1" fill="#f3d7a4" opacity="0.8"/><circle cx="-2" cy="3" r="0.7" fill="#f6e2b8" opacity="0.9"/>`;
      return `<g data-part="cheese" data-half="${side}" transform="translate(${n(x)} ${n(y)}) rotate(${n(spot.rot)}) scale(${n(0.9 + spot.s * 0.25)})">${popWrap(inner, animate, index * 35)}</g>`;
    })
    .join('');
}

function charAndFlour(rng: Rng): string {
  let marks = '';
  for (let i = 0; i < 22; i++) {
    const a = rng() * Math.PI * 2;
    const rad = 68 + rng() * 9;
    const x = 100 + Math.cos(a) * rad;
    const y = 100 + Math.sin(a) * rad;
    const dark = rng() > 0.45;
    marks += `<ellipse cx="${n(x)}" cy="${n(y)}" rx="${n(1.1 + rng() * 2.8)}" ry="${n(0.7 + rng() * 1.3)}" fill="${dark ? '#2a140e' : '#6a3a22'}" opacity="${n(0.35 + rng() * 0.5)}" transform="rotate(${n(rng() * 180)} ${n(x)} ${n(y)})"/>`;
  }
  for (let i = 0; i < 16; i++) {
    const a = rng() * Math.PI * 2;
    const rad = 74 + rng() * 4;
    const x = 100 + Math.cos(a) * rad;
    const y = 100 + Math.sin(a) * rad;
    marks += `<circle cx="${n(x)}" cy="${n(y)}" r="${n(0.35 + rng() * 0.7)}" fill="#fff6e4" opacity="${n(0.25 + rng() * 0.45)}"/>`;
  }
  return marks;
}

function divider(rng: Rng): string {
  let d = 'M100,32';
  for (let y = 44; y <= 168; y += 12) {
    const x = 100 + (rng() - 0.5) * 2.4;
    d += ` L${n(x)} ${y}`;
  }
  return `<path data-part="cut" d="${d}" fill="none" stroke="#fff8ee" stroke-width="3" stroke-linecap="round"/><path data-part="cut" d="${d}" fill="none" stroke="#c47a32" stroke-width="1" stroke-linecap="round" opacity="0.7"/>`;
}

export function renderPizzaSvg(pizza: PizzaView, opts: RenderOpts = {}): string {
  const uid = safeId(opts.uid || pizza.id || 'draft');
  const pizzaId = pizza.id || 'draft';
  const fresh = new Set(opts.freshIds ?? []);
  const entrance = opts.entrance === true;
  const crustRng = mulberry32(hash(`${pizzaId}:crust`));
  const crust = ringPath(crustRng, 100, 100, 78, 0.03, 78);
  const marks = charAndFlour(crustRng);
  const label = xml(pizza.ariaLabel || 'Pizza');
  const a11y = opts.decorative ? 'aria-hidden="true"' : `role="img" aria-label="${label}"`;
  const sides: { side: Side; half: HalfView }[] = pizza.split
    ? [
        { side: 'left', half: pizza.left },
        { side: 'right', half: pizza.right },
      ]
    : [{ side: 'full', half: pizza.left }];
  const gradients: string[] = [];
  const layers: string[] = [];
  for (const item of sides) {
    const chunk = drawHalf(item.half, item.side, pizzaId, uid, fresh, entrance);
    const grad = chunk.split('<!--half-->');
    gradients.push(grad[0]);
    layers.push(grad[1]);
  }
  const clips = pizza.split
    ? `<clipPath id="${uid}-left"><rect x="0" y="0" width="100" height="200"/></clipPath><clipPath id="${uid}-right"><rect x="100" y="0" width="100" height="200"/></clipPath>`
    : '';
  const clipped = pizza.split
    ? `<g clip-path="url(#${uid}-pie)"><g clip-path="url(#${uid}-left)">${layers[0]}</g><g clip-path="url(#${uid}-right)">${layers[1]}</g></g>`
    : `<g clip-path="url(#${uid}-pie)">${layers[0]}</g>`;
  const cut = pizza.split ? divider(mulberry32(hash(`${pizzaId}:cut`))) : '';
  return `<svg class="pizza-svg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" ${a11y}>
    <defs>
      <radialGradient id="${uid}-crust" cx="40%" cy="36%" r="72%">
        <stop offset="0%" stop-color="#f6d7a2"/>
        <stop offset="46%" stop-color="#e09a48"/>
        <stop offset="78%" stop-color="#c56a28"/>
        <stop offset="100%" stop-color="#8a3e16"/>
      </radialGradient>
      <clipPath id="${uid}-pie"><circle cx="100" cy="100" r="66"/></clipPath>
      ${clips}
      ${gradients.join('')}
    </defs>
    <ellipse cx="100" cy="172" rx="64" ry="8" fill="#3a2418" opacity="0.16"/>
    <circle cx="100" cy="100" r="94" fill="#f7f1e8"/>
    <circle cx="100" cy="100" r="90" fill="#fffdf9" stroke="#eadfce" stroke-width="1"/>
    <path d="${crust}" fill="url(#${uid}-crust)"/>
    ${clipped}
    ${marks}
    <circle cx="100" cy="100" r="66" fill="none" stroke="#f6ddb4" stroke-width="1.4" opacity="0.8"/>
    <path d="M62,52 C78,42 96,44 108,54" fill="none" stroke="#ffe7c2" stroke-width="2.4" stroke-linecap="round" opacity="0.55"/>
    ${cut}
  </svg>`;
}
