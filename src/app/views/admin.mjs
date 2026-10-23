import { BANDS, BAND_LABEL, CATEGORIES, SEASONS, STATUSES, STATUS_LABEL, WEEKDAYS } from '../../content/schema.mjs';
import { BRAND, esc } from '../../render/html.mjs';
import { GUIDE_CSS, guideHtml } from '../../render/guide.mjs';
import { page } from './layout.mjs';
import { IDEA_SOURCE, IDEA_STATUS } from '../../collect/ideas.mjs';

export const SOURCES = ['인스타그램', '블로그', '오픈채팅', '당근', '지인 추천', '텀블벅', '기타'];
const TYPE_LABEL = { subscribe: '구독', trial: '체험' };
const STATE_LABEL = { active: '이용 중', expired: '만료', stopped: '정지', upcoming: '시작 전' };

const CSS = `
.wrap{max-width:1180px}
nav{display:flex;gap:6px;flex-wrap:wrap;margin:0 0 18px}
nav a{padding:8px 14px;border-radius:99px;text-decoration:none;background:#fff;border:1px solid var(--line)}
nav a.on{background:#8a5a00;color:#fff;border-color:#8a5a00}
table{width:100%;border-collapse:collapse;background:#fff;border:1px solid var(--line);border-radius:14px;overflow:hidden;font-size:14px}
th,td{padding:9px 10px;border-bottom:1px solid var(--line);text-align:left;vertical-align:top}
th{background:#f7f1ea;font-weight:700;white-space:nowrap}
tr:last-child td{border-bottom:0}
.grid{display:grid;gap:12px}.g2{grid-template-columns:repeat(auto-fit,minmax(320px,1fr))}.g4{grid-template-columns:repeat(auto-fit,minmax(160px,1fr))}
.stat{font-size:26px;font-family:var(--font-display)}
.filters{display:flex;gap:8px;flex-wrap:wrap;align-items:end;margin-bottom:12px}.filters>*{width:auto}
.st-idea{background:#eee;color:#555}.st-draft{background:#e4eff9;color:#2f5f8c}.st-review{background:#fdf1d8;color:#8a5a00}.st-published{background:#e3f3ec;color:#2f6b52}
.code{font:700 30px/1.2 monospace;letter-spacing:.15em;background:#fff4dc;border-radius:12px;padding:14px;text-align:center}
pre.msgbox{white-space:pre-wrap;background:#fff;border:1px dashed var(--line);border-radius:12px;padding:12px;font:14px var(--font-body);-webkit-user-select:all;user-select:all}
.pv{width:360px;max-width:100%;height:509px;overflow:hidden;border:1px solid var(--line);border-radius:8px;background:#fff}
iframe.sheet{width:794px;height:1123px;border:0;transform:scale(.4534);transform-origin:0 0}
.photos{display:flex;gap:8px;flex-wrap:wrap}.photos img{width:120px;height:120px;object-fit:cover;border-radius:10px;border:1px solid var(--line)}
.warn{color:#a3392f;font-weight:700}
.idea{padding:10px 0;border-top:1px solid var(--line)}.idea:first-of-type{border-top:0}
.idea .sum{white-space:pre-line;font-size:14px;margin:4px 0;color:var(--ink-soft)}
.idea form{display:flex;gap:6px;align-items:center;flex-wrap:wrap;margin-top:6px}.idea form>*{width:auto}
.idea select,.idea input{padding:5px 8px;font-size:13px}.idea button{padding:6px 12px;font-size:13px}
details.memo summary{cursor:pointer;font-weight:700}
form.inline{display:inline}
${GUIDE_CSS}`;

function shell({ nonce, tokens, title, active, body }) {
  const tabs = [
    ['contents', '콘텐츠 서랍'],
    ['subscribers', '구독자'],
    ['sets', '콘텐츠 셋'],
    ['collected', '수집함'],
    ['inbox', '받은 소식'],
  ];
  return page({
    nonce,
    tokens,
    title: `어드민 · ${title}`,
    css: CSS,
    body: `<main class="wrap"><p class="muted small" style="margin:0">${esc(BRAND.name)} 어드민</p>
<nav>${tabs.map(([k, l]) => `<a href="/admin/${k}" class="${k === active ? 'on' : ''}">${l}</a>`).join('')}</nav>${body}</main>`,
  });
}

