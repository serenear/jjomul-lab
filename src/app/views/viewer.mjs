import { BAND_LABEL } from '../../content/schema.mjs';
import { BRAND, esc } from '../../render/html.mjs';
import { GUIDE_CSS, guideHtml } from '../../render/guide.mjs';
import { sheetCss, sheetHtml } from '../../render/sheet.mjs';
import { page } from './layout.mjs';

export const REASONS = ['어려워요', '쉬워요', '재료 구하기가 어려워요', '아이가 관심 없어요', '시간이 짧아요', '안 해봤어요', '의견 보내기'];

export function loginPage({ nonce, tokens, notice = '' }) {
  return page({
    nonce,
    tokens,
    title: '놀이 카드',
    css: `.wrap{max-width:420px;padding-top:12vh}#code{font-weight:700;font-size:24px;letter-spacing:.2em;text-align:center;text-transform:uppercase;padding:16px}`,
    body: `<main class="wrap"><h1 style="font-size:30px;margin:0 0 6px">${esc(BRAND.name)} 놀이 카드</h1>
<p class="muted" style="margin:0 0 20px">메시지로 받은 비밀번호를 입력해 주세요.</p>
<form class="card" id="f" autocomplete="off">
<input id="code" maxlength="9" placeholder="XXXX-XXXX" aria-label="비밀번호" autofocus>
<button class="btn wide" style="margin-top:12px">들어가기</button>
<div class="msg" id="msg" role="alert">${esc(notice)}</div></form></main>`,
    script: `const f=document.getElementById('f'),c=document.getElementById('code'),m=document.getElementById('msg');
c.addEventListener('input',()=>{const v=c.value.toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,8);c.value=v.length>4?v.slice(0,4)+'-'+v.slice(4):v});
f.addEventListener('submit',async e=>{e.preventDefault();m.textContent='';
const r=await fetch('/api/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({code:c.value})});
const j=await r.json().catch(()=>({}));if(r.ok)location.href='/home';else m.textContent=j.message||'잠시 후 다시 시도해 주세요.'});`,
  });
}

function expiryBanner(exp) {
  if (!exp || exp.daysLeft > 3) return '';
  const when = exp.daysLeft <= 0 ? '오늘까지' : `${exp.daysLeft}일 남았어요 (${esc(exp.endLabel)}까지)`;
  return exp.type === 'trial'
    ? `<div class="banner"><b>체험 기간이 ${when}.</b><br>계속 함께하고 싶으시면 메시지로 알려 주세요.</div>`
    : `<div class="banner"><b>이용 기간이 ${when}.</b><br>연장을 원하시면 메시지로 알려 주세요.</div>`;
}

