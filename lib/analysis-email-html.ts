// Pure HTML presentation of an analysis email. Every dynamic value is escaped and only
// absolute http(s) URLs become links. Unsupported Markdown remains visible as escaped
// text (or preformatted blocks) so no generated content is dropped.
const SERIF = "Georgia, 'Times New Roman', Times, serif";
const SANS = 'Arial, Helvetica, sans-serif';
const MONO = "Menlo, Consolas, 'Courier New', monospace";
const WRAP = 'overflow-wrap:anywhere;word-wrap:break-word;word-break:break-word;';
const BODY = `font-family:${SERIF};font-size:17px;line-height:25px;color:#333;`;
const P = `margin:0 0 16px;${BODY}`;
const PRE = `margin:0 0 18px;padding:10px 12px;background:#f7f7f7;border:1px solid #dcdcdc;font-family:${MONO};font-size:13px;line-height:19px;color:#333;white-space:pre-wrap;${WRAP}`;
const LINK = `color:#1155cc;text-decoration:underline;${WRAP}`;

const entities: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const clean = (value: string) => value.replace(/\r\n?/g, '\n').replace(/[\x00-\x08\x0b-\x1f\x7f-\x9f]/g, '�');
const escape = (value: string) => clean(value).replace(/[&<>"']/g, c => entities[c]);

// Built from a string: a literal U+2028 emitted into a regex literal would end the line.
const unsafeUrl = new RegExp('[\\x00-\\x20\\x7f-\\x9f\\\\\\u00ad\\u061c\\u180e\\u200b-\\u200f\\u2028-\\u202e\\u2060-\\u206f\\ufeff]');
function safeUrl(raw: string): string | null {
  if (raw.length > 2048 || unsafeUrl.test(raw)) return null;
  const authority = /^https?:\/\/([^/?#]+)/i.exec(raw);
  if (!authority || /[@%]/.test(authority[1])) return null;
  let url: URL;
  try { url = new URL(raw); } catch { return null; }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return null;
  if (!/^\[[0-9a-f:.]+\]$/i.test(url.hostname) && !/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/i.test(url.hostname)) return null;
  return url.href;
}
const anchor = (href: string, label: string) => `<a href="${escape(href)}" style="${LINK}">${label}</a>`;

// Code span | [label](url) | <url> | bare url | **strong** | *em*
const INLINE = /`([^`\n]+)`|\[([^\[\]\n]+)\]\(([^()\s]+)\)|<(https?:[^<>\s]+)>|(https?:\/\/[^\s<>`]+)|\*\*(?=\S)(.+?)(?<=\S)\*\*|\*(?=[^\s*])([^*\n]+?)(?<=[^\s*])\*/g;
function inline(raw: string, links = true): string {
  let out = '', last = 0;
  for (const m of raw.matchAll(INLINE)) {
    const [all, code, label, href, auto, bare, strong, em] = m;
    out += escape(raw.slice(last, m.index)); last = m.index! + all.length;
    if (code !== undefined) out += `<code style="font-family:${MONO};font-size:15px;background:#f2f2f2;padding:0 3px;">${escape(code)}</code>`;
    else if (label !== undefined) { const url = links && safeUrl(href); out += url ? anchor(url, inline(label, false)) : escape(all); }
    else if (auto !== undefined) { const url = links && safeUrl(auto); out += url ? anchor(url, escape(auto)) : escape(all); }
    else if (bare !== undefined) {
      let url = bare, rest = '';
      for (;;) {
        const ch = url.at(-1)!;
        const unbalanced = (open: string) => url.split(open).length < url.split(ch).length;
        if (/[.,;:!?*]/.test(ch) || (ch === ')' && unbalanced('(')) || (ch === ']' && unbalanced('['))) { rest = ch + rest; url = url.slice(0, -1); } else break;
      }
      const safe = links && safeUrl(url);
      out += (safe ? anchor(safe, escape(url)) : escape(url)) + escape(rest);
    } else if (strong !== undefined) out += `<strong>${inline(strong, links)}</strong>`;
    else out += `<em>${inline(em, links)}</em>`;
  }
  return out + escape(raw.slice(last));
}

