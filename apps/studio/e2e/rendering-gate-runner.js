import { mkdir, rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

export function renderingErrorRecord(error) {
  const value = error instanceof Error ? error : new Error(String(error));
  return { name: value.name, message: value.message, stack: value.stack ?? null };
}

function failedResult(scenario, error, partial = {}) {
  return {
    name: scenario.name,
    backend: scenario.backend,
    ...partial,
    status: 'failed',
    error: renderingErrorRecord(error),
  };
}

export async function runCapturedScenario({
  scenario,
  artifactDir,
  execute,
  captureFailure,
  close,
  video,
  measureVideo,
}) {
  if (!scenario?.name || typeof execute !== 'function' || typeof close !== 'function') {
    throw new TypeError('Captured rendering scenario configuration is incomplete.');
  }
  await mkdir(artifactDir, { recursive: true });
  let result;
  let executionError;
  try {
    result = await execute();
  } catch (error) {
    executionError = error;
    let evidence = {};
    if (typeof captureFailure === 'function') {
      try { evidence = await captureFailure(error) ?? {}; }
      catch (captureError) { evidence.failureCaptureError = renderingErrorRecord(captureError); }
    }
    result = failedResult(scenario, error, evidence);
  } finally {
    try { await close(); }
    catch (closeError) {
      result = failedResult(scenario, executionError ?? closeError, {
        ...(result ?? {}),
        cleanupError: renderingErrorRecord(closeError),
      });
    }
    const recordedVideo = typeof video === 'function' ? video() : video;
    if (recordedVideo) {
      try {
        const source = await recordedVideo.path();
        const target = join(artifactDir, `${scenario.name}.webm`);
        if (source !== target) await rename(source, target);
        result ??= failedResult(scenario, new Error('Scenario returned no result.'));
        result.video = typeof measureVideo === 'function'
          ? await measureVideo(target)
          : { path: target };
      } catch (videoError) {
        result = failedResult(scenario, executionError ?? videoError, {
          ...(result ?? {}),
          videoError: renderingErrorRecord(videoError),
        });
      }
    }
  }
  return result;
}

export async function completeRenderingGate({ summaryPath, summary }) {
  if (!summaryPath || !summary || !Array.isArray(summary.scenarios)) {
    throw new TypeError('Rendering gate summary configuration is incomplete.');
  }
  const failures = summary.scenarios.filter((scenario) => scenario.status !== 'passed');
  const gateErrors = summary.error ? [summary.error] : [];
  const completed = {
    ...summary,
    finishedAt: new Date().toISOString(),
    status: failures.length === 0 && gateErrors.length === 0 ? 'passed' : 'failed',
  };
  await mkdir(dirname(summaryPath), { recursive: true });
  await writeFile(summaryPath, `${JSON.stringify(completed, null, 2)}\n`);
  if (failures.length > 0 || gateErrors.length > 0) {
    throw new AggregateError([
      ...failures.map((failure) => new Error(`[${failure.name}] ${failure.error?.message ?? 'rendering scenario failed'}`)),
      ...gateErrors.map((error) => new Error(`[rendering-gate] ${error.message}`)),
    ], `${failures.length} rendering scenario(s) and ${gateErrors.length} gate assertion(s) failed`);
  }
  return completed;
}
