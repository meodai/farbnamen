import { readFile, writeFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const read = file => readFile(new URL(file, root), 'utf8');

const colorList = JSON.parse(await read('colors.json'));
const svgTpl = await read('scripts/template.svg.tpl');
const htmlTpl = await read('scripts/template.html.tpl');

console.log(`Generating SVG image with ${colorList.length} colors`);

const svgItems = colorList
  .map((c, i) => `<text x="40" y="${20 + (i + 1) * 70}" fill="${c.hex}">${c.name.replace(/&/g, '&amp;')}</text>`)
  .join('');

const htmlItems = colorList
  .map(c => `<div><a href="${c.link}" style="color: ${c.hex};">${c.name}</a></div>`)
  .join('');

await writeFile(
  new URL('colors.svg', root),
  svgTpl.replace(/{height}/g, colorList.length * 70 + 80).replace(/{items}/g, svgItems),
);
await writeFile(new URL('colors.html', root), htmlTpl.replace(/{items}/g, htmlItems));
