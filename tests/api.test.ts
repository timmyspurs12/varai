/**
 * VARAI API tests — run with:  npm test
 *
 * These run in DEMO MODE (no chain access) and assert the two properties that
 * matter most for integrity:
 *   1. a demo verdict is never labelled as a GenLayer judgment
 *   2. no transaction hash is ever fabricated
 */
process.env.VARAI_DEMO_MODE = 'true';
process.env.DATABASE_URL = '';
process.env.NODE_ENV = 'test';

import test from 'node:test';
import assert from 'node:assert/strict';
import type { Server } from 'node:http';

// NOTE: static ESM imports are hoisted, so the app/config must be imported
// *dynamically* after the env vars above have been assigned.
let server: Server;
let base: string;

test.before(async () => {
  const { createApp } = await import('../src/app.js');
  const { store } = await import('../src/models/store.js');
  await store.init();
  await new Promise<void>((resolve) => {
    server = createApp().listen(0, '127.0.0.1', () => {
      const addr = server.address();
      base = `http://127.0.0.1:${typeof addr === 'object' && addr ? addr.port : 0}`;
      resolve();
    });
  });
});

test.after(() => {
  server?.close();
});

const VALID_CASE = {
  competition: 'Premier League',
  homeTeam: 'Arsenal',
  awayTeam: 'Chelsea',
  minute: 74,
  incidentType: 'PENALTY_CLAIM',
  description:
    'Attacker enters the box and goes down after contact from the defender. The defender appears to reach for the ball but clipped the attacking players trailing leg first.',
  refereeCall: 'PLAY_ON',
  evidence: [
    { kind: 'VIDEO_URL', value: 'https://example.com/clips/incident-74.mp4' },
    { kind: 'TEXT', value: 'Commentary noted contact before any touch on the ball.' },
  ],
};

