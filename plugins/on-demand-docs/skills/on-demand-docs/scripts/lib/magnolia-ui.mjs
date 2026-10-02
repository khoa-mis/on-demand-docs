// Magnolia 6.2 AdminCentral driver (Vaadin UI) for Playwright.
// Locates everything by visible labels so scenarios stay readable and survive re-renders.
import { chromium } from 'playwright';

export async function launch({ headless = true, width = 1440, height = 1000, scale = 2 } = {}) {
  const browser = await chromium.launch({ headless });
  const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: scale });
  return { browser, context };
}

export class MagnoliaUI {
  constructor(context, { baseUrl, user, password }) {
    this.context = context;
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.user = user;
    this.password = password;
    this.page = null;
    this.frame = null;
  }

  // ---------- waiting ----------
  async idle(extra = 300) {
    const p = this.page;
    await p.waitForTimeout(extra);
    await p.locator('.v-loading-indicator').first().waitFor({ state: 'hidden', timeout: 15000 }).catch(() => {});
    // A modality curtain without a visible window is a transient loading state.
    for (let i = 0; i < 50; i++) {
      const curtains = await p.locator('.v-window-modalitycurtain').count();
      const windows = await p.locator('.v-window').count();
      if (curtains <= windows) break;
      await p.waitForTimeout(200);
    }
  }

  // ---------- session ----------
  async login() {
    const p = await this.context.newPage();
    await p.goto(`${this.baseUrl}/.magnolia/admincentral`);
    await p.fill('#username', this.user);
    await p.fill('#password', this.password);
    await p.click('button');
    await p.waitForSelector('.v-app', { timeout: 60000 });
    if (await p.locator('#username').count()) throw new Error('Magnolia login failed');
    this.page = p;
    await this.idle(1500);
  }

  // Deep links only apply on a fresh AdminCentral load, so navigate and reload in the same tab
  // (closing tabs leaves orphaned Vaadin UIs that later raise error banners).
  async openPageEditor(path) {
    const p = this.page;
    await p.goto(`${this.baseUrl}/.magnolia/admincentral#app:pages-app:detail;${path}:edit`);
    await p.reload();
    const handle = await p.waitForSelector(`iframe[src*="${path}"]`, { timeout: 60000 });
    this.frame = await handle.contentFrame();
    await this.frame.waitForLoadState('load');
    await this.idle(1500);
    await this.dismissCookieBanner();
  }

  // Hide AdminCentral error/notification banners so they never end up in documentation screenshots.
  async hideBanners() {
    await this.page.evaluate(() => {
      const vw = window.innerWidth, vh = window.innerHeight;
      for (const b of document.querySelectorAll('.v-button, button')) {
        if (!/read more/i.test(b.textContent || '')) continue;
        // The banner is the nearest ancestor that spans the screen but is short; never hide the app root.
        for (let el = b.parentElement; el && el !== document.body; el = el.parentElement) {
          const r = el.getBoundingClientRect();
          if (r.height > vh * 0.3) break;
          if (r.width >= vw * 0.8) { el.style.setProperty('visibility', 'hidden', 'important'); break; }
        }
      }
    }).catch(() => {});
  }

  async reloadEditor() {
    await this.frame.waitForLoadState('load');
    await this.idle(1200);
    await this.dismissCookieBanner();
  }

  async dismissCookieBanner() {
    const got = this.frame.getByText('Got it!', { exact: true });
    if (await got.count() && await got.first().isVisible()) { await got.first().click(); await this.idle(); }
  }

  // ---------- page editor ----------
  // Select an empty area placeholder ("New Main Component") or an area bar by its label.
  placeholder(text) { return this.frame.getByText(text, { exact: true }).first(); }

  // A rendered component inside the page, by CSS selector (nth match).
  component(selector, nth = 0) { return this.frame.locator(selector).nth(nth); }


  async selectComponent(selector, nth = 0) {
    const el = this.component(selector, nth);
    await el.scrollIntoViewIfNeeded();
    await el.click({ position: { x: 10, y: 10 } });
    await this.idle(800);
  }

  // Open a component's edit dialog via the pencil on its green editor bar (more reliable than the action bar).
  async editComponent(title, nth = 0) {
    const bar = this.frame.locator('.mgnlEditorBar.component', { has: this.frame.locator(`.mgnlEditorBarLabel[title*="${title}"]`) }).nth(nth);
    await bar.evaluate((el) => el.scrollIntoView({ block: 'center' }));
    await bar.evaluate((el) => { el.style.display = ''; });
    await bar.locator('.mgnlEditorBarLabel').click();
    await this.idle(800);
    await bar.locator('.icon-edit').click();
    for (let i = 0; i < 20 && !(await this.page.locator('.v-window').filter({ visible: true }).count()); i++) await this.page.waitForTimeout(500);
    if (!(await this.page.locator('.v-window').filter({ visible: true }).count())) await this.action('Edit component');
    await this.dialog().waitFor({ timeout: 15000 });
    await this.idle(800);
  }

