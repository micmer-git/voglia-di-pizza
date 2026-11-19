import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { after, test } from 'node:test';
import { unstable_dev } from 'wrangler';

const ORIGIN = 'https://micmer-git.github.io';

function start(name, vars) {
  return unstable_dev('src/index.ts', {
    config: 'wrangler.jsonc',
    persist: true,
    persistTo: mkdtempSync(`${tmpdir()}/gopizzago-${name}-`),
    local: true,
    ip: '127.0.0.1',
    port: 0,
    inspectorPort: 0,
    logLevel: 'error',
    vars,
    experimental: {
      disableExperimentalWarning: true,
      forceLocal: true,
      showInteractiveDevSession: false,
    },
  });
}

const vars = {
  ADMIN_PIN: 'forno-di-prova',
  ALLOWED_ORIGINS: `${ORIGIN},https://voglia-di-pizza.pages.dev,http://127.0.0.1:4321`,
  ALLOW_TEST_IP: '1',
  RATE_WRITE_LIMIT: '80',
  RATE_READ_LIMIT: '200',
  RATE_WINDOW_SEC: '600',
};

let worker;
let rateWorker;

test('flusso ospiti, pizze, spesa e forno', { concurrency: false }, async () => {
  worker = await start('main', vars);

  const health = await api('/api/health');
  assert.equal(health.status, 200);
  assert.equal(health.data.ok, true);
  assert.equal(health.headers.get('access-control-allow-origin'), ORIGIN);

  const pages = await api('/api/health', { origin: 'https://voglia-di-pizza.pages.dev' });
  assert.equal(pages.status, 200);

  const pre = await worker.fetch('/api/guests', {
    method: 'OPTIONS',
    headers: { origin: ORIGIN, 'access-control-request-method': 'POST' },
  });
  assert.equal(pre.status, 204);
  assert.match(pre.headers.get('access-control-allow-headers') ?? '', /X-Edit-Token/);
  assert.equal(pre.headers.get('access-control-allow-origin'), ORIGIN);

  const evil = await api('/api/health', { origin: 'https://evil.example' });
  assert.equal(evil.status, 403);
  assert.equal(evil.headers.get('access-control-allow-origin'), null);

  const badName = await api('/api/guests', { method: 'POST', body: { name: '   ' } });
  assert.equal(badName.status, 400);

  const badJson = await worker.fetch('/api/guests', {
    method: 'POST',
    headers: { origin: ORIGIN, 'content-type': 'application/json' },
    body: '{',
  });
  assert.equal(badJson.status, 400);

  const ings = await api('/api/ingredients');
  assert.equal(ings.status, 200);
  const pomodoro = ings.data.ingredients.find((i) => i.id === 'pomodoro');
  assert.equal(pomodoro.name, 'Pomodoro');
  assert.equal(pomodoro.role, 'base-rossa');
  assert.equal(ings.data.ingredients.filter((i) => i.role === 'topping').length, 10);

  const created = await api('/api/guests', { method: 'POST', body: { name: 'Giulia' } });
  assert.equal(created.status, 201);
  const token = created.data.editToken;
  assert.match(token, /^[a-f0-9]{48}$/);

  const marco = await api('/api/guests', { method: 'POST', body: { name: 'Marco' } });
  assert.equal(marco.status, 201);

  const nic = await api('/api/guests', { method: 'POST', body: { name: 'Niccolò' } });
  assert.equal(nic.status, 201);
  assert.equal(nic.data.guest.name, 'Niccolò');

  const me = await api('/api/me', { token });
  assert.equal(me.status, 200);
  assert.equal(me.data.guest.name, 'Giulia');
  assert.deepEqual(me.data.pizzas, []);

  const stranger = await api('/api/me', { token: 'a'.repeat(48) });
  assert.equal(stranger.status, 401);

  const noNote = await api('/api/me/pizzas', {
    method: 'POST',
    token,
    body: pizza({ base: 'altro', baseNote: '', toppings: ['mozzarella'] }),
  });
  assert.equal(noNote.status, 400);

  const margherita = await api('/api/me/pizzas', {
    method: 'POST',
    token,
    body: pizza({ label: 'Margherita', base: 'rossa', toppings: ['mozzarella'], preset: 'margherita' }),
  });
  assert.equal(margherita.status, 201);
  assert.equal(margherita.data.pizza.left.base, 'rossa');

  const bianca = await api('/api/me/pizzas', {
    method: 'POST',
    token,
    body: pizza({
      label: '4 formaggi',
      base: 'bianca',
      toppings: ['mozzarella', 'gorgonzola', 'grana'],
      preset: 'quattro',
    }),
  });
  assert.equal(bianca.status, 201);

  const split = await api('/api/me/pizzas', {
    method: 'POST',
    token,
    body: {
      label: 'Metà e metà',
      split: true,
      notes: '',
      preset: null,
      left: { base: 'rossa', baseNote: '', toppingIds: ['mozzarella', 'salamino'] },
      right: { base: 'bianca', baseNote: '', toppingIds: ['mozzarella', 'funghi', 'cipolle'] },
    },
  });
  assert.equal(split.status, 201);
  const splitId = split.data.pizza.id;

  const edited = await api(`/api/me/pizzas/${splitId}`, {
    method: 'PUT',
    token,
    body: {
      id: splitId,
      label: 'Senza cipolla',
      split: true,
      notes: 'come sopra ma senza cipolla',
      preset: null,
      left: { base: 'rossa', baseNote: '', toppingIds: ['mozzarella', 'salamino'] },
      right: { base: 'bianca', baseNote: '', toppingIds: ['mozzarella', 'funghi'] },
    },
  });
  assert.equal(edited.status, 200);
  assert.deepEqual(edited.data.pizza.right.toppingIds, ['mozzarella', 'funghi']);

  const unknownTop = await api('/api/me/pizzas', {
    method: 'POST',
    token,
    body: pizza({ toppings: ['mozzarella', 'tartufo'] }),
  });
  assert.equal(unknownTop.status, 400);

  const noPin = await api('/api/admin/overview');
  assert.equal(noPin.status, 401);
  const badPin = await api('/api/admin/overview', { pin: 'sbagliato' });
  assert.equal(badPin.status, 401);

  const publicOrders = await api('/api/orders', { pin: '' });
  assert.equal(publicOrders.status, 200);
  assert.match(publicOrders.data.shopping.text, /Mozzarella — 3 pizze · circa 300 g/);

  const dash = await api('/api/admin/overview', { pin: 'forno-di-prova' });
  assert.equal(dash.status, 200);
  assert.equal(dash.data.shopping.pizzaCount, 3);
  assert.equal(dash.data.shopping.guestCount, 3);
  const text = dash.data.shopping.text;
  assert.match(text, /3 persone · 3 pizze/);
  assert.match(text, /Pomodoro — 2 pizze · circa 120 g/);
  assert.match(text, /Mozzarella — 3 pizze · circa 300 g/);
  assert.match(text, /Salamino — 1 pizza · circa 20 g/);
  assert.match(text, /Funghi porcini — 1 pizza · circa 20 g/);
  assert.match(text, /Zola — 1 pizza · circa 40 g/);
  assert.match(text, /Grana — 1 pizza · circa 15 g/);
  assert.match(text, /Base bianca — 1,5 pizze · olio extravergine, a occhio/);
  assert.match(text, /come sopra ma senza cipolla/);
  assert.doesNotMatch(text, /Cipolle/);
  assert.equal(dash.data.guests.find((g) => g.name === 'Giulia').pizzas.length, 3);
  assert.equal('editToken' in dash.data.guests[0], false);

  const pesto = await api('/api/me/pizzas', {
    method: 'POST',
    token,
    body: pizza({
      label: 'Pesto',
      base: 'altro',
      baseNote: 'pesto',
      toppings: ['mozzarella', 'pomodorini'],
    }),
  });
  assert.equal(pesto.status, 201);
  const dash2 = await api('/api/admin/overview', { pin: 'forno-di-prova' });
  assert.match(dash2.data.shopping.text, /Base pesto — 1 pizza · circa 40 g/);

  let guard = 0;
  while (guard < 8) {
    guard += 1;
    const extra = await api('/api/me/pizzas', {
      method: 'POST',
      token,
      body: pizza({ label: `Extra ${guard}`, toppings: ['olive'] }),
    });
    if (extra.status === 400) {
      assert.match(extra.data.error, /8 pizze/);
      break;
    }
    assert.equal(extra.status, 201);
  }
  assert.ok(guard < 8, 'doveva fermarsi al tetto di 8 pizze');

  const removed = await api(`/api/me/pizzas/${margherita.data.pizza.id}`, { method: 'DELETE', token });
  assert.equal(removed.status, 200);
  const stolen = await api(`/api/me/pizzas/${bianca.data.pizza.id}`, {
    method: 'DELETE',
    token: marco.data.editToken,
  });
  assert.equal(stolen.status, 404);

  const basil = await api('/api/admin/ingredients', {
    method: 'POST',
    pin: 'forno-di-prova',
    body: {
      name: 'Basilico',
      unit: 'pezzi',
      qtyPerPizza: 4,
      shape: 'leaf',
      color: '#2f7d46',
      role: 'topping',
      active: true,
    },
  });
  assert.equal(basil.status, 201);
  assert.equal(basil.data.ingredient.id, 'basilico');

  const hidden = await api('/api/admin/ingredients/basilico', {
    method: 'PUT',
    pin: 'forno-di-prova',
    body: { ...basil.data.ingredient, active: false },
  });
  assert.equal(hidden.status, 200);
  assert.equal(hidden.data.ingredient.active, false);

  const withBasil = await api('/api/me/pizzas', {
    method: 'POST',
    token: marco.data.editToken,
    body: pizza({ toppings: ['basilico'] }),
  });
  assert.equal(withBasil.status, 400);

  const renamed = await api('/api/me', { method: 'PUT', token, body: { name: 'Giulia R.' } });
  assert.equal(renamed.status, 200);
  assert.equal(renamed.data.guest.name, 'Giulia R.');

  const del = await api(`/api/admin/guests/${marco.data.guest.id}`, {
    method: 'DELETE',
    pin: 'forno-di-prova',
  });
  assert.equal(del.status, 200);
  const afterDel = await api('/api/me', { token: marco.data.editToken });
  assert.equal(afterDel.status, 401);

  const ghost = await api('/api/guests', { method: 'POST', body: { name: 'TEST agente' } });
  assert.equal(ghost.status, 201);
  const cleaned = await api('/api/orders');
  assert.equal(cleaned.status, 200);
  assert.equal(cleaned.data.guests.some((guest) => guest.name === 'TEST agente'), false);
});

