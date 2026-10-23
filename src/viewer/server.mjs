// 사용법: node src/viewer/server.mjs   (PORT, VIEWER_DATA_DIR, TRUST_PROXY=1, COOKIE_SECURE=1)
import http from 'node:http';
import { randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ROOT, loadCards, readArt } from '../cards.mjs';
import { documentHtml, SIZES } from '../render.mjs';
import { createStore } from './codes.mjs';
import { loginPage, libraryPage, viewerExtras } from './pages.mjs';

const FONT_ROOT = join(ROOT, 'node_modules', '@fontsource');
const FONT_DIRS = ['gowun-dodum', 'noto-sans-kr'];
const MIME = { '.css': 'text/css; charset=utf-8', '.woff2': 'font/woff2', '.woff': 'font/woff' };
const SESSION = 'jl_session';
const MAX_FAILS = 5;
const FAIL_WINDOW_MS = 10 * 60 * 1000;

function resolvePack(pack, cards) {
  let m;
  let list;
  let title;
  if ((m = /^week-(\d+)$/.exec(pack))) {
    list = cards.filter((c) => c.week === +m[1]);
    title = `${+m[1]}주차 놀이 카드`;
  } else if ((m = /^month-(\d+)$/.exec(pack))) {
    list = cards.filter((c) => Math.ceil(c.week / 4) === +m[1]);
    title = `${+m[1]}개월차 놀이 카드`;
  } else if ((m = /^card-([a-z0-9-]+)$/.exec(pack))) {
    list = cards.filter((c) => c.id === m[1]);
    title = list[0]?.title;
  }
  return list?.length ? { pack, title, cards: list, count: list.length } : null;
}