  async action(label) {
    const btn = this.actionLocator(label);
    await this.idle();
    // Actions are rendered disabled until the selection reaches the server; wait until enabled.
    for (let i = 0; i < 25; i++) {
      const disabled = await btn.evaluate((el) => !!el.closest('[class*=disabled], [aria-disabled=true]')).catch(() => true);
      if (!disabled) break;
      await this.page.waitForTimeout(200);
    }
    const opensDialog = /^(add|edit|change|duplicate)/i.test(label);
    const before = await this.page.locator('.v-window').filter({ visible: true }).count();
    await btn.click();
    await this.idle(1200);
    if (opensDialog && (await this.page.locator('.v-window').filter({ visible: true }).count()) <= before) {
      await btn.click();
      await this.idle(1500);
    }
  }

  // The clickable element is the .v-action item, not its caption text.
  actionLocator(label) {
    return this.page.locator('.v-actionbar .v-action')
      .filter({ hasText: new RegExp(`^\\s*${escapeRe(label)}\\s*$`, 'i') }).filter({ visible: true }).first();
  }

  // ---------- dialogs ----------
  dialog() { return this.page.locator('.v-window').filter({ visible: true }).last(); }

  field(label) {
    return this.dialog().locator('.v-formlayout-row:not(.v-formlayout .v-formlayout .v-formlayout-row)', {
      has: this.page.locator('.v-formlayout-captioncell', { hasText: new RegExp(`^\\s*${escapeRe(label)}\\s*\\*?\\s*$`) }),
    }).first();
  }

  async fill(label, value) {
    const input = this.field(label).locator('input[type=text], textarea').first();
    await input.click();
    await input.fill(String(value));
    await this.idle(200);
  }

  async select(label, option) {
    await this.field(label).locator('.v-filterselect-button').click();
    await this.idle(500);
    await this.page.locator('.v-filterselect-suggestpopup').getByText(option, { exact: true }).first().click();
    await this.idle(400);
  }

  async radio(label, option) {
    const opt = this.field(label).locator('.v-select-option, .v-radiobutton').filter({ hasText: new RegExp(`^\s*${escapeRe(option)}\s*$`, 'i') }).first();
    await opt.locator('label').first().click();
    await this.idle(300);
  }

  // Read the open dialog's top-level fields straight from the UI (no source code needed).
  async describeDialog() {
    return this.dialog().evaluate((dlg) => {
      const rows = [...dlg.querySelectorAll('.v-formlayout-row')].filter((r) => !r.parentElement.closest('.v-formlayout .v-formlayout'));
      return rows.map((r) => {
        const cap = r.querySelector('.v-formlayout-captioncell');
        const cell = r.querySelector('.v-formlayout-contentcell');
        if (!cap || !cell) return null;
        const label = cap.innerText.replace('*', '').trim();
        if (!label) return null;
        const has = (sel) => !!cell.querySelector(sel);
        const picker = /select new/i.test(cell.innerText);
        const val = (cell.querySelector('input[type=text]') || {}).value || '';
        const type = picker ? (/\.(jpe?g|png|gif|svg|webp)$/i.test(val) || /image|asset|photo|picture/i.test(label) ? 'Asset (image) picker' : 'Link picker')
          : has('.v-select-optiongroup') ? 'Radio buttons'
          : has('.v-filterselect') ? 'Drop-down'
          : has('input[type=checkbox]') ? 'Checkbox'
          : has('.v-richtextarea, .ck-editor, iframe') ? 'Rich text'
          : has('textarea') ? 'Text (multi-line)'
          : has('input[type=text]') ? 'Text' : 'Other';
        const options = [...cell.querySelectorAll('.v-select-option label, .v-checkbox label')].map((l) => l.innerText.trim()).filter(Boolean);
        const input = cell.querySelector('input[type=text], textarea');
        const checked = cell.querySelector('.v-select-option input:checked + label');
        return {
          label, type,
          required: cap.innerText.includes('*') || !!r.querySelector('.v-required-field-indicator'),
          options,
          value: input ? input.value : checked ? checked.innerText.trim() : null,
        };
      }).filter(Boolean);
    });
  }

