export const ENDGAME_PAGES = Object.freeze([
  Object.freeze({ kicker: 'finaleKicker', title: 'finaleTitle', copy: 'finaleCopy', button: 'endgameOneButton' }),
  Object.freeze({ kicker: 'endgameTwoKicker', title: 'endgameTwoTitle', copy: 'endgameTwoCopy', button: 'endgameTwoButton' }),
  Object.freeze({ kicker: 'endgameThreeKicker', title: 'endgameThreeTitle', copy: 'endgameThreeCopy', button: 'endgameThreeButton' }),
]);

export const ENDGAME_BOOT_LINES = Object.freeze([
  'mapEventBootLineOne',
  'mapEventBootLineTwo',
  'mapEventBootLineThree',
  'mapEventBootLineFour',
]);

export function endgameBootView(stepIndex, translate) {
  const step = Math.max(0, Math.min(ENDGAME_BOOT_LINES.length - 1, Math.floor(Number(stepIndex) || 0)));
  return {
    phase: 'boot',
    kicker: translate('mapEventBootKicker'),
    title: translate('mapEventBootTitle'),
    wait: translate('mapEventBootWait'),
    lines: ENDGAME_BOOT_LINES.slice(0, step + 1).map((key) => translate(key)),
    progress: Math.round(((step + 1) / ENDGAME_BOOT_LINES.length) * 100),
  };
}

export function endgamePageView(pageIndex, translate) {
  const page = Math.max(0, Math.min(ENDGAME_PAGES.length - 1, Math.floor(Number(pageIndex) || 0)));
  const keys = ENDGAME_PAGES[page];
  return {
    phase: 'reveal',
    page,
    pages: ENDGAME_PAGES.length,
    kicker: translate(keys.kicker),
    title: translate(keys.title),
    copy: translate(keys.copy),
    button: translate(keys.button),
  };
}
