import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadContent } from '../src/content/load.mjs';
import { createApp } from '../src/app/app.mjs';
import { createFileStore } from '../src/app/store-file.mjs';

// 테스트용 콘텐츠: 샘플을 발행 상태로, 2주차에 한 장 더
function fixture() {
  const { content } = loadContent();
  const c = structuredClone(content);
  const c023 = c.cards.find((x) => x.id === 'c023');
  c023.status = 'published';
  const c024 = { ...structuredClone(c023), id: 'c024', title: '둘째 주 놀이' };
  c.cards.push(c024);
  c.sets = [{ id: 'default', title: '기본 셋', weeks: [{ 화: 'c023' }, { 화: 'c024' }] }];
  return c;
}
const at = (iso) => Date.parse(iso);

async function boot({ t = at('2026-10-23T10:00:00+09:00') } = {}) {
  const clock = { t };
  const sent = [];
  const store = createFileStore(mkdtempSync(join(tmpdir(), 'jl-')));
  const content = fixture();
  const app = await createApp({
    store,
    getContent: () => content,
    adminPassword: 'admin-pw',
    notify: async (m) => sent.push(m),
    now: () => clock.t,
    baseUrl: 'https://jjomul.test',
  });
  let jar = {};
  const call = async (path, { method = 'GET', json, form, ip = '1.1.1.1', raw } = {}) => {
    const headers = new Headers();
    const cookie = Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; ');
    if (cookie) headers.set('cookie', cookie);
    let body = raw;
    if (json) {
      headers.set('content-type', 'application/json');
      body = JSON.stringify(json);
    }
    if (form) body = form instanceof FormData ? form : new URLSearchParams(form);
    const r = await app.fetch(new Request(`https://jjomul.test${path}`, { method, headers, body }), { ip });
    for (const c of r.headers.getSetCookie()) {
      const [kv] = c.split(';');
      const [k, v] = kv.split('=');
      if (/Max-Age=0/.test(c)) delete jar[k];
      else jar[k] = v;
    }
    return r;
  };
  const adminLogin = () => call('/admin/login', { method: 'POST', form: { password: 'admin-pw' } });
  /** 어드민으로 구독자를 만들고 비밀번호를 돌려줘요 */
  async function addSubscriber(fields = {}) {
    await adminLogin();
    const r = await call('/admin/subscribers', {
      method: 'POST',
      form: { nickname: '하늘맘', childBirth: '2024-03', type: 'trial', startDate: '2026-10-23', days: '14', band: 'auto', setId: 'default', source: '인스타그램', ...fields },
    });
    const html = await r.text();
    const code = /class="code">([A-Z0-9-]+)</.exec(html)?.[1];
    const id = /(S-\d{4}) /.exec(html)?.[1];
    jar = {};
    return { r, html, code, id };
  }
  const login = (code, ip) => call('/api/login', { method: 'POST', json: { code }, ip });
  return { clock, sent, store, call, login, addSubscriber, adminLogin, reset: () => (jar = {}) };
}

test('구독자 등록 → 비밀번호 1개 발급 → 로그인 → 내 놀이', async () => {
  const b = await boot();
  const { code, id, html } = await b.addSubscriber();
  assert.match(code, /^[A-Z0-9]{4}-[A-Z0-9]{4}$/);
  assert.equal(id, 'S-0001');
  assert.match(html, /체험 기간: 2026-10-23 ~ 2026-11-05/); // 14일
  assert.ok(b.sent.some((m) => m.startsWith('[신규] S-0001 · 체험')));
  const sub = await b.store.subscribers.get('S-0001');
  assert.ok(!JSON.stringify(sub).includes(code.replace('-', '')), '원문 비밀번호는 저장하지 않아요');

  assert.equal((await b.login(code)).status, 200);
  const home = await (await b.call('/home')).text();
  assert.match(home, /찢어서 만드는 가을 나무/);
  assert.match(home, /24~40개월/); // 2024-03생 → 31개월
  assert.match(home, /이번 주 준비물/);
  assert.doesNotMatch(home, /둘째 주 놀이/); // 2주차는 아직
});

