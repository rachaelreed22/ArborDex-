/**
 * API Tests for ArborDex server using Node.js built-in test runner.
 *
 * These tests cover:
 *   1. The health check endpoint (no external dependencies)
 *   2. Auth guard behaviour — every protected route must return 401
 *      when no bearer token is supplied, BEFORE any Supabase call is made.
 *
 * Tests that require a live Supabase connection or real JWT tokens are
 * intentionally out of scope here (they belong in integration / E2E tests).
 */
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');

const app = require('../index');

let server;
let baseUrl;

before(() => {
  server = http.createServer(app);
  return new Promise((resolve) => {
    server.listen(0, () => {
      baseUrl = `http://localhost:${server.address().port}`;
      resolve();
    });
  });
});

after(() => {
  return new Promise((resolve) => server.close(resolve));
});

function request(method, path, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, baseUrl);
    const options = {
      method,
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      headers: { 'Content-Type': 'application/json', ...headers },
    };
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode, body: data });
        }
      });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

// ─── Health check ────────────────────────────────────────────────────────────

test('GET /api/ returns health check', async () => {
  const { status, body } = await request('GET', '/api/');
  assert.equal(status, 200);
  assert.equal(body.status, 'ok');
  assert.equal(body.service, 'ArborDex API');
  assert.ok('staff_guard_enabled' in body);
  assert.ok('winner_email_enabled' in body);
});

// ─── Homeowner auth guard ─────────────────────────────────────────────────────

test('GET /api/homeowners/plants requires auth', async () => {
  const { status, body } = await request('GET', '/api/homeowners/plants');
  assert.equal(status, 401);
  assert.ok(body.error);
});

test('GET /api/homeowners/plants/:id requires auth', async () => {
  const { status, body } = await request('GET', '/api/homeowners/plants/some-id');
  assert.equal(status, 401);
  assert.ok(body.error);
});

test('POST /api/homeowners/plants requires auth', async () => {
  const { status, body } = await request('POST', '/api/homeowners/plants', { name: 'Monstera' });
  assert.equal(status, 401);
  assert.ok(body.error);
});

test('PATCH /api/homeowners/plants/:id requires auth', async () => {
  const { status, body } = await request('PATCH', '/api/homeowners/plants/some-id', { name: 'Updated' });
  assert.equal(status, 401);
  assert.ok(body.error);
});

test('DELETE /api/homeowners/plants/:id requires auth', async () => {
  const { status, body } = await request('DELETE', '/api/homeowners/plants/some-id');
  assert.equal(status, 401);
  assert.ok(body.error);
});

test('POST /api/homeowners/plants/:id/diagnostics requires auth', async () => {
  const { status, body } = await request('POST', '/api/homeowners/plants/some-id/diagnostics');
  assert.equal(status, 401);
  assert.ok(body.error);
});

test('POST /api/stripe/create-checkout-session requires auth', async () => {
  const { status, body } = await request('POST', '/api/stripe/create-checkout-session', { tier: 'pro' });
  assert.equal(status, 401);
  assert.ok(body.error);
});

test('POST /api/stripe/create-portal-session requires auth', async () => {
  const { status, body } = await request('POST', '/api/stripe/create-portal-session');
  assert.equal(status, 401);
  assert.ok(body.error);
});

// ─── 404 for unknown routes ───────────────────────────────────────────────────

test('Unknown route returns 404', async () => {
  const { status } = await request('GET', '/api/does-not-exist');
  assert.equal(status, 404);
});
