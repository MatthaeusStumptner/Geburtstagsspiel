const encoder = new TextEncoder();
const decoder = new TextDecoder();

export function base64UrlEncode(value) {
  const bytes = typeof value === 'string' ? encoder.encode(value) : value;
  let binary = '';
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

export function base64UrlDecode(value) {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(value.length / 4) * 4, '=');
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function hmacKey(secret) {
  if (typeof secret !== 'string' || secret.length < 32) throw new Error('SESSION_SECRET muss mindestens 32 Zeichen lang sein.');
  return crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}

export async function signToken(payload, secret) {
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const signature = await crypto.subtle.sign('HMAC', await hmacKey(secret), encoder.encode(encodedPayload));
  return `${encodedPayload}.${base64UrlEncode(new Uint8Array(signature))}`;
}

export async function verifyToken(token, secret, expectedType) {
  if (typeof token !== 'string' || token.length > 4096) return null;
  const [encodedPayload, encodedSignature, extra] = token.split('.');
  if (!encodedPayload || !encodedSignature || extra) return null;
  try {
    const valid = await crypto.subtle.verify(
      'HMAC',
      await hmacKey(secret),
      base64UrlDecode(encodedSignature),
      encoder.encode(encodedPayload),
    );
    if (!valid) return null;
    const payload = JSON.parse(decoder.decode(base64UrlDecode(encodedPayload)));
    const now = Math.floor(Date.now() / 1000);
    if (payload.type !== expectedType || !Number.isFinite(payload.exp) || payload.exp <= now) return null;
    return payload;
  } catch {
    return null;
  }
}

export function allowedLogins(env) {
  return new Set(String(env.ALLOWED_GITHUB_LOGINS ?? '').split(',').map((login) => login.trim().toLowerCase()).filter(Boolean));
}

export function isAllowedLogin(login, env) {
  return allowedLogins(env).has(String(login ?? '').toLowerCase());
}

export function safeReturnUrl(value, env) {
  try {
    const url = new URL(value);
    const prefix = String(env.EDITOR_PATH_PREFIX || '/');
    if (url.protocol !== 'https:' || url.origin !== env.EDITOR_ORIGIN || !url.pathname.startsWith(prefix)) return null;
    url.searchParams.delete('publisher_session');
    url.hash = '';
    return url.toString();
  } catch {
    return null;
  }
}

export function requestOriginAllowed(request, env) {
  return request.headers.get('Origin') === env.EDITOR_ORIGIN;
}

export function corsHeaders(request, env) {
  if (!requestOriginAllowed(request, env)) return {};
  return {
    'Access-Control-Allow-Origin': env.EDITOR_ORIGIN,
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Max-Age': '600',
    Vary: 'Origin',
  };
}

export function bearerToken(request) {
  const header = request.headers.get('Authorization') ?? '';
  const match = /^Bearer ([A-Za-z0-9._~-]+)$/.exec(header);
  return match?.[1] ?? '';
}

export function securityHeaders() {
  return {
    'Cache-Control': 'no-store',
    'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'; base-uri 'none'",
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
    'Referrer-Policy': 'no-referrer',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
  };
}
