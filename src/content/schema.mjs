// 콘텐츠 규칙. 브라우저·서버 어디서나 쓰도록 Node 전용 모듈은 쓰지 않아요.

export const BANDS = ['12-24', '24-40'];
export const BAND_LABEL = { '12-24': '12~24개월', '24-40': '24~40개월' };
export const WEEKDAYS = ['월', '화', '수', '목', '금'];
export const CATEGORIES = ['끄적이기·색칠', '찢기·붙이기', '몸놀이', '집기·옮기기', '촉감·감각'];
// 셋을 짤 때의 기본 요일 배치 (다르면 경고만)
export const WEEKDAY_CATEGORY = { 월: '끄적이기·색칠', 화: '찢기·붙이기', 수: '몸놀이', 목: '집기·옮기기', 금: '촉감·감각' };

export const STATUSES = ['idea', 'draft', 'review', 'published'];
export const STATUS_LABEL = { idea: '아이디어', draft: '초안', review: '검수', published: '발행' };
export const SEASONS = ['연중', '봄', '여름', '가을', '겨울', '크리스마스'];
export const PLACES = ['실내', '실외'];
export const MESS = ['깨끗', '보통', '지저분'];
export const PREP_MIN = [0, 5, 10];
export const PRINT_LAYOUTS = ['art', 'art+guide', 'guide'];

// 효과 약속·임상 표현 (비임상적 언어 원칙)
const CLAIM_WORDS = ['치료', '치유', '교정', '진단', '효과', '보장', '향상'];
const CLAIM_WARN = ['발달', '훈련', '학습'];
// 삼킬 수 있거나 위험한 재료 (재료·순서에만 적용)
const HAZARD_WORDS = ['구슬', '단추', '동전', '가위', '칼', '작은 솜공', '콩', '풍선'];

const isStr = (v) => typeof v === 'string' && v.trim().length > 0;
const isStrList = (v) => Array.isArray(v) && v.length > 0 && v.every(isStr);
const optList = (v) => v === undefined || (Array.isArray(v) && v.every(isStr));

/** 버전(연령 구간 하나) 검사 */
function validateVersion(v, band, { hasArt }) {
  const errors = [];
  const warnings = [];
  const p = `versions.${band}`;
  if (!v || typeof v !== 'object') return { errors: [`${p}: 내용이 비어 있어요`], warnings };

  if (!Number.isInteger(v.duration_min) || v.duration_min < 10 || v.duration_min > 20) errors.push(`${p}.duration_min: 10~20 사이 정수`);
  if (!PRINT_LAYOUTS.includes(v.print)) errors.push(`${p}.print: ${PRINT_LAYOUTS.join(' / ')} 중 하나`);
  if (v.print && v.print !== 'guide') {
    if (!isStr(v.art)) errors.push(`${p}.art: print가 "${v.print}"이면 도안 파일이 필요해요`);
    else if (hasArt && !hasArt(v.art)) errors.push(`${p}.art: ${v.art} 파일이 없어요`);
  }
  if (!isStrList(v.materials)) errors.push(`${p}.materials: 1개 이상`);
  if (!isStrList(v.steps) || v.steps.length > 3) errors.push(`${p}.steps: 1~3단계`);
  if (!isStrList(v.talk_examples) || v.talk_examples.length > 4) errors.push(`${p}.talk_examples: 1~4개`);
  if (!isStr(v.hand_experience)) errors.push(`${p}.hand_experience: 필수`);
  if (!isStrList(v.safety)) errors.push(`${p}.safety: 1개 이상`);
  else if (!v.safety.some((s) => /보호자|부모님/.test(s))) errors.push(`${p}.safety: 보호자(부모님)와 함께한다는 문장이 필요해요`);

  const texts = (keys) => keys.flatMap((k) => (Array.isArray(v[k]) ? v[k] : isStr(v[k]) ? [v[k]] : []));
  const all = texts(['front_caption', 'materials', 'steps', 'talk_examples', 'hand_experience', 'safety']);
  for (const w of CLAIM_WORDS) if (all.some((t) => t.includes(w))) errors.push(`${p} 표현 규칙: "${w}"는 쓰지 않아요 (효과 약속·임상 표현 금지)`);
  for (const w of CLAIM_WARN) if (all.some((t) => t.includes(w))) warnings.push(`${p} 표현 확인: "${w}" — 효과를 약속하는 문장은 아닌지 봐주세요`);
  for (const w of HAZARD_WORDS) {
    if (texts(['materials', 'steps']).some((t) => t.includes(w))) errors.push(`${p} 안전 규칙: 재료/순서에 "${w}"가 있어요`);
  }
  if (texts(['materials', 'steps']).some((t) => /밀가루|두부|요거트|고구마|귤|크림|젤리|녹말/.test(t)) && !v.safety.some((s) => s.includes('알레르기'))) {
    warnings.push(`${p}.safety: 먹는 재료가 있어요 — 알레르기 확인 문장을 넣어 주세요`);
  }
  return { errors, warnings };
}