const statusTag = (s) => `<span class="tag st-${s}">${STATUS_LABEL[s]}</span>`;
const opts = (list, cur, label = (x) => x) =>
  list.map((x) => `<option value="${esc(x)}"${String(x) === String(cur ?? '') ? ' selected' : ''}>${esc(label(x))}</option>`).join('');

export function adminLoginPage({ nonce, tokens, notice = '' }) {
  return page({
    nonce,
    tokens,
    title: '어드민 로그인',
    css: '.wrap{max-width:380px;padding-top:12vh}',
    body: `<main class="wrap"><h1>어드민</h1><form class="card" method="post" action="/admin/login">
<label>관리자 비밀번호</label><input type="password" name="password" autofocus autocomplete="current-password">
<button class="btn wide" style="margin-top:12px">들어가기</button><div class="msg">${esc(notice)}</div></form></main>`,
  });
}

// ---------- 콘텐츠 서랍 ----------
/** 아이디어 1줄 + 상태 바꾸기 */
function ideaItem(i, back) {
  return `<div class="idea"><b>${esc(i.title)}</b> <span class="tag">${IDEA_SOURCE[i.source]}</span> <span class="tag">${IDEA_STATUS[i.status]}</span>
${i.category ? ` <span class="tag">${esc(i.category)}</span>` : ''}${i.contentId ? ` → <a href="/admin/contents/${esc(i.contentId)}">${esc(i.contentId)}</a>` : ''}
${i.summary ? `<div class="sum">${esc(i.summary)}</div>` : ''}
<div class="small muted">${i.author ? `${esc(i.author)} · ` : ''}${i.url ? `<a href="${esc(i.url)}" target="_blank" rel="noopener noreferrer">원본 보기 ↗</a> · ` : ''}${esc((i.publishedAt || new Date(i.at).toISOString()).slice(0, 10))}</div>
<form method="post" action="/admin/ideas/${esc(i.id)}"><input type="hidden" name="back" value="${esc(back)}">
<select name="status">${opts(Object.keys(IDEA_STATUS), i.status, (s) => IDEA_STATUS[s])}</select>
<input name="contentId" placeholder="연결할 c000" size="8" value="${esc(i.contentId ?? '')}"><button class="btn ghost">저장</button></form></div>`;
}

function memoPanel(memos) {
  const open = memos.filter((m) => m.status !== 'drop' && m.status !== 'done');
  return `<div class="grid g2" style="margin-bottom:16px;align-items:start" id="memo">
<form class="card" method="post" action="/admin/ideas"><h2 style="margin-top:0">메모장</h2>
<p class="muted small" style="margin:0">떠오른 놀이 아이디어를 적어 두세요. 나중에 모아서 콘텐츠로 만들어요.</p>
<label>제목</label><input name="title" required maxlength="60" placeholder="예: 양말 짝 맞추기">
<label>메모</label><textarea name="summary" rows="3" maxlength="2000" placeholder="재료, 방법, 떠오른 계기…"></textarea>
<div class="grid" style="grid-template-columns:1fr 1fr"><div><label>카테고리 (선택)</label><select name="category"><option value="">-</option>${opts(CATEGORIES, '')}</select></div>
<div><label>참고 링크 (선택)</label><input name="url" placeholder="https://"></div></div>
<button class="btn wide" style="margin-top:12px">메모 추가</button></form>
<div class="card"><h2 style="margin-top:0">메모 ${open.length}개</h2>${open.slice().reverse().map((m) => ideaItem(m, '/admin/contents#memo')).join('') || '<p class="muted small">아직 메모가 없어요</p>'}
${memos.length > open.length ? `<details class="memo" style="margin-top:8px"><summary>콘텐츠화·제외한 메모 ${memos.length - open.length}개</summary>${memos.filter((m) => !open.includes(m)).map((m) => ideaItem(m, '/admin/contents#memo')).join('')}</details>` : ''}</div></div>`;
}

