// Move: ticking calendar events (S.evdone) and event items, the Move / Tomorrow forms on the detail sheets, the calendar event
// sheet (Attended, Move, Postpone to tomorrow through update_event), and drag to move on the hour plan, the week grid and the
// week agenda. Run: SHOT_DIR=/path node tests/move.js [path/to/page.html]   Clock: Thu 2026-10-29 14:30 Eastern.
// Same harness as tests/events.js: window.claude is stubbed before load; use('mcp') hands back a fake Google Calendar that records
// every callTool, and its update_event also moves the event in window.__events so a later list_events shows the move.
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const fixture = require('./fixture');

const PAGE = path.resolve(process.argv[2] || path.join(__dirname, '..', 'mission-control.html'));
const shot_dir = process.env.SHOT_DIR || __dirname;
fs.mkdirSync(shot_dir, { recursive: true });
const STUB = `window.__calls=[];window.__mcpMode='ok';window.__events=${JSON.stringify(fixture().cal.events)};
window.__mcp={callTool:function(server,tool,input,opts){window.__calls.push({server:server,tool:tool,input:input});var mode=window.__mcpMode;
  if(mode==='reject'&&tool!=='list_events')return Promise.reject({code:'not_granted'});
  if(tool==='update_event'){window.__events.forEach(function(e){if(e.id===input.eventId){e.start=input.startTime.slice(0,16);e.end=input.endTime.slice(0,16);}});return Promise.resolve({payload:{}});}
  if(tool==='list_events')return Promise.resolve({payload:{events:window.__events}});
  return Promise.reject({code:'tool_error'});}};
window.claude={use:function(n){
  if(n==='artifact')return Promise.resolve({publish:function(html){window.__pub=html;return Promise.resolve();}});
  if(n==='mcp')return Promise.resolve(window.__mcp);
  if(n!=='sample')return Promise.resolve(null);
  var s=function(input,opts){window.__input=input;window.__tools=opts.tools||[];window.__results=[];return Promise.resolve({text:'ok',truncated:false});};
  s.limits=function(){return Promise.resolve({tools:true});};
  s.json=function(){return Promise.reject({code:'not_granted'});};
  return Promise.resolve(s);
}};`;

let fails = 0;
function check(name, ok, info) { if (ok) console.log('  ok   ' + name); else { fails++; console.log('  FAIL ' + name + (info !== undefined ? ' -- ' + JSON.stringify(info) : '')); } }

