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
- ✅ Mine header redesign: dropped the To do/Done toggle; filter icon left, settings gear right; gear opens a sheet with "Completed actions"
- ✅ Mine Completed-actions screen, sorted by most-recently-completed
- ✅ Action cards show a project tag (between the priority dot and the status) when linked to a project
- ✅ Projects page: per-project progress bar + "X of Y done" + assignee avatars; filter removed on the projects tab
- ✅ Mine filter + settings icons moved to the top-right header
- ✅ Tapping the Today list dismisses the composer keyboard (drag already did)

---

## ⬜ Not started

- ⬜ **Pull-to-refresh — remaining:** wide-screen Kanban board and the Completed-actions screen still lack pull-to-refresh (phone lists done).
- ⬜ **Circle analytics.** A Circle's Settings gets an "Analytics" option opening a breakdown screen (inspired by Today's Insights): who completed what, open vs completed counts, circle size (members), how much work is done. First pass — refine what's useful.

---

## Notes

- Everything above (the ✅ items) is implemented but **uncommitted on `main`** — recommend committing to a feature branch before the backlog grows further.
- Argent MCP update v0.7.1 → v0.32.0 available (only if you want it).
</content>
