// Events: the add_event tool, the Add to calendar card (conflicts, Move / Drop / Keep both), the Google Calendar writes
// through the mcp capability, and the no-double-showing rule (an item with a calId hides the calendar copy).
// Run: SHOT_DIR=/path node tests/events.js [path/to/page.html]   Clock: Thu 2026-10-29 14:30 Eastern.
// window.claude is stubbed before load (like tests/tellclaude.js): use('sample') runs the tool calls queued in window.__plan
// against the page's real tools; use('mcp') hands back a fake Google Calendar server that records every callTool.
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const fixture = require('./fixture');

const PAGE = path.resolve(process.argv[2] || path.join(__dirname, '..', 'mission-control.html'));
const shot_dir = process.env.SHOT_DIR || __dirname;
fs.mkdirSync(shot_dir, { recursive: true });
const STUB = `window.__calls=[];window.__created=[];window.__n=0;window.__mcpMode='ok';window.__events=${JSON.stringify(fixture().cal.events)};
window.__mcp={callTool:function(server,tool,input,opts){window.__calls.push({server:server,tool:tool,input:input});var mode=window.__mcpMode;
  if(mode==='reject'&&tool!=='list_events')return Promise.reject({code:'not_granted'});
  if(tool==='create_event'){var id='evt_'+(++window.__n);window.__created.push({id:id,t:input.summary,start:input.startTime.slice(0,16),end:input.endTime.slice(0,16),allDay:false,loc:input.location||''});return Promise.resolve(mode==='noid'?{payload:{}}:{payload:{id:id}});}
  if(tool==='update_event')return Promise.resolve({payload:{}});
  if(tool==='list_events')return Promise.resolve({payload:{events:window.__events.concat(window.__created)}});
  return Promise.reject({code:'tool_error'});}};
window.claude={use:function(n){
  if(n==='artifact')return Promise.resolve({publish:function(html){window.__pub=html;return Promise.resolve();}});
  if(n==='mcp')return Promise.resolve(window.__mcpOff?null:window.__mcp);
  if(n!=='sample')return Promise.resolve(null);
  var s=function(input,opts){
    window.__input=input;window.__tools=opts.tools||[];var plan=window.__plan||[];window.__plan=[];window.__results=null;
    var by={},out=[];(opts.tools||[]).forEach(function(t){by[t.name]=t;});
    return plan.reduce(function(p,step){return p.then(function(){
      var t=by[step.tool];if(!t){out.push({ok:false,err:'no tool '+step.tool});return;}
      return Promise.resolve().then(function(){return t.execute(step.inp,{});}).then(function(r){out.push({ok:true,res:r});},function(e){out.push({ok:false,err:String(e&&e.message||e)});});
    });},Promise.resolve()).then(function(){window.__results=out;return {text:'ok',truncated:false};});
  };
  s.limits=function(){return Promise.resolve({tools:true});};
  s.json=function(){return Promise.reject({code:'not_granted'});};
  return Promise.resolve(s);
}};`;

let fails = 0;
function check(name, ok, info) { if (ok) console.log('  ok   ' + name); else { fails++; console.log('  FAIL ' + name + (info !== undefined ? ' -- ' + JSON.stringify(info) : '')); } }

