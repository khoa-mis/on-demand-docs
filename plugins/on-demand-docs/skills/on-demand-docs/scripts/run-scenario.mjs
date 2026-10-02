#!/usr/bin/env node
// Execute a documentation scenario against Magnolia AdminCentral and capture annotated screenshots.
//
//   node tools/run-scenario.mjs <scenario.json> <outDir> [--headed]
//
// Writes <outDir>/steps.json and <outDir>/img/<nn>-<id>.png. Stops at the first failing step
// (an error screenshot is still captured) so the doc writer can report what broke.
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { launch, MagnoliaUI } from './lib/magnolia-ui.mjs';
import { MagnoliaRest } from './lib/magnolia-rest.mjs';
import { capture } from './lib/annotate.mjs';

const [scenarioFile, outDir] = process.argv.slice(2).filter((a) => !a.startsWith('--'));
if (!scenarioFile || !outDir) {
  console.error('usage: run-scenario.mjs <scenario.json> <outDir> [--headed]');
  process.exit(2);
}
const headed = process.argv.includes('--headed');
const scenario = JSON.parse(fs.readFileSync(scenarioFile, 'utf8'));
const creds = { baseUrl: process.env.MAGNOLIA_URL, user: process.env.MAGNOLIA_USER, password: process.env.MAGNOLIA_PASSWORD };
if (!creds.baseUrl || !creds.user || !creds.password) throw new Error('MAGNOLIA_URL / MAGNOLIA_USER / MAGNOLIA_PASSWORD must be set');

fs.mkdirSync(path.join(outDir, 'img'), { recursive: true });
const rest = new MagnoliaRest(creds);
const { browser, context } = await launch({ headless: !headed });
const ui = new MagnoliaUI(context, creds);

// ---------- setup ----------
if (scenario.setup?.page) {
  const s = scenario.setup.page;
  await rest.ensurePage(s.parent, s.name, s.template, s.title);
  if (s.clearArea) await rest.clearArea(`${s.parent}/${s.name}`, s.clearArea);
}

// ---------- reference -> locator ----------
function locate(ref) {
  if (ref.placeholder) return ui.placeholder(ref.placeholder);
  if (ref.component) return ui.component(ref.component, ref.nth || 0);
  if (ref.action) return ui.actionLocator(ref.action);
  if (ref.field) return ui.field(ref.field).locator('.v-formlayout-contentcell > *').first();
  if (ref.button) return ui.dialogButtonLocator(ref.button);
  if (ref.option) return ui.page.locator('.v-filterselect-suggestpopup').getByText(ref.option, { exact: true }).first();
  if (ref.tree) return ui.treeRow(ref.tree);
  if (ref.dialog) return ui.dialog();
  if (ref.text) return ui.page.getByText(ref.text, { exact: true }).first();
  throw new Error(`Unknown reference ${JSON.stringify(ref)}`);
}

async function clipFor(target) {
  if (!target || target === 'viewport') return null;
  let loc;
  if (target === 'dialog') loc = ui.dialog();
  else if (target === 'editor') loc = ui.page.locator('iframe.gwt-Frame, iframe[src*=".html"]').first();
  else if (target === 'actionbar') loc = ui.page.locator('.v-actionbar').first();
  else loc = locate(target);
  const bb = await loc.boundingBox();
  return bb;
}

