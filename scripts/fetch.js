import { readFile, writeFile } from 'node:fs/promises';
import puppeteer from 'puppeteer';
import { formatHex, converter } from 'culori';

const rgbconv = converter('rgb');

// maybe add https://www.farbenonlineshop.de/collections/edelmineral-silikatfarbe

const pages = [
  {
    name: 'Wikipedia Farbkreis',
    sources: [
      'https://de.wikipedia.org/wiki/Liste_der_Farben_im_Farbkreis',
    ],
    fn: _ => {
      const colorList = [];
      const colorTable = document.querySelector('.wikitable.sortable');
      const colorRows = colorTable.querySelectorAll('tbody tr');

      for (const colorRow of colorRows) {
        const $label = colorRow.querySelector('td:nth-child(2)');
        const $link = $label.querySelector('a');

        const name = ($link ?? $label).textContent.trim();
        const link = $link ? decodeURI($link.href) : location.href;
        const hex = colorRow.querySelector('td:nth-child(3)').style.backgroundColor;

        colorList.push({
          name, hex, link,
        });
      }

      return colorList;
    }
  },
  {
    name: 'HTML Farbtabelle',
    sources: [
      'https://bfw.ac.at/020/farbtabelle.html',
    ],
    fn: _ => {
      const colorList = [];
      const colorTable = document.querySelector('table');
      const colorRows = colorTable.querySelectorAll('tbody tr:not(:first-child)');

      for (const colorRow of colorRows) {
        const name = colorRow.querySelector('td:nth-child(4)').textContent.trim();
        // the hex column has a few typos, the swatch uses the CSS color keyword
        const hex = window.getComputedStyle(
          colorRow.querySelector('td:nth-child(1)')
        ).backgroundColor;
        const link = location.href;
        colorList.push({
          name, hex, link,
        });
      }

      return colorList;
    }
  },
  {
    name: 'Alpina',
    sources: [
      // the "Farbrezepte" and "Farbenfreunde" collections are no longer listed on the website
      'https://alpina-farben.de/sortiment/pure-farben/',
    ],
    fn: _ => {
      const colorList = [];
      const colorCells = document.querySelectorAll('.color_nuance');

      for (const cell of colorCells) {
        const name = cell.querySelector('h4').textContent.trim();
        const colorSample = cell.querySelector('circle');
        const hex = colorSample.getAttribute('fill') ?? colorSample.style.fill;
        const link = location.href;
        colorList.push({
          name, hex, link,
        });
      }

      return colorList;
    }
  }
];

const userColors = JSON.parse(
  await readFile(new URL('../src/userCreations.json', import.meta.url), 'utf8'),
).colors;

const ralResponse = await fetch('https://api.color.pizza/v1/?list=ral');
if (!ralResponse.ok) throw new Error(`could not fetch the RAL colors: ${ralResponse.status}`);
const ralColors = (await ralResponse.json()).colors;

// user creations come first so they win over RAL colors with the same name,
// the ones without a hex value are still waiting for one
let colors = userColors.filter(c => c.hex).map(color => ({
  name: color.name,
  hex: color.hex,
  link: color.link ?? color.source ?? `https://github.com/meodai/farbnamen/#authors-${color.author}`,
}));

const userCreations = new Set(colors);

colors.push(...ralColors.map(c => ({
  name: c.meta.german,
  hex: c.hex,
  link: 'https://de.wikipedia.org/wiki/RAL-Farbe',
})));

const browser = await puppeteer.launch();

try {
  for (const { name, sources, fn } of pages) {
    for (const source of sources) {
      const page = await browser.newPage();
      console.log(`visiting ${source}`);
      try {
        await page.goto(source);
        const colorList = await page.evaluate(fn);
        if (!colorList.length) console.warn(`no colors found on ${source} (${name})`);
        colors.push(...colorList);
      } catch (e) {
        console.warn(`could not scrape ${source} (${name}): ${e.message}`);
      } finally {
        await page.close();
      }
    }
  }
} finally {
  await browser.close();
}

// the Alpina "Farbrezepte" and "Farbenfreunde" collections are gone from the website,
// their colors are kept as they were last published
const alpinaArchive = JSON.parse(
  await readFile(new URL('../src/alpina-archive.json', import.meta.url), 'utf8'),
).colors;
colors.push(...alpinaArchive);

// data sanitization
for (const c of colors) {
  c.name = c.name
    .normalize()
    // remove double quotes and parentheses with their contents
    .replace(/"/g, '')
    .replace(/\(.*\)/, '')
    .replace(/\s+/g, ' ')
    .trim();
  // only the first letter of the whole name is uppercased, adjectives stay lowercase
  // https://dict.leo.org/grammatik/deutsch/Rechtschreibung/Regeln/Gross-klein/Titel.xml?lang=de
  c.name = c.name.charAt(0).toLocaleUpperCase('de') + c.name.slice(1);
  c.hex = formatHex(c.hex);
  if (!c.hex) {
    console.warn(`invalid hex: ${c.name} (${c.link})`);
  }
}

colors = colors.filter(c => c.hex);

// drop numbered shades like "Telegrau 1", "Telegrau 2"…
colors = colors.filter(c => !/\s\d+$/.test(c.name));

// remove duplicate names while keeping the first occurrence
const normalizeName = name => name.toLowerCase().replace(/-/g, ' ').replace(/œ/g, 'oe').replace(/ß/g, 'ss');
const seenNames = new Set();
colors = colors.filter(c => {
  const key = normalizeName(c.name);
  if (seenNames.has(key)) return false;
  seenNames.add(key);
  return true;
});

// sort colors by name, umlauts next to their base letter
const collator = new Intl.Collator('de');
colors.sort((a, b) => collator.compare(a.name, b.name) || (a.name < b.name ? -1 : 1));

// find duplicate hex values and shift each subsequent one a bit to make each color unique
const byHex = Map.groupBy(colors, c => c.hex);
const usedHexes = new Set(byHex.keys());
for (const [hex, dupes] of byHex) {
  if (dupes.length < 2) continue;
  // user creations keep their hex, the others get shifted
  dupes.sort((a, b) => userCreations.has(b) - userCreations.has(a));
  console.warn(`duplicate hex: ${hex} (${dupes.map(c => c.name).join(', ')})`);
  for (const c of dupes.slice(1)) {
    let step = 1;
    let shifted;
    do {
      shifted = shiftColor(hex, step++ / 255);
    } while (usedHexes.has(shifted));
    c.hex = shifted;
    usedHexes.add(shifted);
  }
}

function shiftColor(hex, shift) {
  const rgb = rgbconv(hex);
  for (const channel of ['r', 'g', 'b']) {
    rgb[channel] += shift;
    if (rgb[channel] > 1) rgb[channel] = 2 - rgb[channel];
  }
  return formatHex(rgb);
}

// update color count in README.md
const readmePath = new URL('../README.md', import.meta.url);
const readme = await readFile(readmePath, 'utf8');
await writeFile(readmePath, readme.replace(/\(\*{2}(\d+)\*{2}\)/gm, `(**${colors.length}**)`));

const csvField = value => (/[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value);
const csv = 'name,hex,link\n' + colors.map(c => [c.name, c.hex, c.link].map(csvField).join(',')).join('\n');

const out = file => new URL(`../${file}`, import.meta.url);
await writeFile(out('colors.csv'), csv);
await writeFile(out('colors.min.json'), JSON.stringify(colors));
await writeFile(out('colors.json'), JSON.stringify(colors, null, 2));
