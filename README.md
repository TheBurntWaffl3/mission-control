# Mission Control

Kevin's daily manager page. One self-contained HTML file, ES5 JavaScript only, published as a
claude.ai artifact. This folder is the source of truth for the **code**; the live artifact is the
source of truth for the **data** (the page saves itself into `<script id="state">` when Kevin taps
things). The committed copy carries an empty state (`{"v":2}`); `strip-state.py` produces it from a
live snapshot. Never commit a page with real state: this repository is public.

## Files

- `mission-control.html` – the page. Sections, top to bottom: CSS (`<style id="css">`), state
  (`<script id="state">`, one line, never hand-edit), main script (`<script id="main">`).
- `strip-state.py IN OUT` – replace the state with `{"v":2}`.
- `tests/smoke.js` – Playwright boot test at 390px and 1440px with a fixed clock
  (`node tests/smoke.js [page.html]`). Must pass before every publish.
- `tests/*.js` – one test per feature, same harness.

## Conventions (read before editing)

- ES5 only: `var`, `function`, no arrow functions, no template literals, no `let`/`const`, no
  classes, no `async`. The page runs inside the artifact runtime on iOS Safari and desktop.
- Everything is rendered from `S` (the state) by `render()`; actions go through `act(a, el)` and
  `data-a` attributes on buttons. After changing `S`, call `markDirty()` (or `queueSave()`) then
  `render()`.
- Design: a plain daily tracker, dark only. The only colors used: white `--ink` values, green
  `--green` complete, magenta `--magenta` happening now, amber `--amber` caution, red `--red`
  warning, cyan `--cyan` pressable controls. Rounded 8px only on tappable things, nothing under
  `.75rem`, hit areas at least 40px (44px on phone). Titles and chips in sentence case; small status
  tags (NOW, LATE, DONE, IN 30M) stay upper-case. Explanations live behind the ⓘ button
  (`infoBtn(key)` + `rInfo`), never inline; only panels whose behaviour is not obvious carry one
  (plan, proposed, stats, time log, tell, tasks, week).
- Naming: the page reads like a normal tracker, so the UI says Today (the hour plan), Suggested
  (slots Claude proposed), This week (weekly objectives), Goals with the lights On track / At risk /
  Off track, Year (the milestone track), Wrap up (the evening debrief), Claude (never CAPCOM), the
  Sync chip (did the 07:15 routine run) and countdowns like "23d 10h to launch" / "2d" / "2d ago".
  The data keys keep their old names (`proposals`, `week.items`, `goals[].st` = `go | hold | nogo`,
  `debrief`, `runs`, `runs[].k`), as do ids, `data-act` names, `data-tab="capcom"` and the INFO keys
  (`plan`, `proposed`), so the routines and the tests stay valid.
- Motion: `render()` rebuilds `#app`, so anything that appears (sheets, scrims, toasts, the brush
  strip) gets `.in` from `render()` only when it was not there before (keyframe plays once), and
  anything that changes is classed on the live DOM first (`doneFx`, `tkDoneFx`, `.just`) with the
  re-render delayed by `renderSoon()` / `act(msg, fn, delay)`. Every animation is under 300ms except
  the suggestion-card collapse; `prefers-reduced-motion` turns all of it off, including the delays.
  A ticked plan item keeps its card on screen for an hour after its end (`hpKeep`) before EARLIER may
  fold it. Tests that tick something wait `800ms` before reading the re-rendered DOM.
- Modules are prefixed: `tk_` tasks, `wc_` week calendar, `tc_` Tell Claude, `st_` stats,
  `hp_` hour plan, `wc_`/`rProps` proposals. Keep new CSS inside the matching CSS comment block.
- TODAY holds the day plan (`rPlan`, titled Today), then Habits (`rHabits`, the 7-day trackers of
  goals with `g.habit`; Goals keeps only the lights). Past hours on the plan carry a log chip (`.hlog`,
  `data-act="hlog"`) that opens an inline brush strip (`.hstrip`, `data-act="hbrush"`) writing into
  `log[today]` through `logCommit`, the same path as the Time log on STATS.
- Phone layout: tabs `today`, `week`, `stats`, `capcom`; the center tab opens Tell Claude.
  Desktop: three columns plus a `data-view` toggle (console, tasks, stats).
- Test with Playwright with a fixed clock (`page.clock.install`). Chromium is preinstalled.

## State schema (v2)

Top level: `v, updated, today, week, dates, goals, habits, inbox, debrief, bumped, dropped,
proposals, planned, history, settings, projects, tasks, cal, lognote, log, runs`.
`normalize()` and `tk_normalize()` repair every field on load; a new field must be added there
with a safe default so that an old state still loads.

- `projects: [{id, name, g}]` – array order is display order. `g` is a goal id or `""`.
- `tasks: [{id, t, d, proj, parent, g, due, m, status, created, doneOn, urg}]` – one level of
  subtasks (`parent`). `urg` is `"now" | "week" | "later"`; when missing, derive `"week"` if
  `due` is within 7 days, else `"later"`.
- `proposals: [{id, t, d, g, m, date, s, e, why, task}]` – slots Claude proposed, awaiting
  Kevin. `planned` has the same shape without `why`: slots Kevin accepted.
- `today.items: [{id, t, d, s, e, lbl, g, m, done, task}]` – as many as fit the day's capacity in
  minutes (`settings.capWeekday` / `capWeekend`, default 360 / 180); there is no count cap.
- `runs: [{at, k, ok, fail}]` – routine run log, newest last, max 14. `at` is
  `YYYY-MM-DDTHH:MM` Eastern, `k` is `"morning" | "sunday"`, `fail` lists failed step names.
- `log: {date: 22-char string}` – one code per hour from 06:00 to 03:00. `settings.cats` holds
  Kevin's own categories.

## Urgency rules (page, Tell Claude and routines all follow these)

- NOW: goes straight onto today's plan; over capacity is shown, not refused.
- THIS WEEK: gets a proposed slot inside the current week (Mon–Sun), placed in free time.
- LATER: stays in Tasks with no slot.
- Sort in Tasks: NOW, then due within 2 days, then THIS WEEK, then by due date, then LATER.

## Routines

Three scheduled tasks run outside the page (morning brief Mon–Sat 7:15, Sunday plan 7:15,
breathing reminder 4x/day). They only change the state JSON, never the page code, and append a
`runs` entry. Their prompts are not in this repository.
