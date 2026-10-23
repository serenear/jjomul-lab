import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from '../cards.mjs';
import { BRAND } from '../render.mjs';

const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export const kst = (ms) =>
  new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(ms);

const tokens = () => readFileSync(join(ROOT, 'design', 'tokens.css'), 'utf8');

const shell = (nonce, title, body, script = '') => `<!doctype html>
<html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow"><title>${esc(title)}</title>
<link rel="stylesheet" href="/fonts/gowun-dodum/400.css"><link rel="stylesheet" href="/fonts/noto-sans-kr/400.css">
<style>${tokens()}
*{box-sizing:border-box}body{margin:0;font-family:var(--font-body);color:var(--ink);background:#fbf7f2;line-height:1.6;word-break:keep-all}
main{max-width:30rem;margin:0 auto;padding:12vh 1.25rem 3rem}
h1{font-family:var(--font-display);font-weight:400;font-size:2rem;margin:0 0 .4rem}
p.sub{color:var(--ink-soft);margin:0 0 1.5rem}
.card{background:#fff;border:1px solid var(--line);border-radius:1.25rem;padding:1.5rem}
input{width:100%;font:700 1.6rem/1 var(--font-body);letter-spacing:.2em;text-align:center;text-transform:uppercase;padding:1rem;border:2px solid var(--line);border-radius:.9rem}
input:focus{outline:3px solid #f2c777;border-color:#e9a23b}
button,.btn{display:block;width:100%;margin-top:1rem;padding:.95rem;border:0;border-radius:.9rem;background:#8a5a00;color:#fff;font:700 1.05rem var(--font-body);text-align:center;text-decoration:none;cursor:pointer}
.msg{min-height:1.5rem;margin-top:.8rem;color:#a3392f;font-weight:700}
.row{display:flex;justify-content:space-between;align-items:center;gap:1rem;padding:.9rem 0;border-top:1px solid var(--line)}.row:first-of-type{border-top:0}
.row .btn{width:auto;margin:0;padding:.6rem 1.1rem;font-size:.95rem}
small{color:var(--ink-soft)}
</style></head><body><main>${body}</main>${script ? `<script nonce="${nonce}">${script}</script>` : ''}</body></html>`;

export function loginPage(nonce, notice = '') {
  return shell(
    nonce,
    `${BRAND.name} 놀이 카드`,
    `<h1>${esc(BRAND.name)} 놀이 카드</h1>
<p class="sub">메시지로 받은 비밀번호를 입력해 주세요.</p>
<form class="card" id="f" autocomplete="off">
  <input id="code" name="code" inputmode="latin" maxlength="9" placeholder="XXXX-XXXX" aria-label="비밀번호" autofocus>
  <button type="submit">들어가기</button>
  <div class="msg" id="msg" role="alert">${esc(notice)}</div>
</form>`,
    `const f=document.getElementById('f'),c=document.getElementById('code'),m=document.getElementById('msg');
c.addEventListener('input',()=>{const v=c.value.toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,8);c.value=v.length>4?v.slice(0,4)+'-'+v.slice(4):v});
f.addEventListener('submit',async e=>{e.preventDefault();m.textContent='';
const r=await fetch('/api/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({code:c.value})});
const j=await r.json().catch(()=>({}));
if(r.ok)location.href='/library';else m.textContent=j.message||'잠시 후 다시 시도해 주세요.'});`,
  );
}

export function libraryPage(nonce, record, packs, now) {
  const days = Math.max(0, Math.ceil((record.expiresAt - now) / 86400000));
  const rows = packs
    .map(
      (p) => `<div class="row"><div><strong>${esc(p.title)}</strong><br><small>${p.count}장</small></div>
<a class="btn" href="/view/${esc(p.pack)}">보기 · 인쇄</a></div>`,
    )
    .join('');
  return shell(
    nonce,
    `${BRAND.name} 놀이 카드`,
    `<h1>오늘도 손끝 놀이</h1>
<p class="sub">${esc(kst(record.expiresAt))}까지 볼 수 있어요 (D-${days})</p>
<div class="card">${rows || '<p>볼 수 있는 카드가 아직 없어요.</p>'}</div>`,
  );
}