  // Close any open dialogs and end the session cleanly, so Magnolia doesn't log
  // abandoned-UI errors (which then show up as error banners in later sessions).
  async logout() {
    if (!this.page) return;
    for (let i = 0; i < 4; i++) {
      const open = this.page.locator('.v-window').filter({ visible: true });
      if (!(await open.count())) break;
      await open.last().locator('.v-window-closebox').first().click().catch(() => {});
      await this.page.waitForTimeout(600);
    }
    await this.page.goto(`${this.baseUrl}/.magnolia/admincentral?mgnlLogout=true`).catch(() => {});
  }

  async checkbox(label, checked = true) {
    const box = this.field(label).locator('input[type=checkbox]').first();
    if ((await box.isChecked()) !== checked) await this.field(label).locator('.v-checkbox label, .v-checkbox input').first().click();
    await this.idle(300);
  }

  // Link/asset chooser: click "Select new" then walk the tree path, e.g. ['tours', 'vietnam.jpg'].
  async choose(label, treePath) {
    await this.field(label).getByText(/Select new|Select/).first().click();
    await this.idle(2500);
    await this.pickInTree(treePath);
    await this.dialogButton('Choose');
  }

  // Tree rows show asset names without file extension, so accept either form.
  treeRow(name, scope = this.dialog(), level = null) {
    const bare = name.replace(/\.[a-z0-9]{2,4}$/i, '');
    const re = new RegExp(`^\\s*(${escapeRe(name)}|${escapeRe(bare)})\\s*$`);
    // The depth class disambiguates folders with the same name at different depths (level is 1-based).
    const rows = level ? scope.locator(`tr.v-treegrid-row-depth-${level - 1}`) : scope.locator('tr');
    return rows.filter({ has: this.page.getByText(re) }).first();
  }

  // Tree grids render rows lazily: scroll the grid until the row exists (or the end is reached).
  async findTreeRow(name, chooser = this.dialog(), level = null) {
    const hasLevels = level && (await chooser.locator('tr[class*="v-treegrid-row-depth-"]').count()) > 0;
    const row = this.treeRow(name, chooser, hasLevels ? level : null);
    if (await row.waitFor({ timeout: 4000 }).then(() => true, () => false)) return row;
    // Rows above and below the viewport are not in the DOM: rewind to the top, then page down.
    await chooser.evaluate((d) => { const sc = d.querySelector('.v-grid-scroller-vertical, .v-treegrid-scroller-vertical'); if (sc) sc.scrollTop = 0; });
    await this.page.waitForTimeout(800);
    for (let i = 0; i < 60; i++) {
      if (await row.count()) { await row.scrollIntoViewIfNeeded().catch(() => {}); return row; }
      const atEnd = await chooser.evaluate((d) => {
        const sc = d.querySelector('.v-grid-scroller-vertical, .v-treegrid-scroller-vertical');
        if (!sc) return true;
        const before = sc.scrollTop;
        sc.scrollTop = before + sc.clientHeight * 0.8;
        return sc.scrollTop === before;
      });
      await this.page.waitForTimeout(500);
      if (atEnd && !(await row.count())) break;
    }
    if (!(await row.waitFor({ timeout: 5000 }).then(() => true, () => false))) {
      throw new Error(`Tree row "${name}"${level ? ` at depth ${level}` : ''} not found in the chooser`);
    }
    return row;
  }

  async pickInTree(treePath) {
    const chooser = this.dialog();
    for (let i = 0; i < treePath.length; i++) {
      const row = await this.findTreeRow(treePath[i], chooser, i + 1);
      if (i < treePath.length - 1) {
        const expander = row.locator('.v-treegrid-expander, .v-tree8-expander').first();
        const cls = (await expander.getAttribute('class')) || '';
        const expanded = (await row.getAttribute('aria-expanded')) === 'true' || /\bexpanded\b/.test(cls);
        if (!expanded) await expander.click();
        await this.idle(1200);
      } else {
        await row.click();
        await this.idle(600);
      }
    }
  }

  // Vaadin renders some captions in lower case and capitalises them with CSS, so match case-insensitively.
  dialogButtonLocator(label) {
    return this.dialog().locator('.v-button, button')
      .filter({ hasText: new RegExp(`^\s*${escapeRe(label)}\s*$`, 'i') }).filter({ visible: true }).last();
  }

  async dialogButton(label) {
    await this.idle();
    await this.dialogButtonLocator(label).click();
    await this.idle(1500);
  }

  async saveDialog() {
    await this.dialogButton('Save changes');
    await this.reloadEditor();
  }
}

export function escapeRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
