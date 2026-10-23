// 인쇄 검사: 모든 콘텐츠 × 연령 버전이 A4 1장 안에 들어가는지 브라우저로 확인해요.
// 고객에게는 HTML로만 제공하므로 PDF 파일은 만들지 않아요.
// 사용법: node src/check.mjs [--only c023] [--png]
//   --png: output/previews/<id>-<구간>.png (인쇄본) · <id>-<구간>-done.png (완성 모습, 인스타 소재)
import { mkdirSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright-core';
import { ROOT, loadContent } from './content/load.mjs';
import { BANDS } from './content/schema.mjs';
import { sheetDocument } from './render/sheet.mjs';

const only = process.argv.includes('--only') ? process.argv[process.argv.indexOf('--only') + 1] : null;
const png = process.argv.includes('--png');

const { content, errors, warnings } = loadContent();
warnings.forEach((w) => console.warn(`⚠️  ${w}`));
if (errors.length) {
  errors.forEach((e) => console.error(`❌ ${e}`));
  process.exit(1);
}

/** 설치된 Chromium을 찾아요 (CHROMIUM_PATH > /opt/pw-browsers 안의 chrome > playwright 기본) */
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

const items = content.cards
  .filter((c) => c.status !== 'idea' && (!only || c.id === only))
  .flatMap((card) => BANDS.filter((b) => card.versions?.[b]).map((band) => ({ card, band })));
if (!items.length) {
  console.log('검사할 콘텐츠가 없어요 (아이디어 상태는 건너뛰어요)');
  process.exit(0);
}

const fontsBase = `file://${join(ROOT, 'node_modules', '@fontsource')}`;
const outDir = join(ROOT, 'output', 'previews');
if (png) mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch(launchOptions());
// A4(210×297mm)를 96dpi 화면 픽셀로
const page = await browser.newPage({ viewport: { width: 794, height: 1123 }, deviceScaleFactor: png ? 2 : 1 });
let failed = 0;
for (const { card, band } of items) {
  await page.setContent(sheetDocument([{ card, band }], content, { fontsBase }), { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);
  await page.emulateMedia({ media: 'print' });
  const over = await page.evaluate(() => {
    const s = document.querySelector('.sheet');
    return s.scrollHeight > s.clientHeight + 1;
  });
  const key = `${card.id}-${band}`;
  if (over) {
    failed += 1;
    console.error(`❌ ${key} ${card.title}: A4 1장을 넘쳐요. 문장을 줄이거나 print 레이아웃을 바꿔 주세요`);
  } else console.log(`✓ ${key} ${card.title}`);
  if (png) {
    await page.locator('.sheet').screenshot({ path: join(outDir, `${key}.png`) });
    if (card.versions[band].art_done) {
      await page.setContent(sheetDocument([{ card, band }], content, { fontsBase, artMode: 'done' }), { waitUntil: 'load' });
      await page.evaluate(() => document.fonts.ready);
      await page.locator('.sheet').screenshot({ path: join(outDir, `${key}-done.png`) });
    }
  }
}
await browser.close();
console.log(`\n${items.length}장 검사 — 넘침 ${failed}${png ? ' · 미리보기 → output/previews/' : ''}`);
process.exit(failed ? 1 : 0);
