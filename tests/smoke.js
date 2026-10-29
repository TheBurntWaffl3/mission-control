// Smoke test: boot the page with a fixed clock and no state, then with a sample state.
// Run: node tests/smoke.js [path/to/page.html]
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
(async () => {
  const page_path = path.resolve(process.argv[2] || path.join(__dirname, '..', 'mission-control.html'));
  const browser = await chromium.launch();
  const errors = [];
  for (const vp of [{ width: 390, height: 844 }, { width: 1440, height: 900 }]) {
    const ctx = await browser.newContext({ viewport: vp, timezoneId: 'America/New_York' });
    const page = await ctx.newPage();
    await page.clock.install({ time: new Date('2026-10-29T14:30:00-04:00') });
    page.on('pageerror', e => errors.push(vp.width + ': ' + e.message));
    page.on('console', m => { if (m.type() === 'error') errors.push(vp.width + ' console: ' + m.text()); });
    await page.goto('file://' + page_path);
    await page.waitForTimeout(800);
    const txt = await page.evaluate(() => document.body.innerText.slice(0, 400).replace(/\s+/g, ' '));
    console.log(vp.width + 'px:', txt);
    await page.screenshot({ path: path.join(__dirname, 'shot-' + vp.width + '.png'), fullPage: true });
    await ctx.close();
  }
  await browser.close();
  if (errors.length) { console.error('ERRORS:\n' + errors.join('\n')); process.exit(1); }
  console.log('OK, no page errors');
})();
