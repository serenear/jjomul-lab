import { BRAND, esc, fontLinks } from '../../render/html.mjs';

const BASE_CSS = `
*{box-sizing:border-box}
body{margin:0;font:15px/1.6 var(--font-body);color:var(--ink);background:#fbf7f2;word-break:keep-all}
a{color:inherit}
h1,h2,h3{font-family:var(--font-display);font-weight:400;line-height:1.3}
.wrap{max-width:720px;margin:0 auto;padding:20px 16px 48px}
.card{background:#fff;border:1px solid var(--line);border-radius:18px;padding:18px}
.muted{color:var(--ink-soft)}.small{font-size:13px}
.btn{display:inline-block;border:0;border-radius:12px;background:#8a5a00;color:#fff;font:700 15px var(--font-body);padding:11px 18px;text-decoration:none;cursor:pointer;text-align:center}
.btn.ghost{background:#fff;color:var(--ink);border:1.5px solid var(--line)}
.btn.wide{display:block;width:100%}
input,select,textarea{font:15px var(--font-body);padding:10px 12px;border:1.5px solid var(--line);border-radius:10px;background:#fff;color:var(--ink);width:100%}
input:focus,select:focus,textarea:focus{outline:3px solid #f2c777;border-color:#e9a23b}
label{display:block;font-size:13px;color:var(--ink-soft);margin:10px 0 4px}
.banner{background:#fff4dc;border:1.5px solid #e9a23b;border-radius:14px;padding:12px 14px;margin-bottom:14px}
.tag{display:inline-block;font-size:12px;font-weight:700;padding:2px 9px;border-radius:99px;background:var(--accent-soft,#f3ede6);color:var(--accent,#6b5b53)}
.msg{min-height:22px;margin-top:8px;font-weight:700;color:#a3392f}
.ok{color:#2f6b52}
`;

/** 공통 HTML 껍데기. extraCss/script는 페이지별로 덧붙여요. */
export function page({ nonce, title, body, css = '', script = '', tokens = '', head = '' }) {
  return `<!doctype html>
<html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow"><title>${esc(title)} · ${esc(BRAND.name)}</title>
${fontLinks('/fonts')}<style>${tokens}${BASE_CSS}${css}</style>${head}</head>
<body>${body}${script ? `<script nonce="${nonce}">${script}</script>` : ''}</body></html>`;
}
