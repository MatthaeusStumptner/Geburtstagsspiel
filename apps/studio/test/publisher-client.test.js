import test from 'node:test';
import assert from 'node:assert/strict';
import { PublisherClient, PublisherRequestError, normalizePublisherUrl } from '../src/publisher-client.js';

test('publisher URLs require HTTPS except on local development', () => {
  assert.equal(normalizePublisherUrl('https://publisher.example/'), 'https://publisher.example');
  assert.equal(normalizePublisherUrl('http://publisher.example'), '');
  assert.equal(normalizePublisherUrl('javascript:alert(1)'), '');
  assert.equal(normalizePublisherUrl('http://localhost:8787/'), 'http://localhost:8787');
});

test('OAuth session is consumed from the fragment and removed immediately', async () => {
  let cleanedUrl = '';
  const requests = [];
  const client = new PublisherClient({
    baseUrl: 'https://publisher.example',
    fetchImpl: async (url, options) => {
      requests.push({ url, options });
      return new Response(JSON.stringify({ login: 'freundin', name: 'Freundin' }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    },
  });
  assert.equal(client.consumeSessionFromLocation(
    { hash: '#publisher_session=abc.def-123&tab=level', pathname: '/editor/', search: '?level=hals' },
    { replaceState: (_state, _title, url) => { cleanedUrl = url; } },
  ), true);
  assert.equal(cleanedUrl, '/editor/?level=hals#tab=level');
  assert.deepEqual(await client.me(), { login: 'freundin', name: 'Freundin' });
  assert.equal(requests[0].options.headers.Authorization, 'Bearer abc.def-123');
});

test('session stays in memory and is cleared after unauthorized responses', async () => {
  const client = new PublisherClient({
    baseUrl: 'https://publisher.example',
    fetchImpl: async () => new Response(JSON.stringify({ error: 'Bitte erneut anmelden.' }), { status: 401, headers: { 'Content-Type': 'application/json' } }),
  });
  client.consumeSessionFromLocation(
    { hash: '#publisher_session=temporary', pathname: '/', search: '' },
    { replaceState() {} },
  );
  await assert.rejects(client.me(), /erneut anmelden/);
  assert.equal(client.authenticated, false);
});

test('publishing sends all selected level documents in one request', async () => {
  let body;
  const client = new PublisherClient({
    baseUrl: 'https://publisher.example',
    fetchImpl: async (_url, options) => {
      body = JSON.parse(options.body);
      return new Response(JSON.stringify({ publicationId: 7, state: 'testing' }), { status: 202, headers: { 'Content-Type': 'application/json' } });
    },
  });
  client.consumeSessionFromLocation({ hash: '#publisher_session=token', pathname: '/', search: '' }, { replaceState() {} });
  const selected = [{ id: 'hals', name: { standard: 'Hals' } }, { id: 'home', name: { standard: 'Bramerhof' } }];
  const result = await client.publish(selected);
  assert.deepEqual(body, { levels: selected });
  assert.equal(result.publicationId, 7);
});

test('shared drafts use revisions and expose conflicts to the editor', async () => {
  const requests = [];
  const client = new PublisherClient({
    baseUrl: 'https://publisher.example',
    fetchImpl: async (url, options = {}) => {
      requests.push({ url, options });
      if (options.method === 'PUT') return new Response(JSON.stringify({ error: 'Revision veraltet.', current: { id: 'hals', revision: 4 } }), { status: 409, headers: { 'Content-Type': 'application/json' } });
      return new Response(JSON.stringify({ drafts: [] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    },
  });
  client.consumeSessionFromLocation({ hash: '#publisher_session=token', pathname: '/', search: '' }, { replaceState() {} });
  await client.bootstrapDrafts();
  await assert.rejects(
    client.saveDraft({ id: 'hals' }, 3),
    (error) => error instanceof PublisherRequestError && error.status === 409 && error.current.revision === 4,
  );
  assert.equal(requests[0].options.method, 'POST');
  assert.deepEqual(JSON.parse(requests[1].options.body), { level: { id: 'hals' }, expectedRevision: 3 });
});

test('publication can reference exact shared draft revisions', async () => {
  let body;
  const client = new PublisherClient({
    baseUrl: 'https://publisher.example',
    fetchImpl: async (_url, options) => {
      body = JSON.parse(options.body);
      return new Response(JSON.stringify({ publicationId: 8 }), { status: 202, headers: { 'Content-Type': 'application/json' } });
    },
  });
  client.consumeSessionFromLocation({ hash: '#publisher_session=token', pathname: '/', search: '' }, { replaceState() {} });
  await client.publishDrafts([{ id: 'hals', revision: 7 }]);
  assert.deepEqual(body, { drafts: [{ id: 'hals', revision: 7 }] });
});

test('content registry saves typed documents and publishes mixed exact revisions', async () => {
  const requests = [];
  const client = new PublisherClient({
    baseUrl: 'https://publisher.example',
    fetchImpl: async (url, options = {}) => {
      requests.push({ url, options });
      return new Response(JSON.stringify({ type: 'character', id: 'postler', revision: 2, publicationId: 9, items: [] }), {
        status: options.method === 'POST' && url.endsWith('/api/publish') ? 202 : 200,
        headers: { 'Content-Type': 'application/json' },
      });
    },
  });
  client.consumeSessionFromLocation({ hash: '#publisher_session=token', pathname: '/', search: '' }, { replaceState() {} });
  const content = { kind: 'franz-lola-content', schemaVersion: 1, type: 'character', id: 'postler' };
  await client.bootstrapContent();
  await client.saveContent(content, 1);
  await client.publishContent({ drafts: [{ id: 'hals', revision: 4 }], items: [{ type: 'character', id: 'postler', revision: 2 }] });
  assert.equal(requests[0].url, 'https://publisher.example/api/content/bootstrap');
  assert.equal(requests[1].url, 'https://publisher.example/api/content/character/postler');
  assert.deepEqual(JSON.parse(requests[1].options.body), { content, expectedRevision: 1 });
  assert.deepEqual(JSON.parse(requests[2].options.body), {
    drafts: [{ id: 'hals', revision: 4 }],
    items: [{ type: 'character', id: 'postler', revision: 2 }],
  });
});