/**
 * 콘텐츠 1개 검사. 상태가 올라갈수록 요구하는 내용이 늘어요.
 * idea: 제목·카테고리만 / draft: 버전 1개 이상 / review·published: 두 버전 모두 + 서랍 필드
 */
export function validateCard(card, { hasArt } = {}) {
  const errors = [];
  const warnings = [];
  if (!isStr(card.id) || !/^c\d{3}$/.test(card.id)) errors.push('id: c001 형식');
  if (!isStr(card.title) || card.title.length > 30) errors.push('title: 1~30자');
  if (!CATEGORIES.includes(card.category)) errors.push(`category: ${CATEGORIES.join(' / ')} 중 하나`);
  if (!STATUSES.includes(card.status)) errors.push(`status: ${STATUSES.join(' / ')} 중 하나`);
  if (!optList(card.tags) || !optList(card.hand) || !optList(card.materials_tags)) errors.push('tags·hand·materials_tags: 문자열 목록');
  if (card.season !== undefined && !SEASONS.includes(card.season)) errors.push(`season: ${SEASONS.join(' / ')} 중 하나`);
  if (card.place !== undefined && !PLACES.includes(card.place)) errors.push(`place: ${PLACES.join(' / ')} 중 하나`);
  if (card.mess !== undefined && !MESS.includes(card.mess)) errors.push(`mess: ${MESS.join(' / ')} 중 하나`);
  if (card.prep_min !== undefined && !PREP_MIN.includes(card.prep_min)) errors.push(`prep_min: ${PREP_MIN.join(' / ')} 중 하나`);
  if (errors.length || card.status === 'idea') return { errors, warnings };

  const versions = card.versions ?? {};
  const unknown = Object.keys(versions).filter((b) => !BANDS.includes(b));
  if (unknown.length) errors.push(`versions: 알 수 없는 구간 ${unknown.join(', ')} ("12-24" / "24-40")`);
  const present = BANDS.filter((b) => versions[b]);
  if (!present.length) errors.push('versions: 초안부터는 버전이 1개 이상 필요해요');
  for (const b of present) {
    const r = validateVersion(versions[b], b, { hasArt });
    errors.push(...r.errors);
    warnings.push(...r.warnings);
  }

  const strict = card.status === 'review' || card.status === 'published';
  const missing = BANDS.filter((b) => !versions[b]);
  if (missing.length) (strict ? errors : warnings).push(`versions: ${missing.map((b) => BAND_LABEL[b]).join(', ')} 버전이 아직 없어요`);
  for (const f of ['hand', 'materials_tags', 'season', 'place', 'mess', 'prep_min']) {
    if (card[f] === undefined) (strict ? errors : warnings).push(`${f}: 서랍 필드를 채워 주세요`);
  }
  return { errors, warnings };
}

/** 셋(요일별 배치) 검사 */
export function validateSet(set, cardsById) {
  const errors = [];
  const warnings = [];
  if (!isStr(set.id) || !/^[a-z0-9-]+$/.test(set.id)) errors.push('id: 영문 소문자·숫자·하이픈');
  if (!isStr(set.title)) errors.push('title: 필수');
  if (!Array.isArray(set.weeks) || !set.weeks.length) errors.push('weeks: 1주 이상');
  (set.weeks ?? []).forEach((w, i) => {
    for (const [day, id] of Object.entries(w ?? {})) {
      const at = `${i + 1}주차 ${day}`;
      if (!WEEKDAYS.includes(day)) errors.push(`${at}: 요일은 월~금`);
      const c = cardsById.get(id);
      if (!c) errors.push(`${at}: ${id} 콘텐츠가 없어요`);
      else {
        if (c.status !== 'published') warnings.push(`${at}: ${id}(${c.title})는 아직 "${STATUS_LABEL[c.status]}" 상태예요`);
        if (WEEKDAY_CATEGORY[day] && WEEKDAY_CATEGORY[day] !== c.category) warnings.push(`${at}: 기본 배치는 "${WEEKDAY_CATEGORY[day]}"예요 (${c.category})`);
      }
    }
  });
  return { errors, warnings };
}

/** 셋을 [{week, day, id}] 목록으로 펼쳐요 */
export const flattenSet = (set) =>
  (set.weeks ?? []).flatMap((w, i) =>
    WEEKDAYS.filter((d) => w?.[d]).map((day) => ({ week: i + 1, day, id: w[day] })),
  );
