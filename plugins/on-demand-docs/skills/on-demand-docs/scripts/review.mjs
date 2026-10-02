#!/usr/bin/env node
// Build the human review page: draft guide vs the last approved version.
//
//   node tools/review.mjs <draftDir> <approvedDir|-> <bundleDir> [--fragment]
//
// <draftDir> holds draft.md + img/, <approvedDir> holds doc.md + img/ (or "-" for a first version).
// Sections are matched by heading; screenshots are compared pixel-wise so capture noise is ignored.
// Writes a self-contained bundle: review.html, draft.html, img/ (draft) and approved/img/ (previous).
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';
import { diffWordsWithSpace } from 'diff';
import { parseDoc, sections, renderMarkdown, page, escapeHtml, slug } from './lib/doc-render.mjs';

const args = process.argv.slice(2);
const [draftDir, approvedDir, bundle] = args.filter((a) => !a.startsWith('--'));
const fragment = args.includes('--fragment');
if (!draftDir || !approvedDir || !bundle) {
  console.error('usage: review.mjs <draftDir> <approvedDir|-> <bundleDir> [--fragment]');
  process.exit(2);
}
const out = path.join(bundle, 'review.html');
fs.rmSync(bundle, { recursive: true, force: true });
fs.mkdirSync(path.join(bundle, 'img'), { recursive: true });
// Bundle-relative image paths: draft images under img/, approved ones under approved/img/.
const rel = (p) => {
  const abs = path.resolve(p);
  const name = path.basename(abs);
  if (approvedDir !== '-' && abs.startsWith(path.resolve(approvedDir))) {
    fs.mkdirSync(path.join(bundle, 'approved/img'), { recursive: true });
    fs.copyFileSync(abs, path.join(bundle, 'approved/img', name));
    return `approved/img/${name}`;
  }
  if (abs.startsWith(path.resolve(draftDir, 'img'))) return `img/${name}`;
  return path.relative(bundle, abs);
};
for (const f of fs.readdirSync(path.join(draftDir, 'img'))) fs.copyFileSync(path.join(draftDir, 'img', f), path.join(bundle, 'img', f));

const draft = parseDoc(fs.readFileSync(path.join(draftDir, 'draft.md'), 'utf8'));
const approvedFile = approvedDir !== '-' ? path.join(approvedDir, 'doc.md') : null;
const approved = approvedFile && fs.existsSync(approvedFile) ? parseDoc(fs.readFileSync(approvedFile, 'utf8')) : null;

const key = (title) => slug(title.replace(/\[NEW[^\]]*\]/g, ''));
const IMG = /!\[[^\]]*\]\(([^)]+)\)/g;
const stripImgs = (md) => md.replace(/^\s*!\[[^\]]*\]\([^)]+\)\s*$/gm, '').replace(/\n{3,}/g, '\n\n').trim();
const imgsOf = (md) => [...md.matchAll(IMG)].map((m) => m[1]);

function imageChange(name) {
  const a = approvedDir !== '-' ? path.join(approvedDir, name) : null;
  const b = path.join(draftDir, name);
  if (!a || !fs.existsSync(a)) return { status: 'added', after: b };
  try {
    const pa = PNG.sync.read(fs.readFileSync(a)), pb = PNG.sync.read(fs.readFileSync(b));
    if (pa.width !== pb.width || pa.height !== pb.height) return { status: 'changed', before: a, after: b, ratio: 1 };
    const diff = pixelmatch(pa.data, pb.data, null, pa.width, pa.height, { threshold: 0.15 });
    const ratio = diff / (pa.width * pa.height);
    return ratio > 0.004 ? { status: 'changed', before: a, after: b, ratio } : { status: 'same' };
  } catch {
    return { status: 'changed', before: a, after: b, ratio: 1 };
  }
}

const oldSecs = new Map((approved ? sections(approved.body) : []).map((s) => [key(s.title), s]));
const rows = [];
for (const s of sections(draft.body)) {
  const prev = oldSecs.get(key(s.title));
  oldSecs.delete(key(s.title));
  const shots = imgsOf(s.markdown).map((src) => ({ src, ...imageChange(src) })).filter((x) => x.status !== 'same');
  if (!prev) { rows.push({ s, status: 'added', shots }); continue; }
  const textChanged = stripImgs(prev.markdown) !== stripImgs(s.markdown);
  rows.push({ s, prev, status: textChanged || shots.length ? 'changed' : 'same', textChanged, shots });
}
for (const s of oldSecs.values()) rows.push({ s, status: 'removed', shots: [] });