test('콘텐츠 페이지: 가이드·A4 1장·워터마크·인쇄 버튼·평가 영역', async () => {
  const b = await boot();
  const { code } = await b.addSubscriber();
  await b.login(code);
  const r = await b.call('/c/c023');
  assert.equal(r.status, 200);
  const html = await r.text();
  assert.equal((html.match(/<section class="sheet/g) ?? []).length, 1, '인쇄 시트는 딱 1장');
  for (const s of ['ID S-0001', 'window.print()', '또 하고 싶어요', '우리 아이와는 안 맞았어요', '안 해봤어요', '작품 보내기', '놀이 순서']) {
    assert.ok(html.includes(s), s);
  }
  assert.equal(r.headers.get('cache-control'), 'no-store');
  assert.equal((await b.call('/c/c024')).status, 403); // 아직 안 열림
  assert.equal((await b.call('/c/c001')).status, 403); // 셋에 없음
});

test('평일마다 하나씩 열리고, 주말엔 쉬고, 지난 놀이 평가를 물어봐요', async () => {
  const b = await boot(); // 금요일 시작 → 금: c023, 월: c024
  const { code } = await b.addSubscriber();
  await b.login(code);
  const fri = await (await b.call('/home')).text();
  assert.match(fri, /오늘의 놀이/);
  assert.match(fri, /1번째 놀이/);

  b.clock.t = at('2026-10-24T10:00:00+09:00'); // 토
  const sat = await (await b.call('/home')).text();
  assert.match(sat, /주말엔 쉬어요/);
  assert.match(sat, /다음 주 준비물/);
  assert.match(sat, /10월 26일 \(월\) 예정/);
  assert.doesNotMatch(sat, /둘째 주 놀이/, '월요일 놀이 제목은 아직 비밀');
  assert.equal((await b.call('/c/c024')).status, 403);

  b.clock.t = at('2026-10-26T00:00:01+09:00'); // 월 00시
  const mon = await (await b.call('/home')).text();
  assert.match(mon, /둘째 주 놀이/);
  assert.match(mon, /2번째 놀이/);
  assert.match(mon, /지난 놀이 어땠어요\?/);
  assert.equal((await b.call('/c/c024')).status, 200);
});

test('준비물은 이번 주에 열릴 놀이까지 미리 보여 주되 제목은 숨겨요', async () => {
  const b = await boot({ t: at('2026-10-26T09:00:00+09:00') }); // 월요일 시작
  const { code } = await b.addSubscriber({ startDate: '2026-10-26' });
  await b.login(code);
  const home = await (await b.call('/home')).text(); // 월 c023, 화 c024
  assert.match(home, /이번 주 준비물/);
  assert.match(home, /10월 27일 \(화\) 예정/);
  assert.doesNotMatch(home, /둘째 주 놀이/, '내일 놀이 제목은 아직 비밀');
});

test('평점: A / D+이유, 다시 누르면 덮어쓰고 슬랙에 구독자·콘텐츠·일자·점수', async () => {
  const b = await boot();
  const { code } = await b.addSubscriber();
  await b.login(code);
  assert.equal((await b.call('/api/rate', { method: 'POST', json: { contentId: 'c023', score: 'A' } })).status, 200);
  assert.ok(b.sent.includes('[평점] S-0001 · c023 · 2026-10-23 · A점'));

  const bad = await b.call('/api/rate', { method: 'POST', json: { contentId: 'c023', score: 'D', reasons: [] } });
  assert.equal(bad.status, 400);
  const r = await b.call('/api/rate', { method: 'POST', json: { contentId: 'c023', score: 'D', reasons: ['안 해봤어요', '없는이유', '의견 보내기'], text: '재료가 없었어요' } });
  assert.equal(r.status, 200);
  assert.ok(b.sent.includes('[평점] S-0001 · c023 · 2026-10-23 · D점 (안 해봤어요, 의견 보내기)'));
  assert.ok(b.sent.some((m) => m.startsWith('[의견] S-0001 · c023') && m.includes('재료가 없었어요')));
  const ratings = await b.store.ratings.list({ subscriberId: 'S-0001' });
  assert.equal(ratings.length, 1);
  assert.equal(ratings[0].score, 'D');
  assert.equal((await b.call('/api/rate', { method: 'POST', json: { contentId: 'c024', score: 'A' } })).status, 403);
});

test('의견·작품 보내기 (사진 형식·동의 기록)', async () => {
  const b = await boot();
  const { code } = await b.addSubscriber();
  await b.login(code);
  assert.equal((await b.call('/api/feedback', { method: 'POST', json: { text: '' } })).status, 400);
  assert.equal((await b.call('/api/feedback', { method: 'POST', json: { contentId: 'c023', text: '너무 좋아요' } })).status, 200);

  const fd = new FormData();
  fd.append('contentId', 'c023');
  fd.append('consent', '1');
  fd.append('file', new File([new Uint8Array([0xff, 0xd8, 0xff])], 'a.jpg', { type: 'image/jpeg' }));
  assert.equal((await b.call('/api/photo', { method: 'POST', form: fd })).status, 200);
  const [p] = await b.store.photos.list();
  assert.equal(p.consent, true);
  assert.ok(b.sent.some((m) => m.startsWith('[작품] S-0001 · c023') && m.includes('홍보 동의 O') && m.includes('/admin/photos/')));

  const txt = new FormData();
  txt.append('contentId', 'c023');
  txt.append('file', new File(['hi'], 'a.txt', { type: 'text/plain' }));
  assert.equal((await b.call('/api/photo', { method: 'POST', form: txt })).status, 400);
});

test('만료 3일 전 안내 → 만료되면 즉시 차단', async () => {
  const b = await boot();
  const { code } = await b.addSubscriber({ days: '7' }); // ~10-29
  await b.login(code);
  assert.doesNotMatch(await (await b.call('/home')).text(), /체험 기간이/);
  b.clock.t = at('2026-10-27T09:00:00+09:00');
  assert.match(await (await b.call('/home')).text(), /체험 기간이 2일 남았어요/);
  b.clock.t = at('2026-10-29T23:00:00+09:00');
  assert.match(await (await b.call('/home')).text(), /체험 기간이 오늘까지/);
  b.clock.t = at('2026-10-30T00:00:00+09:00');
  assert.equal((await b.call('/api/ping')).status, 401);
  assert.equal((await b.call('/home')).status, 303);
  b.reset();
  assert.equal((await b.login(code)).status, 401);
});

test('비밀번호 재발급·정지하면 기존 세션이 끊겨요', async () => {
  const b = await boot();
  const { code } = await b.addSubscriber();
  await b.login(code);
  assert.equal((await b.call('/api/ping')).status, 200);

  // 구독자 세션을 유지한 채 어드민이 재발급 버튼을 눌러요
  await b.adminLogin();
  const html = await (await b.call('/admin/subscribers/S-0001/code', { method: 'POST' })).text();
  const fresh = /class="code">([A-Z0-9-]+)</.exec(html)[1];
  assert.equal((await b.call('/api/ping')).status, 401, '열려 있던 화면이 끊겨요');
  b.reset();
  assert.equal((await b.login(code)).status, 401, '예전 비밀번호는 못 써요');
  assert.equal((await b.login(fresh)).status, 200);

  // 정지
  await b.store.subscribers.update('S-0001', { status: 'stopped' });
  assert.equal((await b.call('/api/ping')).status, 401);
});

test('틀린 비밀번호 5번 → 10분 잠금', async () => {
  const b = await boot();
  const { code } = await b.addSubscriber();
  for (let i = 0; i < 5; i++) assert.equal((await b.login('ZZZZ-ZZZZ', '9.9.9.9')).status, 401);
  assert.equal((await b.login(code, '9.9.9.9')).status, 429);
  b.clock.t += 10 * 60 * 1000 + 1;
  assert.equal((await b.login(code, '9.9.9.9')).status, 200);
});

test('어드민: 비밀번호 없으면 막고, 서랍·구독자·셋·소식함이 열려요', async () => {
  const b = await boot();
  assert.equal((await b.call('/admin/contents')).status, 303);
  assert.equal((await b.call('/admin/login', { method: 'POST', form: { password: 'x' } })).status, 401);
  await b.adminLogin();
  const drawer = await (await b.call('/admin/contents?category=%EB%AA%B8%EB%86%80%EC%9D%B4')).text(); // 몸놀이
  assert.match(drawer, /테이프 길 따라 걷기/);
  assert.doesNotMatch(drawer, /찢어서 만드는 가을 나무/);
  assert.match(await (await b.call('/admin/contents/c023')).text(), /\/admin\/sheet\/c023\/12-24/);
  const sheet = await b.call('/admin/sheet/c023/24-40');
  assert.equal(sheet.headers.get('x-frame-options'), 'SAMEORIGIN');
  for (const p of ['/admin/subscribers', '/admin/sets', '/admin/inbox']) assert.equal((await b.call(p)).status, 200, p);
  // 유효성 검사
  const bad = await b.call('/admin/subscribers', { method: 'POST', form: { nickname: '', childBirth: '2024-03', type: 'trial', startDate: '2026-10-23', days: '7' } });
  assert.equal(bad.status, 400);
});

test('어드민: 구독자별 셋 분석과 정보 수정(기간 연장)', async () => {
  const b = await boot();
  const { code } = await b.addSubscriber({ type: 'subscribe', days: '30' });
  await b.login(code);
  await b.call('/api/rate', { method: 'POST', json: { contentId: 'c023', score: 'A' } });
  b.reset();
  await b.adminLogin();
  const detail = await (await b.call('/admin/subscribers/S-0001')).text();
  assert.match(detail, /또 하고 싶어요/);
  assert.match(detail, /찢기·붙이기/);
  const r = await b.call('/admin/subscribers/S-0001', {
    method: 'POST',
    form: { nickname: '하늘맘', childBirth: '2024-03', type: 'subscribe', startDate: '2026-10-23', endDate: '2026-12-31', band: '12-24', setId: 'default', status: 'active' },
  });
  assert.equal(r.status, 303);
  const s = await b.store.subscribers.get('S-0001');
  assert.equal(s.endDate, '2026-12-31');
  assert.equal(s.band, '12-24');
  const re = await (await b.call('/admin/subscribers/S-0001/code', { method: 'POST' })).text();
  assert.match(re, /class="code">[A-Z0-9]{4}-[A-Z0-9]{4}</);
});

test('메모장: 추가 → 서랍에 보이고 → 콘텐츠화 연결', async () => {
  const b = await boot();
  await b.adminLogin();
  assert.equal((await b.call('/admin/ideas', { method: 'POST', form: { title: '', summary: 'x' } })).status, 400);
  const r = await b.call('/admin/ideas', { method: 'POST', form: { title: '양말 짝 맞추기', summary: '빨래 갤 때 같이', category: '집기·옮기기' } });
  assert.equal(r.status, 303);
  const drawer = await (await b.call('/admin/contents')).text();
  assert.match(drawer, /양말 짝 맞추기/);
  assert.match(drawer, /메모 1개/);
  const [memo] = await b.store.ideas.list();
  assert.equal(memo.source, 'memo');
  await b.call(`/admin/ideas/${memo.id}`, { method: 'POST', form: { status: 'done', contentId: 'c050', back: '/admin/contents#memo' } });
  const [after] = await b.store.ideas.list();
  assert.deepEqual([after.status, after.contentId], ['done', 'c050']);
  assert.match(await (await b.call('/admin/contents')).text(), /메모 0개/);
});

test('수집함: 지금 수집하기 → 중복 없이 저장 → 상태 분류', async () => {
  const items = [
    { source: 'youtube', title: '종이컵 탑', summary: '쌓아요', url: 'https://y/1' },
    { source: 'instagram', title: '스펀지 놀이', summary: '꾹', url: 'https://i/1' },
  ];
  const clock = { t: at('2026-10-23T10:00:00+09:00') };
  const store = createFileStore(mkdtempSync(join(tmpdir(), 'jl-')));
  const sent = [];
  const app = await createApp({ store, getContent: fixture, adminPassword: 'pw', notify: async (m) => sent.push(m), now: () => clock.t, collect: async () => ({ items, errors: ['유튜브 @x: 404'] }) });
  const req = (path, init = {}) => app.fetch(new Request(`https://t${path}`, init));
  const login = await req('/admin/login', { method: 'POST', body: new URLSearchParams({ password: 'pw' }) });
  const cookie = login.headers.getSetCookie()[0].split(';')[0];
  const run = await req('/admin/collect', { method: 'POST', headers: { cookie } });
  assert.match(decodeURIComponent(run.headers.get('location')), /새로 2개 · 이미 있음 0개 · 문제 1건/);
  await req('/admin/collect', { method: 'POST', headers: { cookie } });
  assert.equal((await store.ideas.list()).length, 2, '같은 링크는 한 번만');
  assert.ok(sent.includes('[수집] 새 아이디어 2개가 수집함에 들어왔어요'));
  const page = await (await req('/admin/collected?source=instagram', { headers: { cookie } })).text();
  assert.match(page, /스펀지 놀이/);
  assert.doesNotMatch(page, /종이컵 탑/);
  const yt = (await store.ideas.list()).find((i) => i.source === 'youtube');
  await req(`/admin/ideas/${yt.id}`, { method: 'POST', headers: { cookie }, body: new URLSearchParams({ status: 'drop', back: '/admin/collected' }) });
  assert.doesNotMatch(await (await req('/admin/collected', { headers: { cookie } })).text(), /종이컵 탑/, '제외는 기본 목록에서 숨김');
});
