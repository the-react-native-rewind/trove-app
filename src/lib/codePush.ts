import codePush from '@code-push-next/react-native-code-push';
import type { ComponentType } from 'react';

// When Trove looks for over-the-air (OTA) updates and when it applies them.
// The app checks Codemagic's CodePush server on launch and every time it comes
// back to the foreground. A downloaded update is applied the next time the app
// resumes after at least a minute in the background (or on the next cold start).
// Mandatory releases are installed immediately.
const codePushOptions = {
  checkFrequency: codePush.CheckFrequency.ON_APP_RESUME,
  installMode: codePush.InstallMode.ON_NEXT_RESUME,
  minimumBackgroundDuration: 60, // seconds
};

export function withCodePush<P extends object>(Component: ComponentType<P>): ComponentType<P> {
  return codePush(codePushOptions)(Component);
}

export type RunningBundle = { label: string | null; description: string | null };

// The CodePush release the app is running, or a null label for the bundle that
// shipped inside the binary.
export async function getRunningBundle(): Promise<RunningBundle> {
  const update = await codePush.getUpdateMetadata();
  return { label: update?.label ?? null, description: update?.description ?? null };
}
