export const BRAND = { name: '쪼물랩', en: 'Jjomul Lab' };

export const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export const fontLinks = (base) =>
  ['gowun-dodum/400.css', 'noto-sans-kr/400.css', 'noto-sans-kr/700.css']
    .map((f) => `<link rel="stylesheet" href="${base}/${f}">`)
    .join('');