test('rate limit sulle scritture', { concurrency: false }, async () => {
  rateWorker = await start('rate', { ...vars, RATE_WRITE_LIMIT: '3' });
  for (let i = 0; i < 3; i++) {
    const res = await api('/api/guests', { method: 'POST', body: { name: `Ospite ${i}` }, worker: rateWorker, ip: '203.0.113.9' });
    assert.equal(res.status, 201);
  }
  const blocked = await api('/api/guests', {
    method: 'POST',
    body: { name: 'Di troppo' },
    worker: rateWorker,
    ip: '203.0.113.9',
  });
  assert.equal(blocked.status, 429);
  const other = await api('/api/guests', {
    method: 'POST',
    body: { name: 'Altro indirizzo' },
    worker: rateWorker,
    ip: '203.0.113.10',
  });
  assert.equal(other.status, 201);
});

after(async () => {
  await worker?.stop();
  await rateWorker?.stop();
});

function pizza({ label = '', base = 'rossa', baseNote = '', toppings = [], preset = null } = {}) {
  return {
    label,
    split: false,
    notes: '',
    preset,
    left: { base, baseNote, toppingIds: toppings },
    right: { base: 'rossa', baseNote: '', toppingIds: [] },
  };
}

async function api(path, { method = 'GET', body, token, pin, origin = ORIGIN, ip, worker: target = worker } = {}) {
  const headers = {};
  if (origin) headers.origin = origin;
  if (body !== undefined) headers['content-type'] = 'application/json';
  if (token) headers['x-edit-token'] = token;
  if (pin) headers['x-admin-pin'] = pin;
  if (ip) headers['x-test-ip'] = ip;
  const res = await target.fetch(path, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text };
  }
  return { status: res.status, data, headers: res.headers };
}
