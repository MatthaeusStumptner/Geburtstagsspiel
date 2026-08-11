import { createPublication, exchangeGithubCode, listPublishedLevels, publicationStatus, readRepositoryFile } from './github.js';
import { preparePublishedBatch, preparePublishedContent, preparePublishedLevel, publishLevelsFromBody, readPublishBody } from './level-publication.js';
import {
  ContentConflictError,
  ContentNotFoundError,
  deleteContentItem,
  finishContentPublication,
  listContentItems,
  readContentItem,
  recordContentPublication,
  resolveContentReferences,
  saveContentItem,
} from './content-store.js';
import {
  deleteDraft,
  DraftConflictError,
  DraftNotFoundError,
  finishPublication,
  listDrafts,
  readDraft,
  recordPublication,
  resolveDraftReferences,
  saveDraft,
  syncPublishedDraft,
} from './draft-store.js';
import {
  bearerToken,
  corsHeaders,
  isAllowedLogin,
  requestOriginAllowed,
  safeReturnUrl,
  securityHeaders,
  signToken,
  verifyToken,
} from './security.js';

const REQUIRED_SECRET_BINDINGS = Object.freeze([
  'GITHUB_APP_ID',
  'GITHUB_APP_CLIENT_ID',
  'GITHUB_APP_CLIENT_SECRET',
  'GITHUB_INSTALLATION_ID',
  'GITHUB_APP_PRIVATE_KEY',
  'SESSION_SECRET',
  'ALLOWED_GITHUB_LOGINS',
]);

function missingSecretBindings(env) {
  return REQUIRED_SECRET_BINDINGS.filter((name) => !String(env?.[name] ?? '').trim());
}

function databaseAvailable(env) {
  return Boolean(env?.LEVEL_DB?.prepare && env?.LEVEL_DB?.batch);
}

function configurationMessage(missing, hasDatabase) {
  const details = [
    ...(missing.length ? [`fehlende Secrets: ${missing.join(', ')}`] : []),
    ...(!hasDatabase ? ['fehlende D1-Bindung: LEVEL_DB'] : []),
  ];
  return `Der sichere Publisher ist noch nicht vollständig eingerichtet (${details.join('; ')}).`;
}

function response(body, { status = 200, headers = {}, request, env } = {}) {
  return new Response(body, {
    status,
    headers: {
      ...securityHeaders(),
      ...(request && env ? corsHeaders(request, env) : {}),
      ...headers,
    },
  });
}

function json(value, options = {}) {
  return response(JSON.stringify(value), { ...options, headers: { 'Content-Type': 'application/json; charset=utf-8', ...options.headers } });
}

function redirect(location, headers = {}) {
  return response(null, { status: 302, headers: { Location: location, ...headers } });
}

function cookieValue(request, name) {
  const cookies = request.headers.get('Cookie') ?? '';
  const match = cookies.split(';').map((entry) => entry.trim()).find((entry) => entry.startsWith(`${name}=`));
  return match ? decodeURIComponent(match.slice(name.length + 1)) : '';
}

function oauthCookie(value, maxAge = 600) {
  return `publisher_oauth_state=${encodeURIComponent(value)}; Max-Age=${maxAge}; Path=/auth/callback; HttpOnly; Secure; SameSite=Lax`;
}

async function authenticatedSession(request, env) {
  const payload = await verifyToken(bearerToken(request), env.SESSION_SECRET, 'publisher-session');
  if (!payload || !isAllowedLogin(payload.login, env)) return null;
  return payload;
}

async function login(request, env) {
  const url = new URL(request.url);
  const returnTo = safeReturnUrl(url.searchParams.get('return_to'), env);
  if (!returnTo) return response('Ungültige Rücksprungadresse.', { status: 400 });
  const state = await signToken({
    type: 'oauth-state',
    returnTo,
    nonce: crypto.randomUUID(),
    exp: Math.floor(Date.now() / 1000) + 600,
  }, env.SESSION_SECRET);
  const callback = new URL('/auth/callback', url.origin).toString();
  const authorize = new URL('https://github.com/login/oauth/authorize');
  authorize.searchParams.set('client_id', env.GITHUB_APP_CLIENT_ID);
  authorize.searchParams.set('redirect_uri', callback);
  authorize.searchParams.set('state', state);
  return redirect(authorize.toString(), { 'Set-Cookie': oauthCookie(state) });
}

