// Synthetic state for tests. No real names or data. Clock in tests: Thu 2026-10-29 14:30 Eastern.
module.exports = function fixture() {
  return {
    v: 2, updated: '2026-10-29T07:18',
    today: { date: '2026-10-29', items: [
      { id: 'd1', t: 'Draft mission profile section 2', d: 'Write the mission profile. Done = 2 pages in the shared doc.', s: '09:00', e: '10:00', g: 'acad', m: 60, done: true, task: 'e1' },
      { id: 'd2', t: 'Call clinic', d: 'Call about the appointment.', s: '15:00', e: '15:15', g: 'pt', m: 15, done: false }
    ], memo: '' },
    week: { label: 'WK 44', range: 'OCT 26 – NOV 01', items: [
      { id: 'w1', t: 'Mission profile submitted', g: 'acad', done: false, d: '' },
      { id: 'w2', t: 'Table prep finished', g: 'launch', done: false, d: '' } ] },
    dates: [
      { d: '2026-11-02', t: 'Oral exam', g: 'acad', hard: true },
      { d: '2026-11-04', t: 'Mission profile due', g: 'acad', hard: true },
      { d: '2026-11-22', t: 'Launch', g: 'launch', hard: true } ],
    goals: [
      { id: 'career', call: 'CAREER', name: 'Land a job offer', tgt: 'Offer before May', st: 'go', next: 'Send two follow-ups.', cue: '' },
      { id: 'launch', call: 'LAUNCH', name: 'Launch the app', tgt: 'Live Nov 22', st: 'hold', next: 'Map the countdown.', cue: '' },
      { id: 'acad', call: 'ACADEMICS', name: 'Finish fall strong', tgt: 'Graduate May', st: 'go', next: 'Mission profile.', cue: '' },
      { id: 'pt', call: 'PT', name: 'Back in the gym', tgt: '3 a week', st: 'hold', next: '', cue: '' },
      { id: 'comms', call: 'COMMS', name: 'Less phone', tgt: 'Down by 11', st: 'hold', next: '', cue: '' },
      { id: 'home', call: 'HOME', name: 'Family time', tgt: 'Every 2 weeks', st: 'hold', next: '', cue: '' } ],
    habits: { weekStart: '2026-10-26', since: '2026-10-28', pt: [false, true, false, false, false, false, false], comms: [true, false, false, false, false, false, false], prev: null },
    inbox: [], debrief: null, bumped: [], dropped: [],
    proposals: [
      { id: 'q1', t: 'Sizing: first pass', d: 'Rough sizing numbers.', g: 'acad', m: 60, date: '2026-10-30', s: '14:00', e: '15:00', why: 'Free after class, before the weekend.', task: 'e2' },
      { id: 'q2', t: 'Follow up with recruiter A', d: 'One short message.', g: 'career', m: 15, date: '2026-10-31', s: '10:00', e: '10:15', why: 'Quiet Saturday morning.', task: 'j1' } ],
    planned: [
      { id: 'p1', t: 'Prep table demo', d: 'Phone + mirror screen.', g: 'launch', m: 45, date: '2026-11-02', s: '17:00', e: '17:45', task: 's2a' } ],
    history: [
      { date: '2026-10-28', planned: 3, done: 2, loadMin: 150, doneMin: 90, energy: 3, pt: false, comms: true, mins: { career: 120, launch: 60, acad: 180, pt: 0, comms: 0, home: 0 } } ],
    settings: { capWeekday: 360, capWeekend: 180, rotBudget: 90, tgtH: { career: 6, launch: 12, acad: 15, pt: 3, home: 2 }, cats: [{ k: 'A', n: 'HYPERSONICS', ab: 'HY', p: 'a' }] },
    projects: [
      { id: 'spotter', name: 'App launch', g: 'launch' },
      { id: 'jobs', name: 'Job search', g: 'career' },
      { id: 'enae481', name: 'Design course', g: 'acad' },
      { id: 'classes', name: 'Classes', g: 'acad' },
      { id: 'life', name: 'Life admin', g: '' } ],
    tasks: [
      { id: 'j1', t: 'Follow up with recruiter A', d: '', proj: 'jobs', parent: '', g: 'career', due: '', m: 15, status: 'open', created: '2026-10-28', doneOn: '', urg: 'week' },
      { id: 'j2', t: 'Apply to role B', d: '', proj: 'jobs', parent: '', g: 'career', due: '', m: 60, status: 'open', created: '2026-10-28', doneOn: '', urg: 'later' },
      { id: 's2', t: 'Prep table (Nov 3)', d: '', proj: 'spotter', parent: '', g: 'launch', due: '2026-11-03', m: 0, status: 'open', created: '2026-10-28', doneOn: '', urg: 'week' },
      { id: 's2a', t: 'Demo phone + mirror screen', d: '', proj: 'spotter', parent: 's2', g: 'launch', due: '', m: 45, status: 'open', created: '2026-10-28', doneOn: '' },
      { id: 's2b', t: 'Banner and sign', d: '', proj: 'spotter', parent: 's2', g: 'launch', due: '', m: 30, status: 'open', created: '2026-10-28', doneOn: '' },
      { id: 'e1', t: 'Mission profile', d: '', proj: 'enae481', parent: '', g: 'acad', due: '2026-11-04', m: 240, status: 'open', created: '2026-10-28', doneOn: '', urg: 'now' },
      { id: 'e2', t: 'Sizing', d: '', proj: 'enae481', parent: '', g: 'acad', due: '2026-11-18', m: 240, status: 'open', created: '2026-10-28', doneOn: '' },
      { id: 'c1', t: 'Oral exam prep', d: '', proj: 'classes', parent: '', g: 'acad', due: '2026-11-02', m: 90, status: 'open', created: '2026-10-28', doneOn: '' },
      { id: 'l1', t: 'Test aquarium water', d: '', proj: 'life', parent: '', g: '', due: '2026-11-14', m: 20, status: 'open', created: '2026-10-28', doneOn: '' },
      { id: 'l2', t: 'Pick printer stand', d: '', proj: 'life', parent: '', g: '', due: '', m: 30, status: 'done', created: '2026-10-28', doneOn: '2026-10-28' } ],
    cal: { fetched: '2026-10-29T07:15', events: [
      { id: 'c1', t: 'Propulsion', start: '2026-10-29T12:30', end: '2026-10-29T13:45', allDay: false, loc: '' },
      { id: 'c2', t: 'Aircraft Dynamics', start: '2026-10-29T15:30', end: '2026-10-29T16:45', allDay: false, loc: '' },
      { id: 'c3', t: 'Startup meeting', start: '2026-10-29T19:00', end: '2026-10-29T21:00', allDay: false, loc: '' },
      { id: 'c4', t: 'Hypersonics', start: '2026-10-30T10:00', end: '2026-10-30T11:00', allDay: false, loc: '' },
      { id: 'c5', t: 'Vibes', start: '2026-10-30T11:00', end: '2026-10-30T11:45', allDay: false, loc: '' },
      { id: 'c6', t: 'Aircraft Design', start: '2026-10-30T12:00', end: '2026-10-30T12:50', allDay: false, loc: '' },
      { id: 'c7', t: 'Hypersonics', start: '2026-11-02T10:00', end: '2026-11-02T11:00', allDay: false, loc: '' },
      { id: 'c8', t: 'Oral exam', start: '2026-11-02T15:00', end: '2026-11-02T15:30', allDay: false, loc: 'Room 1' },
      { id: 'c9', t: 'Career fair', start: '2026-10-30', end: '2026-10-31', allDay: true, loc: '' } ] },
    lognote: { '2026-10-29': { '3': 'profile writing' } },
    log: { '2026-10-28': 'zzeaaAAcceeellrrxxzzzz', '2026-10-29': 'zzeaaaee..............' },
    runs: [ { at: '2026-10-28T07:19', k: 'morning', ok: true, fail: [] }, { at: '2026-10-29T07:18', k: 'morning', ok: false, fail: ['brain doc'] } ]
  };
};
// Helper for tests: load the page with this state injected and a fixed clock.
module.exports.load = async function (page, pagePath, state, when) {
  const fs = require('fs');
  let html = fs.readFileSync(pagePath, 'utf8');
  html = html.replace(/(<script type="application\/json" id="state">).*?(<\/script>)/s, function (_, a, b) { return a + JSON.stringify(state) + b; });
  await page.clock.install({ time: new Date(when || '2026-10-29T14:30:00-04:00') });
  await page.setContent(html, { waitUntil: 'load' });
  await page.waitForTimeout(600);
};
