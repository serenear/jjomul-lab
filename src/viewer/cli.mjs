// 사용법
//   node src/viewer/cli.mjs issue --pack week-01 [--pack week-02] --days 7 [--note 이름] [--base-url https://...]
//   node src/viewer/cli.mjs list
//   node src/viewer/cli.mjs revoke <id>
import { join } from 'node:path';
import { ROOT } from '../cards.mjs';
import { createStore } from './codes.mjs';
import { kst } from './pages.mjs';
import { BRAND } from '../render.mjs';

const [cmd, ...rest] = process.argv.slice(2);
const store = createStore(process.env.VIEWER_DATA_DIR || join(ROOT, 'viewer-data'));

const opt = (name) => rest.flatMap((a, i) => (a === `--${name}` ? [rest[i + 1]] : []));

if (cmd === 'issue') {
  const packs = opt('pack');
  const days = Number(opt('days')[0] ?? 7);
  const base = opt('base-url')[0] ?? process.env.VIEWER_BASE_URL ?? 'http://localhost:3000';
  const { code, record } = store.issue({ packs, days, note: opt('note')[0] ?? '' });
  console.log(`발급 완료 (ID ${record.id}${record.note ? `, ${record.note}` : ''})\n`);
  console.log('--- 고객에게 보낼 메시지 ---');
  console.log(`[${BRAND.name}] 놀이 카드가 도착했어요.`);
  console.log(`열람 주소: ${base}`);
  console.log(`비밀번호: ${code}`);
  console.log(`이용 기간: ${kst(record.expiresAt)}까지`);
  console.log('---------------------------');
  console.log('※ 비밀번호 원문은 지금만 볼 수 있어요. 서버에는 저장되지 않아요.');
} else if (cmd === 'list') {
  for (const r of store.list()) {
    console.log(`${r.id}  ${r.status.padEnd(7)} ~${kst(r.expiresAt)}  ${r.packs.join(',')}  ${r.note}`);
  }
} else if (cmd === 'revoke') {
  console.log(store.revoke(rest[0]) ? `폐기했어요: ${rest[0]}` : `찾지 못했어요: ${rest[0]}`);
  process.exitCode = 0;
} else {
  console.log('명령: issue | list | revoke <id>  (맨 위 주석 참고)');
  process.exitCode = 1;
}
