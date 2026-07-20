<p align="center">
  <img src="assets/images/logo.png" width="112" alt="Trove logo: three overlapping circles in sage, honey, and terracotta" />
</p>

<h1 align="center">Trove</h1>

<p align="center"><strong>Cross-community collaboration.</strong><br />
One shared board for every group in your life. Everyone sees only their part, so no one carries the whole list.</p>

---

Most of us don't belong to one team. We belong to a household, a garden crew, a choir, a side project, a volunteer group, and somehow one person ends up holding the list for all of them. Trove is built for exactly that person.

Make a space for each group. Invite the people who belong in it. Each person opens Trove and sees just their part: their home chores next to their rehearsal logistics next to their project tasks, and nothing that isn't theirs. The mental load stops living in one head and starts living on the board.

Get it out of your head, and onto everyone's plate.

## What you get

- **A space for every group.** Home, garden, choir, crew, team. Each with its own accent colour, members, and roles (owner, admin, member, viewer).
- **Your part, all in one place.** The "All tasks" view gathers every space you belong to into one adaptive backlog. Two people in the same spaces see two different boards, by design.
- **A board that fits the screen.** Kanban columns with drag and drop on desktop and web, a calm single column with swipe gestures on your phone. Same code, same data.
- **Invites that just work.** Invite by email, share a link, they land in the right space with the right role. Free, no per-person cost.
- **Real-life tasks.** Notes, priority, due dates, assignees, and photos or videos on any task.
- **A private space that stays private.** Every account starts with a Personal space. Nobody sees it until you invite someone. That is not a setting, it is the security model.
- **Confetti.** Finish something, get confetti. Small joys matter.

## The one rule

Trove's visibility is not a UI filter. It is one rule, enforced by the database:

> You can see or change a task only if you are a member of its space.

That rule is a Postgres Row Level Security policy (see [`supabase/migrations`](supabase/migrations)), so it holds for every query the app can possibly make, on every platform. Membership is the boundary. Everything else follows from it.

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

You'll need Node 20+ and a [Supabase](https://supabase.com) project. Apply the SQL in [`supabase/migrations`](supabase/migrations) (in order) to create the schema, RLS policies, and storage buckets.

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

Issues and pull requests are welcome. Keep the tone of the product in mind: warm, plain, human. If you're proposing a feature, open an issue first so we can talk it through. Run `npx tsc --noEmit` before pushing.

## License

[AGPL-3.0](LICENSE). You can use, study, and modify Trove freely; if you host a modified version for others, you share your changes under the same license.

---

<p align="center">Built in the open by <a href="https://github.com/the-react-native-rewind">The React Native Rewind</a>.</p>
