<img src="assets/images/logo.png" width="96" alt="Trove logo: three overlapping circles in sage, honey, and terracotta" />

# Trove

A shared task board for the groups in your life: your home, your projects, your communities. Everyone sees only their part, so no single person carries the whole list.

Visibility is enforced in the database (Supabase Row Level Security), not by app-side filters: you can see or change a task only if you are a member of its space.

## Stack

- React Native + Expo (SDK 56), TypeScript, Expo Router
- Supabase (Postgres, Auth, RLS) via `supabase-js` with AsyncStorage
- TanStack Query for data and mutations
- react-native-gesture-handler + reanimated, react-native-draggable-flatlist
- Fonts: Fraunces (display) + Hanken Grotesk (UI)
- EAS Build → TestFlight

## Backend

- Supabase project: `Trove` (ref `umxghjfxwyiscxdxdwhf`, region eu-west-1)
- Schema, RLS policies, the `is_space_member` / `current_space_role` SECURITY DEFINER
  helpers, the creator-owner trigger, the new-user trigger (creates profile + default
  "Personal" space), and the `accept_invite` RPC are all applied via migrations.

## Environment

Create `.env` (git-ignored):

```
EXPO_PUBLIC_SUPABASE_URL=https://umxghjfxwyiscxdxdwhf.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=<publishable key>
```

## Run locally (dev build)

These native modules need a development build, not Expo Go.

```
nvm use 20            # Expo SDK 56 needs Node >= 20.19
npm install
npx expo run:ios      # builds the dev client, installs on the simulator, starts Metro
```

## TestFlight (EAS)

EAS is configured (`eas.json`, project `@the-react-native-rewind/trove`). A TestFlight
build requires Apple signing credentials. Provide an **App Store Connect API key**:

1. App Store Connect -> Users and Access -> Integrations -> App Store Connect API ->
   generate a key with the **App Manager** role. Note the **Key ID**, **Issuer ID**,
   download the `.p8`, and find your **Team ID**.
2. Build + submit:

```
eas build --platform ios --profile production       # interactive Apple login OR ASC API key
eas submit --platform ios --profile production --latest
```

In non-interactive/CI use, configure the ASC API key with `eas credentials` (iOS ->
App Store Connect API Key) so builds and submits run hands-off.

## Follow-ups (deferred from v1)

- Custom SMTP for auth emails (the built-in Supabase mailer is rate-limited; email
  confirmation is currently enabled).
- Google sign-in (Supabase OAuth + `trove://auth-callback` deep link).
- Accepting an invite deep link while signed out (currently handled when signed in).
- Realtime live sync, labels, comments, attachments, push notifications.
