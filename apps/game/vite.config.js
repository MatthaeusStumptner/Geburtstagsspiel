import { defineConfig } from 'vite';
import { execFileSync } from 'node:child_process';
import { svelte } from '@sveltejs/vite-plugin-svelte';

const VERSION_BASE_COMMIT = 'b64139d850b6a587ae25fddd7b142bfe83acdebc';
const VERSION_BASE_NUMBER = 6;
const VERSION_FALLBACK = 'V0.15';

function resolveAppVersion() {
  try {
    const commitsSinceFirstRelease = Number(execFileSync(
      'git',
      ['rev-list', '--first-parent', '--count', `${VERSION_BASE_COMMIT}..HEAD`],
      { encoding: 'utf8' },
    ).trim());
    if (Number.isInteger(commitsSinceFirstRelease)) {
      return `V0.${VERSION_BASE_NUMBER + commitsSinceFirstRelease}`;
    }
  } catch {
    // Source archives without Git history keep the last known version below.
  }
  return VERSION_FALLBACK;
}

const appVersion = resolveAppVersion();

export default defineConfig({
  // Relative asset URLs keep the build working below /<repository>/ on GitHub Pages.
  base: './',
  plugins: [
    svelte(),
    {
      name: 'app-version',
      transformIndexHtml(html) {
        return html.replace('__APP_VERSION__', appVersion);
      },
    },
  ],
});
