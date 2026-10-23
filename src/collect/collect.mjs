// 아이놀이 수집기: 유튜브 채널 · 인스타그램 해시태그 → "제목 + 개요 + 원본 링크"
// 공식 경로만 사용해요 (YouTube Data API / 채널 RSS, Instagram Graph API). 크롤링은 하지 않아요.
// 원본 이미지·전문은 저장하지 않고 링크와 짧은 요약만 남겨요 (저작권).

const decodeXml = (s) =>
  s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;|&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');

/** 링크·해시태그·여러 줄 공백을 걷어내고 짧게 */
export function clean(text, max) {
  const t = String(text ?? '')
    .replace(/https?:\/\/\S+/g, '')
    .replace(/#[^\s#]+/g, '')
    .split('\n')
    .map((l) => l.replace(/[ \t]+/g, ' ').trim())
    .filter(Boolean)
    .join('\n');
  return t.length > max ? `${t.slice(0, max - 1).trim()}…` : t;
}

// ---------- 유튜브 ----------
/** '@핸들' · 채널 주소 · 'UC…' 아무거나 받아 채널 ID로 */
export async function resolveChannelId(input, { fetch, apiKey }) {
  const s = String(input).trim();
  if (/^UC[\w-]{22}$/.test(s)) return s;
  const byUrl = s.match(/channel\/(UC[\w-]{22})/);
  if (byUrl) return byUrl[1];
  const handle = s.startsWith('@') ? s : s.match(/youtube\.com\/(@[^/?#]+)/)?.[1];
  if (!handle) throw new Error(`채널을 알아볼 수 없어요: ${s}`);
  if (apiKey) {
    const r = await fetch(`https://www.googleapis.com/youtube/v3/channels?part=id&forHandle=${encodeURIComponent(handle)}&key=${apiKey}`);
    const id = (await r.json()).items?.[0]?.id;
    if (id) return id;
  }
  const html = await (await fetch(`https://www.youtube.com/${handle}`)).text();
  const id = html.match(/<link rel="canonical" href="https:\/\/www\.youtube\.com\/channel\/(UC[\w-]{22})/)?.[1];
  if (!id) throw new Error(`채널 ID를 찾지 못했어요: ${handle}`);
  return id;
}

export function parseYoutubeFeed(xml) {
  const author = decodeXml(xml.match(/<author>\s*<name>([\s\S]*?)<\/name>/)?.[1] ?? '');
  return [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)].map(([, e]) => ({
    title: decodeXml(e.match(/<title>([\s\S]*?)<\/title>/)?.[1] ?? ''),
    description: decodeXml(e.match(/<media:description>([\s\S]*?)<\/media:description>/)?.[1] ?? ''),
    url: `https://www.youtube.com/watch?v=${e.match(/<yt:videoId>([\w-]+)<\/yt:videoId>/)?.[1]}`,
    publishedAt: e.match(/<published>([^<]+)<\/published>/)?.[1] ?? '',
    author,
  }));
}

export async function youtubeVideos(channelId, { fetch, apiKey, max = 15 }) {
  if (apiKey) {
    // 채널의 '업로드' 재생목록 = UC → UU
    const u = `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet&maxResults=${Math.min(max, 50)}&playlistId=UU${channelId.slice(2)}&key=${apiKey}`;
    const r = await fetch(u);
    if (!r.ok) throw new Error(`YouTube API ${r.status}`);
    return ((await r.json()).items ?? []).map(({ snippet: s }) => ({
      title: s.title,
      description: s.description,
      url: `https://www.youtube.com/watch?v=${s.resourceId.videoId}`,
      publishedAt: s.publishedAt,
      author: s.channelTitle,
    }));
  }
  const r = await fetch(`https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`);
  if (!r.ok) throw new Error(`유튜브 RSS ${r.status} — 잠시 후 다시 시도하거나 YOUTUBE_API_KEY를 설정해 주세요`);
  return parseYoutubeFeed(await r.text()).slice(0, max);
}

// ---------- 인스타그램 (Graph API 해시태그 검색) ----------
export async function instagramHashtag(tag, { fetch, igUserId, token, version = 'v23.0', max = 20 }) {
  const g = `https://graph.facebook.com/${version}`;
  const s = await fetch(`${g}/ig_hashtag_search?user_id=${igUserId}&q=${encodeURIComponent(tag)}&access_token=${token}`);
  const sj = await s.json();
  if (!s.ok || !sj.data?.[0]?.id) throw new Error(`인스타 해시태그 검색 실패 #${tag}: ${sj.error?.message ?? s.status}`);
  const m = await fetch(`${g}/${sj.data[0].id}/recent_media?user_id=${igUserId}&fields=id,caption,permalink,timestamp&limit=${max}&access_token=${token}`);
  const mj = await m.json();
  if (!m.ok) throw new Error(`인스타 게시물 조회 실패 #${tag}: ${mj.error?.message ?? m.status}`);
  return (mj.data ?? []).map((p) => ({ caption: p.caption ?? '', url: p.permalink, publishedAt: p.timestamp, tag }));
}

// ---------- 정리 ----------
export function youtubeToIdea(v) {
  return { source: 'youtube', title: clean(v.title, 60), summary: clean(v.description, 200), url: v.url, author: v.author, publishedAt: v.publishedAt };
}
export function instagramToIdea(p) {
  const body = clean(p.caption, 400);
  const first = body.split('\n').find((l) => l.trim()) ?? '';
  return {
    source: 'instagram',
    title: clean(first, 40) || `#${p.tag} 게시물`,
    summary: clean(body.slice(first.length), 200) || clean(first, 200),
    url: p.url,
    author: `#${p.tag}`,
    publishedAt: p.publishedAt,
  };
}

/**
 * 설정에 있는 모든 출처를 돌며 아이디어 목록을 모아요. 한 출처가 실패해도 나머지는 계속해요.
 * env: { YOUTUBE_API_KEY, IG_USER_ID, IG_ACCESS_TOKEN, IG_GRAPH_VERSION }
 */
export async function collectAll(config, env = {}, { fetch = globalThis.fetch } = {}) {
  const items = [];
  const errors = [];
  const max = config.max_per_source ?? 15;
  for (const ch of config.youtube_channels ?? []) {
    const input = typeof ch === 'string' ? ch : ch.channel;
    try {
      const id = await resolveChannelId(input, { fetch, apiKey: env.YOUTUBE_API_KEY });
      items.push(...(await youtubeVideos(id, { fetch, apiKey: env.YOUTUBE_API_KEY, max })).map(youtubeToIdea));
    } catch (e) {
      errors.push(`유튜브 ${input}: ${e.message}`);
    }
  }
  const tags = config.instagram_hashtags ?? [];
  if (tags.length && !(env.IG_USER_ID && env.IG_ACCESS_TOKEN)) {
    errors.push('인스타그램: IG_USER_ID · IG_ACCESS_TOKEN 이 없어 건너뛰었어요 (README의 연결 방법 참고)');
  } else {
    for (const tag of tags) {
      try {
        const posts = await instagramHashtag(String(tag).replace(/^#/, ''), {
          fetch, igUserId: env.IG_USER_ID, token: env.IG_ACCESS_TOKEN, version: env.IG_GRAPH_VERSION, max,
        });
        items.push(...posts.map(instagramToIdea));
      } catch (e) {
        errors.push(e.message);
      }
    }
  }
  return { items: items.filter((i) => i.url && i.title), errors };
}
