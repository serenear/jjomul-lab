// 로컬·VPS용 Node 서버. 사용법: npm run dev
// 환경변수: PORT, DATA_DIR, ADMIN_PASSWORD, SLACK_WEBHOOK_URL, BASE_URL, TRUST_PROXY=1, COOKIE_SECURE=1
//          (수집기) YOUTUBE_API_KEY, IG_USER_ID, IG_ACCESS_TOKEN, IG_GRAPH_VERSION
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ROOT, loadContent } from './content/load.mjs';
import { createApp } from './app/app.mjs';
import { createFileStore } from './app/store-file.mjs';
import { slackNotifier } from './app/slack.mjs';
import { nodeCollector } from './collect/run.mjs';

const FONT_ROOT = join(ROOT, 'node_modules', '@fontsource');
const FONT_DIRS = ['gowun-dodum', 'noto-sans-kr'];
const MIME = { '.css': 'text/css; charset=utf-8', '.woff2': 'font/woff2', '.woff': 'font/woff' };

/** 개발용: 콘텐츠를 요청마다 다시 읽어 YAML 수정이 바로 보여요 */
function liveContent() {
  let lastErrors = '';
  return () => {
    const { content, errors } = loadContent();
    const sig = errors.join('\n');
    if (sig && sig !== lastErrors) console.error(`콘텐츠 오류 ${errors.length}건 — npm run validate 로 확인하세요`);
    lastErrors = sig;
    return content;
  };
}

async function serveFont(pathname, res) {
  const rel = decodeURIComponent(pathname.slice('/fonts/'.length));
  const file = resolve(FONT_ROOT, rel);
  const ext = file.slice(file.lastIndexOf('.'));
  if (!file.startsWith(FONT_ROOT + sep) || !FONT_DIRS.includes(rel.split('/')[0]) || !MIME[ext]) {
    res.writeHead(404).end();
    return;
  }
  try {
    const body = await readFile(file);
    res.writeHead(200, { 'content-type': MIME[ext], 'cache-control': 'public, max-age=604800' }).end(body);
  } catch {
    res.writeHead(404).end();
  }
}

export async function startServer({
  port = Number(process.env.PORT) || 3000,
  host = '0.0.0.0',
  dataDir = process.env.DATA_DIR || join(ROOT, 'viewer-data'),
  getContent = liveContent(),
  ...opts
} = {}) {
  const trustProxy = process.env.TRUST_PROXY === '1';
  const app = await createApp({
    store: createFileStore(dataDir),
    getContent,
    adminPassword: process.env.ADMIN_PASSWORD ?? '',
    notify: slackNotifier(process.env.SLACK_WEBHOOK_URL),
    baseUrl: process.env.BASE_URL ?? '',
    secureCookies: trustProxy || process.env.COOKIE_SECURE === '1',
    collect: nodeCollector,
    ...opts,
  });

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    if (req.method === 'GET' && url.pathname.startsWith('/fonts/')) return serveFont(url.pathname, res);

    const chunks = [];
    for await (const c of req) chunks.push(c);
    const body = ['GET', 'HEAD'].includes(req.method) ? undefined : Buffer.concat(chunks);
    const headers = new Headers();
    for (const [k, v] of Object.entries(req.headers)) if (v !== undefined) headers.set(k, Array.isArray(v) ? v.join(', ') : v);
    const ip = (trustProxy && req.headers['x-forwarded-for']?.split(',')[0].trim()) || req.socket.remoteAddress || 'unknown';

    const r = await app.fetch(new Request(`http://${req.headers.host ?? 'localhost'}${req.url}`, { method: req.method, headers, body }), { ip });
    const out = {};
    r.headers.forEach((v, k) => {
      if (k !== 'set-cookie') out[k] = v;
    });
    const cookies = r.headers.getSetCookie();
    if (cookies.length) out['set-cookie'] = cookies;
    res.writeHead(r.status, out).end(Buffer.from(await r.arrayBuffer()));
  });
  await new Promise((ok) => server.listen(port, host, ok));
  return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const server = await startServer();
  const { port } = server.address();
  console.log(`쪼물랩 실행 중 → http://localhost:${port}  (어드민: /admin${process.env.ADMIN_PASSWORD ? '' : ' — ADMIN_PASSWORD 설정 필요'})`);
}
