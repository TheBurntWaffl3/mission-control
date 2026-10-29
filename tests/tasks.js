// Tasks module: urgency (derivation, chips, sort) and project management (rename, move, merge, convert, delete, undo).
// Everything is checked through the rendered DOM (the page state is private to the main script).
// Run: node tests/tasks.js [path/to/page.html]   Clock: Thu 2026-10-29 14:30 Eastern (week = Mon Oct 26 – Sun Nov 1).
const { chromium } = require('playwright');
const path = require('path');
const fixture = require('./fixture');
const page_path = path.resolve(process.argv[2] || path.join(__dirname, '..', 'mission-control.html'));
let fails = 0;
function ok(cond, msg) { if (!cond) { fails++; console.error('  FAIL ' + msg); } else console.log('  ok   ' + msg); }
function deepEq(a, b) { return JSON.stringify(a) === JSON.stringify(b); }

async function run(vp) {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: vp, timezoneId: 'America/New_York' });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  const st = fixture();
  // a task due tomorrow with no urgency set: derives THIS WEEK, sorts into "Due within 2 days"
  st.tasks.push({ id: 'x1', t: 'Return the library book', d: '', proj: 'life', parent: '', g: '', due: '2026-10-30', m: 10, status: 'open', created: '2026-10-28', doneOn: '' });
  await fixture.load(page, page_path, st);
  console.log(vp.width + 'px');
  const ev = (fn, arg) => page.evaluate(fn, arg);
  const click = async (sel) => { await page.click(sel); await page.waitForTimeout(80); };
  const vis = (sel) => page.isVisible(sel);
  const toast = () => ev(() => { const t = document.querySelector('.toast'); return t ? [].map.call(t.querySelectorAll('span,button'), c => c.textContent).join(' ').replace(/\s+/g, ' ').trim() : ''; });
  const hasUndo = () => ev(() => !!document.querySelector('.toast [data-act="undo"]'));
  const undo = () => click('.toast [data-act="undo"]');
  const rowIds = () => ev(() => [].map.call(document.querySelectorAll('.taskp .tk-rows .tk-r:not(.sub) .tk-tb'), b => b.dataset.id));
  const groups = () => ev(() => [].map.call(document.querySelectorAll('.taskp .tk-gt b'), b => b.textContent));
  const tagOf = (id) => ev((id) => { const r = document.querySelector('#tko-' + id + ' .tk-ut'); return r ? [r.textContent, r.classList.contains('now')] : null; }, id);
  const groupOf = (id) => ev((id) => { const b = document.querySelector('#tko-' + id); return b ? b.closest('.tk-g').querySelector('.tk-gt b').textContent : null; }, id);
  const pressed = (sel) => page.getAttribute(sel, 'aria-pressed');
  const dmeta = () => ev(() => [].map.call(document.querySelectorAll('.dsheet .tk-on'), x => x.textContent));

  if (vp.width < 1000) await click('#tab-tasks'); else await click('#vw-tasks');
  ok(await vis('.taskp'), 'Tasks view is visible');

  // ---- 1. default sort is URGENCY: NOW, due within 2 days, THIS WEEK (by due), LATER (by due) ----
  ok(await pressed('#tks-urg') === 'true', 'URGENCY is the default sort');
  ok(deepEq(await groups(), ['Now', 'Due within 2 days', 'This week', 'Later']), 'urgency groups in order: ' + (await groups()).join(' | '));
  ok(deepEq(await rowIds(), ['e1', 'x1', 'c1', 's2', 'j1', 'l1', 'e2', 'j2']), 'rows sorted by urgency, then due: ' + (await rowIds()).join(','));
  ok(await ev(() => document.querySelector('.taskp .tk-g:first-child .tk-ut') === null), 'no NOW tag inside the NOW group');
  ok(deepEq(await tagOf('x1'), ['THIS WEEK', false]), 'a THIS WEEK task due tomorrow keeps its tag in the 2-day group');

  // ---- 2. urgency derivation (tk_normalize) seen through the row tags in PROJECT sort ----
  await click('#tks-proj');
  ok(deepEq(await rowIds(), ['s2', 'j1', 'j2', 'e1', 'e2', 'c1', 'x1', 'l1']), 'project groups keep the urgency order inside: ' + (await rowIds()).join(','));
  ok(deepEq(await tagOf('e1'), ['NOW', true]), 'explicit NOW shows as an ink tag');
  ok(deepEq(await tagOf('j1'), ['THIS WEEK', false]), 'explicit THIS WEEK shows as a dim tag');
  ok(await tagOf('j2') === null, 'explicit LATER shows no tag');
  ok(deepEq(await tagOf('c1'), ['THIS WEEK', false]), 'missing urg, due in 4 days: derives THIS WEEK');
  ok(await tagOf('e2') === null && await tagOf('l1') === null, 'missing urg, due in 16+ days: derives LATER');
  ok(await tagOf('s2a') === null, 'missing urg, no due date: derives LATER');

  // ---- 3. chips in the detail sheet ----
  await click('#tko-l1');
  ok(await vis('.dsheet #tku-now') && await pressed('#tku-later') === 'true', 'detail sheet has urgency chips, LATER pressed');
  const ch = await page.$eval('#tku-now', b => b.getBoundingClientRect().height);
  ok(ch >= (vp.width < 1000 ? 44 : 40), 'chip hit area ' + Math.round(ch) + 'px');
  await click('#tku-week');
  ok(/^THIS WEEK · proposed (THU, OCT 29|FRI, OCT 30|SAT, OCT 31|SUN, NOV 1) \d\d:\d\d UNDO$/.test(await toast()), 'THIS WEEK proposes a timed slot inside this week: ' + (await toast()));
  ok(await vis('.dsheet') && await pressed('#tku-week') === 'true' && await vis('#tk-pacc'), 'sheet stays open, chip pressed, proposed slot shown');
  await click('#tku-later');
  ok(await toast() === 'LATER · proposal removed UNDO' && !(await vis('#tk-pacc')), 'LATER removes the pending proposal');
  await click('#d-close');
  ok(deepEq(await tagOf('l1'), null), 'row has no tag again');

  await click('#tko-j2'); await click('#tku-now');
  ok((await toast()) === 'NOW · on today’s plan UNDO' && await hasUndo(), 'NOW adds a linked today item (plan had 1 open item): ' + (await toast()));
  ok((await dmeta()).some(x => /ON TODAY/.test(x)), 'sheet shows ON TODAY’S PLAN');
  await click('#tku-later');
  ok(await toast() === 'LATER UNDO' && (await dmeta()).some(x => /ON TODAY/.test(x)), 'LATER keeps the today item');
  await click('#d-close');
  ok(deepEq(await tagOf('j2'), null) && await ev(() => /ON TODAY/.test(document.querySelector('#tko-j2').textContent)), 'row shows ON TODAY');
  await click('#tko-e2'); await click('#tku-now'); await click('#d-close');   // today now has 3 open items
  await click('#tko-l1'); await click('#tku-now');
  ok(await toast() === 'NOW · today is full, so it tops Tasks UNDO' && !(await dmeta()).length, 'NOW with 3 open items stays in Tasks: ' + (await toast()));
  await click('#d-close');
  ok(deepEq(await tagOf('l1'), ['NOW', true]), 'row shows the NOW tag');

  // ---- 4. chips in the inline add form ----
  await click('#tka-p_life');
  ok(await vis('#tk-add-f #tka-week') && await pressed('#tka-later') === 'true', 'add form has chips, LATER by default');
  await click('#tka-week');
  await page.fill('#tk-add-in', 'Order filter media');
  await page.press('#tk-add-in', 'Enter'); await page.waitForTimeout(80);
  ok(/^Added to Life admin · THIS WEEK · proposed /.test(await toast()), 'added with THIS WEEK and a proposed slot: ' + (await toast()));
  const nr = await ev(() => { const b = [].filter.call(document.querySelectorAll('.taskp .tk-tb'), x => x.querySelector('.tk-tt').textContent === 'Order filter media')[0]; return b ? [b.querySelector('.tk-ut') && b.querySelector('.tk-ut').textContent, /PROPOSED/.test(b.textContent), b.closest('.tk-g').querySelector('.tk-gt b').textContent] : null; });
  ok(deepEq(nr, ['THIS WEEK', true, 'Life admin']), 'new row: THIS WEEK tag, PROPOSED, under Life admin');
  ok(await pressed('#tka-later') === 'true', 'add form chip resets to LATER');
  await click('#tk-add-x');

  // ---- 5. project panel: rename + undo ----
  ok(await vis('#tkpm-p_life'), 'group header has the ⋯ button');
  const pb = await page.$eval('#tkpm-p_life', b => { const r = b.getBoundingClientRect(); return [r.width, r.height]; });
  ok(pb[0] >= 44 && pb[1] >= 44, '⋯ hit area ' + pb.map(Math.round).join('x'));
  await click('#tkpm-p_life');
  ok(await vis('#tk-pp') && await page.getAttribute('#tkpm-p_life', 'aria-expanded') === 'true', 'panel opens');
  await click('#tk-pf-ren');
  await page.fill('#tk-ren-in', 'Home admin');
  await page.press('#tk-ren-in', 'Enter'); await page.waitForTimeout(80);
  ok(await groupOf('l1') === 'Home admin', 'rename changes the group name');
  ok(await toast() === 'Renamed Life admin to Home admin UNDO', 'rename shows UNDO: ' + (await toast()));
  await undo();
  ok(await groupOf('l1') === 'Life admin', 'undo restores the name');

  // move up / down
  await click('#tkpm-p_jobs');
  ok(await page.getAttribute('#tk-pf-del', 'disabled') !== null, 'DELETE is disabled while tasks are open');
  await click('#tk-pdn');
  ok(deepEq(await groups(), ['App launch', 'Design course', 'Job search', 'Classes', 'Life admin']), 'MOVE DOWN reorders: ' + (await groups()).join(','));
  ok(await vis('#tk-pp') && await hasUndo(), 'panel stays open, UNDO offered');
  await click('#tk-pup');
  ok(deepEq(await groups(), ['App launch', 'Job search', 'Design course', 'Classes', 'Life admin']), 'MOVE UP reorders back');
  await click('#tkpm-p_jobs');
  ok(!(await vis('#tk-pp')), '⋯ again closes the panel');

  // ---- 6. merge + undo ----
  await click('#tkpm-p_classes');
  await click('#tk-pf-merge');
  await page.selectOption('#tk-merge-p', 'enae481');
  await click('#tk-merge-go');
  ok(await vis('#tk-mergeok') && await vis('.taskp .confirm'), 'merge asks to confirm');
  await click('#tk-mergeok');
  ok(!(await groups()).includes('Classes') && await groupOf('c1') === 'Design course', 'merge moves the tasks and removes the project');
  ok(await toast() === 'Merged Classes into Design course UNDO', 'toast: ' + (await toast()));
  await undo();
  ok((await groups()).includes('Classes') && await groupOf('c1') === 'Classes', 'undo restores the merged project');

  // ---- 7. make it a task under… + undo ----
  await click('#tkpm-p_spotter');
  await click('#tk-pf-conv');
  await page.selectOption('#tk-conv-p', 'jobs');
  await click('#tk-conv-go');
  ok(await vis('#tk-convok'), 'convert asks to confirm');
  await click('#tk-convok');
  const cv = await ev(() => {
    const b = [].filter.call(document.querySelectorAll('.taskp .tk-r:not(.sub) .tk-tb'), x => x.querySelector('.tk-tt').textContent === 'App launch')[0]; if (!b) return null;
    const li = b.closest('li'), subs = []; let n = li.nextElementSibling; while (n && n.classList.contains('sub')) { subs.push(n.querySelector('.tk-tt').textContent); n = n.nextElementSibling; }
    return { group: b.closest('.tk-g').querySelector('.tk-gt b').textContent, tag: b.querySelector('.tk-ut') && b.querySelector('.tk-ut').textContent, due: b.querySelector('.tk-du') && b.querySelector('.tk-du').textContent, pg: b.querySelector('.tk-pg') && b.querySelector('.tk-pg').textContent, subs: subs };
  });
  ok(cv && cv.group === 'Job search' && !(await groups()).includes('App launch'), 'project became a task under Job search; its group is gone');
  ok(cv && cv.tag === 'THIS WEEK' && cv.due === 'T−5D', 'new task takes the most urgent child urgency and the earliest due: ' + JSON.stringify(cv));
  ok(cv && cv.pg === '0/3' && deepEq(cv.subs, ['Prep table (Nov 3)', 'Prep table (Nov 3): Demo phone + mirror screen', 'Prep table (Nov 3): Banner and sign']), 'tasks became subtasks; nested ones flattened with the parent prefix: ' + JSON.stringify(cv && cv.subs));
  ok(await toast() === 'App launch is now a task under Job search UNDO', 'toast: ' + (await toast()));
  await undo();
  const back = await ev(() => { const li = document.querySelector('#tko-s2').closest('li'); const subs = []; let n = li.nextElementSibling; while (n && n.classList.contains('sub')) { subs.push(n.querySelector('.tk-tt').textContent); n = n.nextElementSibling; } return subs; });
  ok((await groups()).includes('App launch') && deepEq(back, ['Demo phone + mirror screen', 'Banner and sign']), 'undo restores the project and its subtasks');

  // ---- 8. + NEW PROJECT, then delete it + undo ----
  ok(await vis('#tk-pnew'), '+ NEW PROJECT at the bottom');
  await click('#tk-pnew');
  await page.fill('#tk-pnew-in', 'Scratch');
  await page.selectOption('#tk-pnew-g', 'home');
  await click('#tk-pnew-go');
  ok((await groups()).slice(-1)[0] === 'Scratch' && await toast() === 'Added project Scratch UNDO', 'new project appended: ' + (await groups()).join(','));
  await click('#tkpm-p_scratch');
  ok(await page.getAttribute('#tk-pf-del', 'disabled') === null, 'DELETE enabled on an empty project');
  await click('#tk-pf-del');
  ok(await vis('#tk-delok'), 'delete asks to confirm');
  await click('#tk-delok');
  ok(!(await groups()).includes('Scratch') && await toast() === 'Deleted project Scratch UNDO', 'project deleted: ' + (await toast()));
  await undo();
  ok((await groups()).includes('Scratch'), 'undo restores the deleted project');
  await click('#tkpm-p_scratch'); await click('#tk-pf-del'); await click('#tk-delok');

  // ---- 9. the ⓘ explains urgency and the project panel ----
  await click('#info-tasks');
  ok(await ev(() => /URGENCY: NOW/.test(document.getElementById('isheet').textContent) && /⋯ on a project/.test(document.getElementById('isheet').textContent)), 'ⓘ text covers urgency and project options');
  await click('#i-close');

  // screenshot of the Tasks view with a panel open
  await click('#tkpm-p_life');
  await page.screenshot({ path: path.join(__dirname, 'tasks-' + vp.width + '.png'), fullPage: true });
  await ctx.close(); await browser.close();
  if (errors.length) { fails++; console.error('  PAGE ERRORS:\n  ' + errors.join('\n  ')); }
}
(async () => {
  await run({ width: 390, height: 844 });
  await run({ width: 1440, height: 900 });
  if (fails) { console.error(fails + ' failure(s)'); process.exit(1); }
  console.log('OK, tasks tests pass');
})();
