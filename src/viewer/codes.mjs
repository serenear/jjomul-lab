import { randomBytes, randomInt, createHmac, timingSafeEqual } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

// I·L·O·0·1 처럼 헷갈리는 글자는 뺐어요 (31자 ^ 8자리 ≈ 8.5조 가지)
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const DAY_MS = 24 * 60 * 60 * 1000;

export const normalizeCode = (c) => String(c ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
export const PACK_RE = /^(week-\d+|month-\d+|card-[a-z0-9-]+)$/;

/**
 * 비밀번호 저장소. 원문은 저장하지 않고 HMAC 해시만 파일(codes.json)에 둬요.
 * 나중에 DB로 옮길 때는 이 객체와 같은 함수 모양만 지키면 돼요.
 */
export function createStore(dir) {
  mkdirSync(dir, { recursive: true });
  const keyFile = join(dir, 'secret.key');
  const dbFile = join(dir, 'codes.json');
  if (!existsSync(keyFile)) writeFileSync(keyFile, randomBytes(32).toString('hex'), { mode: 0o600 });
  const secret = readFileSync(keyFile, 'utf8').trim();

  const load = () => (existsSync(dbFile) ? JSON.parse(readFileSync(dbFile, 'utf8')) : []);
  const save = (rows) => {
    writeFileSync(`${dbFile}.tmp`, JSON.stringify(rows, null, 2), { mode: 0o600 });
    renameSync(`${dbFile}.tmp`, dbFile);
  };
  const hmac = (s) => createHmac('sha256', secret).update(s).digest('hex');

  const status = (r, now) => (r.revoked ? 'revoked' : now >= r.expiresAt ? 'expired' : 'active');

  return {
    /** 새 비밀번호를 만들어요. 원문(code)은 이 반환값으로만 볼 수 있어요. */
    issue({ packs, days, note = '', now = Date.now() }) {
      if (!packs?.length || !packs.every((p) => PACK_RE.test(p))) throw new Error('packs 형식이 올바르지 않아요');
      if (!(days > 0)) throw new Error('days는 0보다 커야 해요');
      const raw = Array.from({ length: 8 }, () => ALPHABET[randomInt(ALPHABET.length)]).join('');
      const record = {
        id: randomBytes(3).toString('hex'),
        hash: hmac(raw),
        packs,
        note,
        createdAt: now,
        expiresAt: now + Math.round(days * DAY_MS),
        revoked: false,
      };
      save([...load(), record]);
      return { code: `${raw.slice(0, 4)}-${raw.slice(4)}`, record };
    },

    /** 입력한 비밀번호가 맞고 기간 안인지 확인해요. */
    verify(input, now = Date.now()) {
      const norm = normalizeCode(input);
      if (norm.length !== 8) return { ok: false, reason: 'invalid' };
      const h = hmac(norm);
      const record = load().find((r) => r.hash === h);
      if (!record) return { ok: false, reason: 'invalid' };
      const s = status(record, now);
      return s === 'active' ? { ok: true, record } : { ok: false, reason: s };
    },

    /** 로그인 쿠키(서명된 토큰). 유효기간은 비밀번호 만료 시각과 같아요. */
    sign(record) {
      const body = `${record.id}.${record.expiresAt}`;
      return `${body}.${hmac(`session:${body}`)}`;
    },

    /** 요청마다 호출해요. 서명·만료·폐기를 모두 저장소 기준으로 다시 확인해요. */
    access(token, now = Date.now()) {
      const [id, exp, sig] = String(token ?? '').split('.');
      if (!id || !exp || !sig) return { ok: false, reason: 'invalid' };
      const want = Buffer.from(hmac(`session:${id}.${exp}`));
      const got = Buffer.from(sig);
      if (want.length !== got.length || !timingSafeEqual(want, got)) return { ok: false, reason: 'invalid' };
      const record = load().find((r) => r.id === id);
      if (!record) return { ok: false, reason: 'invalid' };
      const s = status(record, now);
      return s === 'active' ? { ok: true, record } : { ok: false, reason: s };
    },

    revoke(id) {
      const rows = load();
      const r = rows.find((x) => x.id === id);
      if (!r) return false;
      r.revoked = true;
      save(rows);
      return true;
    },

    list: (now = Date.now()) => load().map((r) => ({ ...r, hash: undefined, status: status(r, now) })),
  };
}
