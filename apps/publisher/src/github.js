import { base64UrlEncode } from './security.js';

const encoder = new TextEncoder();
let installationTokenCache = null;

function githubHeaders(token) {
  return {
    Accept: 'application/vnd.github+json',
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
    'User-Agent': 'franz-lola-publisher',
    'X-GitHub-Api-Version': '2026-03-10',
  };
}

async function responseJson(response, operation) {
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`${operation} ist bei GitHub fehlgeschlagen (${response.status}): ${body.message ?? 'Unbekannter Fehler'}`);
  return body;
}

export async function importPrivateKey(pem) {
  const normalized = String(pem ?? '').replace(/\\n/g, '\n');
  const isPkcs1 = normalized.includes('-----BEGIN RSA PRIVATE KEY-----');
  const base64 = normalized.replace(/-----BEGIN (?:RSA )?PRIVATE KEY-----|-----END (?:RSA )?PRIVATE KEY-----|\s/g, '');
  if (!base64) throw new Error('Der private GitHub-App-Schlüssel fehlt.');
  const binary = atob(base64);
  let bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  if (isPkcs1) {
    const der = (tag, content) => {
      const lengthBytes = content.length < 128
        ? [content.length]
        : (() => { const values = []; let length = content.length; while (length) { values.unshift(length & 255); length >>>= 8; } return [0x80 | values.length, ...values]; })();
      return Uint8Array.from([tag, ...lengthBytes, ...content]);
    };
    const version = Uint8Array.from([0x02, 0x01, 0x00]);
    const rsaAlgorithm = Uint8Array.from([0x30, 0x0d, 0x06, 0x09, 0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01, 0x01, 0x05, 0x00]);
    bytes = der(0x30, Uint8Array.from([...version, ...rsaAlgorithm, ...der(0x04, bytes)]));
  }
  return crypto.subtle.importKey('pkcs8', bytes, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
}

async function appJwt(env) {
  const now = Math.floor(Date.now() / 1000);
  const header = base64UrlEncode(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const payload = base64UrlEncode(JSON.stringify({ iat: now - 60, exp: now + 540, iss: String(env.GITHUB_APP_ID) }));
  const unsigned = `${header}.${payload}`;
  const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', await importPrivateKey(env.GITHUB_APP_PRIVATE_KEY), encoder.encode(unsigned));
  return `${unsigned}.${base64UrlEncode(new Uint8Array(signature))}`;
}

export async function installationToken(env) {
  if (installationTokenCache?.expiresAt > Date.now() + 60_000) return installationTokenCache.token;
  const response = await fetch(`https://api.github.com/app/installations/${encodeURIComponent(env.GITHUB_INSTALLATION_ID)}/access_tokens`, {
    method: 'POST',
    headers: githubHeaders(await appJwt(env)),
    body: JSON.stringify({
      repositories: [env.GITHUB_REPO],
      permissions: { actions: 'read', contents: 'write', pull_requests: 'write' },
    }),
  });
  const result = await responseJson(response, 'GitHub-App-Anmeldung');
  installationTokenCache = { token: result.token, expiresAt: Date.parse(result.expires_at) };
  return result.token;
}

export async function githubRequest(env, path, { method = 'GET', body, token } = {}) {
  const response = await fetch(`https://api.github.com${path}`, {
    method,
    headers: githubHeaders(token ?? await installationToken(env)),
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return responseJson(response, path);
}

export async function exchangeGithubCode(env, code, redirectUri) {
  const response = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json', 'User-Agent': 'franz-lola-publisher' },
    body: JSON.stringify({
      client_id: env.GITHUB_APP_CLIENT_ID,
      client_secret: env.GITHUB_APP_CLIENT_SECRET,
      code,
      redirect_uri: redirectUri,
    }),
  });
  const token = await responseJson(response, 'GitHub-Anmeldung');
  if (!token.access_token) throw new Error('GitHub hat kein Benutzer-Token geliefert.');
  return githubRequest(env, '/user', { token: token.access_token });
}

export function repositoryPath(env, suffix = '') {
  return `/repos/${encodeURIComponent(env.GITHUB_OWNER)}/${encodeURIComponent(env.GITHUB_REPO)}${suffix}`;
}

function decodeContent(value) {
  const binary = atob(String(value ?? '').replace(/\s/g, ''));
  return new TextDecoder().decode(Uint8Array.from(binary, (character) => character.charCodeAt(0)));
}

function encodeContent(value) {
  const bytes = encoder.encode(value);
  let binary = '';
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary);
}

export async function readRepositoryFile(env, path, ref = env.GITHUB_BASE_BRANCH) {
  try {
    const file = await githubRequest(env, `${repositoryPath(env, `/contents/${path.split('/').map(encodeURIComponent).join('/')}`)}?ref=${encodeURIComponent(ref)}`);
    return { sha: file.sha, value: JSON.parse(decodeContent(file.content)) };
  } catch (error) {
    if (error.message.includes('(404)')) return null;
    throw error;
  }
}

export async function listPublishedLevels(env) {
  try {
    return await githubRequest(env, `${repositoryPath(env, '/contents/src/data/levels')}?ref=${encodeURIComponent(env.GITHUB_BASE_BRANCH)}`);
  } catch (error) {
    if (error.message.includes('(404)')) return [];
    throw error;
  }
}

function publicationKey(items) {
  if (items.length === 1) return `${items[0].type}-${items[0].id}`;
  return `batch-${items.map((item) => `${item.type}-${item.id}`).sort().join('-')}`.slice(0, 72).replace(/-+$/g, '');
}

export async function createPublication(env, { files, login }) {
  if (!Array.isArray(files) || !files.length) throw new Error('Für die Veröffentlichung fehlen Inhaltsdateien.');
  const items = files.map((file) => file.item ?? {
    type: 'level',
    id: file.level.id,
    name: file.level.name.standard,
  });
  const baseBranch = env.GITHUB_BASE_BRANCH || 'main';
  const openPulls = await githubRequest(env, `${repositoryPath(env, '/pulls')}?state=open&base=${encodeURIComponent(baseBranch)}&per_page=100`);
  const key = publicationKey(items);
  const pending = openPulls.find((pull) => pull.head?.ref?.startsWith(`publisher/${key}-`));
  let branch = pending?.head?.ref;
  if (!branch) {
    const base = await githubRequest(env, `${repositoryPath(env, `/git/ref/heads/${encodeURIComponent(baseBranch)}`)}`);
    const suffix = crypto.randomUUID().slice(0, 8);
    branch = `publisher/${key}-${Date.now()}-${suffix}`;
    await githubRequest(env, repositoryPath(env, '/git/refs'), {
      method: 'POST',
      body: { ref: `refs/heads/${branch}`, sha: base.object.sha },
    });
  }

  for (const [index, file] of files.entries()) {
    const existing = await readRepositoryFile(env, file.path, branch);
    await githubRequest(env, repositoryPath(env, `/contents/${file.path.split('/').map(encodeURIComponent).join('/')}`), {
      method: 'PUT',
      body: {
        message: `content: ${items[index].name} aus der Levelwerkstatt`,
        content: encodeContent(`${JSON.stringify(file.content, null, 2)}\n`),
        branch,
        ...(existing ? { sha: existing.sha } : {}),
      },
    });
  }

  if (pending) return { number: pending.number, url: pending.html_url, branch, reused: true };

  const pullRequest = await githubRequest(env, repositoryPath(env, '/pulls'), {
    method: 'POST',
    body: {
      title: items.length === 1 ? `${items[0].name} veröffentlichen` : `${items.length} Inhalte aus der Levelwerkstatt veröffentlichen`,
      head: branch,
      base: baseBranch,
      body: [
        `Automatisch aus der Franz-&-Lola-Levelwerkstatt veröffentlicht.`,
        ``,
        `Redaktion: @${login}`,
        `Ausgewählte Inhalte:`,
        ...files.map((file, index) => `- \`${items[index].type}:${items[index].id}\` – ${items[index].name} · Prüfhinweise: ${file.warnings.length ? file.warnings.join(' · ') : 'keine'}`),
      ].join('\n'),
    },
  });
  return { number: pullRequest.number, url: pullRequest.html_url, branch };
}

const WORKFLOW_STEPS = {
  validation: [
    ['identity', 27, 'Auftrag und geänderte Dateien werden geprüft.', ['verify publisher', 'changed files']],
    ['checkout', 32, 'Der vorgeschlagene Inhaltsstand wird geladen.', ['checkout proposed']],
    ['setup', 37, 'Die sichere Node.js-Umgebung wird vorbereitet.', ['setup node']],
    ['dependencies', 42, 'Spielabhängigkeiten werden installiert.', ['install dependencies']],
    ['tests', 49, 'Alle automatischen Spiel- und Inhaltstests laufen.', ['full game test', 'npm test']],
    ['build', 56, 'Das fertige GitHub-Pages-Spiel wird gebaut.', ['build game', 'npm run build']],
    ['merge', 62, 'Die geprüften Inhalte werden in das Spiel übernommen.', ['merge publication']],
    ['dispatch', 66, 'Der GitHub-Pages-Deploy wird gestartet.', ['trigger github pages']],
  ],
  deploy: [
    ['checkout', 70, 'Der veröffentlichte Spielstand wird geladen.', ['checkout']],
    ['setup', 74, 'Die Build-Umgebung wird vorbereitet.', ['setup node']],
    ['dependencies', 79, 'Spielabhängigkeiten werden installiert.', ['install dependencies', 'npm ci']],
    ['tests', 84, 'Der Live-Stand durchläuft nochmals alle Tests.', ['test', 'npm test']],
    ['build', 89, 'Das optimierte Browser-Spiel wird gebaut.', ['build', 'npm run build']],
    ['artifact', 93, 'Das fertige Seitenpaket wird an GitHub Pages übergeben.', ['upload artifact', 'upload pages']],
    ['pages', 97, 'GitHub Pages schaltet die neue Version live.', ['deploy to github pages', 'deploy pages']],
  ],
};

export function workflowProgress(run, jobs = [], kind = 'validation') {
  const definitions = WORKFLOW_STEPS[kind] ?? WORKFLOW_STEPS.validation;
  const steps = jobs.flatMap((job) => job.steps ?? []);
  const match = (step) => definitions.find(([, , , needles]) => needles.some((needle) => String(step.name ?? '').toLowerCase().includes(needle)));
  const relevant = steps.map((step) => ({ step, definition: match(step) })).filter((entry) => entry.definition);
  const active = relevant.find(({ step }) => step.status === 'in_progress')
    ?? relevant.find(({ step }) => step.status === 'queued')
    ?? [...relevant].reverse().find(({ step }) => step.status === 'completed');
  const fallbackProgress = kind === 'validation' ? 25 : 68;
  const fallbackPhase = kind === 'validation' ? 'validation-queued' : 'deploy-queued';
  const fallbackDetail = kind === 'validation' ? 'GitHub reserviert gerade einen sicheren Prüfplatz.' : 'Der GitHub-Pages-Build wurde angefordert und wartet auf einen Runner.';
  if (!active) return { phase: fallbackPhase, phaseLabel: kind === 'validation' ? 'Prüfung wird vorbereitet' : 'Live-Build wird vorbereitet', progress: fallbackProgress, detail: fallbackDetail };
  const [id, progress, detail] = active.definition;
  const completedSteps = relevant.filter(({ step }) => step.status === 'completed' && step.conclusion === 'success').length;
  return {
    phase: `${kind}-${id}`,
    phaseLabel: active.step.status === 'completed' ? `${active.step.name} abgeschlossen` : active.step.name,
    progress,
    detail,
    completedSteps,
    totalSteps: relevant.length || definitions.length,
  };
}

async function runProgress(env, run, kind) {
  if (!run?.id || run.status === 'completed') return workflowProgress(run, [], kind);
  const jobs = await githubRequest(env, `${repositoryPath(env, `/actions/runs/${run.id}/jobs`)}?per_page=100`);
  return workflowProgress(run, jobs.jobs ?? [], kind);
}

export async function publicationStatus(env, number) {
  const pull = await githubRequest(env, repositoryPath(env, `/pulls/${number}`));
  const checkedAt = new Date().toISOString();
  if (pull.state === 'closed' && !pull.merged_at) return { state: 'failed', phase: 'failed', progress: 100, detail: 'Die Veröffentlichung wurde geschlossen.', checkedAt };
  const sha = pull.merged_at ? pull.merge_commit_sha : pull.head.sha;
  const runs = await githubRequest(env, `${repositoryPath(env, '/actions/runs')}?head_sha=${encodeURIComponent(sha)}&per_page=20`);
  const relevant = runs.workflow_runs?.find((run) => pull.merged_at
    ? run.name === 'Deploy to GitHub Pages'
    : run.name === 'Validate and publish editor content');
  if (!pull.merged_at) {
    if (relevant?.status === 'completed' && relevant.conclusion !== 'success') return { state: 'failed', phase: 'validation-failed', progress: 100, detail: 'Die automatischen Prüfungen sind fehlgeschlagen.', actionsUrl: relevant.html_url, checkedAt };
    if (relevant?.status === 'completed') return { state: 'testing', phase: 'validation-merge', phaseLabel: 'Prüfung bestanden · Übernahme läuft', progress: 64, detail: 'Alle Prüfungen sind grün. GitHub übernimmt die Inhalte jetzt in den Hauptstand.', actionsUrl: relevant.html_url, checkedAt };
    return { state: 'testing', ...(await runProgress(env, relevant, 'validation')), actionsUrl: relevant?.html_url, checkedAt };
  }
  if (!relevant || relevant.status !== 'completed') return { state: 'deploying', ...(await runProgress(env, relevant, 'deploy')), actionsUrl: relevant?.html_url, checkedAt };
  if (relevant.conclusion !== 'success') return { state: 'failed', phase: 'deploy-failed', progress: 100, detail: 'Der GitHub-Pages-Deploy ist fehlgeschlagen.', actionsUrl: relevant.html_url, checkedAt };
  return { state: 'published', phase: 'published', phaseLabel: 'GitHub Pages ist aktuell', progress: 100, detail: 'Die neue Version ist live.', actionsUrl: relevant.html_url, gameUrl: env.GAME_URL, commit: sha, checkedAt };
}
