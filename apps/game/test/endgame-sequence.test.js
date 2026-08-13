import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ENDGAME_BOOT_LINES,
  ENDGAME_PAGES,
  endgameBootView,
  endgamePageView,
} from '../src/ui/endgame-sequence.js';
import { TEXT } from '../src/content/game-copy.js';

test('endgame has three localized pages ending in the concert unlock', () => {
  assert.equal(ENDGAME_PAGES.length, 3);
  for (const language of ['standard', 'dialect']) {
    const translate = (key) => TEXT[language][key];
    const pages = ENDGAME_PAGES.map((_, index) => endgamePageView(index, translate));
    pages.forEach((page) => {
      assert.ok(page.kicker);
      assert.ok(page.title);
      assert.ok(page.copy);
      assert.ok(page.button);
    });
    assert.match(pages.at(-1).copy, /Konzert/i);
  }
});

test('endgame page selection is clamped to the available sequence', () => {
  const translate = (key) => key;
  assert.equal(endgamePageView(-5, translate).page, 0);
  assert.equal(endgamePageView(99, translate).page, 2);
});

test('map event boot log reveals its checks progressively', () => {
  const translate = (key) => `copy:${key}`;
  const first = endgameBootView(0, translate);
  const complete = endgameBootView(99, translate);

  assert.equal(first.phase, 'boot');
  assert.equal(first.lines.length, 1);
  assert.equal(first.progress, 25);
  assert.equal(complete.lines.length, ENDGAME_BOOT_LINES.length);
  assert.equal(complete.progress, 100);
  assert.match(complete.lines.at(-1), /mapEventBootLineFour/);
});
