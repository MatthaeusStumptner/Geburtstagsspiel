const deepFreeze = (value) => {
  Object.values(value).forEach((entry) => {
    if (entry && typeof entry === 'object' && !Object.isFrozen(entry)) deepFreeze(entry);
  });
  return Object.freeze(value);
};

export const DEFAULT_AUDIO_OUTPUT_PROFILE = 'speaker';

export const AUDIO_OUTPUT_PROFILES = deepFreeze({
  speaker: {
    id: 'speaker',
    masterGain: 2.05,
    lowShelfGain: -3,
    presenceGain: 5,
    compressor: { threshold: -22, knee: 24, ratio: 3.5, attack: 0.008, release: 0.24 },
  },
  headphones: {
    id: 'headphones',
    masterGain: 1,
    lowShelfGain: 0,
    presenceGain: 0,
    compressor: { threshold: -12, knee: 18, ratio: 2, attack: 0.012, release: 0.28 },
  },
});

export function resolveAudioOutputProfile(value) {
  return AUDIO_OUTPUT_PROFILES[value] ?? AUDIO_OUTPUT_PROFILES[DEFAULT_AUDIO_OUTPUT_PROFILE];
}
