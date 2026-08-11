import { DIRECTIONS, LevelSimulation } from '@franz-lola/pixel-renderer';
import { previewGuttis } from './editor-tools.js';

export { DIRECTIONS };

export class PlaytestEngine extends LevelSimulation {
  constructor(level, difficulty = 'easy', options = {}) {
    super(level, {
      difficulty,
      pellets: options.pellets ?? previewGuttis(level, difficulty),
      random: options.random,
    });
  }
}