export function collectedPage({ nonce, tokens, ideas, q, notice = '', canCollect }) {
  const shown = ideas.filter((i) => (!q.source || i.source === q.source) && (q.status ? i.status === q.status : i.status !== 'drop'));
  const back = `/admin/collected?${new URLSearchParams(q)}`;
  return shell({
    nonce,
    tokens,
    title: '수집함',
    active: 'collected',
    body: `${notice ? `<div class="banner">${esc(notice)}</div>` : ''}
<div class="filters" style="justify-content:space-between"><form class="filters" method="get" style="margin:0">
<div><label>출처</label><select name="source"><option value="">전체</option>${opts(['youtube', 'instagram'], q.source, (s) => IDEA_SOURCE[s])}</select></div>
<div><label>상태</label><select name="status"><option value="">제외 빼고 전체</option>${opts(Object.keys(IDEA_STATUS), q.status, (s) => IDEA_STATUS[s])}</select></div>
<button class="btn">보기</button></form>
${canCollect ? '<form method="post" action="/admin/collect" style="margin:0"><button class="btn ghost">지금 수집하기</button></form>' : ''}</div>
<p class="muted small">유튜브 채널·인스타 해시태그는 <code>collect.config.yaml</code>에서 정해요. 원본은 링크로만 보관해요 — 아이디어만 참고하고 문구·그림은 새로 만들어 주세요.</p>
<div class="card">${shown.slice().reverse().map((i) => ideaItem(i, back)).join('') || '<p class="muted small">수집된 아이디어가 없어요</p>'}</div>`,
  });
}

export function contentsPage({ nonce, tokens, cards, q, scores, memos = [] }) {
  const count = (s) => cards.all.filter((c) => c.status === s).length;
  const rows = cards.shown
    .map((c) => {
      const sc = scores.get(c.id) ?? { A: 0, D: 0 };
      return `<tr><td><a href="/admin/contents/${c.id}">${c.id}</a></td><td><a href="/admin/contents/${c.id}"><b>${esc(c.title)}</b></a>${(c.tags ?? []).map((t) => ` <span class="tag">${esc(t)}</span>`).join('')}</td>
<td>${esc(c.category)}</td><td>${statusTag(c.status)}</td>
<td>${BANDS.map((b) => (c.versions?.[b] ? '✓' : '·')).join(' / ')}</td>
<td>${esc(c.season ?? '')}</td><td>${esc(c.place ?? '')}</td><td>${esc(c.mess ?? '')}</td><td>${c.prep_min ?? ''}${c.prep_min !== undefined ? '분' : ''}</td>
<td>${(c.hand ?? []).map(esc).join(', ')}</td><td>${sc.A} / ${sc.D}</td></tr>`;
    })
    .join('');
  return shell({
    nonce,
    tokens,
    title: '콘텐츠 서랍',
    active: 'contents',
    body: `${memoPanel(memos)}<div class="grid g4" style="margin-bottom:14px">${STATUSES.map((s) => `<div class="card"><div class="muted small">${STATUS_LABEL[s]}</div><div class="stat">${count(s)}</div></div>`).join('')}</div>
<form class="filters" method="get">
<div><label>검색</label><input name="q" value="${esc(q.q ?? '')}" placeholder="제목·ID·태그"></div>
<div><label>상태</label><select name="status"><option value="">전체</option>${opts(STATUSES, q.status, (s) => STATUS_LABEL[s])}</select></div>
<div><label>카테고리</label><select name="category"><option value="">전체</option>${opts(CATEGORIES, q.category)}</select></div>
<div><label>계절</label><select name="season"><option value="">전체</option>${opts(SEASONS, q.season)}</select></div>
<button class="btn">보기</button></form>
<p class="muted small">${cards.shown.length}개 · 콘텐츠 수정은 <code>content/cards/&lt;ID&gt;.yaml</code>에서 해요 (여기는 모아보기 전용)</p>
<table><tr><th>ID</th><th>제목</th><th>카테고리</th><th>상태</th><th>12~24 / 24~40</th><th>계절</th><th>장소</th><th>뒷정리</th><th>준비</th><th>손 동작</th><th>또 / 안 맞음</th></tr>${rows}</table>`,
  });
}

