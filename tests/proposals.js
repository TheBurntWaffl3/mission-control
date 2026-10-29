// Proposals in the week calendar + the proposal detail's week strip and day view.
// Run: node tests/proposals.js [path/to/page.html]   (SHOT_DIR=dir to put screenshots elsewhere)
const { chromium } = require('playwright');
const path = require('path');
const fixture = require('./fixture');
const page_path = path.resolve(process.argv[2] || path.join(__dirname, '..', 'mission-control.html'));
const shotDir = process.env.SHOT_DIR || __dirname;
let fails = 0;
function ok(cond, msg) { if (cond) console.log('  ok   ' + msg); else { fails++; console.log('  FAIL ' + msg); } }
function state() {
  const s = fixture();
  // Saturday gets two planned items so that, with q2 (15 min), it holds 180 min = its weekend capacity: a full day to refuse a move.
  s.planned.push({ id: 'p2', t: 'Gym', d: '', g: 'pt', m: 60, date: '2026-10-31', s: '12:00', e: '13:00' });
  s.planned.push({ id: 'p3', t: 'Groceries', d: '', g: '', m: 105, date: '2026-10-31', s: '16:00', e: '17:45' });
  return s;
}
(async () => {
  const browser = await chromium.launch();
  const errors = [];
  for (const vp of [{ width: 390, height: 844 }, { width: 1440, height: 900 }]) {
    const phone = vp.width < 1000;
    console.log(vp.width + 'px');
    const ctx = await browser.newContext({ viewport: vp, timezoneId: 'America/New_York' });
    const page = await ctx.newPage();
    page.on('pageerror', e => errors.push(vp.width + ': ' + e.message));
    page.on('console', m => { if (m.type() === 'error') errors.push(vp.width + ' console: ' + m.text()); });
    await fixture.load(page, page_path, state());
    // the page's state is closed over, so read the proposal's slot from the open detail: lands tag + highlighted row
    const prop = () => page.evaluate(() => { const l = document.querySelector('.dsheet .dm .pl'), r = document.querySelector('.dsheet .wc-pr.me .wc-pt');
      return { lands: l ? l.textContent : '', span: r ? r.textContent.replace(/(\d\d:\d\d)(\d\d:\d\d)/, '$1-$2') : '' }; });

    // Today-tab card: each row says where it lands and opens the detail
    const lands = await page.$$eval('.p.prop .pc .pl', els => els.map(e => e.textContent));
    ok(lands.join('|') === 'FRI 14:00|SAT 10:00', 'proposal rows say where they land: ' + lands.join(', '));
    await page.click('.p.prop [data-act="open"][data-k="proposal"][data-id="q1"]');
    ok(await page.$eval('#d-title', e => e.textContent) === 'Sizing: first pass', 'card row opens the proposal detail');
    await page.click('#d-close');

    // Week calendar: suggestions drawn as dashed cyan blocks with a SUGGESTED marker
    if (phone) await page.click('[data-act="tab"][data-v="week"]');
    const tg = (await page.$$('[data-act="wc-mode"][data-v="cal"]'));
    for (const b of tg) { if (await b.isVisible()) { await b.click(); break; } }
    await page.waitForTimeout(300);
    const blocks = phone ? await page.$$('.wcalp .wc-ag .wc-r.prop') : await page.$$('.wcalp .wc-g .wc-b.prop');
    ok(blocks.length === 2, 'two proposals drawn in the week ' + (phone ? 'agenda' : 'grid'));
    const marks = await Promise.all(blocks.map(b => b.evaluate(e => /SUGGESTED/.test(e.textContent) || /suggested task/.test(e.getAttribute('aria-label')))));
    ok(marks.every(Boolean), 'each proposal block carries a SUGGESTED marker');
    const dashed = await blocks[0].evaluate(e => getComputedStyle(e).borderTopStyle);
    ok(dashed === 'dashed', 'proposal block has a dashed outline (' + dashed + ')');
    if (phone) await blocks[0].scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(shotDir, 'prop-week-' + vp.width + '.png'), fullPage: !phone });

    // Tap a block: detail with 7 chips, the proposed day marked, the day view around it
    await blocks[0].click();
    ok(await page.$eval('#d-title', e => e.textContent) === 'Sizing: first pass', 'tapping the block opens the proposal detail');
    const chips = await page.$$eval('.dsheet .wc-pc', els => els.map(e => e.dataset.v));
    ok(chips.length === 7 && chips[0] === '2026-10-26' && chips[6] === '2026-11-01', '7 day chips Mon–Sun: ' + chips.join(' '));
    ok(await page.$eval('.dsheet .wc-pc.cur', e => e.dataset.v) === '2026-10-30', 'current day marked');
    const loads = await page.$$eval('.dsheet .wc-pc i', els => els.map(e => e.textContent));
    ok(loads.join(' ') === '0H 0H 0H 0.3H 1H 3H 0H', 'chip loads in hours: ' + loads.join(' '));
    ok(await page.$eval('#wc-pc-2026-10-31', e => e.classList.contains('full')) && !(await page.$eval('#wc-pc-2026-10-30', e => e.classList.contains('full'))), 'a day at its capacity is marked full, others are not');
    ok(/OCT 30 · 1H OF 6H/.test(await page.$eval('.dsheet .wc-pdh', e => e.textContent)), 'day view header shows load of capacity: ' + (await page.$eval('.dsheet .wc-pdh', e => e.textContent)));
    const past = await page.$$eval('.dsheet .wc-pc:disabled', els => els.length);
    ok(past === 3, 'past days (Mon–Wed) are disabled: ' + past);
    ok((await page.$eval('.dsheet .wc-pr.me', e => e.textContent)).indexOf('Sizing: first pass') >= 0, 'day view highlights the proposal');
    const around = await page.$$eval('.dsheet .wc-pr', els => els.map(e => e.textContent.replace(/\s+/g, ' ')));
    ok(around.length === 5 && /Career fair/.test(around[0]) && /Hypersonics/.test(around[1]), 'day view lists that day in time order: ' + around.length + ' rows');
    await page.screenshot({ path: path.join(shotDir, 'prop-detail-' + vp.width + '.png') });

    // Next week → and back
    await page.click('#wc-pw');
    ok((await page.$$eval('.dsheet .wc-pc', els => els.map(e => e.dataset.v)))[0] === '2026-11-02', 'NEXT WEEK shows the following seven days');
    await page.click('#wc-pw');
    ok((await page.$$eval('.dsheet .wc-pc', els => els.map(e => e.dataset.v)))[0] === '2026-10-26', 'back to the proposal’s week');

    // Free day keeps the time
    await page.click('#wc-pc-2026-11-01');
    let q = await prop();
    ok(q.lands === 'SUN 14:00' && q.span === '14:00-15:00', 'moved to a free day, same time: ' + JSON.stringify(q));
    ok(await page.$eval('.dsheet .wc-pc.cur', e => e.dataset.v) === '2026-11-01', 'detail stays open, chip marked');
    ok(/SUN 14:00/.test(await page.$eval('.dsheet .dm .pl', e => e.textContent)), 'detail header says where it lands now');

    // Full day refuses with a one-line reason
    await page.click('#wc-pc-2026-10-31');
    q = await prop();
    const note = await page.$eval('.dsheet .wc-pn', e => e.textContent).catch(() => '');
    ok(q.lands === 'SUN 14:00' && /SAT is at 3h of 3h; this needs 60 min more\./.test(note), 'day at capacity refused with the hours: ' + note);
    ok(await page.$eval('.dsheet .wc-pdh', e => e.textContent).then(t => /SAT/.test(t) && /3H OF 3H/.test(t)), 'day view shows the refused day and its load so the clash is visible');
    await page.screenshot({ path: path.join(shotDir, 'prop-refused-' + vp.width + '.png') });

    // Today: 14:00 is in the past, 14:45–16:45 is taken, so the nearest free slot is 16:45
    await page.click('#wc-pc-2026-10-29');
    q = await prop();
    ok(q.lands === 'THU 16:45' && q.span === '16:45-17:45', 'conflict picks the nearest free slot today: ' + JSON.stringify(q));
    // Monday (next week from Thursday): 16:45 would overlap the planned 17:00 item, so it lands at 16:00
    await page.click('#wc-pw');
    await page.click('#wc-pc-2026-11-02');
    ok((await page.$$eval('.dsheet .wc-pc', els => els.map(e => e.dataset.v)))[0] === '2026-11-02', 'strip follows the proposal into its new week');
    q = await prop();
    ok(q.lands === 'MON 16:00' && q.span === '16:00-17:00', 'conflict on Monday moves to 16:00: ' + JSON.stringify(q));
    ok(!(await page.$('.dsheet .wc-pn')), 'note cleared after a successful move');

    // Accept moves it into planned
    await page.click('.dsheet [data-act="pacc"]'); await page.waitForTimeout(400);   // the card folds away (280 ms) before the re-render
    ok(!(await page.$('.dsheet')), 'detail closed after accept');
    const planned = await page.$$eval((phone ? '.wcalp .wc-ag .wc-r.task' : '.wcalp .wc-g .wc-b.task'), els => els.map(e => e.getAttribute('aria-label')).filter(l => /Sizing: first pass/.test(l)));
    ok(planned.length === 1 && /16:00( to |–)17:00, scheduled task/.test(planned[0]) && (await page.$$('[data-k="planned"][data-id]')).length > 0, 'ACCEPT moved it to planned: ' + planned[0]);
    ok((await page.$$eval('.p.prop .pc', els => els.length)) === 1 || phone, 'proposals card now holds one proposal');
    const left = phone ? await page.$$('.wcalp .wc-ag .wc-r.prop') : await page.$$('.wcalp .wc-g .wc-b.prop');
    ok(left.length === 1, 'one proposal left in the week view');
    // Rule check: nothing under 12px in the detail/strip and every chip is at least 44px tall on phone
    await page.click('.p.prop [data-act="open"][data-k="proposal"][data-id="q2"]').catch(async () => { if (phone) { await page.click('[data-act="tab"][data-v="today"]'); await page.click('.p.prop [data-act="open"][data-k="proposal"][data-id="q2"]'); } });
    const sizes = await page.$$eval('.dsheet *', els => els.filter(e => e.childNodes.length && [].some.call(e.childNodes, n => n.nodeType === 3 && n.textContent.trim())).map(e => parseFloat(getComputedStyle(e).fontSize)));
    ok(Math.min.apply(null, sizes) >= 12, 'nothing under 12px in the detail (min ' + Math.min.apply(null, sizes) + 'px)');
    const hits = await page.$$eval('.dsheet .wc-pc', els => els.map(e => e.getBoundingClientRect()).map(r => [Math.round(r.width), Math.round(r.height)]));
    ok(hits.every(h => h[0] >= 44 && h[1] >= 44), 'day chips are at least 44px: ' + JSON.stringify(hits[0]));
    await ctx.close();
  }
  await browser.close();
  if (errors.length) { console.error('ERRORS:\n' + errors.join('\n')); process.exit(1); }
  if (fails) { console.error(fails + ' check(s) failed'); process.exit(1); }
  console.log('OK, no page errors');
})();
