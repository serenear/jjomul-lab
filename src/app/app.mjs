// 앱 본체: Request → Response. Node 서버와 Cloudflare Workers에서 똑같이 돌아가요.
import { BANDS, flattenSet } from '../content/schema.mjs';
import { BRAND } from '../render/html.mjs';
import { sheetDocument } from '../render/sheet.mjs';
import {
  DAY, ageMonths, bandForMonths, dateStart, hmacSigner, kstDate, kstLabel, normalizeCode,
  isWeekday, randomCode, randomId, safeEqual, weekStart, weekdayDates,
} from './util.mjs';
import { REASONS, contentPage, homePage, loginPage } from './views/viewer.mjs';
import {
  SOURCES, adminLoginPage, codeIssuedPage, collectedPage, contentDetailPage, contentsPage, inboxPage, setsPage,
  subscriberDetailPage, subscribersPage,
} from './views/admin.mjs';
import { parseIdeaUpdate, parseMemo, saveIdeas } from '../collect/ideas.mjs';

const SESSION = 'jl_s';
const ADMIN = 'jl_a';
const MAX_FAILS = 5;
const FAIL_WINDOW = 10 * 60 * 1000;
const ADMIN_HOURS = 12;
const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];
const PHOTO_MAX = 10 * 1024 * 1024;

