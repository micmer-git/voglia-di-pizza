import assert from 'node:assert/strict';
import { test } from 'node:test';
import { renderPizzaSvg } from '../dist/pizza-svg.js';

const olive = { id: 'olive', shape: 'olive', color: '#2a2420' };
const mozzarella = { id: 'mozzarella', shape: 'blob', color: '#fff6e8' };
const funghi = { id: 'funghi', shape: 'mushroom', color: '#c49a6a' };

const margherita = {
  id: 'p1',
  split: false,
  left: { base: 'rossa', baseNote: '', toppings: [mozzarella, olive] },
  right: { base: 'bianca', baseNote: '', toppings: [] },
  ariaLabel: 'Pizza rossa con mozzarella e olive',
};

function places(svg, attr, value) {
  const re = new RegExp(`${attr}="${value}"[^>]*transform="([^"]+)"`, 'g');
  return [...svg.matchAll(re)].map((match) => match[1]);
}

test('la pizza è deterministica e i condimenti non si spostano', () => {
  const a = renderPizzaSvg(margherita);
  const b = renderPizzaSvg(margherita);
  assert.equal(a, b);
  assert.notEqual(a, renderPizzaSvg({ ...margherita, id: 'p2' }));

  const animated = renderPizzaSvg(margherita, { freshIds: ['olive'] });
  assert.deepEqual(places(a, 'data-topping', 'olive'), places(animated, 'data-topping', 'olive'));
  assert.deepEqual(places(a, 'data-part', 'cheese'), places(animated, 'data-part', 'cheese'));

  const withFunghi = renderPizzaSvg({
    ...margherita,
    left: { ...margherita.left, toppings: [mozzarella, olive, funghi] },
  });
  assert.deepEqual(places(a, 'data-topping', 'olive'), places(withFunghi, 'data-topping', 'olive'));
  assert.match(withFunghi, /data-topping="funghi"/);
});

test('base rossa, bianca, pesto e metà e metà', () => {
  const red = renderPizzaSvg(margherita);
  assert.match(red, /data-sauce="rossa"/);
  assert.match(red, /data-part="cheese"/);
  assert.match(red, /data-topping="olive"/);
  assert.equal(red.includes('data-part="oil"'), false);
  assert.match(red, /aria-label="Pizza rossa con mozzarella e olive"/);

  const fresh = renderPizzaSvg(margherita, { freshIds: ['olive'] });
  const oliveChunk = fresh.slice(fresh.indexOf('data-topping="olive"'));
  assert.match(oliveChunk, /class="pop"/);

  const white = renderPizzaSvg({
    ...margherita,
    left: { base: 'bianca', baseNote: '', toppings: [mozzarella] },
  });
  assert.match(white, /data-sauce="bianca"/);
  assert.match(white, /data-part="oil"/);
  assert.equal(white.includes('data-sauce="rossa"'), false);

  const marinara = renderPizzaSvg({
    ...margherita,
    left: { base: 'rossa', baseNote: '', toppings: [] },
  });
  assert.equal(marinara.includes('data-part="cheese"'), false);

  const pesto = renderPizzaSvg({
    ...margherita,
    left: { base: 'altro', baseNote: 'pesto', toppings: [mozzarella] },
  });
  assert.match(pesto, /data-sauce="altro"/);
  assert.match(pesto, /#4f7d32/);

  const split = renderPizzaSvg({
    ...margherita,
    split: true,
    right: { base: 'bianca', baseNote: '', toppings: [funghi] },
  });
  assert.match(split, /data-sauce="rossa"/);
  assert.match(split, /data-sauce="bianca"/);
  assert.match(split, /data-half="right"/);
  assert.match(split, /data-part="cut"/);
  assert.match(split, /data-topping="funghi"/);
});
