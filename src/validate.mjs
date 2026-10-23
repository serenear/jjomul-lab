import { loadCards } from './cards.mjs';

const { cards, errors, warnings } = loadCards();
warnings.forEach((w) => console.warn(`⚠️  ${w}`));
errors.forEach((e) => console.error(`❌ ${e}`));
console.log(`카드 ${cards.length}장 확인 — 오류 ${errors.length}, 주의 ${warnings.length}`);
process.exit(errors.length ? 1 : 0);