export function contentDetailPage({ nonce, tokens, card, ratings, feedback, usedIn }) {
  const A = ratings.filter((r) => r.score === 'A').length;
  const D = ratings.filter((r) => r.score === 'D');
  const reasons = Object.entries(Object.groupBy(D.flatMap((r) => r.reasons), (x) => x)).map(([k, v]) => `${esc(k)} ${v.length}`);
  const field = (k, v) => `<tr><th>${k}</th><td>${v}</td></tr>`;
  return shell({
    nonce,
    tokens,
    title: card.title,
    active: 'contents',
    body: `<p><a href="/admin/contents">← 서랍</a></p><h1>${esc(card.id)} · ${esc(card.title)} ${statusTag(card.status)}</h1>
<div class="grid g2"><table>
${field('카테고리', esc(card.category))}${field('태그', (card.tags ?? []).map(esc).join(', '))}
${field('손 동작', (card.hand ?? []).map(esc).join(', '))}${field('재료', (card.materials_tags ?? []).map(esc).join(', '))}
${field('계절 / 장소', `${esc(card.season ?? '-')} / ${esc(card.place ?? '-')}`)}${field('뒷정리 / 준비', `${esc(card.mess ?? '-')} / ${card.prep_min ?? '-'}분`)}
${field('들어간 셋', usedIn.map((u) => `${esc(u.set)} ${u.week}주차 ${esc(u.day)}`).join('<br>') || '-')}
</table><div class="card"><h3 style="margin-top:0">반응</h3><p>또 하고 싶어요 <b>${A}</b> · 안 맞았어요 <b>${D.length}</b></p>
<p class="muted small">${reasons.join(' · ') || '아직 이유 없음'}</p>
${feedback.map((f) => `<p class="small">“${esc(f.text)}” <span class="muted">— ${esc(f.subscriberId)} · ${esc(f.date)}</span></p>`).join('')}</div></div>
${
  card.status === 'idea'
    ? '<p class="card muted" style="margin-top:14px">아직 제목만 있는 아이디어예요. YAML에 versions를 채우면 가이드와 인쇄 미리보기가 보여요.</p>'
    : `<div class="grid g2" style="margin-top:14px">${BANDS.map((b) =>
        card.versions?.[b]
          ? `<div class="card"><h2 style="margin-top:0">${BAND_LABEL[b]} <span class="tag">${esc(card.versions[b].print)}</span></h2>
<div class="pv"><iframe class="sheet" src="/admin/sheet/${card.id}/${b}" title="인쇄 미리보기"></iframe></div><div style="margin-top:12px">${guideHtml(card, b)}</div></div>`
          : `<div class="card"><h2 style="margin-top:0">${BAND_LABEL[b]}</h2><p class="warn">아직 이 구간 버전이 없어요</p></div>`,
      ).join('')}</div>`
}`,
  });
}

// ---------- 구독자 ----------
export function subscribersPage({ nonce, tokens, rows, sets, today, error = '' }) {
  const tr = rows
    .map(
      ({ s, state, band, months, daysLeft, done, total, A, D }) => `<tr>
<td><a href="/admin/subscribers/${s.id}"><b>${s.id}</b></a></td><td>${esc(s.nickname)}</td>
<td><span class="tag">${TYPE_LABEL[s.type]}</span></td><td>${months}개월 · ${BAND_LABEL[band]}${s.band !== 'auto' ? ' (고정)' : ''}</td>
<td>${esc(s.startDate)} ~ ${esc(s.endDate)}</td>
<td>${STATE_LABEL[state]}${state === 'active' && daysLeft <= 3 ? ` <span class="warn">D-${daysLeft}</span>` : ''}</td>
<td>${esc(s.source ?? '')}</td><td>${esc(s.referredBy ?? '')}</td><td>${done}/${total}</td><td>${A} / ${D}</td></tr>`,
    )
    .join('');
  return shell({
    nonce,
    tokens,
    title: '구독자',
    active: 'subscribers',
    body: `<div class="grid g2" style="align-items:start">
<div><table><tr><th>ID</th><th>별칭</th><th>유형</th><th>아이</th><th>기간</th><th>상태</th><th>유입</th><th>추천인</th><th>해봤어요</th><th>또 / 안 맞음</th></tr>${tr || '<tr><td colspan="10" class="muted">아직 구독자가 없어요</td></tr>'}</table></div>
<form class="card" method="post" action="/admin/subscribers"><h2 style="margin-top:0">새 구독자 · 체험자</h2>
${error ? `<p class="warn">${esc(error)}</p>` : ''}
${subscriberFields({ type: 'trial', startDate: today, band: 'auto', setId: 'default' }, sets, { isNew: true })}
<button class="btn wide" style="margin-top:14px">등록하고 비밀번호 만들기</button></form></div>`,
  });
}

