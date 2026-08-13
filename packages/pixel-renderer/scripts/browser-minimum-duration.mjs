const defaultDelay = (milliseconds) => new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds));

export async function waitForMinimumDuration({
  startedAt,
  minimumMs,
  now = Date.now,
  delay = defaultDelay,
}) {
  if (!Number.isFinite(startedAt) || !Number.isFinite(minimumMs) || minimumMs < 0) {
    throw new TypeError('capture duration inputs must be finite and non-negative');
  }
  while (true) {
    const elapsed = now() - startedAt;
    if (!Number.isFinite(elapsed)) throw new TypeError('capture elapsed time must remain finite');
    if (elapsed >= minimumMs) return elapsed;
    await delay(Math.max(1, minimumMs - elapsed));
  }
}
