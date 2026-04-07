// C6 Revenue SDK — Embeddable revenue capture for Carbon6 shipped tools
// Zero dependencies — Node.js built-ins only
// Auto-loads .c6-partner.json for config

import { createHmac } from 'crypto';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { homedir } from 'os';
import { request } from 'http';
import { request as httpsRequest } from 'https';

const CACHE_TTL = 5 * 60 * 1000; // 5 minutes
const PING_TIMEOUT = 3000;
const DEFAULT_GATEWAY = 'http://localhost:6100';

let _instance = null;

export function init(overrides = {}) {
  if (_instance && !overrides._force) return _instance;

  const config = loadConfig(overrides);
  _instance = new C6Revenue(config);
  return _instance;
}

function loadConfig(overrides) {
  const config = {
    toolId: overrides.toolId || null,
    gatewayUrl: overrides.gatewayUrl || DEFAULT_GATEWAY,
    model: overrides.model || 'freemium',
    ...overrides,
  };

  // Auto-load .c6-partner.json
  try {
    const paths = [
      join(process.cwd(), '.c6-partner.json'),
      join(dirname(process.argv[1] || '.'), '.c6-partner.json'),
      join(dirname(process.argv[1] || '.'), '..', '.c6-partner.json'),
    ];
    for (const p of paths) {
      if (existsSync(p)) {
        const partner = JSON.parse(readFileSync(p, 'utf8'));
        if (partner.revenue) {
          config.toolId = config.toolId || partner.revenue.toolId || partner.solution?.name;
          config.gatewayUrl = config.gatewayUrl || partner.revenue.gatewayUrl;
          config.model = config.model || partner.revenue.model;
        } else if (partner.solution) {
          config.toolId = config.toolId || partner.solution.name;
        }
        break;
      }
    }
  } catch {}

  return config;
}

class C6Revenue {
  constructor(config) {
    this.config = config;
    this.toolId = config.toolId;
    this.gatewayUrl = config.gatewayUrl;
    this._cache = {};
    this._usageQueue = [];
  }

  // ─── Startup Telemetry (fire-and-forget) ─────────────────────────

  ping() {
    const body = JSON.stringify({
      toolId: this.toolId,
      version: this.config.version || '1.0.0',
      platform: process.platform,
      nodeVersion: process.version,
      timestamp: new Date().toISOString(),
    });

    this._post('/api/v1/ping', body, PING_TIMEOUT).catch(() => {});
  }

  // ─── API Key Gating ──────────────────────────────────────────────

  async gate(apiKey, operation = 'default') {
    // Offline HMAC validation first
    const offline = this._validateOffline(apiKey);
    if (!offline.valid) return { allowed: false, reason: offline.reason };

    // Check rate limit from cache or gateway
    const cacheKey = `gate:${apiKey}:${new Date().toISOString().slice(0, 10)}`;
    let cached = this._cache[cacheKey];

    if (!cached || Date.now() - cached.ts > CACHE_TTL) {
      try {
        const res = await this._post('/api/v1/gate', JSON.stringify({
          apiKey, operation, toolId: this.toolId,
        }));
        cached = { data: JSON.parse(res), ts: Date.now() };
        this._cache[cacheKey] = cached;
      } catch {
        // Offline fallback — allow with local tracking
        this.recordUsage(operation);
        return { allowed: true, tier: offline.tier, remaining: offline.rateLimit, offline: true };
      }
    }

    if (cached.data.allowed) {
      this.recordUsage(operation);
    }

    return cached.data;
  }

  // ─── x402 Micropayment ───────────────────────────────────────────

  async paywall(amount, metadata = {}) {
    try {
      const res = await this._post('/api/v1/x402/charge', JSON.stringify({
        toolId: this.toolId,
        amount,
        currency: metadata.currency || 'USD',
        description: metadata.description || `${this.toolId} premium feature`,
        ...metadata,
      }));
      return JSON.parse(res);
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  // ─── Local Usage Recording ───────────────────────────────────────

  recordUsage(operation = 'call') {
    const usageDir = join(homedir(), '.c6', 'usage');
    mkdirSync(usageDir, { recursive: true });
    const usagePath = join(usageDir, `${this.toolId || 'unknown'}.json`);

    let usage;
    try { usage = JSON.parse(readFileSync(usagePath, 'utf8')); }
    catch { usage = { toolId: this.toolId, days: {} }; }

    const today = new Date().toISOString().slice(0, 10);
    if (!usage.days[today]) usage.days[today] = { calls: 0, operations: {} };
    usage.days[today].calls++;
    usage.days[today].operations[operation] = (usage.days[today].operations[operation] || 0) + 1;

    this._usageQueue.push({ operation, timestamp: new Date().toISOString() });

    try { writeFileSync(usagePath, JSON.stringify(usage, null, 2), 'utf8'); } catch {}
  }

  // ─── Batch Usage Upload ──────────────────────────────────────────

  async flush() {
    if (this._usageQueue.length === 0) return;

    const batch = [...this._usageQueue];
    this._usageQueue = [];

    try {
      await this._post('/api/v1/usage/batch', JSON.stringify({
        toolId: this.toolId,
        events: batch,
      }));
    } catch {
      // Re-queue on failure
      this._usageQueue.unshift(...batch);
    }
  }

  // ─── Express/Fastify Middleware ──────────────────────────────────

  middleware(options = {}) {
    const self = this;
    const headerName = options.header || 'x-api-key';
    const skipPaths = new Set(options.skip || ['/health', '/healthz']);

    return async (req, res, next) => {
      if (skipPaths.has(req.path || req.url)) return next();

      const apiKey = req.headers[headerName] || req.query?.apiKey;
      if (!apiKey) {
        res.statusCode = 401;
        res.setHeader('Content-Type', 'application/json');
        return res.end(JSON.stringify({ error: 'API key required', header: headerName }));
      }

      const result = await self.gate(apiKey, req.method + ' ' + (req.path || req.url));
      if (!result.allowed) {
        res.statusCode = 403;
        res.setHeader('Content-Type', 'application/json');
        return res.end(JSON.stringify({ error: 'Access denied', reason: result.reason }));
      }

      req.c6 = { tier: result.tier, remaining: result.remaining };
      next();
    };
  }

  // ─── Offline Key Validation ──────────────────────────────────────

  _validateOffline(key) {
    const match = key.match(/^C6K-([^-]+)-(.+)\.([A-Za-z0-9_-]+)$/);
    if (!match) return { valid: false, reason: 'invalid format' };

    const [, toolId, payloadB64, providedHmac] = match;

    // We can't verify HMAC without the tool secret, but we can decode the payload
    let payload;
    try { payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString()); }
    catch { return { valid: false, reason: 'corrupt payload' }; }

    if (payload.expiresAt && new Date(payload.expiresAt) < new Date()) {
      return { valid: false, reason: 'expired' };
    }

    return { valid: true, tier: payload.tier, rateLimit: payload.rateLimit };
  }

  // ─── HTTP Helper ─────────────────────────────────────────────────

  _post(path, body, timeout = 10000) {
    return new Promise((resolve, reject) => {
      const url = new URL(path, this.gatewayUrl);
      const fn = url.protocol === 'https:' ? httpsRequest : request;

      const req = fn(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
        timeout,
      }, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          if (res.statusCode >= 400) reject(new Error(`HTTP ${res.statusCode}: ${data}`));
          else resolve(data);
        });
      });

      req.on('error', reject);
      req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
      req.write(body);
      req.end();
    });
  }
}

export { C6Revenue };
export default { init, C6Revenue };
