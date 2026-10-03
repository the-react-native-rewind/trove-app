import type { ComponentType } from 'react';

import type { RunningBundle } from './codePush';

// CodePush is native-only. On web the root component renders unchanged.
export function withCodePush<P extends object>(Component: ComponentType<P>): ComponentType<P> {
  return Component;
}

export async function getRunningBundle(): Promise<RunningBundle> {
  return { label: null, description: null };
}
