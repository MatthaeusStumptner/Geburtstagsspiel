const deepFreeze = (value) => {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.values(value).forEach(deepFreeze);
  return Object.freeze(value);
};

const createProfile = (profile) => deepFreeze({
  kind: 'franz-lola-soundscape',
  schemaVersion: 1,
  ...profile,
});

export const SOUNDSCAPE_MODES = deepFreeze({
  preview: { output: 0.72, music: 0.34, ambience: 0.58, density: 0.48 },
  transition: { output: 0.68, music: 0.24, ambience: 0.5, density: 0.36 },
  intro: { output: 0.76, music: 0.38, ambience: 0.62, density: 0.56 },
  cutscene: { output: 0.72, music: 0.2, ambience: 0.7, density: 0.34 },
  playing: { output: 0.86, music: 0.66, ambience: 0.52, density: 1 },
  paused: { output: 0.54, music: 0.16, ambience: 0.38, density: 0.25 },
  won: { output: 0.72, music: 0.3, ambience: 0.5, density: 0.42 },
  over: { output: 0.48, music: 0.12, ambience: 0.34, density: 0.2 },
});

export const LEVEL_SOUNDSCAPES = deepFreeze({
  home: createProfile({
    id: 'home', name: 'Bramerhof bei Nacht', bpm: 78, rootMidi: 62,
    scale: [0, 2, 4, 7, 9], waveform: 'triangle', filterFrequency: 1850,
    melody: [0, null, 2, 4, 7, null, 4, 2, 0, null, 2, 5, 4, null, 2, null],
    bass: [0, 0, 3, 2], accent: 12,
    ambience: { type: 'night', filter: 'lowpass', frequency: 1350, q: 0.45, noise: 0.018, drone: 0.009, lfoRate: 0.09, lfoDepth: 0.006 },
  }),
  hals: createProfile({
    id: 'hals', name: 'Ilz in der Nacht', bpm: 72, rootMidi: 57,
    scale: [0, 2, 3, 5, 7, 9, 10], waveform: 'sine', filterFrequency: 2300,
    melody: [0, 2, null, 4, 5, null, 4, 2, 0, null, 3, 5, 4, 2, 1, null],
    bass: [0, 3, 4, 2], accent: 19,
    ambience: { type: 'river', filter: 'bandpass', frequency: 920, q: 0.72, noise: 0.027, drone: 0.006, lfoRate: 0.13, lfoDepth: 0.009 },
  }),
  oberhaus: createProfile({
    id: 'oberhaus', name: 'Wind über der Veste', bpm: 82, rootMidi: 55,
    scale: [0, 2, 3, 5, 7, 8, 10], waveform: 'triangle', filterFrequency: 1500,
    melody: [0, null, 4, 3, 5, null, 7, 5, 4, null, 2, 3, 0, null, -1, null],
    bass: [0, 4, 3, 0], accent: 7,
    ambience: { type: 'wind', filter: 'bandpass', frequency: 620, q: 0.5, noise: 0.024, drone: 0.012, lfoRate: 0.07, lfoDepth: 0.011 },
  }),
  dom: createProfile({
    id: 'dom', name: 'Glocken über der Altstadt', bpm: 66, rootMidi: 60,
    scale: [0, 2, 4, 5, 7, 9, 11], waveform: 'sine', filterFrequency: 2600,
    melody: [0, null, 4, null, 7, null, 4, 2, 0, null, 5, null, 4, 2, 0, null],
    bass: [0, 4, 5, 3], accent: 11,
    ambience: { type: 'hall', filter: 'lowpass', frequency: 1750, q: 0.8, noise: 0.01, drone: 0.015, lfoRate: 0.05, lfoDepth: 0.004 },
  }),
  dreifluesseeck: createProfile({
    id: 'dreifluesseeck', name: 'Drei Flüsse', bpm: 70, rootMidi: 52,
    scale: [0, 2, 3, 5, 7, 9, 10], waveform: 'sine', filterFrequency: 2100,
    melody: [0, 2, 4, null, 6, 4, 2, null, 1, 3, 5, null, 7, 5, 3, null],
    bass: [0, 2, 4, 3], accent: 12,
    ambience: { type: 'currents', filter: 'bandpass', frequency: 760, q: 0.58, noise: 0.03, drone: 0.009, lfoRate: 0.11, lfoDepth: 0.012 },
  }),
  uni: createProfile({
    id: 'uni', name: 'Inn-Lo-Fi', bpm: 96, rootMidi: 65,
    scale: [0, 2, 4, 5, 7, 9, 11], waveform: 'triangle', filterFrequency: 2050,
    melody: [0, null, 2, 4, 5, null, 4, 2, 0, 2, 4, null, 7, 5, 4, null],
    bass: [0, 5, 3, 4], accent: 19,
    ambience: { type: 'city-river', filter: 'bandpass', frequency: 1120, q: 0.42, noise: 0.019, drone: 0.006, lfoRate: 0.15, lfoDepth: 0.006 },
  }),
  bschuett: createProfile({
    id: 'bschuett', name: 'Bschüttpark-Beat', bpm: 104, rootMidi: 62,
    scale: [0, 2, 4, 7, 9], waveform: 'square', filterFrequency: 1450,
    melody: [0, 2, null, 4, 5, 4, 2, null, 0, 3, null, 5, 7, 5, 3, 2],
    bass: [0, 3, 4, 2], accent: 12,
    ambience: { type: 'park', filter: 'highpass', frequency: 780, q: 0.35, noise: 0.014, drone: 0.004, lfoRate: 0.18, lfoDepth: 0.004 },
  }),
  tabakfabrik: createProfile({
    id: 'tabakfabrik', name: 'Dampf und Stahl', bpm: 92, rootMidi: 50,
    scale: [0, 2, 3, 5, 7, 8, 10], waveform: 'sawtooth', filterFrequency: 920,
    melody: [0, null, 0, 3, null, 4, 3, null, 0, 2, 0, null, 5, 4, 2, null],
    bass: [0, 0, 3, 4], accent: 7,
    ambience: { type: 'industrial', filter: 'bandpass', frequency: 430, q: 1.2, noise: 0.026, drone: 0.015, lfoRate: 0.24, lfoDepth: 0.012 },
  }),
  zauberberg: createProfile({
    id: 'zauberberg', name: 'Zauberberg Live', bpm: 118, rootMidi: 52,
    scale: [0, 2, 3, 5, 7, 10], waveform: 'square', filterFrequency: 1720,
    melody: [0, 2, 3, 5, 7, null, 5, 3, 0, 3, 5, 8, 7, 5, 3, 2],
    bass: [0, 3, 4, 5], accent: 12,
    ambience: { type: 'club', filter: 'lowpass', frequency: 980, q: 0.7, noise: 0.02, drone: 0.018, lfoRate: 0.2, lfoDepth: 0.009 },
  }),
});

