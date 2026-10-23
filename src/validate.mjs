import { loadContent } from './content/load.mjs';
import { STATUS_LABEL } from './content/schema.mjs';

const { content, errors, warnings } = loadContent();
warnings.forEach((w) => console.warn(`⚠️  ${w}`));
errors.forEach((e) => console.error(`❌ ${e}`));
const byStatus = Object.keys(STATUS_LABEL)
  .map((s) => `${STATUS_LABEL[s]} ${content.cards.filter((c) => c.status === s).length}`)
  .join(' · ');
console.log(`콘텐츠 ${content.cards.length}개 (${byStatus}) — 오류 ${errors.length}, 주의 ${warnings.length}`);
process.exit(errors.length ? 1 : 0);
