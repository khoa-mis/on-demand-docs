#!/usr/bin/env node
// Promote a reviewed draft into the official docs repo and commit it.
//
//   node tools/approve.mjs <draftDir> <docsRepo> <componentSlug> [--by "Name"]
//
// Copies draft.md -> <docsRepo>/components/<slug>/doc.md and replaces img/, appends to
// history.json, re-renders index.html + guide.pdf, then commits and tags in <docsRepo>.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { parseDoc } from './lib/doc-render.mjs';

const args = process.argv.slice(2);
const [draftDir, docsRepo, compSlug] = args.filter((a, i) => !a.startsWith('--') && args[i - 1] !== '--by');
const by = args.includes('--by') ? args[args.indexOf('--by') + 1] : process.env.USER;
if (!draftDir || !docsRepo || !compSlug) {
  console.error('usage: approve.mjs <draftDir> <docsRepo> <componentSlug> [--by "Name"]');
  process.exit(2);
}

const git = (...a) => execFileSync('git', ['-C', docsRepo, ...a], { encoding: 'utf8' }).trim();
const target = path.join(docsRepo, 'components', compSlug);
const { meta } = parseDoc(fs.readFileSync(path.join(draftDir, 'draft.md'), 'utf8'));

if (!fs.existsSync(path.join(docsRepo, '.git'))) {
  fs.mkdirSync(docsRepo, { recursive: true });
  git('init', '-q');
}

fs.rmSync(path.join(target, 'img'), { recursive: true, force: true });
fs.mkdirSync(path.join(target, 'img'), { recursive: true });
fs.copyFileSync(path.join(draftDir, 'draft.md'), path.join(target, 'doc.md'));
const used = new Set([...fs.readFileSync(path.join(draftDir, 'draft.md'), 'utf8').matchAll(/\]\((img\/[^)]+)\)/g)].map((m) => m[1]));
for (const f of used) fs.copyFileSync(path.join(draftDir, f), path.join(target, f));

const historyFile = path.join(target, 'history.json');
const history = fs.existsSync(historyFile) ? JSON.parse(fs.readFileSync(historyFile, 'utf8')) : [];
history.push({ version: meta.version, date: meta.date, ticket: meta.ticket || null, summary: meta.summary || '', approvedBy: by, approvedAt: new Date().toISOString() });
fs.writeFileSync(historyFile, JSON.stringify(history, null, 2) + '\n');

const node = process.execPath;
const tools = path.dirname(new URL(import.meta.url).pathname);
execFileSync(node, [path.join(tools, 'render-doc.mjs'), path.join(target, 'doc.md'), path.join(target, 'index.html'), '--pdf', path.join(target, 'guide.pdf')], { stdio: 'inherit' });

git('add', '-A', path.join('components', compSlug));
const msg = `docs(${compSlug}): ${meta.version}${meta.ticket ? ` – ${meta.ticket.id}` : ''}\n\n${meta.summary || ''}\n\nApproved-by: ${by}`;
git('commit', '-q', '-m', msg);
const tag = `${compSlug}-${meta.version}`;
git('tag', '-f', tag);
console.log(`Approved ${meta.title} ${meta.version} -> ${target}\ncommit ${git('rev-parse', '--short', 'HEAD')} tag ${tag}`);
