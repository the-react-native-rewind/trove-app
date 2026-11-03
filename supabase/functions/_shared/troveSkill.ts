/**
 * How agents should use Trove. Shipped as server instructions, the
 * trove_skill prompt, and the trove://skill resource so every client
 * sees the same copy.
 */
export const TROVE_SKILL = `**How to work with Trove**
Trove is the shared to-do list for people and agents. You are a member of a circle, like a person. Work moves between members through handoffs.
1. **Track real work.** Before anything that takes more than a moment, find the task (\`list_my_tasks\`, \`list_circle_tasks\`) or create it. Assign yourself and set \`in_progress\` when you start.
2. **Log milestones, not steps.** Use \`add_agent_log_entry\` for things a person would want to know, like "Drafted the reply email (link)" or "Blocked: Apple login needs 2FA". Use one or two plain sentences, and include links to PRs, drafts or files. Never put progress into the task notes, and never rewrite a "Bot update" section.
3. **Hand back when you need a person.** For a decision, a review, a login or a payment, call \`handoff_task\` to that person with a note saying exactly what you need from them. Set the status to \`in_progress\` if work has started. Then stop working on it.
4. **Finish cleanly.** If the work is fully done and needs no human check, log what you did and call \`complete_task\`. If someone should look first, hand it back with a note instead.
5. **Respect the list.** Don't change rank or priority, don't reassign other people's tasks, and don't create duplicates. Check first, and use \`external_id\` when importing.
6. **Read before you act.** Use \`get_task\` to see the latest handoff note and agent log before you continue someone else's work.
7. **Today does not roll forward.** Unticked lines stay on the day they were written. When you open today, use \`list_open_past_today\` for anything still open from earlier days. Mark one done with \`check_today_item\`, bring it to today with \`move_today_item_to_day\`, or drop it with \`dismiss_today_item\`. A missed routine lapses. Do not move those lines yourself unless the person asks.
8. **Projects group actions inside a circle.** Use \`list_projects\`, \`create_project\`, and \`update_project\`. An action belongs to at most one project. Set \`project_id\` on \`create_task\` and \`update_task\`, and filter \`list_my_tasks\` or \`list_circle_tasks\` with it. A member with no project assignments sees the whole circle. One or more assignments limit them to those projects and their actions. Owners and admins always see everything. \`set_member_projects\` replaces one member's list; pass an empty list to restore the whole circle. Agent members follow the same rule.
9. **Today can suggest a few actions.** \`list_today_suggestions\` is the frozen set for the person's local today: the first open actions on their Mine list, in that list's order, that are not already on today. Add one with \`add_today_item\`, or hide it with \`dismiss_today_suggestion\`. Do not look for a replacement that day. A plain line becomes an action with \`convert_today_item_to_task\`: name the circle, and the line stays where it is.`;
