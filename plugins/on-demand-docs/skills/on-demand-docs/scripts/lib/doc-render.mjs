// Markdown guide -> HTML. Shared by render-doc (published guide) and review (draft vs approved).
import fs from 'node:fs';
import yaml from 'js-yaml';
import { Marked } from 'marked';

export function parseDoc(source) {
  const m = source.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!m) return { meta: {}, body: source };
  return { meta: yaml.load(m[1]) || {}, body: m[2] };
}

export const slug = (s) => s.toLowerCase().replace(/<[^>]+>/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

// Split body into level-2 sections: [{ title, id, markdown }]
export function sections(body) {
  const out = [];
  let cur = { title: '_intro', id: 'intro', markdown: '' };
  for (const line of body.split('\n')) {
    const h = line.match(/^##\s+(.*)$/);
    if (h) {
      out.push(cur);
      cur = { title: h[1].trim(), id: slug(h[1]), markdown: line + '\n' };
    } else cur.markdown += line + '\n';
  }
  out.push(cur);
  return out.filter((s) => s.title !== '_intro' || s.markdown.trim());
}

export function renderMarkdown(md, { imgBase = '' } = {}) {
  const marked = new Marked({ gfm: true });
  marked.use({
    renderer: {
      heading({ tokens, depth }) {
        const text = this.parser.parseInline(tokens);
        return `<h${depth} id="${slug(text)}">${text}</h${depth}>\n`;
      },
      image({ href, title, text }) {
        const src = /^(https?:|data:|\/)/.test(href) ? href : imgBase + href;
        return `<figure class="shot"><img src="${src}" alt="${escapeHtml(text)}" loading="lazy">` +
          (text ? `<figcaption>${escapeHtml(text)}</figcaption>` : '') + `</figure>`;
      },
      paragraph({ tokens }) {
        // A paragraph that is only an image renders as a bare figure.
        if (tokens.length === 1 && tokens[0].type === 'image') return this.parser.parseInline(tokens);
        return `<p>${this.parser.parseInline(tokens)}</p>\n`;
      },
      blockquote({ tokens }) {
        const inner = this.parser.parse(tokens);
        const kind = /<strong>(Tip|Note|Important|Warning)/i.exec(inner)?.[1]?.toLowerCase() || 'note';
        return `<aside class="callout callout-${kind}">${inner}</aside>\n`;
      },
    },
  });
  return marked.parse(md).replace(/\[NEW(?: in (v[\d.]+))?\]/g, (_, v) => `<span class="badge-new">New${v ? ' in ' + v : ''}</span>`);
}

export const escapeHtml = (s = '') => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export const CSS = fs.readFileSync(new URL('./doc.css', import.meta.url), 'utf8');

const FONTS = 'https://fonts.googleapis.com/css2?family=Atkinson+Hyperlegible+Next:wght@400;700&family=Bricolage+Grotesque:opsz,wght@12..96,600;12..96,700&family=JetBrains+Mono:wght@400;500&display=swap';

// fragment=true omits the document wrapper (for hosts that add their own skeleton).
export function page({ title, head = '', body, fragment = false }) {
  if (fragment) {
    return `<title>${escapeHtml(title)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="${FONTS}" rel="stylesheet">
<style>${CSS}</style>
${head}
${body}`;
  }
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="${FONTS}" rel="stylesheet">
<style>${CSS}</style>
${head}
</head>
<body>
${body}
</body>
</html>`;
}