function subscriberFields(s, sets, { isNew = false } = {}) {
  return `<label>별칭 (실명 대신 · 예: 하늘맘)</label><input name="nickname" required maxlength="30" value="${esc(s.nickname ?? '')}">
<label>아이 생년월</label><input type="month" name="childBirth" required value="${esc(s.childBirth ?? '')}">
<label>유형</label><select name="type">${opts(['trial', 'subscribe'], s.type, (t) => TYPE_LABEL[t])}</select>
<label>시작일</label><input type="date" name="startDate" required value="${esc(s.startDate ?? '')}">
${isNew ? '<label>기간 (일) — 종료일을 비우면 이 값으로 계산해요</label><input type="number" name="days" min="1" max="400" value="7">' : ''}
<label>종료일${isNew ? ' (선택)' : ''}</label><input type="date" name="endDate" ${isNew ? '' : 'required'} value="${esc(s.endDate ?? '')}">
<label>연령 구간</label><select name="band">${opts(['auto', ...BANDS], s.band, (b) => (b === 'auto' ? '자동 (생년월로 계산)' : BAND_LABEL[b]))}</select>
<label>콘텐츠 셋</label><select name="setId">${opts(sets.map((x) => x.id), s.setId, (id) => sets.find((x) => x.id === id).title)}</select>
<label>유입 경로</label><select name="source"><option value="">-</option>${opts(SOURCES, s.source)}</select>
<label>추천인 (구독자 ID)</label><input name="referredBy" placeholder="S-0001" value="${esc(s.referredBy ?? '')}">
<label>입금자명</label><input name="payerName" value="${esc(s.payerName ?? '')}">
<label>연락처 (알림톡 발송용)</label><input name="phone" inputmode="tel" value="${esc(s.phone ?? '')}">
<label>메모</label><textarea name="memo" rows="2">${esc(s.memo ?? '')}</textarea>`;
}

export function codeIssuedPage({ nonce, tokens, sub, code, message }) {
  return shell({
    nonce,
    tokens,
    title: '비밀번호 발급',
    active: 'subscribers',
    body: `<div class="card" style="max-width:520px"><h2 style="margin-top:0">${esc(sub.id)} ${esc(sub.nickname)} 님 비밀번호</h2>
<div class="code">${esc(code)}</div>
<p class="warn small">이 화면을 벗어나면 다시 볼 수 없어요. 지금 복사해서 보내 주세요. (서버에는 저장하지 않아요)</p>
<h3>보낼 메시지</h3><pre class="msgbox">${esc(message)}</pre>
<a class="btn" href="/admin/subscribers/${esc(sub.id)}">구독자 정보로</a></div>`,
  });
}

export function subscriberDetailPage({ nonce, tokens, sub, info, sets, timeline, feedback, photos, byCategory }) {
  const tl = timeline
    .map(
      (x) => `<tr><td>${x.week}주차 ${esc(x.day)}</td><td>${esc(x.ymd)}</td><td><a href="/admin/contents/${x.id}">${x.id}</a> ${esc(x.title)}</td>
<td>${x.open ? '열림' : '<span class="muted">예정</span>'}${x.missing ? ' <span class="warn">버전 없음</span>' : ''}</td>
<td>${x.rating ? (x.rating.score === 'A' ? '또 하고 싶어요' : `안 맞았어요 <span class="muted small">${esc(x.rating.reasons.join(', '))}</span>`) : ''}</td></tr>`,
    )
    .join('');
  return shell({
    nonce,
    tokens,
    title: sub.id,
    active: 'subscribers',
    body: `<p><a href="/admin/subscribers">← 구독자</a></p>
<h1>${esc(sub.id)} · ${esc(sub.nickname)} <span class="tag">${TYPE_LABEL[sub.type]}</span> <span class="tag">${STATE_LABEL[info.state]}</span></h1>
<p class="muted">${info.months}개월 · ${BAND_LABEL[info.band]} · ${esc(sub.startDate)} ~ ${esc(sub.endDate)}${info.state === 'active' ? ` (D-${info.daysLeft})` : ''}</p>
<div class="grid g2" style="align-items:start">
<form class="card" method="post" action="/admin/subscribers/${esc(sub.id)}"><h2 style="margin-top:0">정보 수정</h2>
${subscriberFields(sub, sets)}
<label>상태</label><select name="status">${opts(['active', 'stopped'], sub.status, (s) => STATE_LABEL[s])}</select>
<button class="btn wide" style="margin-top:14px">저장</button></form>
<div>
<form class="card" method="post" action="/admin/subscribers/${esc(sub.id)}/code"><h2 style="margin-top:0">비밀번호</h2>
<p class="small muted">재발급하면 이전 비밀번호와 열려 있던 화면이 모두 끊겨요.</p><button class="btn ghost wide">비밀번호 재발급</button></form>
<div class="card" style="margin-top:12px"><h2 style="margin-top:0">반응 분석</h2>
<p>해봤어요 <b>${info.done}</b>/${info.total} · 또 하고 싶어요 <b>${info.A}</b> · 안 맞았어요 <b>${info.D}</b></p>
<table><tr><th>카테고리</th><th>또</th><th>안 맞음</th></tr>${byCategory.map((c) => `<tr><td>${esc(c.category)}</td><td>${c.A}</td><td>${c.D}</td></tr>`).join('')}</table></div>
<div class="card" style="margin-top:12px"><h2 style="margin-top:0">작품 · 의견</h2>
<div class="photos">${photos.map((p) => `<a href="/admin/photos/${p.id}"><img src="/admin/photos/${p.id}" alt="${esc(p.contentId)} 작품"></a>`).join('') || '<span class="muted small">작품 없음</span>'}</div>
${feedback.map((f) => `<p class="small">“${esc(f.text)}” <span class="muted">— ${esc(f.contentId ?? '')} · ${esc(f.date)}</span></p>`).join('')}</div>
</div></div>
<h2>콘텐츠 셋 · ${esc(sets.find((x) => x.id === sub.setId)?.title ?? sub.setId)}</h2>
<table><tr><th>순서</th><th>날짜</th><th>콘텐츠</th><th>상태</th><th>반응</th></tr>${tl}</table>`,
  });
}

