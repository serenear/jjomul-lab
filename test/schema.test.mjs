import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parse } from 'yaml';
import { validateCard } from '../src/schema.mjs';
import { loadCards, ART_DIR } from '../src/cards.mjs';

const sample = () => parse(readFileSync(new URL('../content/cards/tear-autumn-tree.yaml', import.meta.url), 'utf8'));
const check = (patch) => validateCard({ ...sample(), ...patch }, { artDir: ART_DIR });

test('샘플 카드는 통과해요', () => {
  assert.deepEqual(check({}).errors, []);
  assert.equal(loadCards().errors.length, 0);
});

test('놀이 순서는 3단계 이내', () => {
  assert.ok(check({ steps: ['a', 'b', 'c', 'd'] }).errors.some((e) => e.startsWith('steps')));
});

test('놀이 시간은 10~20분', () => {
  assert.ok(check({ duration_min: 60 }).errors.some((e) => e.startsWith('duration_min')));
});

test('효과 약속 표현은 막아요', () => {
  assert.ok(check({ hand_experience: '소근육 발달 효과를 보장해요' }).errors.length >= 2);
});

test('삼킬 수 있는 재료는 막아요', () => {
  assert.ok(check({ materials: ['구슬', '작은 솜공'] }).errors.some((e) => e.includes('구슬')));
});

test('보호자 동반 안전 문장이 필수예요', () => {
  assert.ok(check({ safety: ['입에 넣지 않는지 봐주세요.'] }).errors.some((e) => e.startsWith('safety')));
});

test('연령 구간·요일 값을 확인해요', () => {
  assert.ok(check({ age_band: '0-12' }).errors.some((e) => e.startsWith('age_band')));
  assert.ok(check({ weekday: '토' }).errors.some((e) => e.startsWith('weekday')));
});
