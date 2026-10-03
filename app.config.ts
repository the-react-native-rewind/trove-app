import type { ConfigContext, ExpoConfig } from 'expo/config';

// Codemagic's hosted CodePush server. Every Trove build checks this server for
// over-the-air (OTA) JavaScript updates.
const CODEPUSH_SERVER_URL = 'https://codepush.pro/';

// Deployment keys are not secrets: they ship inside the app binary. They are
// set per EAS build profile in eas.json (Production keys for `production`,
// Staging keys for `preview` and `development`), so a store build can never
// pick up a Staging release.
const iosDeploymentKey = process.env.CODEPUSH_IOS_DEPLOYMENT_KEY ?? '';
const androidDeploymentKey = process.env.CODEPUSH_ANDROID_DEPLOYMENT_KEY ?? '';

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...(config as ExpoConfig),
  plugins: [
    ...(config.plugins ?? []),
    [
      // Config plugin shipped inside the CodePush SDK. On prebuild it points
      // the release bundle URL at CodePush (AppDelegate.swift and
      // MainApplication.kt), applies codepush.gradle, and writes the server URL
      // and deployment key into Info.plist and strings.xml.
      '@code-push-next/react-native-code-push/expo',
      {
        ios: {
          CodePushServerURL: CODEPUSH_SERVER_URL,
          CodePushDeploymentKey: iosDeploymentKey,
        },
        android: {
          CodePushServerURL: CODEPUSH_SERVER_URL,
          CodePushDeploymentKey: androidDeploymentKey,
        },
      },
    ],
  ],
});