async function callback(request, env) {
  const url = new URL(request.url);
  const state = url.searchParams.get('state') ?? '';
  const stateCookie = cookieValue(request, 'publisher_oauth_state');
  const payload = state && state === stateCookie ? await verifyToken(state, env.SESSION_SECRET, 'oauth-state') : null;
  const returnTo = payload ? safeReturnUrl(payload.returnTo, env) : null;
  if (!payload || !returnTo) return response('Die Anmeldung ist abgelaufen oder ungültig.', { status: 400, headers: { 'Set-Cookie': oauthCookie('', 0) } });
  const code = url.searchParams.get('code');
  if (!code || code.length > 512) return response('GitHub hat keinen gültigen Anmeldecode geliefert.', { status: 400, headers: { 'Set-Cookie': oauthCookie('', 0) } });
  const user = await exchangeGithubCode(env, code, url.origin + url.pathname);
  if (!isAllowedLogin(user.login, env)) return response('Dieser GitHub-Account ist nicht als Redaktion freigeschaltet.', { status: 403, headers: { 'Set-Cookie': oauthCookie('', 0) } });
  const session = await signToken({
    type: 'publisher-session',
    login: user.login,
    name: user.name || user.login,
    nonce: crypto.randomUUID(),
    exp: Math.floor(Date.now() / 1000) + 1800,
  }, env.SESSION_SECRET);
  const destination = new URL(returnTo);
  destination.hash = new URLSearchParams({ publisher_session: session }).toString();
  return redirect(destination.toString(), { 'Set-Cookie': oauthCookie('', 0) });
}

async function bootstrapDrafts(env) {
  const publishedFiles = await listPublishedLevels(env);
  const levelFiles = publishedFiles.filter((file) => file.type === 'file' && String(file.name).endsWith('.level.json'));
  const levels = await Promise.all(levelFiles.map((file) => readRepositoryFile(env, file.path)));
  for (const file of levels) {
    if (file?.value) await syncPublishedDraft(env.LEVEL_DB, file.value, { sha: file.sha });
  }
  return listDrafts(env.LEVEL_DB);
}

async function publicationDrafts(body, env, session) {
  if (Array.isArray(body?.drafts)) return resolveDraftReferences(env.LEVEL_DB, body.drafts);
  if (Array.isArray(body?.items) && !body?.level && !body?.levels) return [];
  const levels = publishLevelsFromBody(body);
  const drafts = [];
  for (const level of levels) {
    drafts.push(await saveDraft(env.LEVEL_DB, level, { expectedRevision: 0, login: session.login, action: 'legacy-publish' }));
  }
  return drafts;
}

