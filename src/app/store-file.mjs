// Node 전용 저장소: JSON 파일 + 사진 폴더. 내 컴퓨터·VPS에서 쓰고,
// Cloudflare 배포 때는 같은 함수 모양으로 D1(데이터)·R2(사진) 저장소를 만들어 바꿔 끼워요.
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { join } from 'node:path';

export function createFileStore(dir) {
  mkdirSync(join(dir, 'photos'), { recursive: true });
  const keyFile = join(dir, 'secret.key');
  if (!existsSync(keyFile)) writeFileSync(keyFile, randomBytes(32).toString('hex'), { mode: 0o600 });

  const file = (name) => join(dir, `${name}.json`);
  const load = (name) => (existsSync(file(name)) ? JSON.parse(readFileSync(file(name), 'utf8')) : []);
  const save = (name, rows) => {
    writeFileSync(`${file(name)}.tmp`, JSON.stringify(rows, null, 2), { mode: 0o600 });
    renameSync(`${file(name)}.tmp`, file(name));
  };

  return {
    secret: readFileSync(keyFile, 'utf8').trim(),

    subscribers: {
      list: async () => load('subscribers'),
      get: async (id) => load('subscribers').find((s) => s.id === id) ?? null,
      findByCodeHash: async (h) => load('subscribers').find((s) => s.codeHash === h) ?? null,
      /** S-0001 부터 순서대로 번호를 붙여요 */
      create: async (data) => {
        const rows = load('subscribers');
        const n = rows.reduce((m, s) => Math.max(m, Number(s.id.slice(2))), 0) + 1;
        const row = { ...data, id: `S-${String(n).padStart(4, '0')}` };
        save('subscribers', [...rows, row]);
        return row;
      },
      update: async (id, patch) => {
        const rows = load('subscribers');
        const i = rows.findIndex((s) => s.id === id);
        if (i < 0) return null;
        rows[i] = { ...rows[i], ...patch, id };
        save('subscribers', rows);
        return rows[i];
      },
    },

    ratings: {
      /** 구독자 × 콘텐츠당 1개 — 다시 누르면 덮어써요 */
      upsert: async (r) => {
        const rows = load('ratings').filter((x) => !(x.subscriberId === r.subscriberId && x.contentId === r.contentId));
        save('ratings', [...rows, r]);
        return r;
      },
      list: async ({ subscriberId, contentId } = {}) =>
        load('ratings').filter((r) => (!subscriberId || r.subscriberId === subscriberId) && (!contentId || r.contentId === contentId)),
    },

    feedback: {
      add: async (f) => save('feedback', [...load('feedback'), f]),
      list: async ({ subscriberId } = {}) => load('feedback').filter((f) => !subscriberId || f.subscriberId === subscriberId),
    },

    // 아이디어 노트: 메모장(source: memo) + 수집함(youtube·instagram). 같은 링크는 한 번만.
    ideas: {
      list: async () => load('ideas'),
      add: async (idea) => {
        const rows = load('ideas');
        if (idea.url && rows.some((r) => r.url === idea.url)) return null;
        save('ideas', [...rows, idea]);
        return idea;
      },
      update: async (id, patch) => {
        const rows = load('ideas');
        const i = rows.findIndex((r) => r.id === id);
        if (i < 0) return null;
        rows[i] = { ...rows[i], ...patch, id };
        save('ideas', rows);
        return rows[i];
      },
    },

    photos: {
      add: async (meta, bytes) => {
        writeFileSync(join(dir, 'photos', meta.id), Buffer.from(bytes), { mode: 0o600 });
        save('photos', [...load('photos'), meta]);
      },
      list: async ({ subscriberId } = {}) => load('photos').filter((p) => !subscriberId || p.subscriberId === subscriberId),
      read: async (id) => {
        const meta = load('photos').find((p) => p.id === id);
        return meta ? { meta, bytes: readFileSync(join(dir, 'photos', id)) } : null;
      },
    },
  };
}
