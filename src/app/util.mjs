// Web 표준 API만 사용 (Node 22 · Cloudflare Workers 공통)
const enc = new TextEncoder();
const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');

export async function hmacSigner(secret) {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return async (msg) => hex(await crypto.subtle.sign('HMAC', key, enc.encode(msg)));
}

export function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

// I·L·O·0·1 처럼 헷갈리는 글자는 뺐어요 (31자 ^ 8자리 ≈ 8.5조 가지)
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export function randomCode() {
  const out = [];
  while (out.length < 8) {
    for (const b of crypto.getRandomValues(new Uint8Array(16))) {
      if (b < 248 && out.length < 8) out.push(ALPHABET[b % 31]); // 248 = 31×8, 치우침 없이
    }
  }
  return `${out.slice(0, 4).join('')}-${out.slice(4).join('')}`;
}
export const normalizeCode = (c) => String(c ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
export const randomId = (bytes = 8) => hex(crypto.getRandomValues(new Uint8Array(bytes)));

// ---------- 한국 시간 ----------
export const DAY = 86400000;
const KST = 9 * 3600000;
/** ms → 'YYYY-MM-DD' (KST) */
export const kstDate = (ms) => new Date(ms + KST).toISOString().slice(0, 10);
/** 'YYYY-MM-DD' → 그날 00:00 KST 의 ms */
export const dateStart = (ymd) => {
  const [y, m, d] = ymd.split('-').map(Number);
  return Date.UTC(y, m - 1, d) - KST;
};
/** 그 주 월요일 00:00 KST */
export function weekStart(ms) {
  const d = new Date(ms + KST);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - ((d.getUTCDay() + 6) % 7)) - KST;
}
export const isWeekday = (ms) => {
  const d = new Date(ms + KST).getUTCDay();
  return d >= 1 && d <= 5;
};
/** 시작일부터 평일(월~금) 날짜를 count개 — 놀이가 하나씩 열리는 날 (각 00:00 KST) */
export function weekdayDates(startYmd, count) {
  const out = [];
  for (let ms = dateStart(startYmd); out.length < count; ms += DAY) if (isWeekday(ms)) out.push(ms);
  return out;
}
/** 아이 생년월 'YYYY-MM' → 오늘 기준 개월 수 */
export function ageMonths(birthYm, now) {
  const [y, m] = birthYm.split('-').map(Number);
  const d = new Date(now + KST);
  return (d.getUTCFullYear() - y) * 12 + (d.getUTCMonth() + 1 - m);
}
export const bandForMonths = (months) => (months < 24 ? '12-24' : '24-40');

export const kstLabel = (ms) =>
  new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', month: 'long', day: 'numeric', weekday: 'short' }).format(ms);
export const kstDateTime = (ms) =>
  new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).format(ms);
