import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = file => readFile(new URL(`../${file}`, import.meta.url), 'utf8');
const colors = JSON.parse(await read('colors.json'));

test('every color has a name, a valid hex and a link', () => {
  for (const c of colors) {
    assert.ok(c.name, JSON.stringify(c));
    assert.match(c.hex, /^#[0-9a-f]{6}$/, c.name);
    assert.ok(c.link, c.name);
  }
});

test('names start with an uppercase letter', () => {
  for (const c of colors) assert.match(c.name, /^\p{Lu}/u, c.name);
});

test('names are not enumerations or codes', () => {
  for (const c of colors) {
    assert.doesNotMatch(c.name, /\s\d+$|(?<!\p{L})RAL \d/iu);
  }
});

test('names are unique', () => {
  const names = colors.map(c => c.name.toLowerCase().replace(/ß/g, 'ss'));
  assert.equal(new Set(names).size, names.length);
});

test('hex values are unique', () => {
  const hexes = colors.map(c => c.hex);
  assert.equal(new Set(hexes).size, hexes.length);
});

test('user creations keep their hex values', async () => {
  const { colors: userColors } = JSON.parse(await read('src/userCreations.json'));
  const byName = new Map(colors.map(c => [c.name.toLowerCase(), c]));
  const seen = new Set();
  for (const u of userColors.filter(c => c.hex)) {
    const key = u.name.toLowerCase();
    // when two user creations share a name, the first one wins
    if (seen.has(key)) continue;
    seen.add(key);
    assert.equal(byName.get(key)?.hex, u.hex.toLowerCase(), u.name);
  }
});

test('archived Alpina colors are kept', async () => {
  const { colors: archive } = JSON.parse(await read('src/alpina-archive.json'));
  const names = new Set(colors.map(c => c.name));
  for (const c of archive) assert.ok(names.has(c.name), c.name);
});

test('minified json and csv match colors.json', async () => {
  assert.deepEqual(JSON.parse(await read('colors.min.json')), colors);
  assert.equal((await read('colors.csv')).trim().split('\n').length, colors.length + 1);
});

test('readme count matches', async () => {
  assert.match(await read('README.md'), new RegExp(`\\(\\*\\*${colors.length}\\*\\*\\)`));
});
