// 인쇄 시트: 콘텐츠 1개(한 연령 구간) = A4 1장
import { BAND_LABEL } from '../content/schema.mjs';
import { BRAND, esc, fontLinks } from './html.mjs';

export const SIZES = {
  A4: { w: '210mm', h: '297mm', fontPt: 10 },
  A5: { w: '148mm', h: '210mm', fontPt: 7.07 },
};
const NOTE = '아이마다 속도가 달라요. 오늘은 한 번 만져보는 것만으로도 충분해요.';
const li = (arr) => arr.map((x) => `<li>${esc(x)}</li>`).join('');
const steps = (arr) =>
  `<ol class="steps">${arr.map((s, i) => `<li><span class="n">${i + 1}</span><span class="t">${esc(s)}</span></li>`).join('')}</ol>`;

function chips(card, band) {
  return `<div class="chips"><span class="chip">${esc(card.category)}</span><span class="chip">${esc(BAND_LABEL[band])}</span><span class="brand">${esc(BRAND.name)}</span></div>`;
}
const foot = (card, band, stamp) =>
  `<div class="foot"><span class="note">${NOTE}</span><span>${esc(BRAND.name)} · ${esc(card.id)}-${band}${stamp ? ` · ${esc(stamp)}` : ''}</span></div>`;

function artBox(v, art, artMode) {
  if (!v.art_done || artMode === 'blank') return `<div class="art">${art[v.art]}</div>`;
  if (artMode === 'done') return `<div class="art">${art[v.art_done]}</div>`;
  return `<div class="art"><div class="layer done">${art[v.art_done]}</div><div class="layer blank">${art[v.art]}</div></div>`;
}

/**
 * stamp: 인쇄물에 남는 작은 발급 표시 (예: "ID S-0001")
 * artMode: 'blank' 빈 도안 · 'done' 완성 모습 · 'both' 두 장을 겹쳐 두고 화면/인쇄에서 골라 보여요 (뷰어용)
 */
export function sheetHtml(card, band, art, { stamp = '', artMode = 'blank' } = {}) {
  const v = card.versions[band];
  const head = `<section class="sheet${v.print === 'art+guide' ? ' combo' : ''}" data-cat="${esc(card.category)}">${chips(card, band)}`;

  if (v.print === 'art') {
    return `${head}${artBox(v, art, artMode)}
<div class="caption"><h1>${esc(card.title)}</h1>${v.front_caption ? `<p>${esc(v.front_caption)}</p>` : ''}</div>
${stamp ? `<div class="foot"><span></span><span>${esc(stamp)}</span></div>` : ''}</section>`;
  }
  if (v.print === 'art+guide') {
    return `${head}<h1>${esc(card.title)}</h1>${artBox(v, art, artMode)}
<div class="mini">
  <div><div class="box"><h2>준비물</h2><ul class="dots">${li(v.materials)}</ul></div>
       <div class="plain"><h2>놀이 순서 · 약 ${v.duration_min}분</h2>${steps(v.steps)}</div></div>
  <div><div class="safety"><h2>안전 체크</h2><ul>${li(v.safety)}</ul></div>
       <div class="plain"><h2>이렇게 말 걸어 보세요</h2><div class="talk">${v.talk_examples.map((t) => `<span class="bubble">${esc(t)}</span>`).join('')}</div></div></div>
</div>${foot(card, band, stamp)}</section>`;
  }
  return `${head}<h1>${esc(card.title)}</h1>
<p class="time">약 ${v.duration_min}분 · 10~20분 안에서 편하게, 원하면 반복해도 좋아요</p>
<div class="box"><h2>준비물</h2><ul class="dots">${li(v.materials)}</ul></div>
<div class="plain"><h2>놀이 순서</h2>${steps(v.steps)}</div>
<div class="plain"><h2>이렇게 말 걸어 보세요</h2><div class="talk">${v.talk_examples.map((t) => `<span class="bubble">${esc(t)}</span>`).join('')}</div></div>
<div class="two"><div class="box hand"><h2>손이 경험하는 것</h2><p>${esc(v.hand_experience)}</p></div>
<div class="safety"><h2>안전 체크</h2><ul>${li(v.safety)}</ul></div></div>
${foot(card, band, stamp)}</section>`;
}

/** 시트용 CSS (@page 포함). 뷰어 페이지에도 그대로 끼워 넣어요. */
export function sheetCss(content, size = 'A4') {
  const s = SIZES[size];
  return `@page { size: ${s.w} ${s.h}; margin: 0; }
html { font-size: ${s.fontPt}pt; --page-w: ${s.w}; --page-h: ${s.h}; }
${content.css.tokens}
${content.css.card}`;
}

/** 시트만 있는 문서 (PDF 빌드·어드민 미리보기용) */
export function sheetDocument(items, content, { size = 'A4', fontsBase, stamp, artMode } = {}) {
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>${esc(BRAND.name)}</title>
${fontLinks(fontsBase)}<style>${sheetCss(content, size)} body{margin:0;background:#fff}</style></head>
<body>${items.map(({ card, band }) => sheetHtml(card, band, content.art, { stamp, artMode })).join('\n')}</body></html>`;
}
