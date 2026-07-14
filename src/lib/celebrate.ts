// Tiny singleton so data-layer mutations can fire the celebration overlay
// without threading React context through everything.
type Handler = () => void;

let handler: Handler | null = null;

export function registerCelebrate(fn: Handler | null) {
  handler = fn;
}

export function celebrate() {
  handler?.();
}
