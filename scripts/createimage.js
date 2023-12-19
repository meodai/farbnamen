import fs from 'fs';
import path from 'path';

const colorList = JSON.parse(fs.readFileSync(
  path.normalize('colors.json'),
  'utf8'
));
// get SVG template
const svgTpl = fs.readFileSync(
  path.normalize('./scripts/template.svg.tpl'),
  'utf8'
).toString();

const htmlTpl = fs.readFileSync(
  path.normalize('./scripts/template.html.tpl'),
  'utf8'
).toString();

// generates an SVG image with the new color based on the diff ot the last commit to the current
function diffSVG() {
  const svgTxtStr = colorList.reduce((str, c, i) => {
    return `${str}<text x="40" y="${20 + (i + 1) * 70}" fill="${c.hex}">${c.name.replace(/&/g, '&amp;')}</text>`;
  }, '');

  const htmlColorEntries = colorList.reduce((str, c, i) => {
    return `${str}<div><a href="${c.link}" style="color: ${c.hex};">${c.name}</a></div>`;
  }, '');

  fs.writeFileSync(
    path.normalize(`./colors.svg`),
    svgTpl.replace(/{height}/g, colorList.length * 70 + 80)
    .replace(/{items}/g, svgTxtStr)
  );

  fs.writeFileSync(
    path.normalize(`./colors.html`),
    htmlTpl.replace(/{items}/g, htmlColorEntries)
  );
};

console.log(`Generating SVG image with ${colorList.length} colors`);

diffSVG();
