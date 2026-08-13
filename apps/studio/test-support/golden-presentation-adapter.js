import { PlaytestEngine, createPlaytestPresentation } from '../src/playtest-engine.js';

export async function captureGoldenPresentation({ fixture, presentationTime, runInputScript, createRenderer }) {
  if (typeof runInputScript !== 'function' || typeof createRenderer !== 'function') {
    throw new TypeError('Studio golden capture requires the shared script and renderer factories.');
  }
  const session = new PlaytestEngine(fixture.session.level, fixture.session.difficulty, { seed: fixture.session.seed });
  const snapshot = runInputScript(session, fixture.inputs);
  const renderer = createRenderer();
  try {
    const presentation = createPlaytestPresentation(snapshot, { presentationTime });
    return Object.freeze({ checksum: snapshot.checksum, frame: renderer.render(presentation.snapshot, presentation.options) });
  } finally {
    renderer.destroy();
  }
}
