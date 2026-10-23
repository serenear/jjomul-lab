// Node 전용: content/ 폴더를 읽어 앱·빌드가 쓰는 "콘텐츠 묶음" 하나로 만들어요.
// (Cloudflare 배포 시에는 이 묶음을 JSON으로 구워서 넣어요)
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';
import { validateCard, validateSet } from './schema.mjs';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const DIR = (...p) => join(ROOT, ...p);
const yamls = (dir) => (existsSync(dir) ? readdirSync(dir).filter((f) => /\.ya?ml$/.test(f)).sort() : []);

export function loadContent() {
  const errors = [];
  const warnings = [];
  const artDir = DIR('content', 'art');
  const art = Object.fromEntries(
    readdirSync(artDir).filter((f) => f.endsWith('.svg')).map((f) => [f, readFileSync(join(artDir, f), 'utf8')]),
  );

  const cards = [];
  for (const file of yamls(DIR('content', 'cards'))) {
    const card = parse(readFileSync(DIR('content', 'cards', file), 'utf8')) ?? {};
    const r = validateCard(card, { hasArt: (f) => f in art });
    r.errors.forEach((e) => errors.push(`${file} › ${e}`));
    r.warnings.forEach((w) => warnings.push(`${file} › ${w}`));
    if (file.replace(/\.ya?ml$/, '') !== card.id) errors.push(`${file} › 파일명과 id가 달라요 (${card.id})`);
    if (cards.some((c) => c.id === card.id)) errors.push(`${file} › id가 중복돼요`);
    cards.push(card);
  }
  const byId = new Map(cards.map((c) => [c.id, c]));

  const sets = [];
  for (const file of yamls(DIR('content', 'sets'))) {
    const set = parse(readFileSync(DIR('content', 'sets', file), 'utf8')) ?? {};
    const r = validateSet(set, byId);
    r.errors.forEach((e) => errors.push(`sets/${file} › ${e}`));
    r.warnings.forEach((w) => warnings.push(`sets/${file} › ${w}`));
    sets.push(set);
  }
  if (!sets.some((s) => s.id === 'default')) errors.push('sets › default 셋이 필요해요');

  const css = {
    tokens: readFileSync(DIR('design', 'tokens.css'), 'utf8'),
    card: readFileSync(DIR('design', 'card.css'), 'utf8'),
  };
  return { content: { cards, sets, art, css }, errors, warnings };
}