// ---------- operations ----------
const ops = {
  login: () => ui.login(),
  openEditor: (a) => ui.openPageEditor(a.path),
  click: (a) => locate(a.target).click().then(() => ui.idle(800)),
  // Clicking an empty-area placeholder opens "Add component" directly; fall back to the action bar.
  openAddDialog: async (a) => {
    await ui.placeholder(a.placeholder).click();
    await ui.idle(1500);
    if (!(await ui.page.locator('.v-window').count())) await ui.action('Add component');
    await ui.dialog().waitFor();
  },
  selectComponent: (a) => ui.selectComponent(a.selector, a.nth || 0),
  action: (a) => ui.action(a.label),
  editComponent: (a) => ui.editComponent(a.title, a.nth || 0),
  fill: (a) => ui.fill(a.field, a.value),
  select: (a) => ui.select(a.field, a.option),
  openSelect: (a) => ui.field(a.field).locator('.v-filterselect-button').click().then(() => ui.idle(600)),
  pickOption: (a) => ui.page.locator('.v-filterselect-suggestpopup').getByText(a.option, { exact: true }).first().click().then(() => ui.idle(400)),
  radio: (a) => ui.radio(a.field, a.option),
  checkbox: (a) => ui.checkbox(a.field, a.value !== false),
  openChooser: (a) => ui.field(a.field).getByText(/Select new|Select/).first().click().then(() => ui.idle(2500)),
  pickInTree: (a) => ui.pickInTree(a.path),
  choose: (a) => ui.choose(a.field, a.path),
  button: (a) => ui.dialogButton(a.label),
  save: () => ui.saveDialog(),
  scrollTo: (a) => locate(a.target).scrollIntoViewIfNeeded().then(() => ui.idle(500)),
  wait: (a) => ui.page.waitForTimeout(a.ms || 1000),
  // Record the open dialog's fields (label, type, required, options, current value) for the field reference.
  captureFields: async () => { currentFields = await ui.describeDialog(); },
};
let currentFields = null;

async function shoot(step, idx, suffix = '') {
  const file = `${String(idx).padStart(2, '0')}-${step.id}${suffix}.png`;
  const shot = step.shot || {};
  if (shot.highlight?.length) await locate(shot.highlight[0]).scrollIntoViewIfNeeded({ timeout: 3000 }).catch(() => {});
  const highlights = (shot.highlight || []).map((ref, i) => ({ name: JSON.stringify(ref), locator: locate(ref), label: ref.label ?? (shot.highlight.length > 1 ? i + 1 : null) }));
  await ui.hideBanners();
  const clip = await clipFor(shot.target);
  const res = await capture(ui.page, path.join(outDir, 'img', file), { highlights, clip });
  if (res.missing.length) console.log(`  ! highlight not found: ${res.missing.join(', ')}`);
  return `img/${file}`;
}

const results = [];
let failed = false;
let n = 0;
for (const step of scenario.steps) {
  n++;
  const rec = { id: step.id, title: step.title, caption: step.caption, image: null, status: 'ok' };
  const t0 = Date.now();
  try {
    const when = step.shot?.when || 'after';
    if (step.shot && when === 'before') rec.image = await shoot(step, n);
    for (const op of step.do || []) {
      const fn = ops[op.op];
      if (!fn) throw new Error(`Unknown op "${op.op}"`);
      await fn(op);
    }
    if (step.shot && when === 'after') rec.image = await shoot(step, n);
    if (currentFields) { rec.fields = currentFields; currentFields = null; }
    rec.ms = Date.now() - t0;
    console.log(`✓ ${n} ${step.id} (${(rec.ms / 1000).toFixed(1)}s)`);
  } catch (err) {
    rec.status = 'failed';
    rec.error = err.message.split('\n')[0];
    if (process.env.ODD_DEBUG) {
      console.log(err.message.split('\n').slice(0, 14).join('\n'));
      const btns = await ui.page.locator('.v-window').evaluateAll(ws => ws.map((w, i) => `#${i} visible=${!!w.offsetParent || getComputedStyle(w).display !== 'none'} :: ` +
        [...w.querySelectorAll('.v-button, [role=button], button')].map(b => `${b.tagName}.${b.className.split(' ').slice(0, 3).join('.')}[${(b.innerText || '').trim()}]`).join(' | ')));
      console.log(btns.join('\n'));
    }
    try { rec.image = await shoot({ ...step, shot: { target: 'viewport' } }, n, '-error'); } catch {}
    console.log(`✗ ${n} ${step.id}: ${rec.error}`);
    failed = true;
  }
  results.push(rec);
  if (failed) break;
}

const summary = {
  scenario: path.basename(scenarioFile),
  component: scenario.component,
  page: scenario.setup?.page ? `${scenario.setup.page.parent}/${scenario.setup.page.name}` : null,
  ranAt: new Date().toISOString(),
  magnolia: creds.baseUrl,
  status: failed ? 'failed' : 'ok',
  steps: results,
};
fs.writeFileSync(path.join(outDir, 'steps.json'), JSON.stringify(summary, null, 2));
await ui.logout();
await browser.close();
console.log(`${summary.status.toUpperCase()}: ${results.length}/${scenario.steps.length} steps -> ${outDir}/steps.json`);
process.exit(failed ? 1 : 0);
