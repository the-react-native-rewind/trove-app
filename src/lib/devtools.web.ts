// react-grab: hover any element and press Cmd/Ctrl+C to copy its component
// stack + source locations for a coding agent. Dev-only; the guard lets the
// minifier drop it from production web builds.
//
// Note: Metro's dynamic import() can resolve synchronously, so we don't chain
// .then/.catch on it (that would throw on the non-promise return value).
if (__DEV__) {
  import('react-grab');
}

export {};
