import test from 'node:test';
import assert from 'node:assert/strict';
import { clean, collectAll, instagramToIdea, parseYoutubeFeed, resolveChannelId } from '../src/collect/collect.mjs';

const FEED = `<?xml version="1.0"?><feed xmlns:yt="http://www.youtube.com/xml/schemas/2015" xmlns:media="http://search.yahoo.com/mrss/">
<author><name>놀이 채널</name></author>
<entry><yt:videoId>abc123</yt:videoId><title>집에서 하는 &amp; 쉬운 촉감놀이</title><published>2026-10-01T00:00:00+00:00</published>
<media:group><media:description>밀가루로 반죽을 만들어요.
https://example.com 링크
#아이랑 #가정보육</media:description></media:group></entry>
</feed>`;

/** 주소별로 정해 둔 응답을 돌려주는 가짜 fetch */
const fakeFetch = (routes) => async (url) => {
  const hit = Object.entries(routes).find(([k]) => url.includes(k));
  if (!hit) return new Response('not found', { status: 404 });
  const v = typeof hit[1] === 'function' ? hit[1](url) : hit[1];
  return new Response(typeof v === 'string' ? v : JSON.stringify(v), { status: 200 });
};

test('요약 정리: 링크·해시태그 제거, 길이 제한', () => {
  assert.equal(clean('안녕 https://x.y #아이랑 #놀이\n\n\n둘째 줄', 100), '안녕\n둘째 줄');
  assert.equal(clean('가'.repeat(50), 10).length, 10);
});

test('유튜브 RSS 파싱', () => {
  const [v] = parseYoutubeFeed(FEED);
  assert.equal(v.title, '집에서 하는 & 쉬운 촉감놀이');
  assert.equal(v.url, 'https://www.youtube.com/watch?v=abc123');
  assert.equal(v.author, '놀이 채널');
});

test('채널 입력: UC ID · 채널 주소 · @핸들', async () => {
  const id = 'UC' + 'a'.repeat(22);
  const fetch = fakeFetch({ 'youtube.com/@play': `<link rel="canonical" href="https://www.youtube.com/channel/${id}">` });
  assert.equal(await resolveChannelId(id, { fetch }), id);
  assert.equal(await resolveChannelId(`https://www.youtube.com/channel/${id}`, { fetch }), id);
  assert.equal(await resolveChannelId('@play', { fetch }), id);
  await assert.rejects(resolveChannelId('아무거나', { fetch }));
});

test('수집: 유튜브(API 키 있음) + 인스타 해시태그, 한쪽이 실패해도 계속', async () => {
  const id = 'UC' + 'b'.repeat(22);
  const fetch = fakeFetch({
    'youtube/v3/playlistItems': (u) => {
      assert.ok(u.includes(`playlistId=UU${'b'.repeat(22)}`), '업로드 재생목록');
      return { items: [{ snippet: { title: '종이컵 탑 쌓기', description: '쌓고 무너뜨려요 #놀이', resourceId: { videoId: 'v1' }, channelTitle: '채널A', publishedAt: '2026-10-02' } }] };
    },
    ig_hashtag_search: (u) => (u.includes('q=%EB%AA%AC%ED%85%8C%EC%86%8C%EB%A6%AC') ? { data: [{ id: 'h1' }] } : { data: [] }),
    'h1/recent_media': { data: [{ caption: '스펀지 물놀이 해봤어요\n물을 꾹 짜면 재밌어요 #몬테소리', permalink: 'https://instagram.com/p/1', timestamp: '2026-10-03' }] },
  });
  const r = await collectAll(
    { youtube_channels: [id, '@없는채널'], instagram_hashtags: ['몬테소리', '없는태그'] },
    { YOUTUBE_API_KEY: 'k', IG_USER_ID: 'u', IG_ACCESS_TOKEN: 't' },
    { fetch },
  );
  assert.deepEqual(r.items.map((i) => [i.source, i.title, i.url]), [
    ['youtube', '종이컵 탑 쌓기', 'https://www.youtube.com/watch?v=v1'],
    ['instagram', '스펀지 물놀이 해봤어요', 'https://instagram.com/p/1'],
  ]);
  assert.equal(r.items[1].summary, '물을 꾹 짜면 재밌어요');
  assert.equal(r.errors.length, 2);
});

test('인스타 연결 정보가 없으면 건너뛰고 알려줘요', async () => {
  const r = await collectAll({ instagram_hashtags: ['아이랑'] }, {}, { fetch: fakeFetch({}) });
  assert.equal(r.items.length, 0);
  assert.match(r.errors[0], /IG_USER_ID/);
});

test('캡션이 해시태그뿐이어도 제목이 생겨요', () => {
  assert.equal(instagramToIdea({ caption: '#아이랑 #놀이', url: 'u', tag: '아이랑' }).title, '#아이랑 게시물');
});
