// 아이디어 노트 공통 규칙 (메모장 · 수집함)
import { CATEGORIES } from '../content/schema.mjs';
import { randomId } from '../app/util.mjs';

export const IDEA_STATUS = { new: '새로', keep: '보관', done: '콘텐츠화', drop: '제외' };
export const IDEA_SOURCE = { memo: '메모', youtube: '유튜브', instagram: '인스타그램' };

/** 수집 결과를 저장해요. 같은 링크는 건너뛰어요. */
export async function saveIdeas(store, items, now) {
  let added = 0;
  for (const it of items) {
    const row = await store.ideas.add({ id: randomId(), status: 'new', category: '', contentId: '', at: now, ...it });
    if (row) added += 1;
  }
  return { added, skipped: items.length - added };
}

/** 메모 입력 검사 */
export function parseMemo(f) {
  const g = (k) => String(f.get(k) ?? '').trim();
  const d = { title: g('title'), summary: g('summary'), category: g('category'), url: g('url') };
  if (!d.title || d.title.length > 60) return { error: '제목을 1~60자로 적어 주세요' };
  if (d.summary.length > 2000) return { error: '메모는 2000자까지예요' };
  if (d.category && !CATEGORIES.includes(d.category)) return { error: '카테고리를 확인해 주세요' };
  if (d.url && !/^https?:\/\/\S+$/.test(d.url)) return { error: '링크는 http(s)://로 시작해야 해요' };
  return { data: { ...d, source: 'memo', url: d.url || undefined } };
}

/** 상태 변경 입력 검사 */
export function parseIdeaUpdate(f) {
  const status = String(f.get('status') ?? '');
  const contentId = String(f.get('contentId') ?? '').trim();
  if (!IDEA_STATUS[status]) return { error: '상태를 확인해 주세요' };
  if (contentId && !/^c\d{3}$/.test(contentId)) return { error: '콘텐츠 ID는 c001 형식이에요' };
  return { data: { status, contentId } };
}