// the fixture plus a timed today item at 16:45-17:30
function state0() {
  const st = fixture();
  st.today.items.push({ id: 'd9', t: 'Reading block', d: 'Chapter 4.', s: '16:45', e: '17:30', g: 'acad', m: 45, done: false });
  return st;
}
async function boot(page, st) {
  let html = fs.readFileSync(PAGE, 'utf8');
  html = html.replace(/(<script type="application\/json" id="state">).*?(<\/script>)/s, (_, a, b) => a + JSON.stringify(st) + b);
  html = html.replace('<main id="app">', '<script>' + STUB + '</script><main id="app">');
  await page.route('http://mc.test/**', route => route.fulfill({ contentType: 'text/html', body: html }));
  await page.clock.install({ time: new Date('2026-10-29T14:30:00-04:00') });
  await page.goto('http://mc.test/', { waitUntil: 'load' });
  await page.waitForTimeout(600);
  await page.unroute('http://mc.test/**');
}
// state after a change: the page publishes through the stubbed artifact once its save debounce runs on the fake clock
async function state(page) { await page.clock.runFor(7000); await page.waitForTimeout(100); return page.evaluate(() => JSON.parse(/<script type="application\/json" id="state">(.*?)<\/script>/s.exec(window.__pub)[1])); }
// the page's dirty copy of S (markDirty runs at once on every change), for checks that must not advance the clock past the toast
const live = () => page.evaluate(() => JSON.parse(JSON.parse(localStorage.getItem('mc.dirty')).state));
const calls = page => page.evaluate(() => window.__calls);
let page = null;   // the open page of the viewport under test (set in the loop); the short helpers below read it
const txt = (sel) => page.evaluate(sel => { const e = document.querySelector(sel); return e ? e.textContent.replace(/\s+/g, ' ').trim() : null; }, sel);
const has = (sel) => page.evaluate(sel => !!document.querySelector(sel), sel);
const cls = (sel) => page.evaluate(sel => { const e = document.querySelector(sel); return e ? e.className : null; }, sel);
const h = (sel) => page.evaluate(sel => { const e = document.querySelector(sel); return e ? e.getBoundingClientRect().height : 0; }, sel);
const rect = (page, sel) => page.evaluate(sel => { const e = document.querySelector(sel); if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height, cx: r.left + r.width / 2, cy: r.top + r.height / 2 }; }, sel);
const floor = (page, sel) => page.evaluate(sel => { const bad = []; [].forEach.call(document.querySelectorAll(sel + ', ' + sel + ' *'), e => { if (!e.getClientRects().length) return; const f = parseFloat(getComputedStyle(e).fontSize); if (f < 12) bad.push(e.tagName.toLowerCase() + '.' + e.className + ' ' + f); }); return bad; }, sel);
const into = (page, sel) => page.evaluate(sel => { const e = document.querySelector(sel); if (e) e.scrollIntoView({ block: 'center' }); }, sel);
async function calMode(page) { await page.evaluate(() => { const b = [].filter.call(document.querySelectorAll('[data-act="wc-mode"][data-v="cal"]'), x => x.offsetParent)[0] || document.querySelector('[data-act="wc-mode"][data-v="cal"]'); b.click(); }); await page.waitForTimeout(300); }
// a Tell Claude turn with no tool calls, so the prompt the page builds can be read back
async function prompt(page, phone) {
  if (phone) { if (!(await page.$('.tc-sheet'))) await page.click('#tab-plus'); await page.fill('#sheet-in', 'hi'); await page.press('#sheet-in', 'Enter'); }
  else { await page.fill('#tc-bin', 'hi'); await page.press('#tc-bin', 'Enter'); }
  for (let i = 0; i < 50; i++) { if (await page.evaluate(() => Array.isArray(window.__results))) break; await page.waitForTimeout(100); }
  await page.waitForTimeout(150);
  const p = await page.evaluate(() => window.__input[0].content);
  if (phone && await page.$('.tc-sheet')) { await page.keyboard.press('Escape'); await page.waitForTimeout(80); }
  return p;
}
// mouse drag with a look at the page mid-move
async function drag(page, from, to, mid) {
  await page.mouse.move(from.x, from.y); await page.mouse.down();
  await page.mouse.move(from.x + 4, from.y + 4); await page.mouse.move(from.x + 10, from.y + 10);
  await page.mouse.move(to.x, to.y, { steps: 8 }); await page.waitForTimeout(60);
  const r = mid ? await mid() : null;
  await page.mouse.up(); await page.waitForTimeout(300);
  return r;
}
// touch: synthetic pointer events (pointerType touch) dispatched from inside the page
const ptr = (page, type, sel, x, y) => page.evaluate(([type, sel, x, y]) => { const t = sel ? document.querySelector(sel) : document; t.dispatchEvent(new PointerEvent(type, { pointerId: 7, pointerType: 'touch', isPrimary: true, button: 0, buttons: 1, clientX: x, clientY: y, bubbles: true, cancelable: true })); }, [type, sel, x, y]);