export function homePage({ nonce, tokens, sub, band, sch, items, exp, ratings }) {
  const rated = new Map(ratings.map((r) => [r.contentId, r]));
  const row = (x) => {
    const r = rated.get(x.card.id);
    const badge = r ? `<span class="tag" style="background:#e3f3ec;color:#2f6b52">${r.score === 'A' ? '또 하고 싶어요' : '평가함'}</span>` : '';
    return `<a class="row" href="/c/${esc(x.card.id)}" data-cat="${esc(x.card.category)}">
<span class="day">${esc(x.dateLabel)}</span><span class="t">${esc(x.card.title)}<br><span class="tag">${esc(x.card.category)}</span> ${badge}</span><span class="go">›</span></a>`;
  };

  const today = items.find((x) => x.ymd === sch.todayYmd);
  const past = items.filter((x) => x.ymd < sch.todayYmd).reverse();
  const unrated = past.filter((x) => !rated.has(x.card.id)).slice(0, 5);
  // 오늘부터 이번 주(주말엔 다음 주)에 열릴 놀이의 재료 — 제목은 그날 열릴 때까지 숨겨요
  const [ws, we] = sch.prepWeek;
  const weekItems = sch.items.filter((x) => x.ready && x.ms >= ws && x.ms < we && x.ms < exp.endAt && x.ymd >= sch.todayYmd);
  const materials = weekItems.flatMap((x) =>
    x.card.versions[band].materials.map((m) => ({ m, label: x.ymd === sch.todayYmd ? '오늘' : `${x.dateLabel} 예정` })),
  );
  const prepTitle = sch.isWeekday ? '이번 주 준비물' : '다음 주 준비물';

  const todayCard = today
    ? `<a class="today" href="/c/${esc(today.card.id)}" data-cat="${esc(today.card.category)}">
<span class="muted small">${esc(today.dateLabel)} · ${today.index}번째 놀이</span>
<span class="big">${esc(today.card.title)}</span><span class="tag">${esc(today.card.category)}</span>
<span class="btn" style="margin-top:12px">오늘 놀이 보기</span></a>`
    : `<div class="card"><b>${sch.isWeekday ? '오늘은 쉬어 가요.' : '주말엔 쉬어요.'}</b><br><span class="muted">${past.length ? '지난 놀이를 한 번 더 해 봐도 좋아요.' : '평일 아침에 첫 놀이가 열려요.'}</span></div>`;

  return page({
    nonce,
    tokens,
    title: '내 놀이',
    css: `.row{display:flex;gap:12px;align-items:center;padding:12px 4px;border-top:1px solid var(--line);text-decoration:none}.row:first-of-type{border-top:0}
.row .day{flex:none;width:96px;font-size:13px;color:var(--ink-soft)}.row .t{flex:1}.row .go{font-size:22px;color:var(--ink-soft)}
.today{display:flex;flex-direction:column;align-items:flex-start;gap:6px;text-decoration:none;background:#fff;border:2px solid var(--accent-bar);border-radius:18px;padding:18px}
.today .big{font:400 24px/1.3 var(--font-display)}
section{margin-top:16px}h2{font-size:20px;margin:0 0 8px}ul.mat{margin:0;padding-left:20px}`,
    body: `<main class="wrap">
<p class="muted small" style="margin:0">${esc(BRAND.name)} · ${esc(BAND_LABEL[band])}</p>
<h1 style="font-size:28px;margin:2px 0 14px">오늘도 손끝 놀이</h1>
${expiryBanner(exp)}
<h2>오늘의 놀이</h2>${todayCard}
${unrated.length ? `<section class="card"><h2>지난 놀이 어땠어요?</h2><p class="muted small" style="margin:0 0 6px">눌러서 알려 주시면 다음 놀이를 고르는 데 큰 도움이 돼요.</p>${unrated.map(row).join('')}</section>` : ''}
${materials.length ? `<section class="card"><h2>${prepTitle}</h2><p class="muted small" style="margin:0 0 6px">앞으로 열릴 놀이 재료예요. 미리 챙겨 두세요.</p><ul class="mat">${materials.map((x) => `<li>${esc(x.m)} <span class="muted small">(${esc(x.label)})</span></li>`).join('')}</ul></section>` : ''}
${past.length ? `<section class="card"><h2>지난 놀이</h2>${past.map(row).join('')}</section>` : ''}
<p class="muted small" style="text-align:center;margin-top:24px">평일마다 새 놀이가 하나씩 열려요 · ${esc(sub.id)}</p>
</main>`,
  });
}

