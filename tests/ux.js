// UX restructure: Habits on TODAY, log chips + brush strip on the day plan, Tell Claude bar folded by default,
// fewer ⓘ, 12px floor. Run: node tests/ux.js [path/to/page.html]   Clock: Thu 2026-10-29 14:30 Eastern.
// Screenshots go to SHOT_DIR (default: tests/).
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const fixture = require('./fixture');
const page_path = path.resolve(process.argv[2] || path.join(__dirname, '..', 'mission-control.html'));
const shot_dir = process.env.SHOT_DIR || __dirname;
fs.mkdirSync(shot_dir, { recursive: true });
let fails = 0;
function ok(cond, msg) { if (!cond) { fails++; console.error('  FAIL ' + msg); } else console.log('  ok   ' + msg); }

async function run(vp) {
  const phone = vp.width < 1000, hit = phone ? 44 : 40;
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: vp, timezoneId: 'America/New_York' });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  const st = fixture();
  st.goals.forEach(g => { if (g.id === 'pt') { g.habit = 'pt'; g.goal = 3; } if (g.id === 'comms') { g.habit = 'comms'; g.goal = 5; } });
  st.log['2026-10-29'] = 'zzeaaa................';   // 12:00 and 13:00 (past) unlogged; 14:00 is the current hour
  // served from an http origin (like tests/tellclaude.js) so localStorage works: the page's dirty copy of S is read back from it
  let html = fs.readFileSync(page_path, 'utf8').replace(/(<script type="application\/json" id="state">).*?(<\/script>)/s, (_, a, b) => a + JSON.stringify(st) + b);
  await page.route('http://mc.test/**', route => route.fulfill({ contentType: 'text/html', body: html }));
  await page.clock.install({ time: new Date('2026-10-29T14:30:00-04:00') });
  await page.goto('http://mc.test/', { waitUntil: 'load' });
  await page.waitForTimeout(600);
  console.log(vp.width + 'px');
  const ev = (fn, arg) => page.evaluate(fn, arg);
  const click = async (sel) => { await page.click(sel); await page.waitForTimeout(80); };
  const vis = (sel) => page.isVisible(sel);
  const has = (sel) => ev(sel => !!document.querySelector(sel), sel);
  const txt = (sel) => ev(sel => { const e = document.querySelector(sel); return e ? e.textContent.replace(/\s+/g, ' ').trim() : null; }, sel);
  const cls = (sel) => ev(sel => { const e = document.querySelector(sel); return e ? e.className : null; }, sel);
  const h = (sel) => ev(sel => { const e = document.querySelector(sel); return e ? e.getBoundingClientRect().height : 0; }, sel);
  const logToday = () => ev(() => { try { return JSON.parse(localStorage.getItem('mc.dirty')).state; } catch (e) { return ''; } }).then(s => s ? JSON.parse(s).log['2026-10-29'] : null);
  // every element under the new UI renders at 12px or more
  const floor = (sels) => ev(sels => { const bad = []; sels.forEach(s => { [].forEach.call(document.querySelectorAll(s + ', ' + s + ' *'), e => { if (!e.getClientRects().length) return; const f = parseFloat(getComputedStyle(e).fontSize); if (f < 12) bad.push(s + ' > ' + e.tagName.toLowerCase() + '.' + e.className + ' ' + f); }); }); return bad; }, sels);

  // ---- 1. Habits on TODAY, not under Goals ----
  ok(await vis('.p.habp') && await ev(() => document.querySelector('.p.habp').dataset.tab === 'today'), 'Habits section renders on TODAY');
  ok(await txt('.p.habp h2') === 'Habits' && !(await has('#info-habits')) && !(await has('.p.habp .info')), 'titled Habits, no ⓘ');
  ok(await ev(() => [].map.call(document.querySelectorAll('.p.habp .hab h3'), x => x.textContent).join(',')) === 'PT,COMMS', 'one block per habit goal (PT, COMMS)');
  ok(await has('#h-pt-3') && await has('#h-comms-3') && await ev(() => document.querySelectorAll('.p.habp .tel').length === 2), 'tel rows keep their ids inside Habits');
  ok((await h('#h-pt-3')) >= hit, 'tel button height ' + Math.round(await h('#h-pt-3')) + 'px (>= ' + hit + ')');
  ok(await ev(() => document.querySelectorAll('.p.stat .tel, .p.stat .pace').length === 0) && await ev(() => document.querySelectorAll('.p.stat .light').length === 6), 'Goals keeps the lights, no tel rows or pace lines');
  ok(/1\/3/.test(await txt('.p.habp .hab:first-child .pace')), 'pace line shows count/goal: ' + (await txt('.p.habp .hab:first-child .pace')));
  await click('#h-pt-3'); await page.waitForTimeout(800);   // the button pops first, the pace line follows the delayed render
  ok(await ev(() => document.getElementById('h-pt-3').getAttribute('aria-pressed') === 'true') && /2\/3/.test(await txt('.p.habp .hab:first-child .pace')), 'tapping today marks the habit and updates the pace');
  if (phone) {
    const before = await ev(() => { const p = document.querySelector('.p.plan'), hb = document.querySelector('.p.habp'), pr = document.querySelector('.p.prop'); return [p.getBoundingClientRect().bottom <= hb.getBoundingClientRect().top + 1, hb.getBoundingClientRect().bottom <= pr.getBoundingClientRect().top + 1]; });
    ok(before[0] && before[1], 'phone order: Today, Habits, Suggested');
  } else {
    ok(await ev(() => { const a = document.querySelector('.col.a'); return a.children[0].classList.contains('plan') && a.children[1].classList.contains('habp'); }), 'desktop: Habits sits under Today in column a');
  }

  // ---- 2. log chips on the day plan ----
  ok(await has('#hearly') && /NOT LOGGED/i.test(await txt('#hearly')) && await ev(() => document.getElementById('hearly').getAttribute('aria-expanded') === 'true'), 'EARLIER auto-expanded (2 unlogged hours since noon), reads: ' + (await txt('#hearly')));
  ok(await has('#hlog-3') && (await txt('#hlog-3')) === 'SC' && /\bgoal\b/.test(await cls('#hlog-3')), '09:00 chip shows the logged category (SC, goal)');
  ok(await has('#hlog-1') && (await txt('#hlog-1')) === 'ZZ' && /\bsleep\b/.test(await cls('#hlog-1')) && await has('#hlog-2') && (await txt('#hlog-2')) === 'ES', 'collapsed free run 07–09 shows one chip per hour');
  ok((await txt('#hlog-6')) === 'LOG' && /\bmiss\b/.test(await cls('#hlog-6')), '12:00 past and unlogged: dashed LOG chip');
  ok((await txt('#hlog-7')) === 'LOG' && await ev(() => document.getElementById('hlog-7').closest('.hrw') === document.getElementById('hlog-6').closest('.hrw')), '13:00 (swallowed by the 12:30 class) still gets a chip, on the class row');
  ok((await txt('#hlog-8')) === 'LOG' && /\bnow\b/.test(await cls('#hlog-8')) && !(await has('#hlog-9')), 'current hour gets a dim chip, future hours none');
  ok((await h('#hlog-6')) >= hit, 'chip hit area ' + Math.round(await h('#hlog-6')) + 'px');
  ok(!(await has('#golog')) && !(await has('.lognudge')) && !(await has('.hpb.lg')), 'no NOT LOGGED · LOG nudge any more');
  await click('#hearly');
  ok(/EARLIER/i.test(await txt('#hearly')) && /NOT LOGGED/i.test(await txt('#hearly')) && !(await has('#hlog-6')), 'collapsed: ' + (await txt('#hearly')));
  await click('#hearly');
  ok(await has('#hlog-6'), 'expanded again');

  // tapping a chip opens the brush strip under its row
  await click('#hlog-6');
  ok(await vis('#hstrip') && await ev(() => document.getElementById('hstrip').previousElementSibling === document.getElementById('hlog-6').closest('.hrw')), 'strip opens directly under the 12:00 row');
  ok(await has('#hb-a') && await has('#hb-x') && await has('#hb-uA') && await has('#hb-clear'), 'strip has every category incl. the custom one, and CLEAR');
  ok(await ev(() => document.getElementById('hb-clear').disabled), 'CLEAR disabled while the hour is unlogged');
  ok((await h('#hb-a')) >= hit && (await h('#hb-clear')) >= hit, 'brush height ' + Math.round(await h('#hb-a')) + 'px');
  await page.screenshot({ path: path.join(shot_dir, 'ux-strip-' + vp.width + '.png'), fullPage: true });
  await click('#hb-a');
  ok((await logToday()) === 'zzeaaaa...............', 'picking SCHOOL writes a into S.log[today]: ' + (await logToday()));
  ok((await txt('#hlog-6')) === 'SC' && /\bgoal\b/.test(await cls('#hlog-6')), '12:00 chip now reads SC');
  ok(await vis('#hstrip') && await ev(() => document.getElementById('hb-a').dataset.i === '7') && /open/.test(await cls('#hlog-7')), 'strip advanced to 13:00, the next unlogged past hour');
  await click('#hb-x');
  ok((await logToday()) === 'zzeaaaax..............' && (await txt('#hlog-7')) === 'RO' && /\brot\b/.test(await cls('#hlog-7')), 'ROT logged on 13:00');
  ok(!(await has('#hstrip')), 'strip closes: the next hour is the current one');
  ok(!/NOT LOGGED/i.test(await txt('#hearly')), 'EARLIER no longer flags unlogged hours: ' + (await txt('#hearly')));
  await click('#hlog-7');
  ok(await vis('#hstrip') && !(await ev(() => document.getElementById('hb-clear').disabled)) && await ev(() => document.getElementById('hb-x').getAttribute('aria-pressed') === 'true'), 'reopening shows the logged brush pressed, CLEAR enabled');
  await click('#hb-clear');
  ok((await logToday()) === 'zzeaaaa...............' && (await txt('#hlog-7')) === 'LOG' && !(await has('#hstrip')), 'CLEAR unlogs the hour');
  await click('#hlog-7'); await click('#hlog-7');
  ok(!(await has('#hstrip')), 'tapping the chip again closes the strip');
  // the time log on STATS shows the same hours
  ok(await ev(() => document.getElementById('hc-6').textContent === 'SC' && document.getElementById('hc-7').textContent === ''), 'STATS time log reflects the chips');

  // ---- 3. Tell Claude bar (desktop) ----
  if (!phone) {
    ok(await vis('#tc-bin') && !(await has('.tcbar .tc-last')), 'desktop: input row only on first paint, no .tc-last');
    ok((await h('#tc-bin')) >= 44, 'input row height ' + Math.round(await h('#tc-bin')));
  } else {
    ok(!(await vis('.tcbar')), 'phone: no desktop bar');
  }

  // ---- 4. fewer ⓘ ----
  for (const id of ['now', 'status', 'shutdown', 'capcom', 'objectives', 'upcoming', 'track', 'add', 'habits']) ok(!(await has('#info-' + id)), 'no #info-' + id);
  for (const id of ['plan', 'proposed', 'stats', 'timelog', 'tell', 'tasks']) ok(await has('#info-' + id), '#info-' + id + ' kept');
  ok(/Sunday plan/.test(await ev(() => { const S0 = document.querySelector('.p.objp'); return S0 ? S0.textContent : ''; })) || await ev(() => document.querySelectorAll('.p.objp .row').length > 0), 'This week explains itself in the empty state');

  // ---- 5. 12px floor over the new elements ----
  const bad = await floor(['.p.habp', '.hlog', '.hstrip', '#hearly', '.tcbar', '.p.capp .capn', '.hrw .hh']);
  ok(bad.length === 0, '12px floor: ' + (bad.length ? bad.join(' | ') : 'all >= 12px'));

  await page.screenshot({ path: path.join(shot_dir, 'ux-today-' + vp.width + '.png'), fullPage: true });
  await ctx.close(); await browser.close();
  if (errors.length) { fails++; console.error('  PAGE ERRORS:\n  ' + errors.join('\n  ')); }
}
(async () => {
  await run({ width: 390, height: 844 });
  await run({ width: 1440, height: 900 });
  if (fails) { console.error(fails + ' failure(s)'); process.exit(1); }
  console.log('OK, ux tests pass');
})();