const label = { added: 'New section', changed: 'Changed', removed: 'Removed', same: 'Unchanged' };
const title = (s) => renderMarkdown(s.title).replace(/<\/?p>/g, '').trim();

function textDiff(a, b) {
  return diffWordsWithSpace(stripImgs(a), stripImgs(b)).map((p) =>
    p.added ? `<ins>${escapeHtml(p.value)}</ins>` : p.removed ? `<del>${escapeHtml(p.value)}</del>` : escapeHtml(p.value)).join('');
}

function shotsHtml(shots) {
  return shots.map((x) => x.status === 'added'
    ? `<div class="shots"><figure class="after" style="grid-column:1/-1"><figcaption>New screenshot · ${escapeHtml(x.src)}</figcaption><img src="${rel(x.after)}" loading="lazy"></figure></div>`
    : `<div class="shots"><figure><figcaption>Before</figcaption><img src="${rel(x.before)}" loading="lazy"></figure>` +
      `<figure class="after"><figcaption>After · ${(x.ratio * 100).toFixed(1)}% of pixels changed</figcaption><img src="${rel(x.after)}" loading="lazy"></figure></div>`).join('');
}

const body = rows.map((r) => {
  let inner = '';
  if (r.status === 'added') inner = renderMarkdown(r.s.markdown);
  else if (r.status === 'removed') inner = `<div class="textdiff"><del>${escapeHtml(stripImgs(r.s.markdown))}</del></div>`;
  else if (r.status === 'changed') inner = (r.textChanged ? `<div class="textdiff">${textDiff(r.prev.markdown, r.s.markdown)}</div>` : '') + shotsHtml(r.shots);
  return `<section class="sec ${r.status}" id="${r.s.id}">
  <header><span class="name">${title(r.s)}</span><span class="status ${r.status}">${label[r.status]}</span></header>
  <div class="body">${inner}</div></section>`;
}).join('\n');

const count = (st) => rows.filter((r) => r.status === st).length;
const m = draft.meta;
const prevVersion = approved?.meta?.version;
const html = page({
  fragment,
  title: `${m.title} Review`,
  body: `
<div class="review-banner"><div class="inner">
  <strong>Review draft</strong>
  <span>${escapeHtml(m.title)} · ${prevVersion ? `${escapeHtml(prevVersion)} → ` : ''}${escapeHtml(m.version)}</span>
  ${m.ticket ? `<span>Ticket <b>${escapeHtml(m.ticket.id)}</b>${m.ticket.title ? ` — ${escapeHtml(m.ticket.title)}` : ''}</span>` : ''}
  <span class="stat"><i class="dot changed"></i>${count('changed')} changed</span>
  <span class="stat"><i class="dot added"></i>${count('added')} new</span>
  <span class="stat"><i class="dot removed"></i>${count('removed')} removed</span>
  <span class="stat"><i class="dot same"></i>${count('same')} unchanged</span>
</div></div>
<header class="doc-header"><div class="inner">
  <div class="crumbs">Review · ${prevVersion ? 'changes since the approved version' : 'first version, everything is new'}</div>
  <h1>${escapeHtml(m.title)} <span class="pill draft">Draft ${escapeHtml(m.version)}</span></h1>
  <div class="meta">
    ${m.summary ? `<span>${escapeHtml(m.summary)}</span>` : ''}
    <a href="draft.html">Open the full draft guide</a>
  </div>
</div></header>
<div class="layout">
  <nav class="toc"><h4>Sections</h4><ol>${rows.map((r) => `<li><a href="#${r.s.id}"><i class="dot ${r.status}"></i> ${title(r.s)}</a></li>`).join('')}</ol></nav>
  <main class="doc">${body}</main>
</div>`,
});
fs.writeFileSync(out, html);
const tools = path.dirname(new URL(import.meta.url).pathname);
execFileSync(process.execPath, [path.join(tools, 'render-doc.mjs'), path.join(draftDir, 'draft.md'), path.join(bundle, 'draft.html'), '--draft'], { stdio: 'ignore' });
console.log(`Review: ${out}  (${count('changed')} changed, ${count('added')} new, ${count('removed')} removed, ${count('same')} unchanged)`);