/** 콘텐츠 페이지: 화면 가이드 + A4 1장 인쇄 + 평가·의견·작품 보내기 */
export function contentPage({ nonce, tokens, content, item, band, sub, rating }) {
  const { card } = item;
  const stamp = `ID ${sub.id}`;
  const wm = `<svg xmlns='http://www.w3.org/2000/svg' width='280' height='190'><text x='20' y='110' transform='rotate(-24 140 95)' font-family='sans-serif' font-size='15' fill='#000' fill-opacity='0.11'>${esc(stamp)} · ${esc(BRAND.name)}</text></svg>`;
  const chosen = new Set(rating?.reasons ?? []);
  const reasonChips = REASONS.map(
    (r) => `<button type="button" class="chip${chosen.has(r) ? ' on' : ''}" data-r="${esc(r)}">${esc(r)}</button>`,
  ).join('');

  return page({
    nonce,
    tokens: '',
    title: card.title,
    head: `<style>${sheetCss(content)}</style>`,
    css: `${GUIDE_CSS}
body{-webkit-user-select:none;user-select:none;-webkit-touch-callout:none}
textarea,input{-webkit-user-select:text;user-select:text}
.bar{position:sticky;top:0;z-index:10;background:#fff;border-bottom:1px solid var(--line);display:flex;align-items:center;gap:10px;padding:8px 16px}
.bar a{text-decoration:none;color:var(--ink-soft);white-space:nowrap}.bar .sp{flex:1}
.wm{position:fixed;inset:0;z-index:5;pointer-events:none;background-image:url("data:image/svg+xml,${encodeURIComponent(wm)}")}
h1.title{font-size:28px;margin:6px 0 2px}
section{margin-top:16px}section h2{font-size:20px;margin:0 0 10px}
#pv{overflow:hidden;border-radius:6px;box-shadow:0 2px 14px rgba(60,40,30,.18);background:#fff}
#pv .zoom{width:var(--page-w)}
.tip{font-size:13px;color:var(--ink-soft);margin:8px 2px 0}
.rate{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.rate button{padding:16px 8px;border-radius:14px;border:2px solid var(--line);background:#fff;font:700 16px var(--font-body);cursor:pointer;color:var(--ink)}
.rate button.on{border-color:#8a5a00;background:#fdf1d8}
.chips{display:flex;flex-wrap:wrap;gap:8px;margin-top:12px}
.chip{border:1.5px solid var(--line);background:#fff;border-radius:99px;padding:7px 13px;font:14px var(--font-body);cursor:pointer;color:var(--ink)}
.chip.on{border-color:#8a5a00;background:#fdf1d8;font-weight:700}
.hide{display:none}
@media print{
  body{background:#fff}
  .screen,.bar,.wm{display:none!important}
  #pv{box-shadow:none;border-radius:0}
  #pv .zoom{zoom:1!important}
  .wrap{padding:0;max-width:none}
}`,
    body: `<div class="wm screen"></div>
<div class="bar"><a href="/home">← 목록</a><span class="sp"></span><button class="btn" id="print" type="button">인쇄하기</button></div>
<main class="wrap">
<div class="screen">
  <p class="muted small" style="margin:0">${item.index}번째 놀이 · ${esc(item.dateLabel)}</p>
  <h1 class="title">${esc(card.title)}</h1>
  <section>${guideHtml(card, band)}</section>
  <section><h2>인쇄할 종이 (A4 1장)</h2></section>
</div>
<div id="pv"><div class="zoom">${sheetHtml(card, band, content.art, { stamp })}</div></div>
<div class="screen">
  <p class="tip">인쇄창에서 용지 <b>A4</b> · 배율 <b>100%</b>(또는 "실제 크기")를 골라 주세요.</p>

  <section class="card" id="rate">
    <h2>이 놀이, 또 만나고 싶나요?</h2>
    <div class="rate">
      <button type="button" data-s="A" class="${rating?.score === 'A' ? 'on' : ''}">또 하고 싶어요</button>
      <button type="button" data-s="D" class="${rating?.score === 'D' ? 'on' : ''}">우리 아이와는 안 맞았어요</button>
    </div>
    <div id="why" class="${rating?.score === 'D' ? '' : 'hide'}">
      <p class="muted small" style="margin:12px 0 0">어떤 점이 그랬나요? (여러 개 골라도 돼요)</p>
      <div class="chips">${reasonChips}</div>
      <div id="whyText" class="${chosen.has('의견 보내기') ? '' : 'hide'}"><textarea id="dText" rows="3" maxlength="1000" placeholder="편하게 적어 주세요" style="margin-top:10px"></textarea></div>
      <button class="btn wide" id="dSend" type="button" style="margin-top:12px">보내기</button>
    </div>
    <div class="msg" id="rMsg"></div>
  </section>

  <section class="card">
    <h2>의견 보내기</h2>
    <textarea id="fb" rows="3" maxlength="1000" placeholder="놀이 후기, 궁금한 점, 바라는 놀이 무엇이든 좋아요"></textarea>
    <button class="btn wide" id="fbSend" type="button" style="margin-top:10px">전송</button>
    <div class="msg" id="fbMsg"></div>
  </section>

  <section class="card">
    <h2>우리 아이 작품 보내기</h2>
    <p class="muted small" style="margin:0 0 8px">아이 얼굴이 나오지 않게 <b>손과 작품만</b> 찍어 주세요.</p>
    <input type="file" id="ph" accept="image/*">
    <label style="display:flex;gap:8px;align-items:flex-start;font-size:14px;color:var(--ink);margin-top:10px">
      <input type="checkbox" id="consent" style="width:auto;margin-top:4px">
      <span>${esc(BRAND.name)} 인스타그램·블로그 등에 작품 사진을 소개해도 괜찮아요. (선택 · 언제든 철회할 수 있어요)</span></label>
    <button class="btn wide" id="phSend" type="button" style="margin-top:10px">작품 보내기</button>
    <div class="msg" id="phMsg"></div>
  </section>
</div>
</main>`,
    script: `(function(){
var id=${JSON.stringify(card.id)};
var pv=document.getElementById('pv'),z=pv.querySelector('.zoom');
function fit(){z.style.zoom=1;var w=z.querySelector('.sheet').offsetWidth;z.style.zoom=Math.min(1,pv.clientWidth/w);pv.style.height=(z.querySelector('.sheet').offsetHeight*parseFloat(z.style.zoom))+'px'}
fit();addEventListener('resize',fit);
addEventListener('beforeprint',function(){z.style.zoom=1;pv.style.height='auto'});addEventListener('afterprint',fit);
document.getElementById('print').addEventListener('click',function(){window.print()});
['contextmenu','dragstart','copy','cut'].forEach(function(t){addEventListener(t,function(e){if(!/TEXTAREA|INPUT/.test(e.target.tagName))e.preventDefault()})});
addEventListener('keydown',function(e){var k=(e.key||'').toLowerCase();if((e.ctrlKey||e.metaKey)&&['s','u'].indexOf(k)>-1||k==='f12')e.preventDefault()});
function post(url,body){return fetch(url,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)}).then(function(r){return r.json().catch(function(){return{}}).then(function(j){if(!r.ok)throw new Error(j.message||'잠시 후 다시 시도해 주세요.');return j})})}
function say(el,t,ok){el.textContent=t;el.className='msg'+(ok?' ok':'')}
var rMsg=document.getElementById('rMsg'),why=document.getElementById('why'),btns=document.querySelectorAll('.rate button');
btns.forEach(function(b){b.addEventListener('click',function(){
  btns.forEach(function(x){x.classList.toggle('on',x===b)});
  if(b.dataset.s==='A'){why.classList.add('hide');post('/api/rate',{contentId:id,score:'A',reasons:[]}).then(function(){say(rMsg,'고마워요! 비슷한 놀이를 더 준비할게요.',true)}).catch(function(e){say(rMsg,e.message)})}
  else why.classList.remove('hide');
})});
document.querySelectorAll('.chip').forEach(function(c){c.addEventListener('click',function(){c.classList.toggle('on');
  if(c.dataset.r==='의견 보내기')document.getElementById('whyText').classList.toggle('hide',!c.classList.contains('on'))})});
document.getElementById('dSend').addEventListener('click',function(){
  var reasons=[].map.call(document.querySelectorAll('.chip.on'),function(c){return c.dataset.r});
  post('/api/rate',{contentId:id,score:'D',reasons:reasons,text:document.getElementById('dText').value}).then(function(){say(rMsg,'알려 주셔서 고마워요. 다음 놀이에 꼭 반영할게요.',true)}).catch(function(e){say(rMsg,e.message)})});
document.getElementById('fbSend').addEventListener('click',function(){var t=document.getElementById('fb'),m=document.getElementById('fbMsg');
  post('/api/feedback',{contentId:id,text:t.value}).then(function(){t.value='';say(m,'잘 받았어요. 고마워요!',true)}).catch(function(e){say(m,e.message)})});
document.getElementById('phSend').addEventListener('click',function(){var f=document.getElementById('ph').files[0],m=document.getElementById('phMsg');
  if(!f){say(m,'사진을 먼저 골라 주세요.');return}
  var fd=new FormData();fd.append('contentId',id);fd.append('consent',document.getElementById('consent').checked?'1':'0');fd.append('file',f);
  say(m,'보내는 중…',true);
  fetch('/api/photo',{method:'POST',body:fd}).then(function(r){return r.json().then(function(j){if(!r.ok)throw new Error(j.message||'실패했어요');})}).then(function(){document.getElementById('ph').value='';say(m,'작품 사진 잘 받았어요!',true)}).catch(function(e){say(m,e.message)})});
function gone(){location.href='/?expired=1'}
function ping(){fetch('/api/ping',{cache:'no-store'}).then(function(r){if(r.status===401)gone()}).catch(function(){})}
setInterval(ping,30000);document.addEventListener('visibilitychange',function(){if(!document.hidden)ping()});
})();`,
  });
}
