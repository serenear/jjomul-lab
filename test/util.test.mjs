import test from 'node:test';
import assert from 'node:assert/strict';
import { ageMonths, bandForMonths, dateStart, kstDate, normalizeCode, randomCode, unlockedWeeks, weekStart } from '../src/app/util.mjs';

const at = (iso) => Date.parse(iso); // ISO 시각 (+09:00 로 KST 지정)

test('KST 날짜: 자정 경계', () => {
  assert.equal(kstDate(at('2026-10-23T23:59:00+09:00')), '2026-10-23');
  assert.equal(kstDate(at('2026-10-24T00:00:00+09:00')), '2026-10-24');
  assert.equal(dateStart('2026-10-24'), at('2026-10-24T00:00:00+09:00'));
});

test('주 시작은 월요일 00:00 KST', () => {
  // 2026-10-23은 금요일
  assert.equal(weekStart(at('2026-10-23T10:00:00+09:00')), at('2026-10-19T00:00:00+09:00'));
  assert.equal(weekStart(at('2026-10-26T00:00:00+09:00')), at('2026-10-26T00:00:00+09:00'));
});

test('시작한 주가 1주차, 월요일마다 한 주씩 열려요', () => {
  assert.equal(unlockedWeeks('2026-10-23', at('2026-10-22T12:00:00+09:00')), 0);
  assert.equal(unlockedWeeks('2026-10-23', at('2026-10-23T12:00:00+09:00')), 1);
  assert.equal(unlockedWeeks('2026-10-23', at('2026-10-25T23:59:00+09:00')), 1);
  assert.equal(unlockedWeeks('2026-10-23', at('2026-10-26T00:00:00+09:00')), 2);
  assert.equal(unlockedWeeks('2026-10-23', at('2026-11-09T09:00:00+09:00')), 4);
});

test('개월 수와 연령 구간', () => {
  assert.equal(ageMonths('2024-10', at('2026-10-23T12:00:00+09:00')), 24);
  assert.equal(ageMonths('2025-04', at('2026-10-23T12:00:00+09:00')), 18);
  assert.equal(bandForMonths(23), '12-24');
  assert.equal(bandForMonths(24), '24-40');
});

test('비밀번호: 형식·헷갈리는 글자 없음·입력 정규화', () => {
  for (let i = 0; i < 200; i++) assert.match(randomCode(), /^[A-HJKMNP-Z2-9]{4}-[A-HJKMNP-Z2-9]{4}$/);
  assert.equal(normalizeCode(' abcd-2345 '), 'ABCD2345');
});
