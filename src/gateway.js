// C6 Revenue Gateway — Lightweight API server on :6100
// No frameworks — Node http module only

import { createServer } from 'http';
import { loadDB, saveDB } from './revenue.js';
import { validateApiKey, recordUsage, getRevenueSummary, generateApiKey, listKeys, revokeKey } from './revenue.js';

const DEFAULT_PORT = 6100;

export function startGateway(port = DEFAULT_PORT) {
  const server = createServer(async (req, res) => {
    const url = new URL(req.url, `http://localhost:${port}`);
    const path = url.pathname;

    // CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-api-key');
    if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }

    try {
      // Route
      if (path === '/api/v1/ping' && req.method === 'POST') {
        await handlePing(req, res);
      } else if (path === '/api/v1/gate' && req.method === 'POST') {
        await handleGate(req, res);
      } else if (path === '/api/v1/usage/batch' && req.method === 'POST') {
        await handleUsageBatch(req, res);
      } else if (path === '/api/v1/keys/generate' && req.method === 'POST') {
        await handleKeysGenerate(req, res);
      } else if (path === '/api/v1/keys/list' && req.method === 'GET') {
        handleKeysList(url, res);
      } else if (path === '/api/v1/keys/revoke' && req.method === 'POST') {
        await handleKeysRevoke(req, res);
      } else if (path === '/api/v1/revenue' && req.method === 'GET') {
        handleRevenue(url, res);
      } else if (path === '/api/v1/revenue/html' && req.method === 'GET') {
        handleRevenueHtml(res);
      } else if (path.startsWith('/api/v1/x402/')) {
        await handleX402(req, res, path);
      } else if (path === '/' || path === '/health') {
        json(res, { status: 'ok', service: 'c6-revenue-gateway', version: '2.0.0' });
      } else {
        json(res, { error: 'not found' }, 404);
      }
    } catch (err) {
      json(res, { error: err.message }, 500);
    }
  });

  server.listen(port, () => {
    console.log(`\n  C6 Revenue Gateway running on http://localhost:${port}`);
    console.log(`  Dashboard: http://localhost:${port}/api/v1/revenue/html`);
    console.log(`  Press Ctrl+C to stop\n`);
  });

  return server;
}

// ─── Handlers ────────────────────────────────────────────────────────

async function handlePing(req, res) {
  const body = await readBody(req);
  const data = JSON.parse(body);

  const db = loadDB();
  if (!db.pings) db.pings = [];
  db.pings.push({ ...data, receivedAt: new Date().toISOString() });
  // Keep last 1000 pings
  if (db.pings.length > 1000) db.pings = db.pings.slice(-1000);
  saveDB(db);

  json(res, { ok: true });
}

async function handleGate(req, res) {
  const body = await readBody(req);
  const { apiKey, operation, toolId } = JSON.parse(body);

  if (!apiKey) return json(res, { allowed: false, reason: 'no key' }, 400);

  const result = validateApiKey(apiKey, toolId);
  if (!result.valid) return json(res, { allowed: false, reason: result.reason });

  // Check daily rate limit
  const db = loadDB();
  const today = new Date().toISOString().slice(0, 10);
  const usageKey = `${result.hash}:${today}`;
  if (!db.dailyUsage) db.dailyUsage = {};
  const used = db.dailyUsage[usageKey] || 0;

  if (result.rateLimit > 0 && used >= result.rateLimit) {
    return json(res, { allowed: false, reason: 'rate limit exceeded', limit: result.rateLimit, used });
  }

  // Increment usage
  db.dailyUsage[usageKey] = used + 1;
  saveDB(db);

  // Record usage for revenue tracking
  recordUsage(result.toolId, operation || 'call');

  json(res, {
    allowed: true,
    tier: result.tier,
    remaining: result.rateLimit > 0 ? result.rateLimit - used - 1 : -1,
    used: used + 1,
  });
}

async function handleUsageBatch(req, res) {
  const body = await readBody(req);
  const { toolId, events } = JSON.parse(body);

  if (!toolId || !events?.length) return json(res, { error: 'toolId and events required' }, 400);

  for (const event of events) {
    recordUsage(toolId, event.operation || 'call');
  }

  json(res, { ok: true, recorded: events.length });
}

async function handleKeysGenerate(req, res) {
  const body = await readBody(req);
  const { toolId, tier, expiresAt, rateLimit, label } = JSON.parse(body);

  if (!toolId) return json(res, { error: 'toolId required' }, 400);

  const result = generateApiKey(toolId, tier || 'free', { expiresAt, rateLimit, label });
  json(res, result, 201);
}

function handleKeysList(url, res) {
  const toolId = url.searchParams.get('toolId');
  if (!toolId) return json(res, { error: 'toolId query param required' }, 400);

  const keys = listKeys(toolId);
  json(res, { toolId, keys, count: keys.length });
}

