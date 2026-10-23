// 화면용 부모 가이드 (휴대폰에서 읽기 좋게, px 단위)
import { BAND_LABEL } from '../content/schema.mjs';
import { esc } from './html.mjs';

export const GUIDE_CSS = `
.g{display:flex;flex-direction:column;gap:14px}
.g h3{font:400 19px/1.3 var(--font-display);color:var(--accent);margin:0 0 6px}
.g .g-box{background:var(--accent-soft);border-radius:16px;padding:14px 16px}
.g .g-line{border:2px solid var(--accent-bar);border-radius:16px;padding:14px 16px}
.g ul,.g ol{margin:0;padding-left:20px}.g li{margin:2px 0}
.g ol li::marker{color:var(--accent);font-weight:700}
.g .g-talk{display:flex;flex-wrap:wrap;gap:8px}
.g .g-talk span{background:var(--accent-soft);padding:6px 12px;border-radius:14px 14px 14px 3px}
.g .g-meta{color:var(--ink-soft);font-size:14px}
.g .g-note{font-family:var(--font-display);color:var(--ink-soft);text-align:center;margin-top:4px}`;

export function guideHtml(card, band) {
  const v = card.versions[band];
  const li = (arr) => arr.map((x) => `<li>${esc(x)}</li>`).join('');
  return `<div class="g" data-cat="${esc(card.category)}">
<p class="g-meta">${esc(card.category)} · ${esc(BAND_LABEL[band])} · 약 ${v.duration_min}분 (10~20분 안에서 편하게, 원하면 반복해도 좋아요)</p>
<div class="g-box"><h3>준비물</h3><ul>${li(v.materials)}</ul></div>
<div><h3>놀이 순서</h3><ol>${li(v.steps)}</ol></div>
<div><h3>이렇게 말 걸어 보세요</h3><div class="g-talk">${v.talk_examples.map((t) => `<span>${esc(t)}</span>`).join('')}</div></div>
<div class="g-box"><h3>손이 경험하는 것</h3><p style="margin:0">${esc(v.hand_experience)}</p></div>
<div class="g-line"><h3>안전 체크</h3><ul>${li(v.safety)}</ul></div>
<p class="g-note">아이마다 속도가 달라요. 오늘은 한 번 만져보는 것만으로도 충분해요.</p>
</div>`;
}
