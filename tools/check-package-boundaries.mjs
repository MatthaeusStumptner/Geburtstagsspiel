import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { init, parse as parseImports } from 'es-module-lexer';
import { parse as parseSvelte } from 'svelte/compiler';

await init;

const SOURCE_EXTENSIONS = new Set(['.js', '.svelte']);

function inside(parent, candidate) {
  const relative = path.relative(parent, candidate);
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
}

function portable(root, candidate) {
  return path.relative(root, candidate).replaceAll('\\', '/');
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

function constantSpecifier(node) {
  if (node?.type === 'Literal' && typeof node.value === 'string') return node.value;
  if (node?.type === 'TemplateLiteral' && node.expressions.length === 0 && node.quasis.length === 1) {
    return node.quasis[0].value.cooked ?? node.quasis[0].value.raw;
  }
  return null;
}

function walkAst(node, visit, seen = new WeakSet()) {
  if (!node || typeof node !== 'object' || seen.has(node)) return;
  seen.add(node);
  if (typeof node.type === 'string') visit(node);
  for (const child of Object.values(node)) {
    if (Array.isArray(child)) child.forEach((item) => walkAst(item, visit, seen));
    else walkAst(child, visit, seen);
  }
}

function svelteImportSpecifiers(file, source) {
  const parsed = parseSvelte(source, { filename: file });
  const specifiers = [];
  for (const script of [parsed.module, parsed.instance].filter(Boolean)) {
    walkAst(script.content, (node) => {
      const hasStaticSource = node.type === 'ImportDeclaration'
        || node.type === 'ExportNamedDeclaration'
        || node.type === 'ExportAllDeclaration';
      if (!hasStaticSource && node.type !== 'ImportExpression') return;
      const specifier = constantSpecifier(node.source);
      if (specifier !== null) specifiers.push(specifier);
    });
  }
  return specifiers;
}

function importSpecifiers(file, source) {
  if (path.extname(file) === '.svelte') return svelteImportSpecifiers(file, source);
  const [imports] = parseImports(source);
  return imports.map(({ n }) => n).filter((specifier) => typeof specifier === 'string');
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

function withoutSuffix(specifier) {
  return specifier.split(/[?#]/, 1)[0].replaceAll('\\', '/');
}

function applicationTarget(appsRoot, target) {
  const relative = path.relative(appsRoot, target);
  if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) return null;
  const [name, child] = relative.split(path.sep);
  return name ? { name, source: child === 'src' } : null;
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
      for (const specifier of importSpecifiers(file, await readFile(file, 'utf8'))) {
        const classified = withoutSuffix(specifier);
        if (classified.startsWith('.')) {
          const target = path.resolve(path.dirname(file), classified);
          const targetApplication = applicationTarget(appsRoot, target);
          if (targetApplication && targetApplication.name !== owner.name) {
            const description = targetApplication.source
              ? 'imports another application source tree'
              : 'imports another application root';
            violations.push(`${fileName}: ${description}: ${portable(root, target)}`);
          } else if (inside(packagesRoot, target)) {
            violations.push(`${fileName}: imports shared source without @franz-lola/*: ${portable(root, target)}`);
          }
          continue;
        }
        const otherApp = applications.find((candidate) => candidate !== owner
          && (classified === candidate.packageName || classified.startsWith(`${candidate.packageName}/`)));
        if (otherApp) violations.push(`${fileName}: imports another application package: ${specifier}`);
      }
    }
  }

  return violations.sort();
}
