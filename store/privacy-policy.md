# Trove privacy policy

Draft for you to host. Replace the support contact before you submit. This document is not published at a URL by the app.

Trove is a shared task list. The React Native Rewind operates it.

## What the app stores

- Account email and a display name, so you can sign in and so other people in your circles can see who you are.
- An optional profile photo.
- Circles you create or join, and the tasks, notes, due dates, assignees, and photos or videos in those circles.
- A private weekly plan that only you can see.

Passwords are handled by Supabase Auth. Trove does not read your contacts, and it does not track you across other companies' apps or websites.

## How it is used

The data is used to run the app: to show a circle its shared list, to show you the tasks assigned to you, and to let you delete your account. Dictation uses on-device speech recognition. The recording is not uploaded as audio. If a task title is polished by the optional enrich function, the text you typed is sent to that function. That function is off unless the project owner configures it.

## Who can see it

People in a circle can see that circle's list and the names of its members. They cannot see your other circles, your Personal circle, or your weekly plan. Mine is your own filter over tasks assigned to you.

## Deleting your account

Account, inside the app, has Delete account. That removes your profile, your personal circle, and your sign-in. Circles you own are handed to another member when one exists, and deleted when you are the only member. You do not have to email support to delete an account.

## AI assistants and connected apps

You can connect an AI assistant in two ways.

A personal access token (`trove_…`) is created in the app under Account → Connect an AI assistant. Trove stores only a hash of the token. Anyone with the token can do what you can do in Trove until you revoke it there.

OAuth lets an assistant such as Claude, ChatGPT, Cursor, or another MCP client sign in as you. You approve the assistant on the web app at `/oauth/consent`. The screen shows the assistant's name and the identity scopes it asked for (`openid`, `email`, `profile`). Approving it lets that assistant read and change the circles and tasks you can already see. It cannot see a circle you have not joined. Row level security still applies. Inviting someone from an assistant sends that person an email.

Connected apps are listed under Account → Connect an AI assistant. Revoking one signs that assistant out. Revoking a personal token does the same for that token.

The published policy is https://troving.app/privacy.

## Contact

Open an issue at https://github.com/the-react-native-rewind/trove-app or replace this sentence with the email you want on the store listing.
