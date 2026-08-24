const SESSION_FRAGMENT_KEY = 'publisher_session';
const SESSION_STORAGE_KEY = 'franz-lola-publisher-session-v1';
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const validSessionToken = (token) => Boolean(token && token.length <= 4096 && /^[A-Za-z0-9._~-]+$/.test(token));

function normalizePublisherUrl(value) {
  if (!value) return '';
  try {
    const url = new URL(value);
    const isLocalDevelopment = url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname);
    if (url.protocol !== 'https:' && !isLocalDevelopment) return '';
    url.username = '';
    url.password = '';
    url.search = '';
    url.hash = '';
    return url.toString().replace(/\/$/, '');
  } catch {
    return '';
  }
}

export class PublisherRequestError extends Error {
  constructor(message, { status, current = null } = {}) {
    super(message);
    this.name = 'PublisherRequestError';
    this.status = status;
    this.current = current;
  }
}

export class PublisherClient {
  #baseUrl;
  #fetch;
  #storage;
  #now;
  #sessionToken = '';

  constructor({ baseUrl = '', fetchImpl = globalThis.fetch, storage = globalThis.localStorage, now = Date.now } = {}) {
    this.#baseUrl = normalizePublisherUrl(baseUrl);
    this.#fetch = fetchImpl.bind(globalThis);
    this.#storage = storage;
    this.#now = now;
  }

  get configured() {
    return Boolean(this.#baseUrl);
  }

  get authenticated() {
    return Boolean(this.#sessionToken);
  }

  consumeSessionFromLocation(location = globalThis.location, history = globalThis.history) {
    if (!location?.hash) return false;
    const fragment = new URLSearchParams(location.hash.slice(1));
    const token = fragment.get(SESSION_FRAGMENT_KEY) ?? '';
    fragment.delete(SESSION_FRAGMENT_KEY);
    if (validSessionToken(token)) {
      this.#sessionToken = token;
      try { this.#storage?.setItem(SESSION_STORAGE_KEY, JSON.stringify({ token, expiresAt: this.#now() + SESSION_TTL_MS })); } catch {}
    }
    const remainingHash = fragment.toString();
    const cleanUrl = `${location.pathname ?? '/'}${location.search ?? ''}${remainingHash ? `#${remainingHash}` : ''}`;
    history?.replaceState?.(null, '', cleanUrl);
    return Boolean(this.#sessionToken);
  }

  restoreSession() {
    try {
      const saved = JSON.parse(this.#storage?.getItem(SESSION_STORAGE_KEY) ?? 'null');
      if (!validSessionToken(saved?.token) || !Number.isFinite(saved?.expiresAt) || saved.expiresAt <= this.#now()) {
        this.clearSession();
        return false;
      }
      this.#sessionToken = saved.token;
      return true;
    } catch {
      this.clearSession();
      return false;
    }
  }

  clearSession() {
    this.#sessionToken = '';
    try { this.#storage?.removeItem(SESSION_STORAGE_KEY); } catch {}
  }

  loginUrl(returnTo = globalThis.location?.href ?? '') {
    if (!this.configured) return '';
    const url = new URL('/auth/login', `${this.#baseUrl}/`);
    const returnUrl = new URL(returnTo);
    returnUrl.hash = '';
    url.searchParams.set('return_to', returnUrl.toString());
    return url.toString();
  }

  async #request(path, options = {}) {
    if (!this.configured) throw new Error('Der Publisher ist noch nicht eingerichtet.');
    if (!this.#sessionToken) throw new Error('Bitte zuerst mit GitHub anmelden.');
    const response = await this.#fetch(`${this.#baseUrl}${path}`, {
      ...options,
      headers: {
        Authorization: `Bearer ${this.#sessionToken}`,
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        ...options.headers,
      },
    });
    const body = await response.json().catch(() => ({}));
    if (response.status === 401) this.clearSession();
    if (!response.ok) throw new PublisherRequestError(body.error || `Der Publisher antwortet mit Status ${response.status}.`, {
      status: response.status,
      current: body.current ?? null,
    });
    return body;
  }

  me() {
    return this.#request('/api/me');
  }

  publish(levels) {
    const selected = Array.isArray(levels) ? levels : [levels];
    if (!selected.length) throw new Error('Bitte mindestens einen Entwurf auswählen.');
    return this.#request('/api/publish', { method: 'POST', body: JSON.stringify({ levels: selected }) });
  }

  publishDrafts(drafts) {
    if (!Array.isArray(drafts) || !drafts.length) throw new Error('Bitte mindestens einen gemeinsamen Entwurf auswählen.');
    return this.#request('/api/publish', { method: 'POST', body: JSON.stringify({ drafts }) });
  }

  publishContent({ drafts = [], items = [] } = {}) {
    if (!Array.isArray(drafts) || !Array.isArray(items) || !drafts.length && !items.length) {
      throw new Error('Bitte mindestens einen Inhalt auswählen.');
    }
    return this.#request('/api/publish', { method: 'POST', body: JSON.stringify({ drafts, items }) });
  }

  bootstrapDrafts() {
    return this.#request('/api/drafts/bootstrap', { method: 'POST', body: '{}' });
  }

  listDrafts() {
    return this.#request('/api/drafts');
  }

  bootstrapContent() {
    return this.#request('/api/content/bootstrap', { method: 'POST', body: '{}' });
  }

  listContent(type = '') {
    const query = type ? `?type=${encodeURIComponent(type)}` : '';
    return this.#request(`/api/content${query}`);
  }

  content(type, id) {
    return this.#request(`/api/content/${encodeURIComponent(type)}/${encodeURIComponent(id)}`);
  }

  saveContent(content, expectedRevision = 0) {
    return this.#request(`/api/content/${encodeURIComponent(content.type)}/${encodeURIComponent(content.id)}`, {
      method: 'PUT',
      body: JSON.stringify({ content, expectedRevision }),
    });
  }

  deleteContent(type, id, expectedRevision) {
    return this.#request(`/api/content/${encodeURIComponent(type)}/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      body: JSON.stringify({ expectedRevision }),
    });
  }

  draft(id) {
    return this.#request(`/api/drafts/${encodeURIComponent(id)}`);
  }

  saveDraft(level, expectedRevision = 0) {
    return this.#request(`/api/drafts/${encodeURIComponent(level.id)}`, {
      method: 'PUT',
      body: JSON.stringify({ level, expectedRevision }),
    });
  }

  deleteDraft(id, expectedRevision) {
    return this.#request(`/api/drafts/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      body: JSON.stringify({ expectedRevision }),
    });
  }

  publication(publicationId) {
    if (!/^[a-z0-9][a-z0-9-]{0,79}$/.test(String(publicationId ?? ''))) throw new Error('Ungültige Veröffentlichungs-ID.');
    return this.#request(`/api/publications/${publicationId}`);
  }
}

export function publisherSetupGuidance() {
  return {
    variableName: 'VITE_PUBLISHER_URL',
    repositoryName: 'Geburtstagsspiel',
    settingsUrl: 'https://github.com/MatthaeusStumptner/Geburtstagsspiel/settings/variables/actions',
  };
}

export function createPublisherClient(options = {}) {
  const configuredUrl = options.baseUrl ?? import.meta.env?.VITE_PUBLISHER_URL ?? '';
  return new PublisherClient({ ...options, baseUrl: configuredUrl });
}

let sharedPublisherClient;

export function getPublisherClient() {
  sharedPublisherClient ??= createPublisherClient();
  return sharedPublisherClient;
}

export { normalizePublisherUrl };
