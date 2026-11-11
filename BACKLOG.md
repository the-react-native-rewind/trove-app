# Trove — working backlog

A running notepad of everything requested in this session. Updated as items land.
Legend: ✅ done & verified · 🔧 in progress · ⬜ not started

---

## ✅ Done & verified (uncommitted on `main`)

- ✅ Today: thin day-stepper bar (‹ date ›), step through days, add to any day
- ✅ Today: relative labels — **Today / Yesterday / Tomorrow**, else the date
- ✅ Today: day-change animations — list rows fade-stack in; date animates letter-by-letter
- ✅ Today: line menu redesign — Edit, Repeat, Convert to action, Send to tomorrow, Drop (each with description); no duplicate Delete
- ✅ Today: progress line ("X of Y done") replacing the cryptic "0" momentum badge
- ✅ Insights screen (chart icon in header) with: completion hero, "Where you finish" (by circle), per-routine chart
- ✅ Insights: 7 days / 30 days / All time range toggle
- ✅ Insights: hide deleted (inactive) routines + merge same-named ones
- ✅ Insights: everything animates in on open
- ✅ Insights: centered title + collapsing header
- ✅ Translucent status bar — content ghosts through it (Today + Insights)
- ✅ Header fix — header background extends past the status bar and fully hides on scroll (fixes all collapsing-header pages)
- ✅ Composer: more indentation; gray "+" button instead of the green "Action" tick
- ✅ Drawer Account row shows the profile photo when set
- ✅ Add-action sheet: circle name stacked below the (untruncated) title; ordered like the Mine tab (priority first)
- ✅ Action details: removed the "On today / Tomorrow / Not today" block
- ✅ Add-action sheet: title + search pinned; only the list scrolls, with a fade between
- ✅ Drag the Today list to dismiss the keyboard (partial: tap-on-empty-space still TODO)
- ✅ Removed the My Week feature entirely; Beta section kept with "No new beta features"
- ✅ Splash: circles hold as the logo, then fly apart and fade to reveal the page
- ✅ Confetti when completing an action on Today (plain lines get none)
- ✅ Faster splash; circles expand to ~3.6x as they fly out
- ✅ Today pull-to-refresh now returns server truth (cleared a stuck optimistic-edit guard); Mine/circle/projects lists already had working refresh

---

## ⬜ Not started

- ⬜ **Mine page header redesign** (take a cue from Circles). Remove the "To do / Done" toggle. Put a **filter** icon on the left and a **settings** icon on the right. The settings icon opens a bottom sheet containing a "Completed actions" button.
- ⬜ **Mine / actions sort:** sort by most-recently-completed, newest at the top.
- ⬜ **Projects page — per project:** a progress bar + "X of Y tasks complete"; show who's involved / assigned; remove the filter option on the projects page.
- ⬜ **Actions page:** between the priority color circle and the status ("in progress"), show a tag with the project the action belongs to (when it belongs to one).
- ⬜ **Composer keyboard dismiss:** tapping on truly empty space should also dismiss (drag-to-dismiss already done).
- ⬜ **Pull-to-refresh — remaining:** wide-screen Kanban board and the Completed-actions screen still lack pull-to-refresh (phone lists done).

---

## Notes

- Everything above (the ✅ items) is implemented but **uncommitted on `main`** — recommend committing to a feature branch before the backlog grows further.
- Argent MCP update v0.7.1 → v0.32.0 available (only if you want it).
</content>
