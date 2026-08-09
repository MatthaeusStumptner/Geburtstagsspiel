import assert from 'node:assert/strict';
import test from 'node:test';
import {
  AUDIO_OUTPUT_PROFILES,
  DEFAULT_AUDIO_OUTPUT_PROFILE,
  resolveAudioOutputProfile,
} from '../src/audio/audio-output-profiles.js';

test('speaker mode is the safe audible default for mobile browser playback', () => {
  assert.equal(DEFAULT_AUDIO_OUTPUT_PROFILE, 'speaker');
  assert.equal(resolveAudioOutputProfile('unknown'), AUDIO_OUTPUT_PROFILES.speaker);
  assert.ok(AUDIO_OUTPUT_PROFILES.speaker.masterGain > AUDIO_OUTPUT_PROFILES.headphones.masterGain);
  assert.ok(AUDIO_OUTPUT_PROFILES.speaker.presenceGain > AUDIO_OUTPUT_PROFILES.headphones.presenceGain);
  assert.ok(AUDIO_OUTPUT_PROFILES.speaker.compressor.ratio > AUDIO_OUTPUT_PROFILES.headphones.compressor.ratio);
  assert.ok(Object.isFrozen(AUDIO_OUTPUT_PROFILES.speaker.compressor));
});

test('headphone mode preserves the neutral mix', () => {
  const profile = resolveAudioOutputProfile('headphones');
  assert.equal(profile.id, 'headphones');
  assert.equal(profile.masterGain, 1);
  assert.equal(profile.presenceGain, 0);
});