(async () => {
  const browser = await chromium.launch();
  for (const vp of [{ width: 390, height: 844 }, { width: 1440, height: 900 }]) {
    const phone = vp.width < 1000, hit = phone ? 44 : 40;
    const ctx = await browser.newContext({ viewport: vp, timezoneId: 'America/New_York' });
    page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
    console.log(vp.width + 'px');
    let S, C;

    // ---- A. tick calendar events and event items ----
    const stA = state0();
    stA.today.items.push({ id: 'x1', t: 'Hiring call', d: '', s: '18:00', e: '18:30', g: 'launch', m: 30, done: false, kind: 'event', loc: 'Zoom' });
    await boot(page, stA);
    const EVC = '.p.plan .hcard:has(#hp-ev-c2)';
    check('calendar event card has a checkbox (evtick, id, day); free and all-day events have none', await page.evaluate(() => { const i = document.querySelector('#hev-c2'); return i && i.type === 'checkbox' && i.dataset.act === 'evtick' && i.dataset.id === 'c2' && i.dataset.ds === '2026-10-29' && !i.checked; }));
    check('the checkbox hit area is ' + Math.round(await h('label[for="hev-c2"]')) + 'px (>= ' + hit + ')', (await h('label[for="hev-c2"]')) >= hit);
    await page.click('label[for="hev-c2"]'); await page.waitForTimeout(100);
    check('ticking animates the card on screen first: .done + .just, DONE tag', /\bdone\b/.test(await cls(EVC)) && /\bjust\b/.test(await cls(EVC)) && (await txt(EVC + ' .tag')) === 'DONE');
    await page.waitForTimeout(800);
    S = await state(page);
    check('S.evdone[today] holds the event id after the re-render; the card stays done with its strike and DONE tag', S.evdone && S.evdone['2026-10-29'].join() === 'c2' && /\bdone\b/.test(await cls(EVC)) && await has(EVC + ' .hcx .stk') && (await txt(EVC + ' .tag')) === 'DONE' && await page.evaluate(() => document.querySelector('#hev-c2').checked), S.evdone);
    check('a ticked event is not counted in the day row (today items only)', S.history.every(r => r.date !== '2026-10-29' || r.planned === 4), S.history);
    check('the hour log chips are untouched', S.log['2026-10-29'] === 'zzeaaaee..............', S.log);
    await page.click('label[for="hev-c2"]'); await page.waitForTimeout(900);
    S = await state(page);
    check('un-ticking removes the id and the done look', !S.evdone['2026-10-29'] && !/\bdone\b/.test(await cls(EVC)) && !(await has(EVC + ' .tag.t-done')), S.evdone);
    check('an event item (kind event) shows a checkbox again and keeps its ink look', await page.evaluate(() => { const c = document.querySelector('.p.plan .hcard.evi:has(#hp-evi-x1)'); return c && !!c.querySelector('#h-x1[type=checkbox]') && getComputedStyle(c.querySelector('.hcx')).color === 'rgb(237, 237, 239)'; }));
    await page.click('label[for="h-x1"]'); await page.waitForTimeout(900);
    S = await state(page);
    check('ticking the event item marks it done, card done with DONE tag', S.today.items.filter(i => i.id === 'x1')[0].done === true && /\bdone\b/.test(await cls('.p.plan .hcard.evi:has(#hp-evi-x1)')) && (await txt('.p.plan .hcard.evi:has(#hp-evi-x1) .tag')) === 'DONE');
    await page.click('label[for="hev-c2"]'); await page.waitForTimeout(900);
    await calMode(page);
    check('week agenda row and grid block show the ticked event as done', /\bdone\b/.test(await cls('#wca-e-c2-1029')) && /\bdone\b/.test(await cls('#wcg-e-c2-1029')) && /DONE/.test(await txt('#wca-e-c2-1029')), [await cls('#wca-e-c2-1029'), await cls('#wcg-e-c2-1029')]);
    await page.click('#hp-ev-c2'); await page.waitForTimeout(150);
    check('event sheet: Attended toggle pressed, hit area ' + Math.round(await h('#wc-ev-done')) + 'px', (await page.getAttribute('#wc-ev-done', 'aria-pressed')) === 'true' && /^attended$/i.test(await txt('#wc-ev-done')) && (await h('#wc-ev-done')) >= hit);
    await page.click('#wc-ev-done'); await page.waitForTimeout(400);
    S = await state(page);
    check('toggle off: Not attended, id removed', (await page.getAttribute('#wc-ev-done', 'aria-pressed')) === 'false' && /^not attended$/i.test(await txt('#wc-ev-done')) && !S.evdone['2026-10-29']);
    await page.click('#wc-ev-done'); await page.waitForTimeout(400);
    S = await state(page);
    check('toggle on again: Attended, id back', (await page.getAttribute('#wc-ev-done', 'aria-pressed')) === 'true' && S.evdone['2026-10-29'].join() === 'c2');
    const badS = await floor(page, '.wc-evs');
    check('12px floor on the event sheet', badS.length === 0, badS);
    for (const id of ['wc-mv-tmrw', 'wc-mv-go', 'wc-mv-d', 'wc-mv-s']) { const hh = await h('#' + id); check('#' + id + ' hit area ' + Math.round(hh) + 'px (>= ' + hit + ')', hh >= hit); }
    await page.locator('.wc-evs').screenshot({ path: path.join(shot_dir, 'mv-sheet-' + vp.width + '.png') });
    await page.click('#wc-evx'); await page.waitForTimeout(100);
    const P = await prompt(page, phone);
    check('prompt: CALENDAR TODAY line with (attended)', /CALENDAR TODAY: 12:30-13:45 Propulsion; 15:30-16:45 Aircraft Dynamics \(attended\); 19:00-21:00 Startup meeting/.test(P), /CALENDAR TODAY[^\n]*/.exec(P));
    check('no page errors (A)', errors.length === 0, errors); errors.length = 0;

    // ---- B. move from the detail sheets ----
    await boot(page, state0());
    await page.click('#hp-evi-d9, [data-act="open"][data-k="today"][data-id="d9"]'); await page.waitForTimeout(150);
    check('today detail: DAY input (min today), START, END, Move button ' + Math.round(await h('#dt-go')) + 'px, Tomorrow button', (await page.getAttribute('#dt-d', 'min')) === '2026-10-29' && (await page.inputValue('#dt-d')) === '2026-10-29' && /^move$/i.test(await txt('#dt-go')) && (await h('#dt-go')) >= hit && (await h('#d-tmrw')) >= hit);
    await page.fill('#dt-d', '2026-10-30'); await page.fill('#dt-s', '16:00'); await page.fill('#dt-e', '16:45');
    await page.click('#dt-go'); await page.waitForTimeout(150);
    const tb = await txt('.toast');
    S = await live();
    const pl = S.planned.filter(p => p.id === 'd9')[0];
    check('item moved to planned on the later day with its fields; gone from today; toast says where', pl && pl.date === '2026-10-30' && pl.s === '16:00' && pl.e === '16:45' && pl.m === 45 && pl.g === 'acad' && pl.d === 'Chapter 4.' && !S.today.items.some(i => i.id === 'd9') && /^Moved to FRI, OCT 30 16:00/.test(tb) && await has('.toast [data-act="undo"]'), [pl, tb]);
    await page.click('.toast [data-act="undo"]'); await page.waitForTimeout(150);
    S = await live();
    check('undo brings it back to today', S.today.items.some(i => i.id === 'd9' && i.s === '16:45') && !S.planned.some(p => p.id === 'd9'));
    await page.click('[data-act="open"][data-k="today"][data-id="d2"]'); await page.waitForTimeout(150);
    await page.click('#d-tmrw'); await page.waitForTimeout(150);
    const tt = await txt('.toast');
    S = await state(page);
    const p2 = S.planned.filter(p => p.id === 'd2')[0];
    check('Tomorrow on a timed item: planned tomorrow at the same time, not bumped', p2 && p2.date === '2026-10-30' && p2.s === '15:00' && p2.e === '15:15' && S.bumped.length === 0 && /Moved to FRI, OCT 30 15:00/.test(tt), [p2, tt]);
    // the calendar event sheet: Move
    await page.click('#hp-ev-c2'); await page.waitForTimeout(150);
    check('sheet Move form preset to the event day and start', (await page.inputValue('#wc-mv-d')) === '2026-10-29' && (await page.inputValue('#wc-mv-s')) === '15:30' && await page.evaluate(() => document.querySelector('#wc-mv-n').hidden));
    await page.fill('#wc-mv-s', '16:00'); await page.waitForTimeout(80);
    check('overlap note under the form (amber, one line) before moving', /^Overlaps Reading block 16:45–17:30$/.test(await txt('#wc-mv-n')) && await page.evaluate(() => !document.querySelector('#wc-mv-n').hidden && getComputedStyle(document.querySelector('#wc-mv-n')).color === 'rgb(227, 179, 87)'), await txt('#wc-mv-n'));
    await page.locator('.wc-evs').screenshot({ path: path.join(shot_dir, 'mv-sheet-move-' + vp.width + '.png') });
    await page.click('#wc-mv-go'); await page.waitForTimeout(250);
    C = await calls(page);
    const up = C.filter(c => c.tool === 'update_event')[0];
    check('update_event with eventId and ISO local times, length kept', up && up.server === 'Google Calendar' && up.input.eventId === 'c2' && up.input.startTime === '2026-10-29T16:00:00' && up.input.endTime === '2026-10-29T17:15:00', up);
    const tm = await txt('.toast');
    S = await state(page);
    check('sheet closed, toast, the page\'s copy of the event shows 16:00', !(await has('.wc-evs')) && /^Moved on Google Calendar$/.test(tm) && /^16:00–17:15/.test(await txt('.p.plan .hcard:has(#hp-ev-c2) .hcm')) && S.cal.events.filter(e => e.id === 'c2')[0].start === '2026-10-29T16:00', await txt('.p.plan .hcard:has(#hp-ev-c2) .hcm'));
    // rejection leaves it where it was
    await boot(page, state0());
    await page.evaluate(() => { window.__mcpMode = 'reject'; });
    await page.click('#hp-ev-c2'); await page.waitForTimeout(150);
    await page.fill('#wc-mv-s', '16:00'); await page.click('#wc-mv-go'); await page.waitForTimeout(250);
    check('refused: toast says why, event still at 15:30, sheet still open', /^Not moved: Live calendar works when this page is open in Claude\./.test(await txt('.toast')) && /^15:30–16:45/.test(await txt('.p.plan .hcard:has(#hp-ev-c2) .hcm')) && await has('.wc-evs') && /^move$/i.test(await txt('#wc-mv-go')), await txt('.toast'));
    await page.click('#wc-evx'); await page.waitForTimeout(100);
    await page.evaluate(() => { window.__mcpMode = 'ok'; });
    // Postpone to tomorrow
    await page.click('#hp-ev-c2'); await page.waitForTimeout(150);
    await page.click('#wc-mv-tmrw'); await page.waitForTimeout(250);
    C = await calls(page);
    const up2 = C.filter(c => c.tool === 'update_event').pop();
    check('Postpone to tomorrow: update_event same time tomorrow; card gone from today', up2 && up2.input.startTime === '2026-10-30T15:30:00' && up2.input.endTime === '2026-10-30T16:45:00' && !(await has('#hp-ev-c2')), up2);
    check('no page errors (B)', errors.length === 0, errors); errors.length = 0;

    if (!phone) {
      // ---- C. drag with the mouse: hour plan, then the week grid ----
      await boot(page, state0());
      await into(page, '.p.plan .hcard:has([data-id="d9"])');
      let from = await rect(page, '.p.plan .hcard:has([data-id="d9"]) .hct'), row = await rect(page, '.hrw.free[data-h="1020"]');
      check('free run row 17:00–19:00 carries data-h / data-h2', row && (await page.getAttribute('.hrw.free[data-h="1020"]', 'data-h2')) === '1140');
      let mid = await drag(page, { x: from.cx, y: from.cy }, { x: row.cx, y: row.y + row.h * 0.75 }, async () => {
        const r = { lifted: await cls('.p.plan .hcard:has([data-id="d9"])'), row: await cls('.hrw.free[data-h="1020"]'), tf: await page.evaluate(() => document.querySelector('.p.plan .hcard:has([data-id="d9"])').style.transform) };
        await page.screenshot({ path: path.join(shot_dir, 'mv-drag-today-' + vp.width + '.png') });
        return r;
      });
      check('mid-drag: card lifted (.dragging, transform), row under the pointer .dropok, nothing re-rendered', /\bdragging\b/.test(mid.lifted) && /\bdropok\b/.test(mid.row) && /translate/.test(mid.tf), mid);
      const td = await txt('.toast'), tu = await has('.toast [data-act="undo"]');
      S = await state(page);
      const d9 = S.today.items.filter(i => i.id === 'd9')[0];
      check('dropped on the 18:00 hour: 18:00–18:45, toast with UNDO', d9 && d9.s === '18:00' && d9.e === '18:45' && /^Moved to 18:00/.test(td) && tu, [d9, td]);
      check('card not lifted after the drop, no dropok left behind', !(await has('.dragging')) && !(await has('.dropok')) && !(await has('.dropno')));
      // a calendar event onto the 17:00 row -> update_event
      await into(page, '.p.plan .hcard:has(#hp-ev-c2)');
      from = await rect(page, '.p.plan .hcard:has(#hp-ev-c2) .hct'); row = await rect(page, '.hrw.free[data-h="1020"]');
      await drag(page, { x: from.cx, y: from.cy }, { x: row.cx, y: row.cy });
      await page.waitForTimeout(200);
      C = await calls(page);
      const up3 = C.filter(c => c.tool === 'update_event').pop();
      check('calendar event dropped on 17:00: update_event 17:00–18:15, toast says Google Calendar and notes the soft overlap', up3 && up3.input.eventId === 'c2' && up3.input.startTime === '2026-10-29T17:00:00' && up3.input.endTime === '2026-10-29T18:15:00' && /Moved to 17:00 on Google Calendar/.test(await txt('.toast')) && /overlaps reading block 18:00–18:45/.test(await txt('.toast')) && /^17:00–18:15/.test(await txt('.p.plan .hcard:has(#hp-ev-c2) .hcm')), [up3, await txt('.toast')]);
      // drop outside any row: snaps back
      from = await rect(page, '.p.plan .hcard:has([data-id="d9"]) .hct');
      await drag(page, { x: from.cx, y: from.cy }, { x: 20, y: 20 });
      S = await state(page);
      check('released outside any row: unchanged', S.today.items.filter(i => i.id === 'd9')[0].s === '18:00' && !(await has('.dragging')));
      // no drag from the checkbox
      from = await rect(page, 'label[for="h-d9"]');
      await drag(page, { x: from.cx, y: from.cy }, { x: row.cx, y: row.cy });
      S = await state(page);
      check('a drag that starts on the checkbox does nothing', S.today.items.filter(i => i.id === 'd9')[0].s === '18:00');
      // week grid
      await calMode(page);
      await into(page, '#wcg-t-d9');
      const blk = await rect(page, '#wcg-t-d9'), col = await rect(page, '.wc-col[data-ds="2026-10-30"]'), gb = await rect(page, '.wc-gb'), h0 = +(await page.getAttribute('.wc-gb', 'data-h0'));
      check('grid: columns carry data-ds, the grid body data-h0', col && h0 > 0);
      const y13 = gb.y + (13 * 60 - h0) * 0.8;
      mid = await drag(page, { x: blk.cx, y: blk.cy }, { x: col.cx, y: y13 + (blk.cy - blk.y) }, async () => {
        const r = { slot: await has('.wc-col[data-ds="2026-10-30"] .dg-slot'), lbl: await txt('.dg-slot span'), col: await cls('.wc-col[data-ds="2026-10-30"]'), lifted: await cls('#wcg-t-d9'), bad: await floor(page, '.dg-slot') };
        await page.screenshot({ path: path.join(shot_dir, 'mv-drag-grid-' + vp.width + '.png') });
        return r;
      });
      check('mid-drag on the grid: dashed landing slot in Friday\'s column with the live time label, 12px floor', mid.slot && mid.lbl === 'FRI 13:00–13:45' && /\bdropok\b/.test(mid.col) && /\bdragging\b/.test(mid.lifted) && mid.bad.length === 0, mid);
      S = await state(page);
      const pg = S.planned.filter(p => p.id === 'd9')[0];
      check('dropped on Friday 13:00: today item is now planned FRI 13:00–13:45, gone from today', pg && pg.date === '2026-10-30' && pg.s === '13:00' && pg.e === '13:45' && !S.today.items.some(i => i.id === 'd9') && !(await has('.dg-slot')), pg);
      check('no page errors (C)', errors.length === 0, errors); errors.length = 0;
    } else {
      // ---- D. phone: press-and-hold, then drag ----
      await boot(page, state0());
      await into(page, '.p.plan .hcard:has([data-id="d9"])');
      let from = await rect(page, '.p.plan .hcard:has([data-id="d9"]) .hct'), row = await rect(page, '.hrw.free[data-h="1020"]');
      check('cards keep touch-action pan-y so the page still scrolls', await page.evaluate(() => getComputedStyle(document.querySelector('.p.plan .hcard')).touchAction === 'pan-y'));
      // a quick swipe (< 300 ms) never lifts the card
      await ptr(page, 'pointerdown', '.p.plan .hcard:has([data-id="d9"]) .hct', from.cx, from.cy);
      await ptr(page, 'pointermove', null, from.cx, from.cy + 60);
      const quick = await has('.dragging');
      await ptr(page, 'pointerup', null, from.cx, from.cy + 60); await page.waitForTimeout(100);
      check('a quick move does not drag', !quick && !(await has('.dragging')));
      // a move of more than 8px before the hold fires cancels it
      await ptr(page, 'pointerdown', '.p.plan .hcard:has([data-id="d9"]) .hct', from.cx, from.cy);
      await page.waitForTimeout(100); await ptr(page, 'pointermove', null, from.cx, from.cy + 40); await page.waitForTimeout(350);
      check('moving before the hold timer cancels the drag', !(await has('.dragging')));
      await ptr(page, 'pointerup', null, from.cx, from.cy + 40); await page.waitForTimeout(100);
      S = await state(page).catch(() => null);
      check('nothing moved', !S || S.today.items.filter(i => i.id === 'd9')[0].s === '16:45');
      // hold 300 ms, then drag onto the 18:00 hour of the free run
      await ptr(page, 'pointerdown', '.p.plan .hcard:has([data-id="d9"]) .hct', from.cx, from.cy);
      await page.waitForTimeout(350);
      check('after the hold the card is lifted', /\bdragging\b/.test(await cls('.p.plan .hcard:has([data-id="d9"])')));
      await ptr(page, 'pointermove', null, row.cx, row.y + row.h * 0.75); await page.waitForTimeout(60);
      const mid = { row: await cls('.hrw.free[data-h="1020"]'), tf: await page.evaluate(() => document.querySelector('.p.plan .hcard:has([data-id="d9"])').style.transform) };
      await page.screenshot({ path: path.join(shot_dir, 'mv-drag-today-' + vp.width + '.png') });
      await ptr(page, 'pointerup', null, row.cx, row.y + row.h * 0.75); await page.waitForTimeout(300);
      const tu = await has('.toast [data-act="undo"]');
      S = await state(page);
      const d9 = S.today.items.filter(i => i.id === 'd9')[0];
      check('mid-drag row .dropok and the card follows the finger; drop lands at 18:00–18:45 with an UNDO toast', /\bdropok\b/.test(mid.row) && /translate/.test(mid.tf) && d9 && d9.s === '18:00' && d9.e === '18:45' && tu, [mid, d9]);
      check('the click after a drag does not open the detail sheet', !(await has('.dsheet')));
      // agenda: hold a row and drop it on another day's header
      await page.click('[data-act="tab"][data-v="week"]'); await page.waitForTimeout(100);
      await calMode(page);
      await into(page, '.wc-day[data-ds="2026-10-30"] .wc-dh');
      const src = await rect(page, '#wca-t-d9'), fri = await rect(page, '.wc-day[data-ds="2026-10-30"] .wc-dh');
      await ptr(page, 'pointerdown', '#wca-t-d9', src.cx, src.cy); await page.waitForTimeout(350);
      await ptr(page, 'pointermove', null, fri.cx, fri.cy); await page.waitForTimeout(60);
      const hdr = await cls('.wc-day[data-ds="2026-10-30"] .wc-dh');
      await ptr(page, 'pointerup', null, fri.cx, fri.cy); await page.waitForTimeout(300);
      S = await state(page);
      const pa = S.planned.filter(p => p.id === 'd9')[0];
      check('agenda: Friday\'s header lit .dropok; the item is planned FRI at the same start 18:00', /\bdropok\b/.test(hdr) && pa && pa.date === '2026-10-30' && pa.s === '18:00' && pa.e === '18:45' && !S.today.items.some(i => i.id === 'd9'), [hdr, pa]);
      check('no page errors (D)', errors.length === 0, errors); errors.length = 0;
    }
    await ctx.close();
  }
  await browser.close();
  if (fails) { console.error(fails + ' FAILED'); process.exit(1); }
  console.log('OK, move');
})();
