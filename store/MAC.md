# Mac App Store route

Ship one iOS binary and offer it on the Mac App Store as a Designed for iPad app on Apple silicon.

`app.json` keeps `ios.supportsTablet` and turns off `requireFullScreen`. The config plugin `plugins/withIpadOrientations.js` leaves iPhone in portrait and lets iPad rotate. On a Mac, that is how the window resizes. The board already switches to columns when the window is at least 900 points wide, which an iPad 13-inch window and a Mac window both reach.

## Why this route

EAS Build produces an iOS archive and `eas submit -p ios` delivers it to App Store Connect. Designed for iPad distribution to Mac is on by default for that record. One build, one submission, and the same membership rules, Mine view, and account deletion.

## What you give up

- Apple silicon only. Intel Macs do not run it.
- No Mac menu bar, no multiple windows, and no Mac-specific chrome. It is the iPad app in a window.
- iOS-only APIs that have no Mac equivalent simply do nothing. Dictation and the photo library still go through the iOS permission prompts the app already has.

## Why not Mac Catalyst

EAS does not treat a Mac Catalyst archive as a supported `eas build` target. This project also depends on Skia, Reanimated, Gesture Handler, and speech recognition, which are risky under Catalyst even where an XCFramework exists. A separate Catalyst app would be a second binary and a second App Store record, without a supported Expo path to produce it.

Leave "Make this app available on Mac" enabled for the iOS app in App Store Connect. Do not create a separate Mac Catalyst target unless you later take on a native Mac build outside EAS.
