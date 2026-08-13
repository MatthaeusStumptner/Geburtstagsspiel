import { access, cp, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repoRoot = fileURLToPath(new URL('../', import.meta.url));

export async function assemblePages({
  gameDist = path.join(repoRoot, 'apps', 'game', 'dist'),
  studioDist = path.join(repoRoot, 'apps', 'studio', 'dist'),
} = {}) {
  const gameIndex = path.join(gameDist, 'index.html');
  const studioIndex = path.join(studioDist, 'index.html');
  await access(gameIndex);
  await access(studioIndex);

  const studioPath = path.join(gameDist, 'studio');
  await rm(studioPath, { recursive: true, force: true });
  await cp(studioDist, studioPath, { recursive: true });
  return Object.freeze({ gameDist, studioDist, studioPath });
}

if (process.argv[1]
  && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  assemblePages()
    .then(({ studioPath }) => {
      console.log(`Studio Pages artifact assembled at ${studioPath}`);
    })
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    });
}