export async function createApp({
  store,
  getContent, // () => 콘텐츠 묶음 (cards, sets, art, css)
  adminPassword = '',
  notify = async () => {}, // (text) => 슬랙 등으로 알림
  collect = null, // async () => ({ items, errors }) — 아이놀이 수집기 (없으면 버튼 숨김)
  now = () => Date.now(),
  baseUrl = '',
  secureCookies = false,
}) {
  const sign = await hmacSigner(store.secret);
  const fails = new Map(); // 로그인 실패 횟수 (key → {n, resetAt})
  const hits = new Map(); // API 호출 횟수

  // ---------- 응답 도우미 ----------
  const csp = (nonce, frame) =>
    `default-src 'none'; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self' data:; script-src ${nonce ? `'nonce-${nonce}'` : "'none'"}; connect-src 'self'; form-action 'self'; frame-src 'self'; base-uri 'none'; frame-ancestors ${frame ? "'self'" : "'none'"}`;
  function respond(body, { status = 200, type = 'text/html; charset=utf-8', nonce, frame = false, headers = {} } = {}) {
    return new Response(body, {
      status,
      headers: {
        'content-type': type,
        'cache-control': 'no-store',
        'x-content-type-options': 'nosniff',
        'x-frame-options': frame ? 'SAMEORIGIN' : 'DENY',
        'referrer-policy': 'no-referrer',
        'content-security-policy': csp(nonce, frame),
        ...headers,
      },
    });
  }
  const json = (obj, status = 200, headers) => respond(JSON.stringify(obj), { status, type: 'application/json', headers });
  const redirect = (to, headers = {}) => respond('', { status: 303, headers: { location: to, ...headers } });
  const text = (msg, status) => respond(msg, { status, type: 'text/plain; charset=utf-8' });
  const cookie = (name, value, maxAge, path = '/') =>
    `${name}=${value}; Path=${path}; Max-Age=${maxAge}; HttpOnly; SameSite=Strict${secureCookies ? '; Secure' : ''}`;
  const cookiesOf = (req) =>
    Object.fromEntries((req.headers.get('cookie') ?? '').split(/;\s*/).filter(Boolean).map((c) => c.split(/=(.*)/s).slice(0, 2)));
  const newNonce = () => btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(12))));

  const blocked = (key, t) => {
    const f = fails.get(key);
    return f && f.resetAt > t && f.n >= MAX_FAILS;
  };
  const fail = (key, t) => {
    const f = fails.get(key);
    const cur = f && f.resetAt > t ? f : { n: 0, resetAt: t + FAIL_WINDOW };
    fails.set(key, { n: cur.n + 1, resetAt: cur.resetAt });
  };
  /** 1분에 max번까지 */
  const throttled = (key, t, max = 30) => {
    const h = hits.get(key);
    const cur = h && h.resetAt > t ? h : { n: 0, resetAt: t + 60000 };
    hits.set(key, { n: cur.n + 1, resetAt: cur.resetAt });
    return cur.n + 1 > max;
  };
  async function readJson(req) {
    const raw = await req.text();
    if (raw.length > 4096) throw new Error('too large');
    return JSON.parse(raw || '{}');
  }

  // ---------- 구독자 · 일정 ----------
  const endAt = (s) => dateStart(s.endDate) + DAY; // 종료일 23:59:59 KST 까지
  const daysLeftOf = (s, t) => Math.ceil((endAt(s) - t) / DAY) - 1; // 종료일 당일 = 0
  function stateOf(s, t) {
    if (s.status === 'stopped') return 'stopped';
    if (t >= endAt(s)) return 'expired';
    if (t < dateStart(s.startDate)) return 'upcoming';
    return 'active';
  }
  function bandOf(s, t) {
    const months = ageMonths(s.childBirth, t);
    return { months, band: s.band && s.band !== 'auto' ? s.band : bandForMonths(months) };
  }
  /**
   * 구독자의 셋을 펼쳐요. 셋의 순서대로, 시작일부터 평일마다 하나씩 00:00 KST에 열려요.
   * 이용 기간이 끝난 뒤의 날짜는 열리지 않아요.
   */
  function scheduleOf(s, content, t) {
    const set = content.sets.find((x) => x.id === s.setId) ?? content.sets.find((x) => x.id === 'default');
    const byId = new Map(content.cards.map((c) => [c.id, c]));
    const { band } = bandOf(s, t);
    const list = flattenSet(set);
    const dates = weekdayDates(s.startDate, list.length);
    return {
      band,
      todayYmd: kstDate(t),
      isWeekday: isWeekday(t),
      // 준비물 안내 주간: 평일엔 이번 주, 주말엔 다음 주 (주말에 장보기 하도록)
      prepWeek: isWeekday(t) ? [weekStart(t), weekStart(t) + 7 * DAY] : [weekStart(t) + 7 * DAY, weekStart(t) + 14 * DAY],
      items: list.map((x, i) => {
        const ms = dates[i];
        const card = byId.get(x.id);
        const ready = !!card && card.status === 'published' && !!card.versions?.[band];
        return { ...x, index: i + 1, card, ms, ymd: kstDate(ms), dateLabel: kstLabel(ms), open: t >= ms && ms < endAt(s), ready };
      }),
    };
  }
  const visibleItems = (sch) => sch.items.filter((x) => x.open && x.ready);

  async function sessionToken(s) {
    const body = `${s.id}.${s.codeVer}`;
    return `${body}.${await sign(`s:${body}`)}`;
  }
  async function currentSub(req, t) {
    const [id, ver, sig] = String(cookiesOf(req)[SESSION] ?? '').split('.');
    if (!id || !ver || !sig || !safeEqual(sig, await sign(`s:${id}.${ver}`))) return null;
    const sub = await store.subscribers.get(id);
    if (!sub || String(sub.codeVer) !== ver) return null;
    const state = stateOf(sub, t);
    return state === 'active' || state === 'upcoming' ? sub : null;
  }
  async function issueCode(sub) {
    const code = randomCode();
    const updated = await store.subscribers.update(sub.id, {
      codeHash: await sign(`c:${normalizeCode(code)}`),
      codeVer: (sub.codeVer ?? 0) + 1,
    });
    return { code, sub: updated };
  }
  const welcome = (s, code) =>
    [
      `[${BRAND.name}] 놀이 카드 ${s.type === 'trial' ? '체험' : '이용'} 안내`,
      `${s.nickname} 님, 반가워요!`,
      `열람 주소: ${baseUrl || '(서비스 주소)'}`,
      `비밀번호: ${code}`,
      `${s.type === 'trial' ? '체험' : '이용'} 기간: ${s.startDate} ~ ${s.endDate}`,
      '평일 아침마다 새 놀이가 하나씩 열려요.',
    ].join('\n');

  // ---------- 어드민 ----------
  async function isAdmin(req, t) {
    const [exp, sig] = String(cookiesOf(req)[ADMIN] ?? '').split('.');
    return !!exp && Number(exp) > t && !!sig && safeEqual(sig, await sign(`a:${exp}`));
  }
  function parseSubscriber(f, content, { isNew }) {
    const g = (k) => String(f.get(k) ?? '').trim();
    const d = {
      nickname: g('nickname'),
      childBirth: g('childBirth'),
      type: g('type'),
      startDate: g('startDate'),
      endDate: g('endDate'),
      band: g('band') || 'auto',
      setId: g('setId') || 'default',
      source: g('source'),
      referredBy: g('referredBy').toUpperCase(),
      payerName: g('payerName'),
      phone: g('phone'),
      memo: g('memo'),
    };
    const ymd = /^\d{4}-\d{2}-\d{2}$/;
    if (isNew && !d.endDate && ymd.test(d.startDate)) {
      const days = Number(g('days'));
      if (!(days >= 1 && days <= 400)) return { error: '기간(일)은 1~400 사이로 입력해 주세요' };
      d.endDate = kstDate(dateStart(d.startDate) + (days - 1) * DAY);
    }
    if (!isNew) d.status = g('status');
    if (!d.nickname || d.nickname.length > 30) return { error: '별칭을 1~30자로 입력해 주세요' };
    if (!/^\d{4}-\d{2}$/.test(d.childBirth)) return { error: '아이 생년월을 입력해 주세요' };
    if (!['subscribe', 'trial'].includes(d.type)) return { error: '유형을 골라 주세요' };
    if (!ymd.test(d.startDate) || !ymd.test(d.endDate) || d.endDate < d.startDate) return { error: '시작일·종료일을 확인해 주세요' };
    if (!['auto', ...BANDS].includes(d.band)) return { error: '연령 구간을 확인해 주세요' };
    if (!content.sets.some((s) => s.id === d.setId)) return { error: '콘텐츠 셋을 확인해 주세요' };
    if (d.source && !SOURCES.includes(d.source)) return { error: '유입 경로를 확인해 주세요' };
    if (d.referredBy && !/^S-\d{4}$/.test(d.referredBy)) return { error: '추천인은 S-0001 형식이에요' };
    if (d.phone && !/^[0-9+\- ]{8,20}$/.test(d.phone)) return { error: '연락처 형식을 확인해 주세요' };
    if (d.payerName.length > 30 || d.memo.length > 500) return { error: '입금자명·메모가 너무 길어요' };
    if (!isNew && !['active', 'stopped'].includes(d.status)) return { error: '상태를 확인해 주세요' };
    return { data: d };
  }
  function subStats(s, sch, ratings) {
    const mine = ratings.filter((r) => r.subscriberId === s.id);
    return {
      total: visibleItems(sch).length,
      done: mine.filter((r) => !r.reasons.includes('안 해봤어요')).length,
      A: mine.filter((r) => r.score === 'A').length,
      D: mine.filter((r) => r.score === 'D').length,
    };
  }

  async function handleAdmin(req, url, t, ip, nonce, content) {
    const tokens = content.css.tokens;
    const path = url.pathname;
    const isPost = req.method === 'POST';

    if (path === '/admin/login') {
      if (!adminPassword) return text('ADMIN_PASSWORD 환경변수를 설정하면 어드민을 쓸 수 있어요.', 503);
      if (!isPost) return respond(adminLoginPage({ nonce, tokens }), { nonce });
      if (blocked(`admin:${ip}`, t)) return respond(adminLoginPage({ nonce, tokens, notice: '시도가 너무 많아요. 10분 뒤에 다시 해 주세요.' }), { status: 429, nonce });
      const pw = String((await req.formData()).get('password') ?? '');
      if (!safeEqual(await sign(`p:${pw}`), await sign(`p:${adminPassword}`))) {
        fail(`admin:${ip}`, t);
        return respond(adminLoginPage({ nonce, tokens, notice: '비밀번호가 달라요.' }), { status: 401, nonce });
      }
      const exp = t + ADMIN_HOURS * 3600000;
      return redirect('/admin/contents', { 'set-cookie': cookie(ADMIN, `${exp}.${await sign(`a:${exp}`)}`, ADMIN_HOURS * 3600, '/admin') });
    }
    if (!adminPassword || !(await isAdmin(req, t))) return redirect('/admin/login');

    const cardsById = new Map(content.cards.map((c) => [c.id, c]));
    const allRatings = await store.ratings.list();
    let m;

    if (path === '/admin' || path === '/admin/') return redirect('/admin/contents');

    if (path === '/admin/contents') {
      const q = Object.fromEntries(url.searchParams);
      const kw = (q.q ?? '').trim().toLowerCase();
      const shown = content.cards.filter(
        (c) =>
          (!q.status || c.status === q.status) &&
          (!q.category || c.category === q.category) &&
          (!q.season || c.season === q.season) &&
          (!kw || [c.id, c.title, ...(c.tags ?? [])].some((x) => x.toLowerCase().includes(kw))),
      );
      const scores = new Map();
      for (const r of allRatings) {
        const s = scores.get(r.contentId) ?? { A: 0, D: 0 };
        s[r.score] += 1;
        scores.set(r.contentId, s);
      }
      const memos = (await store.ideas.list()).filter((i) => i.source === 'memo');
      return respond(contentsPage({ nonce, tokens, cards: { all: content.cards, shown }, q, scores, memos }), { nonce });
    }
    if ((m = /^\/admin\/contents\/(c\d{3})$/.exec(path))) {
      const card = cardsById.get(m[1]);
      if (!card) return text('콘텐츠가 없어요', 404);
      const usedIn = content.sets.flatMap((s) => flattenSet(s).filter((x) => x.id === card.id).map((x) => ({ ...x, set: s.title })));
      const feedback = (await store.feedback.list()).filter((f) => f.contentId === card.id);
      return respond(contentDetailPage({ nonce, tokens, card, ratings: allRatings.filter((r) => r.contentId === card.id), feedback, usedIn }), { nonce });
    }
    if ((m = /^\/admin\/sheet\/(c\d{3})\/(12-24|24-40)$/.exec(path))) {
      const card = cardsById.get(m[1]);
      if (!card?.versions?.[m[2]]) return text('버전이 없어요', 404);
      return respond(sheetDocument([{ card, band: m[2] }], content, { fontsBase: '/fonts' }), { frame: true });
    }

    const subscriberRows = async () =>
      (await store.subscribers.list())
        .map((s) => ({ s, state: stateOf(s, t), ...bandOf(s, t), daysLeft: daysLeftOf(s, t), ...subStats(s, scheduleOf(s, content, t), allRatings) }))
        .reverse();
    if (path === '/admin/subscribers' && !isPost) {
      return respond(subscribersPage({ nonce, tokens, rows: await subscriberRows(), sets: content.sets, today: kstDate(t) }), { nonce });
    }
    if (path === '/admin/subscribers' && isPost) {
      const r = parseSubscriber(await req.formData(), content, { isNew: true });
      if (r.error) return respond(subscribersPage({ nonce, tokens, rows: await subscriberRows(), sets: content.sets, today: kstDate(t), error: r.error }), { status: 400, nonce });
      const created = await store.subscribers.create({ ...r.data, status: 'active', codeVer: 0, createdAt: t });
      const { code, sub } = await issueCode(created);
      await notify(`[신규] ${sub.id} · ${sub.type === 'trial' ? '체험' : '구독'} · ${sub.startDate}~${sub.endDate}${sub.source ? ` · ${sub.source}` : ''}${sub.referredBy ? ` · 추천 ${sub.referredBy}` : ''}`);
      return respond(codeIssuedPage({ nonce, tokens, sub, code, message: welcome(sub, code) }), { nonce });
    }
    if ((m = /^\/admin\/subscribers\/(S-\d{4})(\/code)?$/.exec(path))) {
      const sub = await store.subscribers.get(m[1]);
      if (!sub) return text('구독자가 없어요', 404);
      if (isPost && m[2]) {
        const r = await issueCode(sub);
        return respond(codeIssuedPage({ nonce, tokens, sub: r.sub, code: r.code, message: welcome(r.sub, r.code) }), { nonce });
      }
      if (isPost) {
        const r = parseSubscriber(await req.formData(), content, { isNew: false });
        if (r.error) return text(r.error, 400);
        await store.subscribers.update(sub.id, r.data);
        return redirect(`/admin/subscribers/${sub.id}`);
      }
      const sch = scheduleOf(sub, content, t);
      const mine = allRatings.filter((r) => r.subscriberId === sub.id);
      const rated = new Map(mine.map((r) => [r.contentId, r]));
      const byCategory = Object.entries(Object.groupBy(mine, (r) => cardsById.get(r.contentId)?.category ?? '?')).map(([category, rs]) => ({
        category,
        A: rs.filter((r) => r.score === 'A').length,
        D: rs.filter((r) => r.score === 'D').length,
      }));
      return respond(
        subscriberDetailPage({
          nonce,
          tokens,
          sub,
          sets: content.sets,
          info: { state: stateOf(sub, t), ...bandOf(sub, t), daysLeft: daysLeftOf(sub, t), ...subStats(sub, sch, allRatings) },
          timeline: sch.items.map((x) => ({ ...x, title: x.card?.title ?? '?', missing: !x.ready, rating: rated.get(x.id) })),
          feedback: await store.feedback.list({ subscriberId: sub.id }),
          photos: await store.photos.list({ subscriberId: sub.id }),
          byCategory,
        }),
        { nonce },
      );
    }
    if (path === '/admin/ideas' && isPost) {
      const r = parseMemo(await req.formData());
      if (r.error) return text(r.error, 400);
      await saveIdeas(store, [r.data], t);
      return redirect('/admin/contents#memo');
    }
    if ((m = /^\/admin\/ideas\/([0-9a-f]{16})$/.exec(path)) && isPost) {
      const f = await req.formData();
      const r = parseIdeaUpdate(f);
      if (r.error) return text(r.error, 400);
      if (!(await store.ideas.update(m[1], r.data))) return text('아이디어가 없어요', 404);
      const back = String(f.get('back') ?? '');
      return redirect(back.startsWith('/admin/') ? back : '/admin/collected');
    }
    if (path === '/admin/collected') {
      const q = { source: url.searchParams.get('source') ?? '', status: url.searchParams.get('status') ?? '' };
      const ideas = (await store.ideas.list()).filter((i) => i.source !== 'memo');
      return respond(collectedPage({ nonce, tokens, ideas, q, notice: url.searchParams.get('msg') ?? '', canCollect: !!collect }), { nonce });
    }
    if (path === '/admin/collect' && isPost) {
      if (!collect) return text('수집기가 연결되지 않았어요', 503);
      const { items, errors } = await collect();
      const { added, skipped } = await saveIdeas(store, items, t);
      if (added) await notify(`[수집] 새 아이디어 ${added}개가 수집함에 들어왔어요`);
      const msg = `새로 ${added}개 · 이미 있음 ${skipped}개${errors.length ? ` · 문제 ${errors.length}건: ${errors.join(' / ')}` : ''}`;
      return redirect(`/admin/collected?msg=${encodeURIComponent(msg)}`);
    }
    if (path === '/admin/sets') return respond(setsPage({ nonce, tokens, sets: content.sets, cardsById }), { nonce });
    if (path === '/admin/inbox') {
      const events = [
        ...allRatings.map((r) => ({ ...r, kind: 'rating' })),
        ...(await store.feedback.list()).map((f) => ({ ...f, kind: 'feedback' })),
        ...(await store.photos.list()).map((p) => ({ ...p, kind: 'photo' })),
      ]
        .sort((a, b) => b.at - a.at)
        .slice(0, 200);
      return respond(inboxPage({ nonce, tokens, events }), { nonce });
    }
    if ((m = /^\/admin\/photos\/([0-9a-f]{16})$/.exec(path))) {
      const p = await store.photos.read(m[1]);
      if (!p) return text('사진이 없어요', 404);
      return new Response(p.bytes, { headers: { 'content-type': p.meta.type, 'cache-control': 'private, no-store', 'x-content-type-options': 'nosniff', 'content-security-policy': "default-src 'none'" } });
    }
    return text('not found', 404);
  }

  // ---------- 구독자 API ----------
  async function handleApi(req, url, t, ip, content) {
    if (url.pathname === '/api/login' && req.method === 'POST') {
      if (blocked(ip, t)) return json({ message: '시도가 너무 많아요. 10분 뒤에 다시 입력해 주세요.' }, 429);
      let code;
      try {
        ({ code } = await readJson(req));
      } catch {
        return json({ message: '요청을 읽지 못했어요.' }, 400);
      }
      const norm = normalizeCode(code);
      const sub = norm.length === 8 ? await store.subscribers.findByCodeHash(await sign(`c:${norm}`)) : null;
      if (!sub) {
        fail(ip, t);
        return json({ message: '비밀번호를 다시 확인해 주세요.' }, 401);
      }
      const state = stateOf(sub, t);
      if (state === 'expired') return json({ message: '이용 기간이 끝난 비밀번호예요.' }, 401);
      if (state === 'stopped') return json({ message: '사용할 수 없는 비밀번호예요.' }, 401);
      fails.delete(ip);
      const maxAge = Math.max(60, Math.floor((endAt(sub) - t) / 1000));
      return json({ ok: true }, 200, { 'set-cookie': cookie(SESSION, await sessionToken(sub), maxAge) });
    }
    if (url.pathname === '/api/logout' && req.method === 'POST') return json({ ok: true }, 200, { 'set-cookie': cookie(SESSION, '', 0) });

    const sub = await currentSub(req, t);
    if (url.pathname === '/api/ping') return sub ? json({ ok: true }) : json({ ok: false }, 401);
    if (!sub) return json({ message: '다시 로그인해 주세요.' }, 401);
    if (throttled(sub.id, t)) return json({ message: '잠시 후 다시 시도해 주세요.' }, 429);
    if (req.method !== 'POST') return json({ message: 'not found' }, 404);

    const sch = scheduleOf(sub, content, t);
    const canSee = (id) => visibleItems(sch).some((x) => x.card.id === id);
    const date = kstDate(t);

    if (url.pathname === '/api/rate') {
      let b;
      try {
        b = await readJson(req);
      } catch {
        return json({ message: '요청을 읽지 못했어요.' }, 400);
      }
      if (!canSee(b.contentId)) return json({ message: '볼 수 없는 콘텐츠예요.' }, 403);
      if (!['A', 'D'].includes(b.score)) return json({ message: '평가를 골라 주세요.' }, 400);
      const reasons = b.score === 'D' ? [...new Set(b.reasons ?? [])].filter((r) => REASONS.includes(r)) : [];
      if (b.score === 'D' && !reasons.length) return json({ message: '어떤 점이 안 맞았는지 하나 이상 골라 주세요.' }, 400);
      const note = String(b.text ?? '').trim().slice(0, 1000);
      await store.ratings.upsert({ subscriberId: sub.id, contentId: b.contentId, band: sch.band, date, score: b.score, reasons, at: t });
      await notify(`[평점] ${sub.id} · ${b.contentId} · ${date} · ${b.score}점${reasons.length ? ` (${reasons.join(', ')})` : ''}`);
      if (note) {
        await store.feedback.add({ id: randomId(), subscriberId: sub.id, contentId: b.contentId, date, text: note, at: t });
        await notify(`[의견] ${sub.id} · ${b.contentId} · ${date}\n> ${note}`);
      }
      return json({ ok: true });
    }
    if (url.pathname === '/api/feedback') {
      let b;
      try {
        b = await readJson(req);
      } catch {
        return json({ message: '요청을 읽지 못했어요.' }, 400);
      }
      const note = String(b.text ?? '').trim();
      if (!note) return json({ message: '내용을 적어 주세요.' }, 400);
      if (note.length > 1000) return json({ message: '1000자 이내로 적어 주세요.' }, 400);
      const contentId = b.contentId && canSee(b.contentId) ? b.contentId : null;
      await store.feedback.add({ id: randomId(), subscriberId: sub.id, contentId, date, text: note, at: t });
      await notify(`[의견] ${sub.id} · ${contentId ?? '-'} · ${date}\n> ${note}`);
      return json({ ok: true });
    }
    if (url.pathname === '/api/photo') {
      if (Number(req.headers.get('content-length') ?? 0) > PHOTO_MAX + 64 * 1024) return json({ message: '사진이 너무 커요 (10MB 이하).' }, 413);
      let f;
      try {
        f = await req.formData();
      } catch {
        return json({ message: '사진을 읽지 못했어요.' }, 400);
      }
      const file = f.get('file');
      const contentId = String(f.get('contentId') ?? '');
      if (!canSee(contentId)) return json({ message: '볼 수 없는 콘텐츠예요.' }, 403);
      if (!file || typeof file === 'string' || !PHOTO_TYPES.includes(file.type)) return json({ message: '사진 파일(jpg·png·heic)만 보낼 수 있어요.' }, 400);
      if (file.size > PHOTO_MAX) return json({ message: '사진이 너무 커요 (10MB 이하).' }, 413);
      const meta = { id: randomId(), subscriberId: sub.id, contentId, date, consent: f.get('consent') === '1', type: file.type, size: file.size, at: t };
      await store.photos.add(meta, new Uint8Array(await file.arrayBuffer()));
      await notify(`[작품] ${sub.id} · ${contentId} · ${date} · 홍보 동의 ${meta.consent ? 'O' : 'X'}${baseUrl ? `\n${baseUrl}/admin/photos/${meta.id}` : ''}`);
      return json({ ok: true });
    }
    return json({ message: 'not found' }, 404);
  }

  // ---------- 진입점 ----------
  async function handle(req, { ip = 'unknown' } = {}) {
    const url = new URL(req.url);
    const t = now();
    const nonce = newNonce();
    try {
      const content = getContent();
      if (url.pathname === '/admin' || url.pathname.startsWith('/admin/')) return await handleAdmin(req, url, t, ip, nonce, content);
      if (url.pathname.startsWith('/api/')) return await handleApi(req, url, t, ip, content);

      const tokens = content.css.tokens;
      const sub = await currentSub(req, t);
      if (url.pathname === '/') {
        if (sub) return redirect('/home');
        const notice = url.searchParams.get('expired') ? '이용 기간이 끝났거나 다시 로그인이 필요해요.' : '';
        return respond(loginPage({ nonce, tokens, notice }), { nonce });
      }
      if (!sub) return redirect('/?expired=1', { 'set-cookie': cookie(SESSION, '', 0) });

      const sch = scheduleOf(sub, content, t);
      const ratings = await store.ratings.list({ subscriberId: sub.id });
      if (url.pathname === '/home') {
        return respond(
          homePage({
            nonce,
            tokens,
            sub,
            band: sch.band,
            sch,
            items: visibleItems(sch),
            ratings,
            exp: { daysLeft: daysLeftOf(sub, t), endLabel: kstLabel(dateStart(sub.endDate)), endAt: endAt(sub), type: sub.type },
          }),
          { nonce },
        );
      }
      const m = /^\/c\/(c\d{3})$/.exec(url.pathname);
      if (m) {
        const item = visibleItems(sch).find((x) => x.card.id === m[1]);
        if (!item) return text('아직 열리지 않았거나 볼 수 없는 놀이예요.', 403);
        return respond(contentPage({ nonce, content, item, band: sch.band, sub, rating: ratings.find((r) => r.contentId === m[1]) }), { nonce });
      }
      return text('not found', 404);
    } catch (e) {
      console.error(e);
      return text('문제가 생겼어요. 잠시 후 다시 시도해 주세요.', 500);
    }
  }

  return { fetch: handle };
}
