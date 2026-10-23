// 사용법: node src/build.mjs [--size A4|A5] [--only <card-id>]
import { mkdirSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright-core';
import { PDFDocument } from 'pdf-lib';
import { ROOT, loadCards, readArt } from './cards.mjs';
import { documentHtml, SIZES } from './render.mjs';

const arg = (name, def) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : def;
};
const size = arg('size', 'A4');
const only = arg('only');
if (!SIZES[size]) throw new Error(`--size 는 ${Object.keys(SIZES).join('/')} 중 하나예요`);

const { cards, errors, warnings } = loadCards();
warnings.forEach((w) => console.warn(`⚠️  ${w}`));
if (errors.length) {
  errors.forEach((e) => console.error(`❌ ${e}`));
  process.exit(1);
}

/** 설치된 Chromium을 찾아요 (CHROMIUM_PATH > playwright 기본 > /opt/pw-browsers 안의 chrome) */
function launchOptions() {
  if (process.env.CHROMIUM_PATH) return { executablePath: process.env.CHROMIUM_PATH };
  const base = process.env.PLAYWRIGHT_BROWSERS_PATH;
  if (base && existsSync(base)) {
    const dir = readdirSync(base).find((d) => /^chromium-\d+$/.test(d));
    const exe = dir && join(base, dir, 'chrome-linux', 'chrome');
    if (exe && existsSync(exe)) return { executablePath: exe };
  }
  return {};
}

const out = join(ROOT, 'output', size);
const htmlDir = join(ROOT, 'build', 'html');
for (const d of ['cards', 'weekly', 'monthly']) mkdirSync(join(out, d), { recursive: true });
mkdirSync(htmlDir, { recursive: true });
const fontsBase = '../../node_modules/@fontsource';

const browser = await chromium.launch(launchOptions());
const page = await browser.newPage();

async function renderPdf(name, list) {
  const file = join(htmlDir, `${name}.html`);
  writeFileSync(file, documentHtml(list, readArt, { size, fontsBase }));
  await page.goto(pathToFileURL(file).href);
  await page.evaluate(() => document.fonts.ready);
  // 내용이 한 페이지를 넘치면 잘려 인쇄되므로 빌드를 멈춰요
  const overflowed = await page.evaluate(() =>
    [...document.querySelectorAll('.page')].flatMap((p, i) =>
      p.scrollHeight > p.clientHeight + 1 ? [i + 1] : [],
    ),
  );
  if (overflowed.length) {
    throw new Error(`${name}: ${overflowed.join(', ')}번째 페이지 내용이 넘쳐요. 문장을 줄이거나 디자인 토큰(글자 크기)을 조절해 주세요`);
  }
  return page.pdf({ preferCSSPageSize: true, printBackground: true });
}

async function merge(buffers) {
  const doc = await PDFDocument.create();
  for (const b of buffers) {
    const src = await PDFDocument.load(b);
    (await doc.copyPages(src, src.getPageIndices())).forEach((p) => doc.addPage(p));
  }
  return doc.save();
}

const target = only ? cards.filter((c) => c.id === only) : cards;
if (!target.length) throw new Error(`카드를 찾지 못했어요: ${only}`);

// 1) 카드 1장 PDF (앞면+뒷면 2페이지)
const pdfOf = new Map();
for (const c of target) {
  const buf = await renderPdf(c.id, [c]);
  pdfOf.set(c.id, buf);
  writeFileSync(join(out, 'cards', `${c.id}.pdf`), buf);
  console.log(`카드  ${c.id}.pdf`);
}
await browser.close();

if (!only) {
  // 2) 주간 묶음 (week 별, 요일 순) / 3) 월간 묶음 (4주 = 1개월)
  const group = (keyOf) => {
    const m = new Map();
    for (const c of cards) m.set(keyOf(c), [...(m.get(keyOf(c)) ?? []), c]);
    return m;
  };
  const pad = (n) => String(n).padStart(2, '0');
  for (const [w, list] of group((c) => c.week)) {
    writeFileSync(join(out, 'weekly', `week-${pad(w)}.pdf`), await merge(list.map((c) => pdfOf.get(c.id))));
    console.log(`주간  week-${pad(w)}.pdf  (${list.length}/5장)`);
  }
  for (const [m, list] of group((c) => Math.ceil(c.week / 4))) {
    writeFileSync(join(out, 'monthly', `month-${pad(m)}.pdf`), await merge(list.map((c) => pdfOf.get(c.id))));
    console.log(`월간  month-${pad(m)}.pdf  (${list.length}/20장)`);
  }
}
console.log(`\n완료 → output/${size}/`);
