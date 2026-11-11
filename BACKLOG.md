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

---

## ⬜ Not started

- ⬜ **Remove the My Week feature entirely.** Keep the "Beta features" section, but with no features in it (e.g. "No new beta features"). Touches: MyWeekView, weekPlans data, the drawer, the task-detail My Week section, the settings toggle.
- ⬜ **Splash screen animation.** Open with the three circles static in the middle, then expand them in different directions to "fold open" / reveal the page.
- ⬜ **Mine page header redesign** (take a cue from Circles). Remove the "To do / Done" toggle. Put a **filter** icon on the left and a **settings** icon on the right. The settings icon opens a bottom sheet containing a "Completed actions" button.
- ⬜ **Mine / actions sort:** sort by most-recently-completed, newest at the top.
- ⬜ **Projects page — per project:** a progress bar + "X of Y tasks complete"; show who's involved / assigned; remove the filter option on the projects page.
- ⬜ **Actions page:** between the priority color circle and the status ("in progress"), show a tag with the project the action belongs to (when it belongs to one).
- ⬜ **Today completion confetti:** when you complete an **action** (a task) on Today, play a confetti animation. A plain line gets no confetti.
- ⬜ **Composer keyboard dismiss:** when the "Add a line, or @ an action" input is focused, tapping outside should dismiss the keyboard / unfocus the input (currently you can't).

---

## Notes

- Everything above (the ✅ items) is implemented but **uncommitted on `main`** — recommend committing to a feature branch before the backlog grows further.
- Argent MCP update v0.7.1 → v0.32.0 available (only if you want it).
</content>
