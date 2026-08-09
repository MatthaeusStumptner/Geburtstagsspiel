export const STARTUP_BOOT_LINES = Object.freeze([
  'startupBootLineOne',
  'startupBootLineTwo',
  'startupBootLineThree',
  'startupBootLineFour',
]);

export function startupBootView(stepIndex, translate) {
  const step = Math.max(0, Math.min(STARTUP_BOOT_LINES.length - 1, Math.floor(Number(stepIndex) || 0)));
  return {
    phase: 'boot',
    kicker: translate('startupBootKicker'),
    title: translate('startupBootTitle'),
    wait: translate('startupBootWait'),
    terminalLabel: 'F-60 // ERSTSTART',
    lines: STARTUP_BOOT_LINES.slice(0, step + 1).map((key) => translate(key)),
    progress: Math.round(((step + 1) / STARTUP_BOOT_LINES.length) * 100),
  };
}
