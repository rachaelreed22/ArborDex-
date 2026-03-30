/**
 * API Tests for ArborDex server using Node.js built-in test runner
 */
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');

// Use an in-memory SQLite database for tests
process.env.DB_PATH = ':memory:';

const app = require('../index');

let server;
let baseUrl;
let createdTreeId;

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

function request(method, path, body) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, baseUrl);
    const options = {
      method,
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      headers: { 'Content-Type': 'application/json' },
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

test('GET /api/trees returns empty array initially', async () => {
  const { status, body } = await request('GET', '/api/trees');
  assert.equal(status, 200);
  assert.ok(Array.isArray(body));
  assert.equal(body.length, 0);
});

test('POST /api/trees creates a new tree', async () => {
  const { status, body } = await request('POST', '/api/trees', {
    common_name: 'White Oak',
    scientific_name: 'Quercus alba',
    species: 'Quercus',
    family: 'Fagaceae',
    condition: 'Good',
    height_ft: 45,
    diameter_in: 18,
    age_years: 80,
    gps_lat: 38.5767,
    gps_lng: -92.1735,
    location_description: 'Near east trailhead',
  });
  assert.equal(status, 201);
  assert.equal(body.common_name, 'White Oak');
  assert.equal(body.scientific_name, 'Quercus alba');
  assert.equal(body.condition, 'Good');
  assert.ok(body.id);
  createdTreeId = body.id;
});

test('POST /api/trees returns 400 without common_name', async () => {
  const { status } = await request('POST', '/api/trees', { scientific_name: 'Pinus' });
  assert.equal(status, 400);
});

test('GET /api/trees returns list with created tree', async () => {
  const { status, body } = await request('GET', '/api/trees');
  assert.equal(status, 200);
  assert.equal(body.length, 1);
  assert.equal(body[0].common_name, 'White Oak');
});

test('GET /api/trees/:id returns the tree', async () => {
  const { status, body } = await request('GET', `/api/trees/${createdTreeId}`);
  assert.equal(status, 200);
  assert.equal(body.id, createdTreeId);
  assert.equal(body.common_name, 'White Oak');
});

test('GET /api/trees/:id returns 404 for unknown id', async () => {
  const { status } = await request('GET', '/api/trees/nonexistent-id');
  assert.equal(status, 404);
});

test('PUT /api/trees/:id updates the tree', async () => {
  const { status, body } = await request('PUT', `/api/trees/${createdTreeId}`, {
    common_name: 'White Oak',
    condition: 'Excellent',
    height_ft: 50,
  });
  assert.equal(status, 200);
  assert.equal(body.condition, 'Excellent');
  assert.equal(body.height_ft, 50);
});

test('GET /api/trees/:id/photos returns empty array initially', async () => {
  const { status, body } = await request('GET', `/api/trees/${createdTreeId}/photos`);
  assert.equal(status, 200);
  assert.ok(Array.isArray(body));
  assert.equal(body.length, 0);
});

test('GET /api/trees/:id/qrcode returns QR data URL', async () => {
  const { status, body } = await request('GET', `/api/trees/${createdTreeId}/qrcode`);
  assert.equal(status, 200);
  assert.ok(body.qrcode.startsWith('data:image/png;base64,'));
  assert.ok(body.url.includes(createdTreeId));
});

test('DELETE /api/trees/:id deletes the tree', async () => {
  const { status, body } = await request('DELETE', `/api/trees/${createdTreeId}`);
  assert.equal(status, 200);
  assert.equal(body.message, 'Tree deleted');
});

test('GET /api/trees returns empty after deletion', async () => {
  const { status, body } = await request('GET', '/api/trees');
  assert.equal(status, 200);
  assert.equal(body.length, 0);
});