// the fixture plus the item that sits in the prep slot of a 15:00 call with 30 min of prep
function state0() {
  const st = fixture();
  st.today.items.push({ id: 'd3', t: 'File trip refund', d: 'Submit the receipts.', s: '14:00', e: '14:45', g: '', m: 45, done: false });
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
async function run(page, phone, plan) {
  await page.evaluate(p => { window.__plan = p; window.__results = null; }, plan);
  if (phone) { if (!(await page.$('.tc-sheet'))) await page.click('#tab-plus'); await page.fill('#sheet-in', 'test ' + Date.now()); await page.press('#sheet-in', 'Enter'); }
  else { await page.fill('#tc-bin', 'test ' + Date.now()); await page.press('#tc-bin', 'Enter'); }
  for (let i = 0; i < 50; i++) { if (await page.evaluate(() => Array.isArray(window.__results))) break; await page.waitForTimeout(100); }
  await page.waitForTimeout(150);
  return page.evaluate(() => window.__results);
}
// state after a change: the page publishes through the stubbed artifact once its save debounce runs on the fake clock
async function state(page) { await page.clock.runFor(7000); await page.waitForTimeout(100); return page.evaluate(() => JSON.parse(/<script type="application\/json" id="state">(.*?)<\/script>/s.exec(window.__pub)[1])); }
const calls = page => page.evaluate(() => window.__calls);
const txt = (page, sel) => page.evaluate(sel => { const e = document.querySelector(sel); return e ? e.textContent.replace(/\s+/g, ' ').trim() : null; }, sel);
const has = (page, sel) => page.evaluate(sel => !!document.querySelector(sel), sel);
const h = (page, sel) => page.evaluate(sel => { const e = document.querySelector(sel); return e ? e.getBoundingClientRect().height : 0; }, sel);
const disabled = (page, sel) => page.evaluate(sel => { const e = document.querySelector(sel); return e ? e.disabled : null; }, sel);
const pressed = (page, sel) => page.evaluate(sel => { const e = document.querySelector(sel); return e ? e.getAttribute('aria-pressed') : null; }, sel);
const floor = (page, sel) => page.evaluate(sel => { const bad = []; [].forEach.call(document.querySelectorAll(sel + ', ' + sel + ' *'), e => { if (!e.getClientRects().length) return; const f = parseFloat(getComputedStyle(e).fontSize); if (f < 12) bad.push(e.tagName.toLowerCase() + '.' + e.className + ' ' + f); }); return bad; }, sel);
const planCards = (page, t) => page.evaluate(t => [].filter.call(document.querySelectorAll('.p.plan .hcard'), c => c.querySelector('.hcx').textContent.indexOf(t) === 0).length, t);
async function setTime(page, sel, v) { await page.fill(sel, v); await page.dispatchEvent(sel, 'change'); await page.waitForTimeout(80); }
async function closeSheet(page, phone) { if (phone && await page.$('.tc-sheet')) { await page.keyboard.press('Escape'); await page.waitForTimeout(80); } }

const CALL = { t: 'Hiring call with Lauren', date: '2026-10-29', s: '15:00', e: '15:30', loc: 'Zoom', g: 'launch', prep: 30 };

(async () => {
  const browser = await chromium.launch();
  for (const vp of [{ width: 390, height: 844 }, { width: 1440, height: 900 }]) {
    const phone = vp.width < 1000, hit = phone ? 44 : 40;
    const ctx = await browser.newContext({ viewport: vp, timezoneId: 'America/New_York' });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
    console.log(vp.width + 'px');

    // ---- A. the tool: conflicts and suggestions, nothing written, the card ----
    await boot(page, state0());
    let R = await run(page, phone, [{ tool: 'add_event', inp: CALL }, { tool: 'add_event', inp: { t: 'Second one', date: '2026-10-29', s: '18:00', m: 30, prep: 0 } }]);
    const tool = await page.evaluate(() => { const t = window.__tools.filter(t => t.name === 'add_event')[0]; return t ? { req: t.inputSchema.required, props: Object.keys(t.inputSchema.properties) } : null; });
    check('add_event tool: t, date, s, prep required; e, m, loc, d, g, prep_t optional', tool && tool.req.join() === 't,date,s,prep' && tool.props.join() === 't,date,s,e,m,loc,d,g,prep,prep_t', tool);
    const P = await page.evaluate(() => window.__input[0].content);
    check('prompt rule: a set time goes to add_event, never add_task; the page asks him about conflicts', /-> add_event with the real time, never add_task/.test(P) && /do not ask him yourself and do not move anything/.test(P) && /Only something with no set time is a task\./.test(P));
    const r0 = R[0].ok ? R[0].res : null;
    check('result: awaiting_confirmation with the slot and the prep slot', r0 && r0.status === 'awaiting_confirmation' && r0.slot === 'THU 2026-10-29 15:00-15:30' && r0.prep === '14:30-15:00', R[0]);
    check('conflicts: the item in the prep slot and the one in the event slot, with suggestions that avoid the 15:30-16:45 class and each other', r0 && r0.conflicts.length === 2 && r0.conflicts[0].what === 'File trip refund 14:00-14:45 (today item)' && r0.conflicts[0].suggest === '16:45-17:30' && r0.conflicts[1].what === 'Call clinic 15:00-15:15 (today item)' && r0.conflicts[1].suggest === '17:30-17:45', r0 && r0.conflicts);
    check('a second add_event while one waits is refused, not queued silently', !R[1].ok && /already waiting/.test(R[1].err), R[1]);
    check('nothing saved: the tool wrote nothing', await page.evaluate(() => typeof window.__pub === 'undefined'));
    const chip = await page.evaluate(() => { const c = [].filter.call(document.querySelectorAll('.tc-chip'), x => /Event →/.test(x.textContent))[0]; return c ? { t: c.textContent, tag: c.tagName, act: c.dataset.act, cls: c.className } : null; });
    check('chip "Event → 15:00 Hiring call with Lauren · confirm on page", tappable', chip && chip.t === 'Event → 15:00 Hiring call with Lauren · confirm on page' && chip.tag === 'BUTTON' && chip.act === 'ev-open' && /\bc\b/.test(chip.cls), chip);
    await page.locator('[data-act="ev-open"]:visible').first().click(); await page.waitForTimeout(100);
    check('tapping the chip closes the sheet and shows the card on TODAY', !(await page.$('.tc-sheet')) && await page.isVisible('#ev-card'));
    const card = await txt(page, '#ev-card');
    check('card: title, day, time, place, prep block', /Hiring call with Lauren/.test(card) && /THU, OCT 29 · 15:00–15:30 · Zoom/.test(card) && /14:30–15:00 ?Prep: Hiring call with Lauren/.test(card), card);
    check('card: one row per conflict with the item and its time', /File trip refund · 14:00–14:45/.test(await txt(page, '#ev-c-0')) && /Call clinic · 15:00–15:15/.test(await txt(page, '#ev-c-1')));
    check('row: Move to <suggestion>, time input preset, Drop, Keep both', /^move to 16:45$/i.test(await txt(page, '#ev-c-0-move')) && (await page.inputValue('#ev-c-0-time')) === '16:45' && await has(page, '#ev-c-0-drop') && await has(page, '#ev-c-0-keep'));
    check('Add to calendar disabled until every conflict has a choice; Cancel present', (await disabled(page, '#ev-add')) === true && await has(page, '#ev-cancel'));
    const bad = await floor(page, '#ev-card');
    check('12px floor on the card', bad.length === 0, bad);
    for (const id of ['ev-c-0-move', 'ev-c-0-time', 'ev-c-0-drop', 'ev-c-0-keep', 'ev-add', 'ev-cancel']) { const hh = await h(page, '#' + id); check('#' + id + ' hit area ' + Math.round(hh) + 'px (>= ' + hit + ')', hh >= hit); }
    await page.clock.runFor(61000); await page.waitForTimeout(50);
    check('the minute tick keeps the card', await has(page, '#ev-card'));
    await page.evaluate(() => window.scrollTo(0, 0)); await page.waitForTimeout(50);
    await page.locator('#ev-card').screenshot({ path: path.join(shot_dir, 'ev-card-' + vp.width + '.png') });
    await page.click('#ev-c-0-move'); await page.waitForTimeout(80);
    check('Move chosen on one row: still disabled while the other row waits', (await pressed(page, '#ev-c-0-move')) === 'true' && (await disabled(page, '#ev-add')) === true);
    await page.click('#ev-c-1-keep'); await page.waitForTimeout(80);
    check('every row chosen: Add to calendar enabled', (await pressed(page, '#ev-c-1-keep')) === 'true' && (await disabled(page, '#ev-add')) === false);
    await setTime(page, '#ev-c-0-time', '16:00');
    check('a typed time that clashes with the class is refused on the row and disables the main button', /16:00 clashes with Aircraft Dynamics 15:30–16:45/.test(await txt(page, '#ev-c-0')) && (await disabled(page, '#ev-add')) === true && (await pressed(page, '#ev-c-0-move')) === 'false');
    await setTime(page, '#ev-c-0-time', '17:00');
    check('a typed free time selects Move to that time', /^move to 17:00$/i.test(await txt(page, '#ev-c-0-move')) && (await pressed(page, '#ev-c-0-move')) === 'true' && (await disabled(page, '#ev-add')) === false);
    await page.locator('#ev-card').screenshot({ path: path.join(shot_dir, 'ev-card-chosen-' + vp.width + '.png') });
    await page.click('#ev-add'); await page.waitForTimeout(200);
    check('card gone after Add to calendar', !(await has(page, '#ev-card')));
    check('toast confirms the calendar write', /on Google Calendar/.test((await txt(page, '.toast')) || ''), await txt(page, '.toast'));
    let S = await state(page), C = await calls(page);
    const evIt = S.today.items.filter(i => i.kind === 'event')[0], prIt = S.today.items.filter(i => i.t === 'Prep: Hiring call with Lauren')[0], d3 = S.today.items.filter(i => i.id === 'd3')[0], d2 = S.today.items.filter(i => i.id === 'd2')[0];
    check('event item on today: kind event, 15:00-15:30, Zoom, goal, m from the span, calId evt_1', evIt && evIt.t === 'Hiring call with Lauren' && evIt.s === '15:00' && evIt.e === '15:30' && evIt.loc === 'Zoom' && evIt.g === 'launch' && evIt.m === 30 && evIt.calId === 'evt_1' && evIt.done === false, evIt);
    check('prep item on today: 14:30-15:00, calId evt_2, a normal tickable item', prIt && prIt.s === '14:30' && prIt.e === '15:00' && prIt.calId === 'evt_2' && !prIt.kind && prIt.g === 'launch', prIt);
    check('moved item at the chosen time, kept item untouched', d3 && d3.s === '17:00' && d3.e === '17:45' && d2 && d2.s === '15:00' && d2.e === '15:15', [d3, d2]);
    const cr = C.filter(c => c.tool === 'create_event');
    check('two create_event calls with ISO local times', cr.length === 2 && cr.every(c => c.server === 'Google Calendar') && cr[0].input.summary === 'Hiring call with Lauren' && cr[0].input.startTime === '2026-10-29T15:00:00' && cr[0].input.endTime === '2026-10-29T15:30:00' && cr[0].input.location === 'Zoom' && cr[1].input.summary === 'Prep: Hiring call with Lauren' && cr[1].input.startTime === '2026-10-29T14:30:00' && cr[1].input.endTime === '2026-10-29T15:00:00', cr);
    check('no update_event when no calendar event moved', !C.some(c => c.tool === 'update_event'));
    check('hour plan: the event is a fixed block in ink without a checkbox; the prep has one', (await planCards(page, 'Hiring call with Lauren')) === 1 && await page.evaluate(() => { const c = [].filter.call(document.querySelectorAll('.p.plan .hcard.evi'), x => /Hiring call/.test(x.textContent))[0]; const p = [].filter.call(document.querySelectorAll('.p.plan .hcard'), x => /Prep: Hiring/.test(x.textContent))[0]; return c && !c.querySelector('input[type=checkbox]') && getComputedStyle(c.querySelector('.hcx')).color === 'rgb(237, 237, 239)' && p && !!p.querySelector('input[type=checkbox]'); }));
    // the live calendar now returns the created events (ids evt_1, evt_2): the items win, the calendar copies are skipped
    await page.evaluate(() => { const b = [].filter.call(document.querySelectorAll('[data-act="wc-mode"][data-v="cal"]'), x => x.offsetParent)[0] || document.querySelector('[data-act="wc-mode"][data-v="cal"]'); b.click(); });
    await page.waitForTimeout(300);
    check('live calendar read happened', C = await calls(page), C.some(c => c.tool === 'list_events') && /LIVE/.test((await txt(page, '#wc-sync')) || ''));
    check('no double-showing: the hour plan shows the event once, no calendar card for evt_1', (await planCards(page, 'Hiring call with Lauren')) === 1 && (await planCards(page, 'Prep: Hiring call')) === 1 && !(await has(page, '#hp-ev-evt_1')) && !(await has(page, '#hp-ev-evt_2')));
    check('no double-showing in the week view', await page.evaluate(() => [].filter.call(document.querySelectorAll('.p.wcalp .wc-ag .wc-r .wc-tx'), x => x.textContent.indexOf('Hiring call with Lauren') === 0).length === 1 && ![].some.call(document.querySelectorAll('.p.wcalp [data-act="wc-ev"]'), x => x.dataset.id === 'evt_1' || x.dataset.id === 'evt_2')));
    check('no page errors (A)', errors.length === 0, errors); errors.length = 0;

    // ---- B. a future event over a calendar event: Move (update_event) and Keep both only; lands in planned ----
    await boot(page, state0());
    R = await run(page, phone, [{ tool: 'add_event', inp: { t: 'Dentist', date: '2026-10-30', s: '10:30', m: 30, prep: 0, d: 'Bring the form.' } }]);
    const rb = R[0].ok ? R[0].res : null;
    check('calendar event conflict reported with a suggestion that avoids the other classes and the proposal', rb && rb.conflicts.length === 1 && rb.conflicts[0].what === 'Hypersonics 10:00-11:00 (calendar event)' && rb.conflicts[0].suggest === '13:00-14:00' && rb.prep === '', R[0]);
    await closeSheet(page, phone);
    check('calendar conflict row: Move and Keep both, no Drop', await has(page, '#ev-c-0-move') && await has(page, '#ev-c-0-keep') && !(await has(page, '#ev-c-0-drop')));
    await page.click('#ev-c-0-move'); await page.waitForTimeout(80); await page.click('#ev-add'); await page.waitForTimeout(200);
    S = await state(page); C = await calls(page);
    const pl = S.planned.filter(p => p.kind === 'event')[0];
    check('future event goes to planned with kind event, calId, notes', pl && pl.date === '2026-10-30' && pl.s === '10:30' && pl.e === '11:00' && pl.calId === 'evt_1' && pl.d === 'Bring the form.' && S.today.items.length === 3, pl);
    const up = C.filter(c => c.tool === 'update_event')[0];
    check('moved calendar event: update_event with eventId and ISO local times', up && up.input.eventId === 'c4' && up.input.startTime === '2026-10-30T13:00:00' && up.input.endTime === '2026-10-30T14:00:00', up);
    check('create_event carries the description, no location', C.filter(c => c.tool === 'create_event').length === 1 && C.filter(c => c.tool === 'create_event')[0].input.description === 'Bring the form.' && C.filter(c => c.tool === 'create_event')[0].input.location === undefined);
    check('no page errors (B)', errors.length === 0, errors); errors.length = 0;

    // ---- C. Drop both; the connector returns no id, so the page finds it through list_events ----
    await boot(page, state0());
    await page.evaluate(() => { window.__mcpMode = 'noid'; });
    R = await run(page, phone, [{ tool: 'add_event', inp: CALL }]);
    await closeSheet(page, phone);
    await page.click('#ev-c-0-drop'); await page.click('#ev-c-1-drop'); await page.waitForTimeout(80);
    check('Drop chosen on both rows enables the main button', (await pressed(page, '#ev-c-0-drop')) === 'true' && (await disabled(page, '#ev-add')) === false);
    await page.click('#ev-add'); await page.waitForTimeout(200);
    S = await state(page); C = await calls(page);
    check('dropped items are gone from today and logged in dropped', !S.today.items.some(i => i.id === 'd3' || i.id === 'd2') && S.dropped.some(d => d.t === 'File trip refund' && d.date === '2026-10-29') && S.dropped.some(d => d.t === 'Call clinic'), S.dropped);
    const ev2 = S.today.items.filter(i => i.kind === 'event')[0], pr2 = S.today.items.filter(i => /^Prep:/.test(i.t))[0];
    check('no id in the result: list_events lookup links the items by start and title', ev2 && ev2.calId === 'evt_1' && pr2 && pr2.calId === 'evt_2' && C.filter(c => c.tool === 'list_events').length >= 2, [ev2, pr2]);
    check('no page errors (C)', errors.length === 0, errors); errors.length = 0;

    // ---- D. the calendar refuses: items stay on the plan, toast says why ----
    await boot(page, state0());
    await page.evaluate(() => { window.__mcpMode = 'reject'; });
    R = await run(page, phone, [{ tool: 'add_event', inp: CALL }]);
    await closeSheet(page, phone);
    await page.click('#ev-c-0-keep'); await page.click('#ev-c-1-keep'); await page.waitForTimeout(80);
    await page.click('#ev-add'); await page.waitForTimeout(200);
    const tst = await txt(page, '.toast');
    S = await state(page);
    const ev3 = S.today.items.filter(i => i.kind === 'event')[0], pr3 = S.today.items.filter(i => /^Prep:/.test(i.t))[0];
    check('not_granted: items kept on the plan without calId, Keep both left the others alone', ev3 && !ev3.calId && pr3 && !pr3.calId && S.today.items.length === 5 && S.today.items.filter(i => i.id === 'd3')[0].s === '14:00', S.today.items.map(i => i.t + ' ' + i.s));
    check('toast: "On your plan, not on Google Calendar: <reason>"', /^On your plan, not on Google Calendar: Live calendar works when this page is open in Claude\./.test(tst || ''), tst);
    check('no page errors (D)', errors.length === 0, errors); errors.length = 0;

    // ---- E. Cancel changes nothing ----
    await boot(page, state0());
    await run(page, phone, [{ tool: 'add_event', inp: CALL }]);
    await closeSheet(page, phone);
    await page.click('#ev-cancel'); await page.waitForTimeout(100);
    check('Cancel: card gone, nothing saved', !(await has(page, '#ev-card')) && await page.evaluate(() => typeof window.__pub === 'undefined') && /Not added/.test((await txt(page, '.toast')) || ''));

    // ---- F. a snapshot calendar event matching an item by day, start and title: shown once, linked at load, link kept by set_today_items ----
    const st = state0();
    st.today.items.push({ id: 'ev9', t: 'Hiring call with Lauren', d: '', s: '15:00', e: '15:30', g: 'launch', m: 30, done: false, kind: 'event', loc: 'Zoom' });
    st.cal.events.push({ id: 'gx1', t: 'Hiring call with Lauren', start: '2026-10-29T15:00', end: '2026-10-29T15:30', allDay: false, loc: '' });
    await boot(page, st);
    check('snapshot copy of an item is skipped on the plan', (await planCards(page, 'Hiring call with Lauren')) === 1 && !(await has(page, '#hp-ev-gx1')) && await has(page, '#hp-evi-ev9'));
    R = await run(page, phone, [{ tool: 'set_today_items', inp: { items: [{ id: 'd1', t: 'Draft mission profile section 2' }, { id: 'ev9', t: 'Hiring call with Lauren', s: '15:00', e: '15:30' }, { t: 'New thing', m: 30 }] } }]);
    S = await state(page);
    const kept = S.today.items.filter(i => i.id === 'ev9')[0];
    check('normalize linked the item (calId gx1) and set_today_items kept calId, kind and loc on the kept id', R[0].ok && kept && kept.calId === 'gx1' && kept.kind === 'event' && kept.loc === 'Zoom', kept);
    check('prompt lists the event item as an event', /ev9 \| 15:00-15:30 \| Hiring call with Lauren \| event/.test(await page.evaluate(() => window.__input[0].content)));
    check('no page errors (F)', errors.length === 0, errors);
    await ctx.close();
  }
  await browser.close();
  if (fails) { console.error(fails + ' FAILED'); process.exit(1); }
  console.log('OK, events');
})();
