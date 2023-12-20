import fs from 'fs';
import path from 'path';
import puppeteer from 'puppeteer';
import { formatHex, converter } from 'culori';
const userColors = JSON.parse( 
  fs.readFileSync(path.normalize('src/userCreations.json'), 'utf8') 
).colors;

const ralColors = await fetch('https://api.color.pizza/v1/?list=ral').then(r => r.json());

const ralColorsInGerman = ralColors.colors.map(c => {return {
  name: c.meta.german,
  hex: c.hex,
  link: '',
}});

const rgbconv = converter('rgb');

// maybe add https://www.farbenonlineshop.de/collections/edelmineral-silikatfarbe
const pages = [
  {
    name: 'Wikipedia Farbkreis',
    sources: [
      'https://de.wikipedia.org/wiki/Liste_der_Farben_im_Farbkreis',
    ],
    parentSelector: 'body',
    fn: _ => {
      const colorList = [];
      const colorTable = document.querySelector('.wikitable.sortable');
      const colorRows = colorTable.querySelectorAll('tbody tr');

      for (let y = 0; y < colorRows.length; y++) {
        const colorRow = colorRows[y];

        const $label = colorRow.querySelector('td:nth-child(2)');
        const $link = $label.querySelector('a');

        let link, name;

        if ($link) {
          name = $link.innerHTML.trim();
          link = $link.getAttribute('href');
        } else {
          name = $label.innerHTML.trim();
          link = 'https://de.wikipedia.org/wiki/Liste_der_Farben_im_Farbkreis';
        }

        const $colorSample = colorRow.querySelector('td:nth-child(3)');

        const hex = $colorSample.style.backgroundColor;
        
        if (link && !link.startsWith('http')) {
            link = 'https://de.wikipedia.org/' + link;
        }

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
      const colorTable = document.querySelector('table')
      const colorRows = colorTable.querySelectorAll('tbody tr:not(:first-child)');
      for (let y = 0; y < colorRows.length; y++) {
        const colorRow = colorRows[y];
        const name = colorRow.querySelector('td:nth-child(4)').innerHTML.trim();
        const hex = colorRow.querySelector('td:nth-child(3)').innerHTML.trim();
        const link = 'https://bfw.ac.at/020/farbtabelle.html';
        colorList.push({
          name, hex, link,
        });
      }

      return colorList;
    }
  }
];

let colors = [...ralColorsInGerman];

userColors.forEach(color => {
  colors.push({
    name: color.name,
    hex: color.hex,
    link: color.hasOwnProperty('link') ? color.link :
    `https://github.com/meodai/farbnamen/#authors-${color.author}`,
  })  
});

(async () => {
  const browser = await puppeteer.launch();
  
  for (let j = 0; j < pages.length; j++) {
    for (let i = 0; i < pages[j].sources.length; i++) {
      const page = await browser.newPage();
      console.log(`visiting ${pages[j].sources[i]}`);
      if (Object.keys(pages[j]).includes('parentSelector')) {
        await page.waitForSelector(pages[j].parentSelector);
      } else {
        await page.waitForSelector('body');
      }
      await page.goto(pages[j].sources[i]);
      

      const colorList = await page.evaluate(pages[j].fn);
      colors = colors.concat(colorList);
    }
  }

  await browser.close();

  // data sanitization
  
  colors.forEach(c => {
    // Make the first latter of the whole string uppercase
    // https://dict.leo.org/grammatik/deutsch/Rechtschreibung/Regeln/Gross-klein/Titel.xml?lang=de
    c.name = c.name.charAt(0).toUpperCase() + c.name.slice(1);

    // remove double quotes from name
    c.name = c.name.replace(/"/g, '');
  });


  // sanitize hex values and names
  colors.forEach(c => {
    // remove parentheses and its contents from name
    c.name = c.name.replace(/\(.*\)/, '').trim();
    c.hex = formatHex(c.hex);
    if (!c.hex) {
      console.warn(`invalid hex: ${c.name} (${c.link})`);
    }
  });

  // remove duplicate names from colors list
  // while keeping the first occurence
  colors = colors.filter((c, i) => {
    const referenceName = c.name.toLowerCase().replace(/-/g, ' ').replace(/Œ/ig, 'oe').replace(/ß/ig, 'ss');
    const index = colors.findIndex(
      c => c.name.toLowerCase()
                 .replace(/-/g, ' ')
                 .replace(/Œ/ig, 'oe')
                  .replace(/ß/ig, 'ss')
                 .localeCompare(
                    referenceName
                  ) === 0
    );
    if (index === i) {
      return true;
    }
    return false;
  });

  // sort colors by name
  colors.sort((a, b) => {
    if (a.name < b.name) {
      return -1;
    }
    if (a.name > b.name) {
      return 1;
    }
    return 0;
  });

  // find duplicate hex values and warn about them
  const hexes = colors.map(c => c.hex);
  const duplicates = hexes.filter((h, i) => hexes.indexOf(h) !== i);
  if (duplicates.length > 0) {
    console.warn('found some duplicate hex values:');
    duplicates.forEach(d => {
      const dupes = colors.filter(c => c.hex === d);
      console.warn(`duplicate hex: ${d} (${dupes.map(c => c.name).join(', ')})`);
      // shift each subsequent duplicate color value by 1
      for (let i = 1; i < dupes.length; i++) {
        dupes[i].hex = shiftColor(dupes[i].hex, (1/255) * i);
      }
    });
  }
  // will probably need to do this recursively
  console.warn('Shifted all the color values a bit to make each color unique');

  function shiftColor(hex, shift) {
    const rgb = rgbconv(hex);
    rgb.r = rgb.r + shift;
    rgb.g = rgb.g + shift;
    rgb.b = rgb.b + shift;
    
    if (rgb.r > 1) {
      rgb.r = 2 - rgb.r;
    }
    if (rgb.g > 1) {
      rgb.g = 2 - rgb.g;
    }
    if (rgb.b > 1) {
      rgb.b = 2 - rgb.b;
    }

    return formatHex(rgb);
  }


  // update color count in readme.md
  // gets SVG template
  let mdTpl = fs.readFileSync(
    './readme.md',
    'utf8'
  ).toString();

  mdTpl = mdTpl.replace(/\(\*{2}(\d+)\*{2}\)/gm, `(**${colors.length}**)`);

  fs.writeFileSync(
    './readme.md',
    mdTpl
  );

  // create a csv file with the colors
  const csv = 'name,hex,link\n' + colors.map(c => `${c.name},${c.hex},${c.link}`).join('\n');
  
  fs.writeFileSync('./colors.csv', csv);
  fs.writeFileSync('./colors.min.json', JSON.stringify(colors));
  fs.writeFileSync('./colors.json', JSON.stringify(colors, null, 2));
})().catch(e => console.log(e));