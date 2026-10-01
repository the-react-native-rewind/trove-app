<p align="center">
  <img src="assets/images/logo.png" width="112" alt="Trove logo: three overlapping circles in sage, honey, and terracotta" />
</p>

<h1 align="center">Trove</h1>

<p align="center"><strong>Everything that's yours, from every group.</strong><br />
Shared lists for the groups you belong to, and one personal view of the work that is actually yours.</p>

---

Most of us don't belong to one team. We belong to a household, a garden crew, a choir, a side project, a volunteer group. The work is scattered across those group spaces, and no tool shows everything that is yours in one place. Trove is built for that.

Make a space for each group. Everyone in the group sees the whole shared list. Mine gathers the tasks assigned to you from every group you have joined, so the same person, in the same groups, still has their own pile.

Get it out of the group chat, and onto a list you can actually see.

## What you get

- **A space for every group.** Home, garden, choir, crew, team. Each with its own accent colour, members, and roles (owner, admin, member, viewer).
- **Mine, across every group.** The Mine view is every task assigned to you, from every space you have joined. A group's own board stays the full shared list.
- **A board that fits the screen.** Kanban columns with drag and drop on desktop and web, a calm single column with swipe gestures on your phone. Same code, same data.
- **Invites that just work.** Invite by email, share a link, they land in the right space with the right role. Free, no per-person cost.
- **Real-life tasks.** Notes, priority, due dates, assignees, and photos or videos on any task.
- **A private space that stays private.** Every account starts with a Personal space. Nobody sees it until you invite someone. That is not a setting, it is the security model.
- **Confetti.** Finish something, get confetti. Small joys matter.

## The one rule

Trove's visibility is not a UI filter. It is one rule, enforced by the database:

> You can see or change a task only if you are a member of its space.

That rule is a Postgres Row Level Security policy (see [`supabase/migrations`](supabase/migrations)), so it holds for every query the app can possibly make, on every platform. Membership is the boundary. Mine is an extra filter on top of that: tasks where you are the assignee. It does not hide other people's tasks on a group board you belong to.

## Built with

One TypeScript codebase, three platforms (iOS, Android, web):

- [Expo](https://expo.dev) SDK 56 / React Native 0.85, with Expo Router for file-based navigation
- [Supabase](https://supabase.com): Postgres, Auth, Row Level Security, Storage
- [TanStack Query](https://tanstack.com/query) for data and mutations
- Reanimated + Gesture Handler for the drag, swipe, and splash animations
- [react-native-fast-confetti](https://github.com/AlirezaHadjar/react-native-fast-confetti) (Skia) on native, canvas-confetti on web
- Fraunces + Hanken Grotesk, and a warm hand-rolled design system
- EAS for builds and deployment

## Run it locally

You'll need Node 20+ and a [Supabase](https://supabase.com) project. Apply the SQL in [`supabase/migrations`](supabase/migrations) in filename order, then set the Auth redirects described in [`supabase/README.md`](supabase/README.md). `supabase/seed.sql` is local demo data only.

Create a `.env` in the project root:

```
EXPO_PUBLIC_SUPABASE_URL=your-project-url
EXPO_PUBLIC_SUPABASE_ANON_KEY=your-publishable-key
```

Then:

```bash
npm install
npx expo start --web     # web, at localhost:8081
npx expo run:ios         # iOS simulator (dev build; Expo Go won't cover the native modules)
```

## Contributing

Issues and pull requests are welcome. Keep the tone of the product in mind: warm, plain, human. If you're proposing a feature, open an issue first so we can talk it through. Run `npm test` and `npm run typecheck` before pushing.

Store listing copy, the Mac distribution note, and a privacy policy draft live in [`store/`](store/).

## License

[AGPL-3.0](LICENSE). You can use, study, and modify Trove freely; if you host a modified version for others, you share your changes under the same license.

---

<p align="center">Built in the open by <a href="https://github.com/the-react-native-rewind">The React Native Rewind</a>.</p>
