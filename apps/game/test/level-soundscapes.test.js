import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { LevelAudioDirector } from '../src/audio/level-audio-director.js';
import {
  LEVEL_SOUNDSCAPES,
  SOUNDSCAPE_MODES,
  frequencyForDegree,
  soundscapeMix,
  soundscapeProfile,
  validateSoundscapeProfile,
} from '../src/audio/level-soundscapes.js';

const levelsDirectory = fileURLToPath(new URL('../../../content/levels/', import.meta.url));

test('every published level owns one valid soundscape profile', async () => {
  const filenames = (await readdir(levelsDirectory)).filter((name) => name.endsWith('.level.json'));
  const levelIds = await Promise.all(filenames.map(async (filename) => (
    JSON.parse(await readFile(resolve(levelsDirectory, filename), 'utf8')).id
  )));

  assert.deepEqual(Object.keys(LEVEL_SOUNDSCAPES).sort(), levelIds.sort());
  for (const [id, profile] of Object.entries(LEVEL_SOUNDSCAPES)) {
    assert.equal(profile.id, id);
    assert.deepEqual(validateSoundscapeProfile(profile), { ok: true, errors: [] });
    assert.ok(profile.name);
    assert.ok(profile.ambience.type);
    assert.ok(Object.isFrozen(profile));
  }
});

test('soundscape modes cover map preview, narrative and gameplay states', () => {
  for (const mode of ['preview', 'transition', 'intro', 'cutscene', 'playing', 'paused', 'won', 'over']) {
    const mix = soundscapeMix(mode);
    assert.equal(mix, SOUNDSCAPE_MODES[mode]);
    assert.ok(mix.output > 0 && mix.output <= 1);
    assert.ok(mix.music >= 0 && mix.music <= 1);
    assert.ok(mix.ambience >= 0 && mix.ambience <= 1);
  }
  assert.ok(SOUNDSCAPE_MODES.playing.music > SOUNDSCAPE_MODES.preview.music);
  assert.ok(SOUNDSCAPE_MODES.cutscene.ambience > SOUNDSCAPE_MODES.cutscene.music);
  assert.ok(SOUNDSCAPE_MODES.paused.output < SOUNDSCAPE_MODES.playing.output);
});

test('profile notes resolve deterministically into musical frequencies', () => {
  const profile = soundscapeProfile('dom');
  assert.ok(profile);
  assert.equal(frequencyForDegree({ rootMidi: 69, scale: [0, 2, 4] }, 0), 440);
  assert.ok(frequencyForDegree(profile, 1) > frequencyForDegree(profile, 0));
  assert.ok(frequencyForDegree(profile, 0, 1) > frequencyForDegree(profile, 0));
  assert.equal(frequencyForDegree(profile, Number.NaN), 0);
});

test('audio director remembers silent requests without creating a browser context', () => {
  let contextRequests = 0;
  const director = new LevelAudioDirector({
    isEnabled: () => false,
    acquireContext: () => { contextRequests += 1; return null; },
  });

  assert.equal(director.setScene('hals', 'preview'), true);
  assert.deepEqual(director.snapshot(), {
    requestedLevelId: 'hals', activeLevelId: null, mode: 'preview',
    running: false, enabled: false, scheduledSteps: 0,
  });
  director.setMode('cutscene');
  assert.equal(director.snapshot().mode, 'cutscene');
  assert.equal(director.setScene('nicht-vorhanden'), false);
  assert.equal(contextRequests, 0);
  director.destroy();
});