const pre = (lines: string[]) => `<pre style="${PRE}">${lines.map(escape).join('\n')}</pre>`;
function cells(row: string) {
  let s = row.trim();
  if (s.startsWith('|')) s = s.slice(1);
  if (s.endsWith('|') && !s.endsWith('\\|')) s = s.slice(0, -1);
  return s.split(/(?<!\\)\|/).map(c => c.trim().replace(/\\\|/g, '|'));
}
function table(rows: string[]) {
  const cell = (tag: string, value: string) => `<${tag} align="left" valign="top" style="border:1px solid #dcdcdc;padding:6px 8px;text-align:left;vertical-align:top;font-family:${SERIF};font-size:15px;line-height:21px;color:#333;${tag === 'th' ? 'font-weight:700;background:#f7f7f7;' : ''}${WRAP}">${inline(value)}</${tag}>`;
  const body = [rows[0], ...rows.slice(2)].map((row, i) => `<tr>${cells(row).map(c => cell(i ? 'td' : 'th', c)).join('')}</tr>`).join('');
  return `<div style="overflow-x:auto;margin:0 0 18px;"><table cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;">${body}</table></div>`;
}
type Item = { depth: number; marker: string; lines: string[] };
function list(items: Item[]) {
  const rows = items.map(({ depth, marker, lines }) => `<tr><td valign="top" style="${BODY}vertical-align:top;white-space:nowrap;width:1%;padding:0 8px 6px ${depth * 22}px;">${escape(/^\d/.test(marker) ? marker : depth ? '◦' : '•')}</td><td valign="top" style="${BODY}vertical-align:top;padding:0 0 6px;${WRAP}">${lines.map(l => inline(l.trim())).join('<br>')}</td></tr>`).join('');
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:100%;margin:0 0 12px;">${rows}</table>`;
}