export function soundscapeProfile(levelId) {
  return LEVEL_SOUNDSCAPES[levelId] ?? null;
}

export function soundscapeMix(mode) {
  return SOUNDSCAPE_MODES[mode] ?? SOUNDSCAPE_MODES.preview;
}

export function frequencyForDegree(profile, degree, octaveShift = 0) {
  if (!profile || !Number.isFinite(degree)) return 0;
  const scaleLength = profile.scale.length;
  const octave = Math.floor(degree / scaleLength);
  const index = ((degree % scaleLength) + scaleLength) % scaleLength;
  const midi = profile.rootMidi + profile.scale[index] + (octave + octaveShift) * 12;
  return 440 * (2 ** ((midi - 69) / 12));
}

export function validateSoundscapeProfile(profile) {
  const errors = [];
  if (profile?.kind !== 'franz-lola-soundscape') errors.push('kind');
  if (profile?.schemaVersion !== 1) errors.push('schemaVersion');
  if (!profile?.id) errors.push('id');
  if (!Number.isFinite(profile?.bpm) || profile.bpm < 40 || profile.bpm > 180) errors.push('bpm');
  if (!Number.isFinite(profile?.rootMidi)) errors.push('rootMidi');
  if (!Array.isArray(profile?.scale) || profile.scale.length < 3) errors.push('scale');
  if (!Array.isArray(profile?.melody) || profile.melody.length < 8) errors.push('melody');
  if (!Array.isArray(profile?.bass) || profile.bass.length < 2) errors.push('bass');
  if (!profile?.ambience?.type) errors.push('ambience');
  return { ok: errors.length === 0, errors };
}
