import { existsSync } from 'node:fs';
import { join } from 'node:path';

export const WEEKDAYS = ['월', '화', '수', '목', '금'];
export const AGE_BANDS = ['12-24', '24-40'];
export const WEEKDAY_THEMES = {
  월: '끄적이기·색칠',
  화: '찢기·붙이기',
  수: '몸놀이',
  목: '집기·옮기기',
  금: '촉감·감각',
};

// 효과 약속·임상 표현 (콘텐츠 원칙: 비임상적, 효과 보장 금지)
const CLAIM_WORDS = ['치료', '치유', '교정', '진단', '효과', '보장', '향상'];
const CLAIM_WARN = ['발달', '훈련', '학습'];
// 삼킬 수 있거나 위험한 재료 (재료·놀이 순서에만 적용)
const HAZARD_WORDS = ['구슬', '단추', '동전', '가위', '칼', '작은 솜공', '콩'];

const TEXT_FIELDS = ['title', 'hand_experience', 'front_caption'];
const LIST_FIELDS = ['materials', 'steps', 'talk_examples', 'safety'];

const isStr = (v) => typeof v === 'string' && v.trim().length > 0;
const isStrList = (v) => Array.isArray(v) && v.every(isStr);

export function validateCard(card, { artDir } = {}) {
  const errors = [];
  const warnings = [];
  const err = (m) => errors.push(m);

  if (!isStr(card.id) || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(card.id)) {
    err('id: 영문 소문자·숫자·하이픈만 사용해요 (예: tear-autumn-tree)');
  }
  if (!isStr(card.title) || card.title.length > 30) err('title: 1~30자');
  if (!isStr(card.theme)) err('theme: 필수');
  if (!WEEKDAYS.includes(card.weekday)) err(`weekday: ${WEEKDAYS.join('/')} 중 하나`);
  else if (isStr(card.theme) && WEEKDAY_THEMES[card.weekday] !== card.theme) {
    warnings.push(`theme: ${card.weekday}요일 기본 테마는 "${WEEKDAY_THEMES[card.weekday]}"예요`);
  }
  if (!AGE_BANDS.includes(card.age_band)) err(`age_band: ${AGE_BANDS.join(' / ')} 중 하나 (문자열로 따옴표 필요)`);
  if (!Number.isInteger(card.duration_min) || card.duration_min < 10 || card.duration_min > 20) {
    err('duration_min: 10~20 사이 정수');
  }
  if (!Number.isInteger(card.week) || card.week < 1) err('week: 1 이상의 정수');

  if (!isStrList(card.materials) || card.materials.length < 1) err('materials: 1개 이상');
  if (!isStrList(card.steps) || card.steps.length < 1 || card.steps.length > 3) err('steps: 1~3단계');
  if (!isStrList(card.talk_examples) || card.talk_examples.length < 1 || card.talk_examples.length > 4) {
    err('talk_examples: 1~4개');
  }
  if (!isStr(card.hand_experience)) err('hand_experience: 필수');
  if (!isStrList(card.safety) || card.safety.length < 1) err('safety: 1개 이상');
  else if (!card.safety.some((s) => /보호자|부모님/.test(s))) {
    err('safety: 보호자(부모님)와 함께한다는 문장이 필요해요');
  }

  if (card.art !== undefined) {
    if (!isStr(card.art)) err('art: 파일명 문자열');
    else if (artDir && !existsSync(join(artDir, card.art))) err(`art: ${card.art} 파일이 없어요`);
  }

  const fieldTexts = (fields) =>
    fields.flatMap((f) => (Array.isArray(card[f]) ? card[f] : card[f] ? [card[f]] : []));
  const allText = fieldTexts([...TEXT_FIELDS, ...LIST_FIELDS]);
  for (const w of CLAIM_WORDS) {
    if (allText.some((t) => t.includes(w))) err(`표현 규칙: "${w}"는 쓰지 않아요 (효과 약속·임상 표현 금지)`);
  }
  for (const w of CLAIM_WARN) {
    if (allText.some((t) => t.includes(w))) warnings.push(`표현 확인: "${w}" — 효과를 약속하는 문장은 아닌지 봐주세요`);
  }
  for (const w of HAZARD_WORDS) {
    if (fieldTexts(['materials', 'steps']).some((t) => t.includes(w))) {
      err(`안전 규칙: 재료/순서에 "${w}"가 있어요 (삼킬 수 있거나 위험한 재료 금지)`);
    }
  }

  return { errors, warnings };
}

export const weekdayIndex = (d) => WEEKDAYS.indexOf(d);