// ---------- 셋 ----------
export function setsPage({ nonce, tokens, sets, cardsById }) {
  const cell = (id) => {
    const c = cardsById.get(id);
    if (!id) return '<td class="muted">-</td>';
    if (!c) return `<td class="warn">${esc(id)} 없음</td>`;
    return `<td><a href="/admin/contents/${c.id}">${c.id}</a> ${esc(c.title)}<br>${statusTag(c.status)} ${BANDS.map((b) => (c.versions?.[b] ? '✓' : '·')).join('/')}</td>`;
  };
  return shell({
    nonce,
    tokens,
    title: '콘텐츠 셋',
    active: 'sets',
    body: `<p class="muted small">셋 수정은 <code>content/sets/&lt;셋&gt;.yaml</code>에서 해요. 지금은 모든 구독자가 기본 셋을 받아요.</p>
${sets.map((s) => `<h2>${esc(s.title)} <span class="muted small">(${esc(s.id)})</span></h2>
<table><tr><th>주차</th>${WEEKDAYS.map((d) => `<th>${d}</th>`).join('')}</tr>
${s.weeks.map((w, i) => `<tr><th>${i + 1}주차</th>${WEEKDAYS.map((d) => cell(w?.[d])).join('')}</tr>`).join('')}</table>`).join('')}`,
  });
}

// ---------- 받은 소식 ----------
export function inboxPage({ nonce, tokens, events }) {
  const line = (e) => {
    if (e.kind === 'rating') return `${e.score === 'A' ? '💛 또 하고 싶어요' : '🙅 안 맞았어요'} ${e.reasons?.length ? `<span class="muted">(${esc(e.reasons.join(', '))})</span>` : ''}`;
    if (e.kind === 'feedback') return `💬 “${esc(e.text)}”`;
    return `🖼️ 작품 사진 ${e.consent ? '<span class="tag st-published">홍보 동의</span>' : '<span class="tag">비공개</span>'} <a href="/admin/photos/${e.id}">보기</a>`;
  };
  return shell({
    nonce,
    tokens,
    title: '받은 소식',
    active: 'inbox',
    body: `<table><tr><th>날짜</th><th>구독자</th><th>콘텐츠</th><th>내용</th></tr>
${events.map((e) => `<tr><td>${esc(e.date)}</td><td><a href="/admin/subscribers/${esc(e.subscriberId)}">${esc(e.subscriberId)}</a></td><td>${e.contentId ? `<a href="/admin/contents/${esc(e.contentId)}">${esc(e.contentId)}</a>` : '-'}</td><td>${line(e)}</td></tr>`).join('') || '<tr><td colspan="4" class="muted">아직 받은 소식이 없어요</td></tr>'}</table>`,
  });
}
