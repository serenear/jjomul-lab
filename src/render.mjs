import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from './cards.mjs';

// 한 장을 앞면·뒷면 2페이지로 그려요. rem 기준이라 용지 크기는 html font-size 배율로만 바뀌어요.
export const SIZES = {
  A4: { w: '210mm', h: '297mm', fontPt: 10 },
  A5: { w: '148mm', h: '210mm', fontPt: 7.07 },
};

const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const read = (...p) => readFileSync(join(ROOT, ...p), 'utf8');

export const BRAND = { name: '쪼물랩', en: 'Jjomul Lab' };

function chips(card) {
  return `<div class="chips">
    <span class="chip">${esc(card.weekday)}요일 · ${esc(card.theme)}</span>
    <span class="chip">${esc(card.age_band.replace('-', '~'))}개월</span>
    <span class="brand">${esc(BRAND.name)}</span>
  </div>`;
}

export function frontPage(card, artSvg) {
  return `<section class="page front" data-weekday="${esc(card.weekday)}">
    ${chips(card)}
    <div class="art">${artSvg}</div>
    <div class="front-foot">
      <h1>${esc(card.title)}</h1>
      ${card.front_caption ? `<p>${esc(card.front_caption)}</p>` : ''}
    </div>
  </section>`;
}

export function backPage(card) {
  const li = (arr) => arr.map((x) => `<li>${esc(x)}</li>`).join('');
  return `<section class="page back" data-weekday="${esc(card.weekday)}">
    ${chips(card)}
    <h1>${esc(card.title)}</h1>
    <p class="time">약 ${card.duration_min}분 · 10~20분 안에서 편하게, 원하면 반복해도 좋아요</p>

    <div class="box"><h2>준비물</h2><ul class="dots">${li(card.materials)}</ul></div>

    <div class="plain"><h2>놀이 순서</h2>
      <ol class="steps">${card.steps
        .map((s, i) => `<li><span class="n">${i + 1}</span><span class="t">${esc(s)}</span></li>`)
        .join('')}</ol>
    </div>

    <div class="plain"><h2>이렇게 말 걸어 보세요</h2>
      <div class="talk">${card.talk_examples.map((t) => `<span class="bubble">${esc(t)}</span>`).join('')}</div>
    </div>

    <div class="two">
      <div class="box hand"><h2>손이 경험하는 것</h2><p>${esc(card.hand_experience)}</p></div>
      <div class="safety"><h2>안전 체크</h2><ul>${li(card.safety)}</ul></div>
    </div>

    <div class="back-foot">
      <span class="note">아이마다 속도가 달라요. 오늘은 한 번 만져보는 것만으로도 충분해요.</span>
      <span>${esc(BRAND.name)} · ${esc(card.id)}</span>
    </div>
  </section>`;
}

/**
 * 완성된 HTML 문서. fontsBase는 node_modules/@fontsource 를 가리키는 URL 접두어예요.
 * extraHead/extraBody는 뷰어가 워터마크·보호 스크립트를 끼워 넣을 때 써요.
 */
export function documentHtml(cards, artOf, { size = 'A4', fontsBase, extraHead = '', extraBody = '' }) {
  const s = SIZES[size];
  const css = `${read('design', 'tokens.css')}\n${read('design', 'card.css')}`;
  const fonts = ['gowun-dodum/400.css', 'noto-sans-kr/400.css', 'noto-sans-kr/700.css']
    .map((f) => `<link rel="stylesheet" href="${fontsBase}/${f}">`)
    .join('\n');
  const pages = cards.map((c) => frontPage(c, artOf(c)) + backPage(c)).join('\n');
  return `<!doctype html>
<html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(BRAND.name)}</title>
${fonts}
<style>
@page { size: ${s.w} ${s.h}; margin: 0; }
html { font-size: ${s.fontPt}pt; --page-w: ${s.w}; --page-h: ${s.h}; }
${css}
</style>${extraHead}</head>
<body>${pages}${extraBody}</body></html>`;
}