async function publish(request, env, session) {
  const body = await readPublishBody(request);
  const drafts = await publicationDrafts(body, env, session);
  const contentItems = await resolveContentReferences(env.LEVEL_DB, Array.isArray(body?.items) ? body.items : []);
  if (!drafts.length && !contentItems.length) throw new Error('Bitte mindestens einen Inhalt auswählen.');
  if (drafts.length + contentItems.length > 20) throw new Error('Es können höchstens 20 Inhalte auf einmal veröffentlicht werden.');
  const levels = drafts.map((draft) => draft.level);
  const publishedFiles = await listPublishedLevels(env);
  const initial = levels.map((level, index) => preparePublishedLevel(level, { existing: null, nextMapOrder: publishedFiles.length + index }));
  const existingFiles = await Promise.all(initial.map((entry) => readRepositoryFile(env, entry.path)));
  const existingByPath = new Map(initial.map((entry, index) => [entry.path, existingFiles[index]?.value ?? null]));
  const prepared = preparePublishedBatch(levels, { existingByPath, nextMapOrder: publishedFiles.length });
  const preparedItems = contentItems.map((item) => ({ ...item, ...preparePublishedContent(item.content) }));
  const publication = await createPublication(env, {
    files: [
      ...prepared.map((entry) => ({
        path: entry.path,
        content: entry.value,
        level: entry.value,
        item: { type: 'level', id: entry.value.id, name: entry.value.name.standard },
        warnings: entry.warnings,
      })),
      ...preparedItems.map((entry) => ({
        path: entry.path,
        content: entry.value,
        item: { type: entry.type, id: entry.id, name: entry.name },
        warnings: entry.warnings,
      })),
    ],
    login: session.login,
  });
  await recordPublication(env.LEVEL_DB, { number: publication.number, login: session.login, drafts });
  await recordContentPublication(env.LEVEL_DB, {
    number: publication.number,
    items: preparedItems.map((entry) => ({ ...entry, content: entry.value })),
  });
  const warnings = prepared.flatMap((entry) => entry.warnings.map((warning) => `${entry.value.name.standard}: ${warning}`));
  const count = prepared.length + preparedItems.length;
  return json({
    publicationId: publication.number,
    state: 'testing',
    phase: 'upload-complete',
    phaseLabel: 'Inhalte sicher übertragen',
    progress: 22,
    detail: `${count === 1 ? 'Der Inhalt wurde' : `${count} Inhalte wurden`} übertragen und werden automatisch geprüft.`,
    prUrl: publication.url,
    warnings,
    levelIds: prepared.map((entry) => entry.value.id),
    contentIds: preparedItems.map((entry) => `${entry.type}:${entry.id}`),
    drafts: drafts.map((draft) => ({ id: draft.id, revision: draft.revision })),
    items: preparedItems.map((item) => ({ type: item.type, id: item.id, revision: item.revision })),
  }, { status: 202, request, env });
}

