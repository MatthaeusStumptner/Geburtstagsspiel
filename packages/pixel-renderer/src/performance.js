const percentile = (values, fraction) => {
  if (!values.length) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * fraction) - 1))];
};

const rounded = (value) => Math.round(value * 100) / 100;

export const RENDER_BUDGETS = Object.freeze({
  notebook: Object.freeze({ renderP95Ms: 14, frameP95Ms: 34, longFramePercent: 15 }),
  tablet: Object.freeze({ renderP95Ms: 20, frameP95Ms: 34, longFramePercent: 25 }),
  mobile: Object.freeze({ renderP95Ms: 24, frameP95Ms: 34, longFramePercent: 30 }),
  'weak-mobile': Object.freeze({ renderP95Ms: 36, frameP95Ms: 52, longFramePercent: 50 }),
  desktop: Object.freeze({ renderP95Ms: 14, frameP95Ms: 34, longFramePercent: 15 }),
});

export function summarizeRenderSamples(renderSamples, frameSamples, longTaskDuration = 0) {
  const render = renderSamples.filter(Number.isFinite);
  const frames = frameSamples.filter(Number.isFinite);
  const longFrames = frames.filter((duration) => duration > 33.34).length;
  const averageFrame = frames.length ? frames.reduce((sum, value) => sum + value, 0) / frames.length : 0;
  return Object.freeze({
    samples: render.length,
    renderAverageMs: rounded(render.length ? render.reduce((sum, value) => sum + value, 0) / render.length : 0),
    renderP50Ms: rounded(percentile(render, 0.5)),
    renderP95Ms: rounded(percentile(render, 0.95)),
    renderP99Ms: rounded(percentile(render, 0.99)),
    frameAverageMs: rounded(averageFrame),
    frameP95Ms: rounded(percentile(frames, 0.95)),
    effectiveFps: rounded(averageFrame ? 1000 / averageFrame : 0),
    longFramePercent: rounded(frames.length ? longFrames / frames.length * 100 : 0),
    longTaskDurationMs: rounded(longTaskDuration),
  });
}

export function evaluatePerformanceBudget(summary, profile = 'desktop') {
  const budget = RENDER_BUDGETS[profile] ?? RENDER_BUDGETS.desktop;
  const failures = [];
  if (summary.renderP95Ms > budget.renderP95Ms) failures.push(`Render-p95 ${summary.renderP95Ms} ms > ${budget.renderP95Ms} ms`);
  if (summary.frameP95Ms > budget.frameP95Ms) failures.push(`Frame-p95 ${summary.frameP95Ms} ms > ${budget.frameP95Ms} ms`);
  if (summary.longFramePercent > budget.longFramePercent) failures.push(`Lange Frames ${summary.longFramePercent}% > ${budget.longFramePercent}%`);
  return Object.freeze({ passed: failures.length === 0, profile, budget, failures: Object.freeze(failures) });
}
