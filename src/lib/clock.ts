/**
 * Injectable clock seam — every schedule, quiet-hours, cooldown, and "today"
 * decision routes through now() so tests can freeze time.
 */

let _now: () => number = () => Date.now();

/** Current epoch ms (overridable in tests). */
export function now(): number {
  return _now();
}

/** Override the clock for tests. Pass null to restore wall clock. */
export function setNow(fn: (() => number) | null): void {
  _now = fn ?? (() => Date.now());
}

/** Freeze the clock at a fixed epoch ms. */
export function freezeAt(ms: number): void {
  _now = () => ms;
}
