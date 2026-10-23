// 사용법: npm run collect
// 환경변수: YOUTUBE_API_KEY(권장), IG_USER_ID · IG_ACCESS_TOKEN · IG_GRAPH_VERSION, DATA_DIR, SLACK_WEBHOOK_URL
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parse } from 'yaml';
import { ROOT } from '../content/load.mjs';
import { createFileStore } from '../app/store-file.mjs';
import { collectAll } from './collect.mjs';
import { saveIdeas } from './ideas.mjs';
import { slackNotifier } from '../app/slack.mjs';

export const readCollectConfig = () => parse(readFileSync(join(ROOT, 'collect.config.yaml'), 'utf8')) ?? {};

/** Node에서 쓰는 수집 함수 (CLI·어드민 버튼 공통) */
export const nodeCollector = () => collectAll(readCollectConfig(), process.env);

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const store = createFileStore(process.env.DATA_DIR || join(ROOT, 'viewer-data'));
  const { items, errors } = await nodeCollector();
  const { added, skipped } = await saveIdeas(store, items, Date.now());
  errors.forEach((e) => console.warn(`⚠️  ${e}`));
  console.log(`수집 ${items.length}개 → 새로 ${added}개, 이미 있음 ${skipped}개`);
  if (added) await slackNotifier(process.env.SLACK_WEBHOOK_URL)(`[수집] 새 아이디어 ${added}개가 수집함에 들어왔어요`);
}