export function createViewer({ dataDir = process.env.VIEWER_DATA_DIR || join(ROOT, 'viewer-data'), now = () => Date.now() } = {}) {
  const store = createStore(dataDir);
  const fails = new Map(); // ip → { n, resetAt }
  const trustProxy = process.env.TRUST_PROXY === '1';

  const ipOf = (req) =>
    (trustProxy && req.headers['x-forwarded-for']?.split(',')[0].trim()) || req.socket.remoteAddress || 'unknown';
  const cookieOf = (req) =>
    Object.fromEntries((req.headers.cookie ?? '').split(/;\s*/).filter(Boolean).map((c) => c.split(/=(.*)/s).slice(0, 2)))[SESSION];

  function send(res, status, body, { type = 'text/html; charset=utf-8', nonce, headers = {} } = {}) {
    res.writeHead(status, {
      'content-type': type,
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
      'x-frame-options': 'DENY',
      'referrer-policy': 'no-referrer',
      'content-security-policy': `default-src 'none'; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src data:; script-src ${nonce ? `'nonce-${nonce}'` : "'none'"}; connect-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'`,
      ...headers,
    });
    res.end(body);
  }
  const json = (res, status, obj, headers) => send(res, status, JSON.stringify(obj), { type: 'application/json', headers });
  const redirect = (res, to, headers) => send(res, 302, '', { headers: { location: to, ...headers } });
  const clearCookie = `${SESSION}=; Path=/; Max-Age=0; HttpOnly; SameSite=Strict`;

  async function readJson(req) {
    let raw = '';
    for await (const chunk of req) {
      raw += chunk;
      if (raw.length > 1024) throw new Error('too large');
    }
    return JSON.parse(raw || '{}');
  }

  async function login(req, res) {
    const ip = ipOf(req);
    const f = fails.get(ip);
    if (f && f.resetAt > now() && f.n >= MAX_FAILS) {
      return json(res, 429, { message: '시도가 너무 많아요. 10분 뒤에 다시 입력해 주세요.' });
    }
    let code;
    try {
      ({ code } = await readJson(req));
    } catch {
      return json(res, 400, { message: '요청을 읽지 못했어요.' });
    }
    const r = store.verify(code, now());
    if (!r.ok) {
      if (r.reason === 'expired') return json(res, 401, { message: '이용 기간이 끝난 비밀번호예요.' });
      const cur = f && f.resetAt > now() ? f : { n: 0, resetAt: now() + FAIL_WINDOW_MS };
      fails.set(ip, { n: cur.n + 1, resetAt: cur.resetAt });
      return json(res, 401, { message: '비밀번호를 다시 확인해 주세요.' });
    }
    fails.delete(ip);
    const maxAge = Math.floor((r.record.expiresAt - now()) / 1000);
    const secure = trustProxy || process.env.COOKIE_SECURE === '1' ? '; Secure' : '';
    return json(res, 200, { ok: true }, {
      'set-cookie': `${SESSION}=${store.sign(r.record)}; Path=/; Max-Age=${maxAge}; HttpOnly; SameSite=Strict${secure}`,
    });
  }

  async function font(url, res) {
    const rel = decodeURIComponent(url.pathname.slice('/fonts/'.length));
    const file = resolve(FONT_ROOT, rel);
    const [dir] = rel.split('/');
    const ext = file.slice(file.lastIndexOf('.'));
    if (!file.startsWith(FONT_ROOT + sep) || !FONT_DIRS.includes(dir) || !MIME[ext]) return send(res, 404, 'not found', { type: 'text/plain' });
    try {
      const body = await readFile(file);
      return send(res, 200, body, { type: MIME[ext], headers: { 'cache-control': 'public, max-age=86400' } });
    } catch {
      return send(res, 404, 'not found', { type: 'text/plain' });
    }
  }

  return http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://x');
    const nonce = randomBytes(12).toString('base64');
    try {
      if (req.method === 'GET' && url.pathname.startsWith('/fonts/')) return font(url, res);
      if (req.method === 'POST' && url.pathname === '/api/login') return login(req, res);
      if (req.method === 'POST' && url.pathname === '/api/logout') return json(res, 200, { ok: true }, { 'set-cookie': clearCookie });

      const a = store.access(cookieOf(req), now());
      if (req.method === 'GET' && url.pathname === '/api/ping') {
        return a.ok ? json(res, 200, { ok: true, expiresAt: a.record.expiresAt }) : json(res, 401, { ok: false });
      }
      if (req.method === 'GET' && url.pathname === '/') {
        if (a.ok) return redirect(res, '/library');
        const notice = url.searchParams.get('expired') ? '이용 기간이 끝났어요. 새 비밀번호를 입력해 주세요.' : '';
        return send(res, 200, loginPage(nonce, notice), { nonce });
      }
      if (!a.ok) return redirect(res, '/?expired=1', { 'set-cookie': clearCookie });

      const { cards } = loadCards();
      if (req.method === 'GET' && url.pathname === '/library') {
        const packs = a.record.packs.map((p) => resolvePack(p, cards)).filter(Boolean);
        return send(res, 200, libraryPage(nonce, a.record, packs, now()), { nonce });
      }
      const m = /^\/view\/([a-z0-9-]+)$/.exec(url.pathname);
      if (req.method === 'GET' && m) {
        if (!a.record.packs.includes(m[1])) return send(res, 403, '이 비밀번호로는 볼 수 없는 카드예요.', { type: 'text/plain; charset=utf-8' });
        const pack = resolvePack(m[1], cards);
        if (!pack) return send(res, 404, '카드를 찾지 못했어요.', { type: 'text/plain; charset=utf-8' });
        const size = SIZES[url.searchParams.get('size')] ? url.searchParams.get('size') : 'A4';
        const x = viewerExtras(nonce, a.record);
        let html = documentHtml(pack.cards, readArt, {
          size,
          fontsBase: '/fonts',
          extraHead: x.head,
          extraBody: x.body,
          wrap: (pages) => `<div id="sheet">${pages}</div>`,
        });
        // 인쇄물(PDF로 저장해도 남음) 하단에 발급 ID를 작게 넣어요 — 유출 시 추적용
        html = html.replaceAll('</section>', `<div class="wm-print">${x.stamp}</div></section>`);
        return send(res, 200, html, { nonce });
      }
      return send(res, 404, 'not found', { type: 'text/plain' });
    } catch (e) {
      console.error(e);
      return send(res, 500, '문제가 생겼어요. 잠시 후 다시 시도해 주세요.', { type: 'text/plain; charset=utf-8' });
    }
  });
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const port = Number(process.env.PORT) || 3000;
  createViewer().listen(port, () => console.log(`뷰어 실행 중 → http://localhost:${port}`));
}
