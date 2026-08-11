import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SOURCE_EXTENSIONS = new Set(['.js', '.svelte']);

function inside(parent, candidate) {
  const relative = path.relative(parent, candidate);
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
}

function portable(root, candidate) {
  return path.relative(root, candidate).replaceAll('\\', '/');
}

function applicationSourceName(appsRoot, target) {
  const relative = path.relative(appsRoot, target);
  if (relative.startsWith(`..${path.sep}`) || relative === '..' || path.isAbsolute(relative)) return null;
  const [application, source] = relative.split(path.sep);
  return application && source === 'src' ? application : null;
}

async function filesBelow(directory) {
  const entries = await readdir(directory, { withFileTypes: true }).catch((error) => {
    if (error.code === 'ENOENT') return [];
    throw error;
  });
  const files = [];
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    const candidate = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await filesBelow(candidate));
    else if (entry.isFile() && SOURCE_EXTENSIONS.has(path.extname(entry.name))) files.push(candidate);
  }
  return files;
}

function tokens(source) {
  const result = [];
  let index = 0;
  while (index < source.length) {
    const character = source[index];
    if (/\s/.test(character)) { index += 1; continue; }
    if (character === '/' && source[index + 1] === '/') {
      index = source.indexOf('\n', index + 2);
      if (index < 0) break;
      continue;
    }
    if (character === '/' && source[index + 1] === '*') {
      const end = source.indexOf('*/', index + 2);
      index = end < 0 ? source.length : end + 2;
      continue;
    }
    if (character === '`') {
      index += 1;
      while (index < source.length) {
        if (source[index] === '\\') index += 2;
        else if (source[index++] === '`') break;
      }
      continue;
    }
    if (character === "'" || character === '"') {
      const quote = character;
      let value = '';
      index += 1;
      while (index < source.length) {
        const current = source[index++];
        if (current === quote) break;
        if (current === '\\' && index < source.length) value += source[index++];
        else value += current;
      }
      result.push({ type: 'string', value });
      continue;
    }
    if (/[A-Za-z_$]/.test(character)) {
      let end = index + 1;
      while (end < source.length && /[A-Za-z0-9_$]/.test(source[end])) end += 1;
      result.push({ type: 'identifier', value: source.slice(index, end) });
      index = end;
      continue;
    }
    result.push({ type: 'punctuation', value: character });
    index += 1;
  }
  return result;
}

function importSpecifiers(source) {
  const sourceTokens = tokens(source);
  const specifiers = [];
  for (let index = 0; index < sourceTokens.length; index += 1) {
    const token = sourceTokens[index];
    if (token.type !== 'identifier' || !['import', 'export'].includes(token.value)) continue;
    if (token.value === 'import' && sourceTokens[index + 1]?.value === '.') continue;
    if (token.value === 'import' && sourceTokens[index + 1]?.value === '(') {
      if (sourceTokens[index + 2]?.type === 'string') specifiers.push(sourceTokens[index + 2].value);
      continue;
    }
    for (let cursor = index + 1; cursor < sourceTokens.length; cursor += 1) {
      const candidate = sourceTokens[cursor];
      if (candidate.value === ';' || (candidate.type === 'identifier' && ['import', 'export'].includes(candidate.value))) break;
      if (candidate.type === 'string' && (cursor === index + 1 || sourceTokens[cursor - 1]?.value === 'from')) {
        specifiers.push(candidate.value);
        break;
      }
    }
  }
  return specifiers;
}

async function applicationPackages(appsRoot) {
  const entries = await readdir(appsRoot, { withFileTypes: true }).catch((error) => {
    if (error.code === 'ENOENT') return [];
    throw error;
  });
  const applications = [];
  for (const entry of entries.filter((candidate) => candidate.isDirectory()).sort((a, b) => a.name.localeCompare(b.name))) {
    const root = path.join(appsRoot, entry.name);
    const manifest = await readFile(path.join(root, 'package.json'), 'utf8')
      .then(JSON.parse)
      .catch((error) => {
        if (error.code === 'ENOENT') return {};
        throw error;
      });
    applications.push({ name: entry.name, packageName: manifest.name ?? `@franz-lola/${entry.name}`, root, source: path.join(root, 'src') });
  }
  return applications;
}

export async function checkPackageBoundaries(rootUrl) {
  const root = path.resolve(fileURLToPath(rootUrl));
  const appsRoot = path.join(root, 'apps');
  const packagesRoot = path.join(root, 'packages');
  const applications = await applicationPackages(appsRoot);
  const violations = [];

  for (const owner of applications) {
    for (const file of await filesBelow(owner.source)) {
      const fileName = portable(root, file);
      for (const specifier of importSpecifiers(await readFile(file, 'utf8'))) {
        if (specifier.startsWith('.')) {
          const target = path.resolve(path.dirname(file), specifier.split(/[?#]/, 1)[0]);
          const targetApplication = applicationSourceName(appsRoot, target);
          if (targetApplication && targetApplication !== owner.name) {
            violations.push(`${fileName}: imports another application source tree: ${portable(root, target)}`);
          } else if (inside(packagesRoot, target)) {
            violations.push(`${fileName}: imports shared source without @franz-lola/*: ${portable(root, target)}`);
          }
          continue;
        }
        const otherApp = applications.find((candidate) => candidate !== owner
          && (specifier === candidate.packageName || specifier.startsWith(`${candidate.packageName}/`)));
        if (otherApp) violations.push(`${fileName}: imports another application package: ${specifier}`);
      }
    }
  }

  return violations.sort();
}
