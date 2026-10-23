import test from 'node:test';
import assert from 'node:assert/strict';
import { loadContent } from '../src/content/load.mjs';
import { validateCard, validateSet, flattenSet } from '../src/content/schema.mjs';

const { content, errors } = loadContent();
const sample = () => structuredClone(content.cards.find((c) => c.id === 'c023'));
const check = (card) => validateCard(card, { hasArt: (f) => f in content.art });

test('저장소의 콘텐츠는 오류가 없어요 (아이디어 79 + 샘플 1)', () => {
  assert.deepEqual(errors, []);
  assert.equal(content.cards.length, 80);
  assert.equal(content.cards.filter((c) => c.status === 'idea').length, 79);
});

test('아이디어는 제목·카테고리만 있으면 돼요', () => {
  assert.deepEqual(check({ id: 'c900', title: '새 놀이', category: '몸놀이', status: 'idea' }).errors, []);
  assert.ok(check({ id: 'c900', title: '새 놀이', category: '요리', status: 'idea' }).errors.length);
});

test('검수·발행은 두 연령 버전이 모두 필요해요', () => {
  const c = sample();
  delete c.versions['12-24'];
  assert.ok(check(c).errors.some((e) => e.includes('12~24개월')));
  c.status = 'draft';
  assert.deepEqual(check(c).errors, []);
});

test('버전별 규칙: 순서 3단계·시간·표현·안전', () => {
  const c = sample();
  c.versions['24-40'].steps.push('넷째');
  c.versions['12-24'].duration_min = 40;
  c.versions['12-24'].hand_experience = '발달 효과를 보장해요';
  c.versions['24-40'].materials.push('구슬');
  const e = check(c).errors.join('\n');
  for (const k of ['steps', 'duration_min', '"효과"', '"보장"', '"구슬"']) assert.ok(e.includes(k), k);
});

test('도안을 인쇄하는 버전은 도안 파일이 있어야 해요', () => {
  const c = sample();
  c.versions['24-40'].art = 'none.svg';
  assert.ok(check(c).errors.some((e) => e.includes('none.svg')));
  c.versions['24-40'].print = 'guide';
  delete c.versions['24-40'].art;
  assert.deepEqual(check(c).errors, []);
});

test('먹는 재료에는 알레르기 안내를 권해요', () => {
  const c = sample();
  c.versions['24-40'].materials = ['밀가루 반죽'];
  assert.ok(check(c).warnings.some((w) => w.includes('알레르기')));
});

test('셋: 없는 콘텐츠·잘못된 요일은 오류, 배치 차이는 경고', () => {
  const byId = new Map(content.cards.map((c) => [c.id, c]));
  const r = validateSet({ id: 'x', title: 'x', weeks: [{ 월: 'c023', 토: 'c001', 화: 'c999' }] }, byId);
  assert.ok(r.errors.some((e) => e.includes('요일')));
  assert.ok(r.errors.some((e) => e.includes('c999')));
  assert.ok(r.warnings.some((w) => w.includes('기본 배치')));
  assert.deepEqual(flattenSet({ weeks: [{ 화: 'c023', 월: 'c001' }] }).map((x) => x.day), ['월', '화']);
});