const section = (html: string) => `<h2 style="margin:30px 0 14px;padding:8px 0 0;border-top:10px solid #000;font-family:${SANS};font-size:15px;line-height:20px;font-weight:700;letter-spacing:0.04em;text-transform:uppercase;color:#000;${WRAP}">${html}</h2>`;
const LIST = /^([ \t]*)([-*+•]|\d{1,3}[.)])[ \t]+(.*)$/;
const SEPARATOR = /^\s*\|?\s*:?-+:?\s*(?:\|\s*:?-+:?\s*)*\|?\s*$/;
const DIAGRAM = /[─-▟]/;
const RULE = /^ {0,3}([-*_])(?:[ \t]*\1){2,}[ \t]*$/;
const CONNECTOR = /^[\s↑↓←→↔↕⇒⇓⇑⇐▲▼◄►▶◀|\/\\^v<>+*-]+$/;
function renderBody(text: string): string {
  const lines = clean(text).split('\n');
  const out: string[] = [];
  let para: string[] = [], items: Item[] = [], quote: string[] = [], lastTitle = NaN;
  // End of a preformatted run starting at i: indented, box-drawing or connector-only lines.
  const preEnd = (i: number) => {
    let j = i + 1; while (j < lines.length && lines[j].trim() && (DIAGRAM.test(lines[j]) || /^\s/.test(lines[j]) || CONNECTOR.test(lines[j]))) j++;
    return j;
  };
  // Indented lines after a list item are an ASCII diagram, not continuation prose, only when the
  // run spans 2+ lines and one of them is purely connector glyphs (e.g. "  v     v", "  |").
  const asciiDiagram = (i: number) => {
    const run = lines.slice(i, preEnd(i));
    return /^\s/.test(lines[i]) && run.length > 1 && run.some(l => CONNECTOR.test(l) && /[↑↓←→↔↕⇒⇓⇑⇐▲▼◄►▶◀|\/\\^v<>]/.test(l));
  };
  // A bold-only numbered line is a section title when the next non-blank line cannot continue the
  // same ordered list: unindented prose or an unindented bullet. Inside an open list it must also
  // continue the previous title's numbering, so a bold item within an ordinary list stays an item.
  const titleAt = (i: number, number: string) => {
    if (items.length && parseInt(number, 10) !== lastTitle + 1) return false;
    let j = i + 1; while (j < lines.length && !lines[j].trim()) j++;
    const next = lines[j] ?? '';
    return !RULE.test(next) && (/^[-*+•][ \t]+\S/.test(next) || (/^[^\s\-*+•\d|>#`~]/.test(next) && !LIST.test(next)));
  };
  const flush = () => {
    if (para.length) out.push(`<p style="${P}${WRAP}">${para.map(l => inline(l.trim())).join('<br>')}</p>`);
    if (items.length) out.push(list(items));
    if (quote.length) out.push(`<blockquote style="margin:0 0 16px;padding:0 0 0 12px;border-left:3px solid #dcdcdc;${BODY}${WRAP}">${quote.map(l => inline(l.trim())).join('<br>')}</blockquote>`);
    para = []; items = []; quote = [];
  };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    let m: RegExpExecArray | null;
    if (!line.trim()) { flush(); continue; }
    if ((m = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line))) {
      flush();
      const info = m[2].trim(), close = new RegExp(`^ {0,3}${m[1][0]}{${m[1].length},}\\s*$`);
      let j = i + 1;
      while (j < lines.length && !close.test(lines[j])) j++;
      if (j < lines.length) {
        if (info) out.push(`<div style="margin:0 0 4px;font-family:${SANS};font-size:12px;line-height:18px;color:#777;">${escape(info)}</div>`);
        out.push(pre(lines.slice(i + 1, j))); i = j;
      } else { out.push(pre(lines.slice(i))); i = lines.length; }
    } else if ((m = /^ {0,3}(#{1,6})[ \t]+(\S.*?)(?:[ \t]+#+)?[ \t]*$/.exec(line))) {
      flush();
      const level = m[1].length;
      if (level === 1) out.push(`<h2 style="margin:26px 0 12px;font-family:${SERIF};font-size:22px;line-height:29px;font-weight:700;color:#000;${WRAP}">${inline(m[2])}</h2>`);
      else if (level === 2) out.push(section(inline(m[2])));
      else out.push(`<h3 style="margin:22px 0 8px;font-family:${SERIF};font-size:19px;line-height:26px;font-weight:700;color:#000;${WRAP}">${inline(m[2])}</h3>`);
    } else if (RULE.test(line) || /^\s*[─━═]{3,}\s*$/.test(line)) {
      flush(); out.push('<div style="margin:22px 0;border-top:1px solid #dcdcdc;height:0;line-height:0;font-size:0;"></div>');
    } else if (/^\s*\|/.test(line)) {
      flush();
      let j = i; while (j < lines.length && /^\s*\|/.test(lines[j])) j++;
      const rows = lines.slice(i, j);
      out.push(rows.length > 1 && SEPARATOR.test(rows[1]) ? table(rows) : pre(rows)); i = j - 1;
    } else if ((m = /^(\d{1,3}[.)])[ \t]+\*\*(?=\S)(.+?)(?<=\S)\*\*(\s*:)?[ \t]*$/.exec(line)) && !m[2].includes('**') && titleAt(i, m[1])) {
      flush(); lastTitle = parseInt(m[1], 10);
      out.push(section(`${escape(m[1])} ${inline(m[2])}${escape(m[3] ?? '')}`));
    } else if ((m = LIST.exec(line))) {
      if (para.length || quote.length) flush();
      const indent = m[1].replace(/\t/g, '    ').length;
      items.push({ depth: Math.min(6, Math.floor(indent / 2)), marker: m[2], lines: [m[3]] });
    } else if ((m = /^ {0,3}>[ \t]?(.*)$/.exec(line))) {
      if (para.length || items.length) flush();
      quote.push(m[1]);
    } else if (items.length && !DIAGRAM.test(line) && !asciiDiagram(i)) {
      items[items.length - 1].lines.push(line);
    } else if (DIAGRAM.test(line) || items.length || (!para.length && /^(?: {4}|\t)/.test(line))) {
      flush();
      const j = preEnd(i);
      out.push(pre(lines.slice(i, j))); i = j - 1;
    } else if ((m = /^\s*\*\*(?=\S)(.+?)(?<=\S)\*\*(\s*:)?\s*$/.exec(line)) && !m[1].includes('**')) {
      flush(); out.push(`<h3 style="margin:22px 0 8px;font-family:${SERIF};font-size:19px;line-height:26px;font-weight:700;color:#000;${WRAP}">${inline(m[1])}${escape(m[2] ?? '')}</h3>`);
    } else {
      if (quote.length) flush();
      para.push(line);
    }
  }
  flush();
  return out.join('\n');
}

const dateFormat = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
export function renderAnalysisEmailHtml({ text, companyName, failure = false, date = new Date() }: { text: string; companyName: string; failure?: boolean; date?: Date }): string {
  const company = escape(companyName.replace(/[\x00-\x1f\x7f]/g, ' '));
  const heading = failure ? 'Analysis could not be completed' : 'Your analysis';
  const day = Number.isFinite(date.getTime()) ? escape(dateFormat.format(date)) : '';
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="color-scheme" content="light"><title>${heading}: ${company}</title></head>
<body style="margin:0;padding:0;background:#ffffff;-webkit-text-size-adjust:100%;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;background:#ffffff;"><tr><td align="center" style="padding:0;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;background:#ffffff;">
<tr><td style="padding:0 15px;"><div style="padding:24px 0 12px;border-bottom:1px solid #dcdcdc;"><div style="font-family:${SERIF};font-size:28px;line-height:36px;font-weight:700;color:#000;">HelmerBot</div><div style="font-family:${SERIF};font-size:12px;line-height:18px;color:#666;">${day}</div></div></td></tr>
<tr><td style="padding:0 15px;"><div style="padding:20px 0 14px;border-bottom:1px solid #dcdcdc;"><div style="font-family:${SANS};font-size:13px;line-height:18px;color:#666;">${failure ? company : heading}</div><h1 style="margin:4px 0 8px;font-family:${SERIF};font-size:24px;line-height:31px;font-weight:700;color:#000;${WRAP}">${failure ? heading : company}</h1><div style="font-family:${SANS};font-size:13px;line-height:18px;color:#666;">Generated by HelmerBot</div></div></td></tr>
<tr><td data-report style="padding:20px 15px 8px;${BODY}${WRAP}">
${renderBody(text)}
</td></tr>
<tr><td style="padding:0 15px 28px;"><div style="padding:12px 0 0;border-top:1px solid #dcdcdc;font-family:${SANS};font-size:12px;line-height:18px;color:#777;">You requested this email from HelmerBot. A plain-text version is included.</div></td></tr>
</table></td></tr></table>
</body></html>`;
}