async function api(request, env, path) {
  if (!requestOriginAllowed(request, env)) return json({ error: 'Nicht erlaubter Ursprung.' }, { status: 403, request, env });
  if (request.method === 'OPTIONS') return response(null, { status: 204, request, env });
  const session = await authenticatedSession(request, env);
  if (!session) return json({ error: 'Bitte erneut mit GitHub anmelden.' }, { status: 401, request, env });
  if (path === '/api/me' && request.method === 'GET') return json({ login: session.login, name: session.name, expiresAt: session.exp }, { request, env });
  if (path === '/api/drafts/bootstrap' && request.method === 'POST') {
    return json({ drafts: await bootstrapDrafts(env) }, { request, env });
  }
  if (path === '/api/drafts' && request.method === 'GET') return json({ drafts: await listDrafts(env.LEVEL_DB) }, { request, env });
  if (path === '/api/content/bootstrap' && request.method === 'POST') {
    return json({ items: await listContentItems(env.LEVEL_DB, { includeContent: true }) }, { request, env });
  }
  if (path === '/api/content' && request.method === 'GET') {
    const type = new URL(request.url).searchParams.get('type') ?? '';
    return json({ items: await listContentItems(env.LEVEL_DB, { type }) }, { request, env });
  }
  const draftMatch = /^\/api\/drafts\/([a-z0-9][a-z0-9-]{0,63})$/.exec(path);
  if (draftMatch && request.method === 'GET') return json(await readDraft(env.LEVEL_DB, draftMatch[1]), { request, env });
  if (draftMatch && request.method === 'PUT') {
    const body = await readPublishBody(request);
    if (body?.level?.id !== draftMatch[1]) throw new Error('Level-ID und Adresse des gemeinsamen Entwurfs stimmen nicht überein.');
    return json(await saveDraft(env.LEVEL_DB, body.level, {
      expectedRevision: body.expectedRevision,
      login: session.login,
    }), { request, env });
  }
  if (draftMatch && request.method === 'DELETE') {
    const body = await readPublishBody(request);
    return json(await deleteDraft(env.LEVEL_DB, draftMatch[1], {
      expectedRevision: body.expectedRevision,
      login: session.login,
    }), { request, env });
  }
  const contentMatch = /^\/api\/content\/(character|tileset|block|animation|cutscene|object)\/([a-z0-9][a-z0-9-]{0,63})$/.exec(path);
  if (contentMatch && request.method === 'GET') return json(await readContentItem(env.LEVEL_DB, contentMatch[1], contentMatch[2]), { request, env });
  if (contentMatch && request.method === 'PUT') {
    const body = await readPublishBody(request);
    if (body?.content?.type !== contentMatch[1] || body?.content?.id !== contentMatch[2]) {
      throw new Error('Content-Typ, ID und Adresse des Bibliotheksinhalts stimmen nicht überein.');
    }
    return json(await saveContentItem(env.LEVEL_DB, body.content, {
      expectedRevision: body.expectedRevision,
      login: session.login,
    }), { request, env });
  }
  if (contentMatch && request.method === 'DELETE') {
    const body = await readPublishBody(request);
    return json(await deleteContentItem(env.LEVEL_DB, contentMatch[1], contentMatch[2], {
      expectedRevision: body.expectedRevision,
      login: session.login,
    }), { request, env });
  }
  if (path === '/api/publish' && request.method === 'POST') return publish(request, env, session);
  const publicationMatch = /^\/api\/publications\/(\d+)$/.exec(path);
  if (publicationMatch && request.method === 'GET') {
    const publicationId = Number(publicationMatch[1]);
    const status = await publicationStatus(env, publicationId);
    await finishPublication(env.LEVEL_DB, publicationId, status);
    await finishContentPublication(env.LEVEL_DB, publicationId, status);
    return json(status, { request, env });
  }
  return json({ error: 'API-Endpunkt nicht gefunden.' }, { status: 404, request, env });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const missing = missingSecretBindings(env);
    const hasDatabase = databaseAvailable(env);
    if (url.pathname === '/health') {
      return json({
        ok: missing.length === 0 && hasDatabase,
        service: 'franz-lola-publisher',
        storage: hasDatabase ? 'd1' : 'missing',
        ...(missing.length ? { missingSecrets: missing } : {}),
        ...(!hasDatabase ? { missingBindings: ['LEVEL_DB'] } : {}),
      }, { status: missing.length === 0 && hasDatabase ? 200 : 503 });
    }
    if ((missing.length || !hasDatabase) && (url.pathname.startsWith('/auth/') || url.pathname.startsWith('/api/'))) {
      const message = configurationMessage(missing, hasDatabase);
      console.error(JSON.stringify({ message: 'publisher configuration incomplete', missing, hasDatabase, path: url.pathname }));
      if (url.pathname.startsWith('/api/')) return json({ error: message }, { status: 503, request, env });
      return response(message, { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
    }
    try {
      if (url.pathname === '/auth/login' && request.method === 'GET') return login(request, env);
      if (url.pathname === '/auth/callback' && request.method === 'GET') return callback(request, env);
      if (url.pathname.startsWith('/api/')) return api(request, env, url.pathname);
      return response('Nicht gefunden.', { status: 404 });
    } catch (error) {
      console.error(JSON.stringify({ message: 'publisher request failed', error: error instanceof Error ? error.message : 'Unbekannter Fehler', path: url.pathname }));
      const knownStatus = error instanceof DraftConflictError || error instanceof DraftNotFoundError
        || error instanceof ContentConflictError || error instanceof ContentNotFoundError ? error.status : null;
      const expected = error instanceof SyntaxError || /Level|Entwurf|Content|Inhalt|Bibliothek|Revision|JSON|Veröffentlich|GitHub|64 × 64|mehr als|nicht erlaubt|größer|höchstens|vorkommen|auswählen/.test(error?.message ?? '');
      return json({
        error: knownStatus || expected ? error.message : 'Die Veröffentlichung konnte nicht abgeschlossen werden.',
        ...(error instanceof DraftConflictError || error instanceof ContentConflictError ? { current: error.current } : {}),
      }, {
        status: knownStatus || (expected ? 400 : 500),
        request: url.pathname.startsWith('/api/') ? request : undefined,
        env: url.pathname.startsWith('/api/') ? env : undefined,
      });
    }
  },
};
