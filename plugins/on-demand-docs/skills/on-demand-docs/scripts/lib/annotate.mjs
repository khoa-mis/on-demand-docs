// Screenshot helpers: numbered highlight boxes drawn on top of the main page
// (works for elements inside the page-editor iframe too, since boxes use viewport coordinates).

const OVERLAY_ID = '__odd_annotations';

export async function drawHighlights(page, boxes) {
  await page.evaluate(({ id, boxes }) => {
    document.getElementById(id)?.remove();
    const root = document.createElement('div');
    root.id = id;
    root.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:2147483647';
    boxes.forEach((b, i) => {
      const pad = 6;
      const box = document.createElement('div');
      box.style.cssText = `position:fixed;left:${b.x - pad}px;top:${b.y - pad}px;width:${b.width + pad * 2}px;height:${b.height + pad * 2}px;` +
        'border:3px solid #e8590c;border-radius:8px;box-shadow:0 0 0 4000px rgba(0,0,0,0.0)';
      root.appendChild(box);
      if (b.label !== null && b.label !== undefined) {
        const tag = document.createElement('div');
        tag.textContent = b.label;
        const left = Math.max(4, b.x - pad - 14), top = Math.max(4, b.y - pad - 14);
        tag.style.cssText = `position:fixed;left:${left}px;top:${top}px;min-width:28px;height:28px;padding:0 6px;border-radius:14px;` +
          'background:#e8590c;color:#fff;font:700 15px/28px system-ui,sans-serif;text-align:center;box-shadow:0 2px 6px rgba(0,0,0,.3)';
        root.appendChild(tag);
      }
    });
    document.body.appendChild(root);
  }, { id: OVERLAY_ID, boxes });
}

export async function clearHighlights(page) {
  await page.evaluate((id) => document.getElementById(id)?.remove(), OVERLAY_ID);
}

// Capture `page` cropped to `clip` (viewport coords) or full viewport, with highlight boxes.
export async function capture(page, path, { highlights = [], clip = null } = {}) {
  const boxes = [];
  const missing = [];
  for (const h of highlights) {
    const bb = await h.locator.boundingBox({ timeout: 3000 }).catch(() => null);
    if (bb) boxes.push({ ...bb, label: h.label ?? null });
    else missing.push(h.name || String(h.locator));
  }
  if (boxes.length) await drawHighlights(page, boxes);
  const vp = page.viewportSize();
  let c = clip;
  if (c) {
    const pad = 16;
    const x = Math.max(0, c.x - pad), y = Math.max(0, c.y - pad);
    c = { x, y, width: Math.min(vp.width - x, c.width + pad * 2), height: Math.min(vp.height - y, c.height + pad * 2) };
  }
  await page.screenshot({ path, clip: c || undefined, animations: 'disabled', caret: 'hide' });
  await clearHighlights(page);
  return { path, highlighted: boxes.length, missing };
}
