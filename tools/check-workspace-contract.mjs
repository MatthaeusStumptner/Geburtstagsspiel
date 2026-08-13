import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

async function walk(directory, root, files = []) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (['.git', 'node_modules', 'dist', 'output', '.worktrees'].includes(entry.name)) continue;
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) await walk(absolute, root, files);
    else files.push(path.relative(root, absolute).replaceAll('\\', '/'));
  }
  return files;
}

export async function checkWorkspaceContract(rootUrl) {
  const root = fileURLToPath(rootUrl);
  const files = await walk(root, root);
  const lockfiles = files.filter((file) => file.endsWith('package-lock.json')).sort();
  const packageFiles = files.filter((file) => file === 'package.json' || /^(apps|packages)\/[^/]+\/package\.json$/.test(file));
  const manifests = await Promise.all(packageFiles.map(async (file) => ({
    file,
    value: JSON.parse(await readFile(path.join(root, file), 'utf8')),
  })));
  const packages = manifests.filter(({ file }) => file !== 'package.json').map(({ value }) => value.name).sort();
  const externalRendererPins = manifests.flatMap(({ file, value }) => {
    const dependency = value.dependencies?.['@franz-lola/pixel-renderer'];
    return typeof dependency === 'string' && /github:|Pacman_clone_renderer|#[0-9a-f]{7,40}/i.test(dependency) ? [file] : [];
  });
  const violations = [];
  if (lockfiles.length !== 1 || lockfiles[0] !== 'package-lock.json') violations.push('exactly one root package-lock.json is required');
  if (externalRendererPins.length) violations.push('external renderer pins are forbidden');
  return { packages, lockfiles, externalRendererPins, violations };
}