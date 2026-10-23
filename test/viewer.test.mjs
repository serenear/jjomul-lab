import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createStore } from '../src/viewer/codes.mjs';
import { createViewer } from '../src/viewer/server.mjs';

const DAY = 86400000;
const tmp = () => mkdtempSync(join(tmpdir(), 'jl-'));

test('비밀번호: 형식·해시 저장·대소문자/하이픈 무시', () => {
  const dir = tmp();
  const store = createStore(dir);
  const { code } = store.issue({ packs: ['week-01'], days: 7 });
  assert.match(code, /^[A-HJKMNP-Z2-9]{4}-[A-HJKMNP-Z2-9]{4}$/);
  assert.ok(!readFileSync(join(dir, 'codes.json'), 'utf8').includes(code.replace('-', '')));
  assert.ok(store.verify(code.toLowerCase().replace('-', ' ')).ok);
  assert.equal(store.verify('AAAA-AAAA').reason, 'invalid');
});

test('비밀번호: 만료와 폐기', () => {
  const store = createStore(tmp());
  const t0 = 1_000_000;
  const { code, record } = store.issue({ packs: ['week-01'], days: 1, now: t0 });
  assert.ok(store.verify(code, t0 + DAY - 1).ok);
  assert.equal(store.verify(code, t0 + DAY).reason, 'expired');
  store.revoke(record.id);
  assert.equal(store.verify(code, t0 + 1).reason, 'revoked');
});

test('비밀번호: 잘못된 입력은 발급 거부', () => {
  const store = createStore(tmp());
  assert.throws(() => store.issue({ packs: ['../etc'], days: 1 }));
  assert.throws(() => store.issue({ packs: ['week-01'], days: 0 }));
});

async function boot(clock) {
  const dir = tmp();
  const server = createViewer({ dataDir: dir, now: () => clock.t });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const store = createStore(dir);
  const login = (code) =>
    fetch(`${base}/api/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ code }) });
  return { server, base, store, login };
}

test('뷰어: 로그인 → 열람 → 만료 시 차단', async () => {
  const clock = { t: Date.now() };
  const { server, base, store, login } = await boot(clock);
  try {
    const { code } = store.issue({ packs: ['week-01'], days: 1, now: clock.t });

    // 로그인 전: 열람 불가
    const anon = await fetch(`${base}/view/week-01`, { redirect: 'manual' });
    assert.equal(anon.status, 302);

    const r = await login(code);
    assert.equal(r.status, 200);
    const cookie = r.headers.get('set-cookie').split(';')[0];
    assert.match(r.headers.get('set-cookie'), /HttpOnly; SameSite=Strict/);
    const h = { cookie };

    const view = await fetch(`${base}/view/week-01`, { headers: h });
    assert.equal(view.status, 200);
    const html = await view.text();
    assert.match(html, /찢어서 만드는 가을 나무/);
    assert.match(html, /wm-print/);
    assert.match(html, /window\.print\(\)/);
    assert.equal(view.headers.get('cache-control'), 'no-store');
    assert.ok(!view.headers.get('content-disposition'));

    // 허용되지 않은 묶음
    assert.equal((await fetch(`${base}/view/week-02`, { headers: h })).status, 403);
    assert.equal((await fetch(`${base}/view/month-01`, { headers: h })).status, 403);

    // 만료되면 보던 세션도 즉시 끊김
    clock.t += DAY + 1;
    assert.equal((await fetch(`${base}/api/ping`, { headers: h })).status, 401);
    assert.equal((await fetch(`${base}/view/week-01`, { headers: h, redirect: 'manual' })).status, 302);
    assert.equal((await login(code)).status, 401);
  } finally {
    server.close();
  }
});

test('뷰어: 폐기하면 바로 끊기고, 조작된 쿠키는 거부', async () => {
  const clock = { t: Date.now() };
  const { server, base, store, login } = await boot(clock);
  try {
    const { code, record } = store.issue({ packs: ['week-01'], days: 3, now: clock.t });
    const cookie = (await login(code)).headers.get('set-cookie').split(';')[0];
    assert.equal((await fetch(`${base}/api/ping`, { headers: { cookie } })).status, 200);
    assert.equal((await fetch(`${base}/api/ping`, { headers: { cookie: `${cookie}x` } })).status, 401);
    store.revoke(record.id);
    assert.equal((await fetch(`${base}/api/ping`, { headers: { cookie } })).status, 401);
  } finally {
    server.close();
  }
});

test('뷰어: 틀린 비밀번호를 5번 넘게 넣으면 잠시 막아요', async () => {
  const clock = { t: Date.now() };
  const { server, store, login } = await boot(clock);
  try {
    const { code } = store.issue({ packs: ['week-01'], days: 1, now: clock.t });
    for (let i = 0; i < 5; i++) assert.equal((await login('ZZZZ-ZZZZ')).status, 401);
    assert.equal((await login('ZZZZ-ZZZZ')).status, 429);
    assert.equal((await login(code)).status, 429); // 맞는 비밀번호도 잠시 대기
    clock.t += 10 * 60 * 1000 + 1;
    assert.equal((await login(code)).status, 200);
  } finally {
    server.close();
  }
});

test('뷰어: 글꼴 경로 이탈 차단', async () => {
  const { server, base } = await boot({ t: Date.now() });
  try {
    assert.equal((await fetch(`${base}/fonts/gowun-dodum/400.css`)).status, 200);
    assert.equal((await fetch(`${base}/fonts/..%2F..%2Fpackage.json`)).status, 404);
    assert.equal((await fetch(`${base}/fonts/yaml/package.json`)).status, 404);
  } finally {
    server.close();
  }
});
