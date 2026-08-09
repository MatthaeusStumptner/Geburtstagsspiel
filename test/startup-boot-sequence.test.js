import assert from 'node:assert/strict';
import test from 'node:test';
import { TEXT } from '../src/content/game-copy.js';
import { STARTUP_BOOT_LINES, startupBootView } from '../src/ui/startup-boot-sequence.js';

test('the first map boot progressively reveals localized system checks', () => {
  for (const language of ['standard', 'dialect']) {
    const translate = (key) => TEXT[language][key];
    const first = startupBootView(0, translate);
    const complete = startupBootView(999, translate);
    assert.equal(first.phase, 'boot');
    assert.equal(first.lines.length, 1);
    assert.equal(first.progress, 25);
    assert.equal(complete.lines.length, STARTUP_BOOT_LINES.length);
    assert.equal(complete.progress, 100);
    assert.ok(complete.title);
    complete.lines.forEach((line) => assert.ok(line));
  }
});
