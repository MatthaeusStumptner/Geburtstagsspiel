import { readFile } from 'node:fs/promises';
import { assertPublishedContentPaths, assertPublisherPullRequest } from './publish-guard.mjs';

const event = JSON.parse(await readFile(process.env.GITHUB_EVENT_PATH, 'utf8'));
const pullRequest = event.pull_request;
const expectedBot = String(process.env.PUBLISHER_BOT_LOGIN ?? '').trim();
const token = process.env.GITHUB_TOKEN;

if (!token) throw new Error('Publishing-Prüfung ist nicht vollständig konfiguriert.');
assertPublisherPullRequest(pullRequest, expectedBot);

const changedFiles = [];
for (let page = 1; page <= 10; page += 1) {
  const response = await fetch(`${pullRequest.url}/files?per_page=100&page=${page}`, {
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': '2026-03-10',
    },
  });
  if (!response.ok) throw new Error(`GitHub-Dateiliste konnte nicht geprüft werden (${response.status}).`);
  const files = await response.json();
  changedFiles.push(...files.map((file) => file.filename));
  if (files.length < 100) break;
}

assertPublishedContentPaths(changedFiles);
console.log(`Vertrauenswürdiger Publishing-PR mit ${changedFiles.length} Inhaltsdatei(en).`);