async function handleKeysRevoke(req, res) {
  const body = await readBody(req);
  const { hash } = JSON.parse(body);

  if (!hash) return json(res, { error: 'hash required' }, 400);

  const success = revokeKey(hash);
  json(res, { ok: success, hash });
}

function handleRevenue(url, res) {
  const toolId = url.searchParams.get('toolId');
  const summary = getRevenueSummary(toolId || null);
  json(res, summary);
}

function handleRevenueHtml(res) {
  const summary = getRevenueSummary();
  const db = loadDB();

  const toolRows = Object.entries(summary.tools || {}).map(([id, t]) => `
    <tr>
      <td>${id}</td>
      <td>${t.model}</td>
      <td>${t.activeKeys}</td>
      <td>${t.calls.toLocaleString()}</td>
      <td>$${t.total.toFixed(2)}</td>
      <td>$${t.carbon6.toFixed(2)}</td>
      <td>$${t.partner.toFixed(2)}</td>
    </tr>`).join('');

  const html = `<!DOCTYPE html>
<html>
<head>
  <title>C6 Revenue Dashboard</title>
  <meta charset="utf-8">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, sans-serif; background: #0a0a0f; color: #e0e0e0; padding: 2rem; }
    h1 { color: #00b4d8; margin-bottom: 0.5rem; }
    .subtitle { color: #666; margin-bottom: 2rem; }
    .cards { display: flex; gap: 1rem; margin-bottom: 2rem; flex-wrap: wrap; }
    .card { background: #1a1a2e; border: 1px solid #333; border-radius: 8px; padding: 1.5rem; min-width: 180px; }
    .card .label { color: #888; font-size: 0.85rem; text-transform: uppercase; }
    .card .value { font-size: 1.8rem; font-weight: bold; margin-top: 0.25rem; }
    .card .value.cyan { color: #00b4d8; }
    .card .value.green { color: #10b981; }
    .card .value.yellow { color: #f59e0b; }
    table { width: 100%; border-collapse: collapse; background: #1a1a2e; border-radius: 8px; overflow: hidden; }
    th { background: #16213e; color: #00b4d8; padding: 0.75rem 1rem; text-align: left; font-size: 0.85rem; text-transform: uppercase; }
    td { padding: 0.75rem 1rem; border-top: 1px solid #222; }
    tr:hover td { background: #16213e33; }
    .footer { margin-top: 2rem; color: #444; text-align: center; }
  </style>
</head>
<body>
  <h1>C6 Revenue Dashboard</h1>
  <p class="subtitle">Powered by CARBON[6] — 15% platform / 85% partner</p>

  <div class="cards">
    <div class="card">
      <div class="label">Total Revenue</div>
      <div class="value cyan">$${summary.totalRevenue.toFixed(2)}</div>
    </div>
    <div class="card">
      <div class="label">Carbon6 Share (15%)</div>
      <div class="value green">$${summary.totalCarbon6.toFixed(2)}</div>
    </div>
    <div class="card">
      <div class="label">Partner Share (85%)</div>
      <div class="value green">$${summary.totalPartner.toFixed(2)}</div>
    </div>
    <div class="card">
      <div class="label">Total API Calls</div>
      <div class="value yellow">${summary.totalCalls.toLocaleString()}</div>
    </div>
    <div class="card">
      <div class="label">Active Tools</div>
      <div class="value cyan">${Object.keys(summary.tools || {}).length}</div>
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th>Tool</th>
        <th>Model</th>
        <th>Keys</th>
        <th>Calls</th>
        <th>Revenue</th>
        <th>C6 (15%)</th>
        <th>Partner (85%)</th>
      </tr>
    </thead>
    <tbody>
      ${toolRows || '<tr><td colspan="7" style="text-align:center;color:#666">No tools registered yet</td></tr>'}
    </tbody>
  </table>

  <p class="footer">C6 Revenue Gateway — Updated: ${db.updated || 'never'}</p>
</body>
</html>`;

  res.writeHead(200, { 'Content-Type': 'text/html' });
  res.end(html);
}

async function handleX402(req, res, path) {
  const action = path.replace('/api/v1/x402/', '');

  if (action === 'charge' && req.method === 'POST') {
    const body = await readBody(req);
    const { toolId, amount, currency, description } = JSON.parse(body);

    // Record as revenue
    recordUsage(toolId, 'x402-charge', 1, amount || 0);

    json(res, {
      success: true,
      chargeId: `x402-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      amount,
      currency: currency || 'USD',
      toolId,
      carbon6Share: (amount * 0.15).toFixed(4),
      partnerShare: (amount * 0.85).toFixed(4),
    });
  } else {
    json(res, { error: 'unknown x402 action' }, 404);
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────

function json(res, data, status = 200) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => data += chunk);
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}
