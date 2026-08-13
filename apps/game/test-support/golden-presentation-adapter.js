import { createBrowserGameSession } from '../src/game/game-session-adapter.js';
import { createGamePresentation } from '../src/game/game-presentation.js';

export async function captureGoldenPresentation({ fixture, presentationTime, runInputScript, createRenderer }) {
  if (typeof runInputScript !== 'function' || typeof createRenderer !== 'function') {
    throw new TypeError('Game golden capture requires the shared script and renderer factories.');
  }
  const session = createBrowserGameSession(fixture.session);
  const snapshot = runInputScript(session, fixture.inputs);
  const renderer = createRenderer();
  try {
    const presentation = createGamePresentation(snapshot, { presentationTime, zoom: 1.12 });
    return Object.freeze({ checksum: snapshot.checksum, frame: renderer.render(presentation.snapshot, presentation.options) });
  } finally {
    renderer.destroy();
  }
}
