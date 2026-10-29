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
- `tests/*.js` – one test per feature, same harness (`tests/events.js` stubs `window.claude.use('mcp')` with a fake
  Google Calendar server and drives the Tell Claude tools through the page's own `execute` functions, like
  `tests/tellclaude.js`; `tests/move.js` covers ticking, the Move forms and drag, with `page.mouse` on the desktop and
  synthetic touch `PointerEvent`s on the phone).

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
  `hp_` hour plan, `wc_`/`rProps` proposals, `ev_` events, `mv_` moves, `dg_` drag. Keep new CSS inside the
  matching CSS comment block (drag styles live in the "drag" block).
- TODAY holds the day plan (`rPlan`, titled Today), then Habits (`rHabits`, the 7-day trackers of
  goals with `g.habit`; Goals keeps only the lights). Past hours on the plan carry a log chip (`.hlog`,
  `data-act="hlog"`) that opens an inline brush strip (`.hstrip`, `data-act="hbrush"`) writing into
  `log[today]` through `logCommit`, the same path as the Time log on STATS.
- Phone layout: tabs `today`, `week`, `stats`, `capcom`; the center tab opens Tell Claude.
  Desktop: three columns plus a `data-view` toggle (console, tasks, stats).
- Test with Playwright with a fixed clock (`page.clock.install`). Chromium is preinstalled.

## State schema (v2)

Top level: `v, updated, today, week, dates, goals, habits, inbox, debrief, bumped, dropped,
proposals, planned, history, settings, projects, tasks, cal, lognote, log, runs, evdone`.
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
- Items (today, planned) may also carry `kind: "event"` (a fixed block with a set time, drawn like a calendar
  event in ink, never LATE; it has a checkbox like any item), `loc` and `calId` (the Google Calendar event id it
  stands for). `cleanItems` / `cleanSched` keep all three; `set_today_items` keeps them on a kept id.
- `evdone: {"YYYY-MM-DD": ["<calendar event id>", ...]}` – calendar events Kevin ticked that day (ok dates only,
  42 days, strings). It is the only record of a ticked calendar event: the event itself is not an item, so it never
  counts in the done-rate stats (`dayRow`) and ticking it logs no hours.

## Tell Claude tools (`tc_tools()`)

`log_time`, `add_task`, `update_task`, `add_event`, `add_project`, `propose_task`, `set_today_items`,
`set_capacity`, `capture`. All but `add_event` change `S` at once inside the turn's undo envelope.

`add_event {t, date, s, e | m, loc?, d?, g?, prep, prep_t?}` is for anything with a set time (a call, a
meeting, an appointment). It writes nothing: it computes the conflicts (everything overlapping the event
slot and the prep slot among today's timed items, planned items, pending proposals and calendar events),
suggests a new slot for each one by the scheduler's rules (first free start after the event, else before it,
else the next day with room; 08:00–22:30, not past, no overlap, within capacity), stores the request in
`ui.ev`, and returns `{status: "awaiting_confirmation", slot, prep, conflicts: [{what, suggest}]}` so
Claude tells Kevin it is waiting on the page. The **Add to calendar?** card (`ev_card`, top of TODAY,
`#ev-card`) asks for one choice per conflict (Move to the suggestion or a typed time, Drop, Keep both; a
calendar event offers Move and Keep both) and only **Add to calendar** (`ev_commit`) changes state: the
choices are applied, the event (`kind: "event"`) and its prep block become today items (or `planned` for a
later date) in one undo envelope, then the page writes both to Google Calendar through the mcp capability
and links them by `calId` (a moved calendar event is an `update_event`). If the calendar refuses, the items
stay on the plan and a toast says why. **Undo restores the plan only; it never deletes a calendar event.**
An item with a `calId` (or one matching a calendar event by day, start and title, which `normalize()` links)
hides the calendar copy everywhere (`wc_src` → `ev_dedupe`), so nothing shows twice.

## Ticking, moving and dragging (`evdone`, `mv_`, `dg_`)

- **Tick a calendar event.** Every timed calendar event card on Today (`hpCard`, `x.k==='ev'`, not free, not all-day)
  has the same animated checkbox as an item (`evck`, `data-act="evtick"`, `data-id`, `data-ds`); the change handler
  writes `S.evdone[ds]` and plays `doneFx` (green check, `.stk` strike, DONE tag) before the delayed re-render. The week
  agenda rows and grid blocks show the done state (green edge, strike, DONE), and the event sheet (`wc_sheet`) has an
  Attended / Not attended toggle (`#wc-ev-done`, same action). `tc_prompt` adds a `CALENDAR TODAY` line with
  `(attended)` after each ticked event. Event items (`kind: "event"`) tick like any item through `done`.
