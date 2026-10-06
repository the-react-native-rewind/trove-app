const SCOPE_COPY: Record<string, string> = {
  openid: 'Sign in as you',
  email: 'See your email address',
  profile: 'See your name',
  phone: 'See your phone number',
  offline_access: 'Stay connected after you close the assistant',
};

export function splitScopes(scope: string | null | undefined): string[] {
  if (!scope) return [];
  return scope.split(/\s+/).map((item) => item.trim()).filter((item) => item.length > 0);
}

export function describeScope(scope: string): string {
  return SCOPE_COPY[scope] ?? scope;
}
