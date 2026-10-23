import { readdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';
import { validateCard, weekdayIndex } from './schema.mjs';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const CARDS_DIR = join(ROOT, 'content', 'cards');
export const ART_DIR = join(ROOT, 'content', 'art');

/** content/cards/*.yaml 을 읽어 검증하고 (주차 → 요일 → id) 순으로 정렬해 돌려줘요. */
export function loadCards() {
  const cards = [];
  const errors = [];
  const warnings = [];
  const seen = new Set();

  for (const file of readdirSync(CARDS_DIR).filter((f) => /\.ya?ml$/.test(f)).sort()) {
    const card = parse(readFileSync(join(CARDS_DIR, file), 'utf8')) ?? {};
    const r = validateCard(card, { artDir: ART_DIR });
    r.errors.forEach((e) => errors.push(`${file} › ${e}`));
    r.warnings.forEach((w) => warnings.push(`${file} › ${w}`));
    if (file.replace(/\.ya?ml$/, '') !== card.id) errors.push(`${file} › 파일명과 id가 달라요 (${card.id})`);
    if (seen.has(card.id)) errors.push(`${file} › id가 중복돼요 (${card.id})`);
    seen.add(card.id);
    cards.push(card);
  }

  cards.sort(
    (a, b) => a.week - b.week || weekdayIndex(a.weekday) - weekdayIndex(b.weekday) || a.id.localeCompare(b.id),
  );
  return { cards, errors, warnings };
}

export function readArt(card) {
  return card.art ? readFileSync(join(ART_DIR, card.art), 'utf8') : '';
}