/** 열람 화면에 덧붙이는 스타일·워터마크·스크립트 */
export function viewerExtras(nonce, record) {
  const stamp = `ID ${record.id} · ${BRAND.name}`;
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='280' height='190'><text x='20' y='110' transform='rotate(-24 140 95)' font-family='sans-serif' font-size='15' fill='#000' fill-opacity='0.12'>${esc(stamp)}</text></svg>`;
  const css = `<style>
body{background:#efe9e2;-webkit-user-select:none;user-select:none;-webkit-touch-callout:none}
.page{position:relative}
#sheet{padding:68px 0 24px}
#sheet .page{margin:0 auto 20px;box-shadow:0 2px 14px rgba(60,40,30,.18)}
.toolbar{position:fixed;top:0;left:0;right:0;z-index:10;background:#fff;border-bottom:1px solid #e7ddd3;display:flex;align-items:center;gap:12px;padding:8px 16px;font:14px/1.4 var(--font-body)}
.toolbar a{color:#6b5b53;text-decoration:none;white-space:nowrap}
.toolbar .tip{flex:1;color:#6b5b53;font-size:12.5px}
.toolbar button{border:0;border-radius:10px;background:#8a5a00;color:#fff;font:700 15px var(--font-body);padding:10px 18px;cursor:pointer;white-space:nowrap}
.wm-screen{position:fixed;inset:0;z-index:5;pointer-events:none;background-image:url("data:image/svg+xml,${encodeURIComponent(svg)}")}
.wm-print{display:none}
@media(max-width:640px){.toolbar .tip{display:none}.toolbar{justify-content:space-between}}
.gone{position:fixed;inset:0;z-index:20;background:#fbf7f2;display:grid;place-items:center;text-align:center;font:700 18px var(--font-body);padding:24px}
@media print{
 .toolbar,.wm-screen{display:none!important}
 body{background:#fff}
 #sheet{padding:0!important;zoom:1!important}
 #sheet .page{margin:0;box-shadow:none}
 .wm-print{display:block;position:absolute;left:0;right:0;bottom:3mm;text-align:center;font-size:6.5pt;color:#b3a79e}
}
</style>`;
  const body = `<div class="wm-screen"></div>
<div class="toolbar"><a href="/library">← 목록</a>
<span class="tip">인쇄창에서 용지 <b>A4</b> · 배율 <b>100%</b> · <b>양면(긴 변 기준)</b>을 고르면 앞뒷면이 맞게 나와요.</span>
<button id="print" type="button">인쇄하기</button></div>
<script nonce="${nonce}">
(function(){
var sheet=document.getElementById('sheet');
function fit(){sheet.style.zoom=1;var p=sheet.querySelector('.page');var z=Math.min(1,(document.documentElement.clientWidth-24)/p.offsetWidth);sheet.style.zoom=z}
fit();addEventListener('resize',fit);
addEventListener('beforeprint',function(){sheet.style.zoom=1});addEventListener('afterprint',fit);
document.getElementById('print').addEventListener('click',function(){window.print()});
['contextmenu','dragstart','selectstart','copy','cut'].forEach(function(t){addEventListener(t,function(e){e.preventDefault()})});
addEventListener('keydown',function(e){
 var k=(e.key||'').toLowerCase();
 if((e.ctrlKey||e.metaKey)&&['s','u','c','a','x'].indexOf(k)>-1||k==='f12')e.preventDefault()});
addEventListener('keyup',function(e){if(e.key==='PrintScreen'){try{navigator.clipboard.writeText('')}catch(_){}}});
function gone(){document.body.insertAdjacentHTML('beforeend','<div class="gone">이용 기간이 끝났어요.<br>새 비밀번호로 다시 들어와 주세요.</div>');setTimeout(function(){location.href='/?expired=1'},1500)}
function ping(){fetch('/api/ping',{cache:'no-store'}).then(function(r){if(r.status===401)gone()}).catch(function(){})}
setInterval(ping,30000);document.addEventListener('visibilitychange',function(){if(!document.hidden)ping()});
})();
</script>`;
  return { head: css, body, stamp };
}
