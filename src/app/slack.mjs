/** 슬랙 Incoming Webhook 알림. 주소가 없으면 터미널에만 찍어요. 주소는 서버(환경변수)에만 두세요. */
export const slackNotifier = (webhook) => async (text) => {
  if (!webhook) return console.log(`[알림] ${text}`);
  try {
    const r = await fetch(webhook, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text }) });
    if (!r.ok) console.error(`슬랙 전송 실패: ${r.status}`);
  } catch (e) {
    console.error(`슬랙 전송 실패: ${e.message}`);
  }
};
