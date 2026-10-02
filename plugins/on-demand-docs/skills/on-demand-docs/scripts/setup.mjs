#!/usr/bin/env node
// First-run check and install for On-Demand Docs. Safe to run every time; it only installs what is missing.
//
//   node <skill-dir>/scripts/setup.mjs [--check]
//
// 1. Node 18+ and git present
// 2. npm dependencies installed next to this script
// 3. Playwright Chromium downloaded
// 4. Magnolia connection settings present (env or .env in the working folder) and the login works
// Prints one line per check and a final READY / NOT READY. --check skips installing.
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const checkOnly = process.argv.includes('--check');
let ok = true;
const line = (status, msg) => console.log(`${status === true ? 'OK  ' : status === false ? 'FAIL' : 'INFO'} ${msg}`);
const has = (cmd, args = ['--version']) => spawnSync(cmd, args, { encoding: 'utf8' }).status === 0;

// 1. runtimes
const major = Number(process.versions.node.split('.')[0]);
line(major >= 18, `Node.js ${process.versions.node}${major >= 18 ? '' : ' (need 18 or newer: install the LTS from https://nodejs.org)'}`);
ok &&= major >= 18;
const gitOk = has('git');
line(gitOk, gitOk ? 'git available' : 'git missing (macOS: run "xcode-select --install"; Windows: https://git-scm.com/download/win). Only needed to approve/commit guides.');

// 2. npm dependencies
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
if (!fs.existsSync(path.join(here, 'node_modules', 'playwright'))) {
  if (checkOnly) { line(false, 'npm packages not installed'); ok = false; }
  else {
    line('info', 'installing npm packages (one time, ~1 minute)…');
    const r = spawnSync(npm, ['install', '--no-audit', '--no-fund', '--loglevel=error'], { cwd: here, stdio: 'inherit', shell: process.platform === 'win32' });
    line(r.status === 0, 'npm packages installed');
    ok &&= r.status === 0;
  }
} else line(true, 'npm packages installed');

// 3. Chromium for Playwright
if (ok) {
  let browserOk = false;
  try {
    const { chromium } = await import(path.join(here, 'node_modules', 'playwright', 'index.mjs'));
    browserOk = fs.existsSync(chromium.executablePath());
  } catch { /* not installed yet */ }
  if (!browserOk && !checkOnly) {
    line('info', 'downloading Chromium for Playwright (one time, ~150 MB)…');
    const r = spawnSync(process.execPath, [path.join(here, 'node_modules', 'playwright', 'cli.js'), 'install', 'chromium'], { cwd: here, stdio: 'inherit' });
    browserOk = r.status === 0;
  }
  line(browserOk, 'Chromium browser for screenshots');
  ok &&= browserOk;
}

// 4. Magnolia settings (env vars, or .env in the current working folder)
const envFile = path.join(process.cwd(), '.env');
if (fs.existsSync(envFile)) {
  for (const l of fs.readFileSync(envFile, 'utf8').split('\n')) {
    const m = l.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}
const missing = ['MAGNOLIA_URL', 'MAGNOLIA_USER', 'MAGNOLIA_PASSWORD'].filter((k) => !process.env[k]);
if (missing.length) {
  line(false, `Magnolia settings missing: ${missing.join(', ')} (put them in ${envFile})`);
  ok = false;
} else {
  try {
    const auth = 'Basic ' + Buffer.from(`${process.env.MAGNOLIA_USER}:${process.env.MAGNOLIA_PASSWORD}`).toString('base64');
    const res = await fetch(`${process.env.MAGNOLIA_URL.replace(/\/$/, '')}/.rest/nodes/v1/website/?depth=0`, { headers: { Authorization: auth, Accept: 'application/json' } });
    line(res.ok, `Magnolia login at ${process.env.MAGNOLIA_URL} (HTTP ${res.status})`);
    ok &&= res.ok;
  } catch (e) {
    line(false, `Magnolia not reachable at ${process.env.MAGNOLIA_URL}: ${e.message}`);
    ok = false;
  }
}

console.log(ok ? 'READY' : 'NOT READY');
process.exit(ok ? 0 : 1);