- **Move from a sheet.** The today item detail's `time-f` form has DAY (`#dt-d`, min today), START, END and a Move
  button: the same day sets `s`/`e`; a later day sends the item to `S.planned` for that date (`mv_out`: id, t, d, g,
  task, kind, calId and loc kept; `s`/`e` as given or empty with `m`), toast "Moved to FRI, OCT 30 16:00" with UNDO.
  TOMORROW (`tomorrow`) does the same for a timed item (same time tomorrow); an untimed item is still bumped into
  `S.bumped`. The planned detail's `pmove-f` is unchanged. The calendar event sheet has a Move form (`#wc-mv-f`:
  `#wc-mv-d`, `#wc-mv-s`, `#wc-mv-go`, duration kept) and Postpone to tomorrow (`#wc-mv-tmrw`); both call
  `update_event` (`mv_sheetGo` → `mv_calWrite`), the button reads "Moving…" meanwhile, and on success the page's copies
  of the event (`WC.live.events` and `S.cal.events`, `mv_calApply`) take the new times at once; a refusal toasts
  "Not moved: " + `wc_why` and changes nothing. While typing, an amber one-line note under the form (`#wc-mv-n`,
  `mv_overlap` over `tc_blocks(ds)` minus the event itself; `tc_blocks` rows carry the id as their 5th field) says
  "Overlaps X 15:30–16:45"; the move is still allowed. A calId-linked item moved from its sheet (or by drag) also
  sends `update_event` after the local move and the toast says "… on your plan, not on Google Calendar: …" when that
  fails, like `ev_write`.
- **Drag to move** (`dg_`, pointer events). Sources: Today cards (`.hcard.it`, `.hcard.evi`, `.hcard.pl`, and
  `.hcard.ev` that is not free or all-day), week grid blocks (`.wc-b` of kind task/today/proposal/event) and, on the
  phone, week agenda rows (`.wc-r`). Touch or pen: a 300 ms press-and-hold lifts the card (a move of more than 8 px
  before that cancels the hold, so scrolling keeps working; cards have `touch-action: pan-y` and the page blocks
  `touchmove` only once lifted); mouse: 6 px of movement. The lifted element (`.dragging`: scale 1.02, shadow,
  opacity .9) follows the pointer through an inline transform; the target under the pointer gets `.dropok` (cyan) or
  `.dropno`: an hour row `.hrw` (`data-h` = the row's start minute, a free run `data-h`..`data-h2`) lands the thing
  at the first free 15-minute start inside that hour with its duration kept (overlap is soft and named in the toast),
  else "No room at HH:00"; a grid column `.wc-col` (`data-ds`) maps the lifted block's top edge to minutes through
  `WC_PX` from `.wc-gb[data-h0]`, snapped to 15 and kept inside 06:00–23:30, with a dashed `.dg-slot` outline and a
  live "FRI 16:15–17:00" label; an agenda day `.wc-day` (`data-ds`, its `.wc-dh` lights) takes the same start, or
  the first free start after it. Releasing outside any target, or on the same slot, snaps back; nothing renders
  mid-move (`safeRender` waits while `DG.on`), and the click that follows a real drag is swallowed. No drag starts
  from a checkbox, a log chip or a button that is not the card. Items move inside one `act()` (UNDO in the toast);
  calendar events go through `update_event` and a refusal puts the event back. `prefers-reduced-motion` removes the
  lift animation only.
- **Calendar moves are not undoable.** UNDO restores the plan only; a moved Google Calendar event stays moved, and the
  page never deletes a calendar event.

## Google Calendar (mcp capability)

The page declares nothing itself; it is published with
`capabilities: {artifact: {}, sample: {}, mcp: {servers: [{server: "Google Calendar", tools: ["list_events",
"create_event", "update_event"]}]}}`. `list_events` feeds the live week calendar (`wc_live`), `create_event`
is used only by the Add to calendar card, `update_event` by the card, the event sheet's Move / Postpone and drag
(`mv_calWrite`). Times are ISO local without an offset
(`2026-10-29T15:00:00`). The shape of `create_event`'s result is not documented, so the id is read
defensively (`payload.id`, `payload.eventId`, `payload.event.id`), with a `list_events` lookup by start and
title as the fallback.

## Urgency rules (page, Tell Claude and routines all follow these)

- NOW: goes straight onto today's plan; over capacity is shown, not refused.
- THIS WEEK: gets a proposed slot inside the current week (Mon–Sun), placed in free time.
- LATER: stays in Tasks with no slot.
- Sort in Tasks: NOW, then due within 2 days, then THIS WEEK, then by due date, then LATER.

## Routines

Three scheduled tasks run outside the page (morning brief Mon–Sat 7:15, Sunday plan 7:15,
breathing reminder 4x/day). They only change the state JSON, never the page code, and append a
`runs` entry. Their prompts are not in this repository.