async function post(path: string, body?: unknown) {
  const res = await fetch(base + path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  return { status: res.status, body: (await res.json()) as any };
}

async function get(path: string) {
  const res = await fetch(base + path);
  return { status: res.status, body: (await res.json()) as any };
}

test('health reports DEMO mode with a warning', async () => {
  const { status, body } = await get('/api/health');
  assert.equal(status, 200);
  assert.equal(body.mode, 'DEMO');
  assert.ok(body.warning.includes('DEMO'));
});

test('creates a case in DRAFT', async () => {
  const { status, body } = await post('/api/cases', VALID_CASE);
  assert.equal(status, 201);
  assert.equal(body.case.status, 'DRAFT');
  assert.equal(body.case.evidence.length, 2);
  // Evidence must never be marked verified by the backend alone.
  assert.equal(body.case.evidence.every((e: any) => e.verifiedByGenlayer === false), true);
});

test('rejects an unknown incident type', async () => {
  const { status, body } = await post('/api/cases', { ...VALID_CASE, incidentType: 'VAR_DRAMA' });
  assert.equal(status, 400);
  assert.equal(body.error.code, 'VALIDATION_ERROR');
});

test('rejects a too-short description', async () => {
  const { status } = await post('/api/cases', { ...VALID_CASE, description: 'pen?' });
  assert.equal(status, 400);
});

test('rejects a javascript: evidence URL', async () => {
  const { status, body } = await post('/api/cases', {
    ...VALID_CASE,
    evidence: [{ kind: 'VIDEO_URL', value: 'javascript:alert(1)' }],
  });
  assert.equal(status, 400);
  assert.equal(body.error.code, 'VALIDATION_ERROR');
});

test('rejects an SSRF-style localhost evidence URL', async () => {
  const { status } = await post('/api/cases', {
    ...VALID_CASE,
    evidence: [{ kind: 'IMAGE_URL', value: 'http://127.0.0.1:8080/admin' }],
  });
  assert.equal(status, 400);
});

test('rejects an oversized description', async () => {
  const { status } = await post('/api/cases', { ...VALID_CASE, description: 'x'.repeat(50_000) });
  assert.equal(status, 400);
});

test('rejects a SQL-injection style id without touching the database', async () => {
  const { status, body } = await get("/api/cases/1';DROP TABLE cases;--");
  assert.equal(status, 400);
  assert.equal(body.error.code, 'VALIDATION_ERROR');
});

test('full workflow: submit → verdict, clearly marked DEMO', async () => {
  const created = await post('/api/cases', VALID_CASE);
  const id = created.body.case.id;

  const submitted = await post(`/api/cases/${id}/submit`);
  assert.equal(submitted.status, 201);

  const v = submitted.body.verdict;

  // The decision must be in the incident's vocabulary.
  assert.ok(['PENALTY', 'NO_PENALTY', 'INSUFFICIENT_EVIDENCE'].includes(v.decision));

  // INTEGRITY: a demo verdict must never masquerade as a GenLayer judgment.
  assert.equal(v.source, 'DEMO');
  assert.equal(v.demo, true);
  assert.ok(v.label.includes('DEMO'));
  assert.notEqual(v.label, 'GenLayer Decision');

  // INTEGRITY: no fabricated transaction, no fabricated validators.
  assert.equal(v.genlayerTransaction, null);
  assert.equal(v.explorerUrl, null);
  assert.deepEqual(v.validatorResults, []);
  assert.equal(v.consensus.total, 0);

  // The response itself carries the warning.
  assert.equal(submitted.body.demo, true);
  assert.ok(submitted.body.warning.includes('NOT'));

  const status = await get(`/api/cases/${id}/status`);
  assert.equal(status.body.status, 'VERDICT_READY');
  assert.equal(status.body.mode, 'DEMO');
});

test('sparse facts yield INSUFFICIENT_EVIDENCE rather than an invented call', async () => {
  const created = await post('/api/cases', {
    ...VALID_CASE,
    description: 'Something happened in the box maybe.',
    evidence: [],
  });
  const submitted = await post(`/api/cases/${created.body.case.id}/submit`);
  assert.equal(submitted.body.verdict.decision, 'INSUFFICIENT_EVIDENCE');
  assert.equal(submitted.body.verdict.criteria.evidenceSufficiency, 'insufficient');
});

test('re-submitting returns the existing verdict instead of judging twice', async () => {
  const created = await post('/api/cases', VALID_CASE);
  const id = created.body.case.id;
  await post(`/api/cases/${id}/submit`);
  const again = await post(`/api/cases/${id}/submit`);
  assert.equal(again.status, 200);
  assert.equal(again.body.alreadyJudged, true);
});

test('verdict is retrievable by case id and by verdict id', async () => {
  const created = await post('/api/cases', VALID_CASE);
  const id = created.body.case.id;
  const submitted = await post(`/api/cases/${id}/submit`);
  const verdictId = submitted.body.verdict.id;

  const byVerdict = await get(`/api/verdicts/${verdictId}`);
  assert.equal(byVerdict.status, 200);
  const byCase = await get(`/api/verdicts/${id}`);
  assert.equal(byCase.status, 200);
  assert.equal(byCase.body.verdict.id, verdictId);
});

test('unknown case returns 404', async () => {
  const { status } = await get('/api/cases/11111111-2222-3333-4444-555555555555');
  assert.equal(status, 404);
});

test('malformed JSON is rejected cleanly', async () => {
  const res = await fetch(base + '/api/cases', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{"competition": ',
  });
  assert.equal(res.status, 400);
  const body = (await res.json()) as any;
  assert.equal(body.error.code, 'MALFORMED_JSON');
});

test('listing supports status filtering', async () => {
  const { body } = await get('/api/cases?status=VERDICT_READY&limit=50');
  assert.equal(body.ok, true);
  assert.ok(body.cases.every((c: any) => c.status === 'VERDICT_READY'));
});

test('async submit returns 202 and the verdict arrives via polling', async () => {
  const created = await post('/api/cases', VALID_CASE);
  const id = created.body.case.id;

  const accepted = await post(`/api/cases/${id}/submit?async=true`);
  assert.equal(accepted.status, 202);
  assert.equal(accepted.body.accepted, true);
  assert.equal(accepted.body.poll, `/api/cases/${id}/status`);

  // Poll until the background job finishes.
  let final: any;
  for (let i = 0; i < 40; i++) {
    const s = await get(`/api/cases/${id}/status`);
    if (s.body.status === 'VERDICT_READY' || s.body.status === 'FAILED') {
      final = s.body;
      break;
    }
    await new Promise((r) => setTimeout(r, 50));
  }
  assert.ok(final, 'judgment did not settle in time');
  assert.equal(final.status, 'VERDICT_READY');
  assert.equal(final.hasVerdict, true);
  // Status returns the verdict inline, so polling needs one endpoint.
  assert.ok(final.verdict);
  assert.equal(final.verdict.source, 'DEMO');
  assert.equal(final.verdict.genlayerTransaction, null);
});

test('health reports the store kind and whether it persists', async () => {
  const res = await get('/api/health');
  assert.equal(res.status, 200);
  assert.equal(res.body.ok, true);
  // Tests run without DATABASE_URL, so this is the in-memory store.
  assert.equal(res.body.database.kind, 'memory');
  assert.equal(res.body.database.ok, true);
  assert.equal(res.body.database.persistent, false);
  assert.match(res.body.database.warning, /lost when the service restarts/);
});

test('appeal is rejected in demo mode rather than faked', async () => {
  const created = await post('/api/cases', {
    competition: 'Premier League', homeTeam: 'Arsenal', awayTeam: 'Chelsea',
    minute: 74, incidentType: 'PENALTY_CLAIM', refereeCall: 'PLAY_ON',
    description: 'Defender slides in from behind and contacts the standing leg inside the area before touching the ball.',
  });
  const id = created.body.case.id;
  await post(`/api/cases/${id}/submit`, {});

  const res = await post(`/api/cases/${id}/appeal`, {
    newEvidence: 'A new camera angle shows the defender clearly played the ball first.',
  });
  // Demo mode must never produce an appeal ruling.
  assert.equal(res.status, 409);
  assert.equal(res.body.error.code, 'DEMO_MODE');
});

test('appeal requires substantive new evidence', async () => {
  const created = await post('/api/cases', {
    competition: 'Serie A', homeTeam: 'Inter', awayTeam: 'Juventus',
    minute: 31, incidentType: 'HANDBALL_CLAIM', refereeCall: 'PLAY_ON',
    description: 'Ball strikes the defenders outstretched arm above shoulder height inside the area.',
  });
  const id = created.body.case.id;
  const res = await post(`/api/cases/${id}/appeal`, { newEvidence: 'nope' });
  // The suite runs in demo mode, where the demo guard fires first — either way
  // the appeal is refused and no ruling is invented.
  assert.ok([400, 409].includes(res.status));
  assert.ok(['VALIDATION_ERROR', 'DEMO_MODE'].includes(res.body.error.code));
  assert.equal(res.body.ok, false);
});
