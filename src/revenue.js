// C6 Launch — Revenue Model + API Key Generation
// Handles key creation, validation, revenue tracking with 15/85 split

import { createHmac, randomBytes } from 'crypto';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

const DB_PATH = join(homedir(), '.c6', 'launch', 'gateway.db.json');
const MASTER_SECRET = process.env.C6_MASTER_SECRET || 'c6-launch-default-secret-change-in-production';
const CARBON6_CUT = 0.15;

// ─── Database ────────────────────────────────────────────────────────

function loadDB() {
  mkdirSync(join(homedir(), '.c6', 'launch'), { recursive: true });
  try {
    return JSON.parse(readFileSync(DB_PATH, 'utf8'));
  } catch {
    return { keys: [], usage: {}, revenue: {}, tools: {}, updated: null };
  }
}

function saveDB(db) {
  db.updated = new Date().toISOString();
  writeFileSync(DB_PATH, JSON.stringify(db, null, 2) + '\n', 'utf8');
}

export { loadDB, saveDB, DB_PATH };

// ─── Tool Secret Derivation ──────────────────────────────────────────

export function deriveToolSecret(toolId) {
  return createHmac('sha256', MASTER_SECRET)
    .update(`c6-tool-secret:${toolId}`)
    .digest('hex');
}

// ─── API Key Generation ──────────────────────────────────────────────

export function generateApiKey(toolId, tier = 'free', options = {}) {
  const payload = {
    tier,
    createdAt: new Date().toISOString(),
    expiresAt: options.expiresAt || null,
    rateLimit: options.rateLimit || getRateLimit(tier),
    label: options.label || null,
  };

  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const secret = deriveToolSecret(toolId);
  const hmac = createHmac('sha256', secret)
    .update(payloadB64)
    .digest('base64url')
    .slice(0, 32);

  const key = `C6K-${toolId}-${payloadB64}.${hmac}`;

  // Store in DB
  const db = loadDB();
  const hash = createHmac('sha256', secret).update(key).digest('hex').slice(0, 12);
  db.keys.push({
    hash,
    toolId,
    tier,
    label: payload.label,
    rateLimit: payload.rateLimit,
    createdAt: payload.createdAt,
    expiresAt: payload.expiresAt,
    revoked: false,
  });
  saveDB(db);

  return { key, hash };
}

// ─── API Key Validation ──────────────────────────────────────────────

export function validateApiKey(key, toolId = null) {
  const match = key.match(/^C6K-([^-]+)-(.+)\.([A-Za-z0-9_-]+)$/);
  if (!match) return { valid: false, reason: 'invalid format' };

  const [, keyToolId, payloadB64, providedHmac] = match;
  if (toolId && keyToolId !== toolId) return { valid: false, reason: 'tool mismatch' };

  const secret = deriveToolSecret(keyToolId);
  const expectedHmac = createHmac('sha256', secret)
    .update(payloadB64)
    .digest('base64url')
    .slice(0, 32);

  if (providedHmac !== expectedHmac) return { valid: false, reason: 'invalid signature' };

  let payload;
  try {
    payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString());
  } catch {
    return { valid: false, reason: 'corrupt payload' };
  }

  if (payload.expiresAt && new Date(payload.expiresAt) < new Date()) {
    return { valid: false, reason: 'expired' };
  }

  // Check revocation
  const db = loadDB();
  const hash = createHmac('sha256', secret).update(key).digest('hex').slice(0, 12);
  const entry = db.keys.find(k => k.hash === hash);
  if (entry?.revoked) return { valid: false, reason: 'revoked' };

  return { valid: true, toolId: keyToolId, tier: payload.tier, rateLimit: payload.rateLimit, hash };
}

// ─── Rate Limits ─────────────────────────────────────────────────────

function getRateLimit(tier) {
  switch (tier) {
    case 'free': return 100;
    case 'pro': return 10000;
    case 'enterprise': return -1; // unlimited
    default: return 100;
  }
}

// ─── Key Management ──────────────────────────────────────────────────

export function listKeys(toolId) {
  const db = loadDB();
  return db.keys.filter(k => k.toolId === toolId && !k.revoked);
}

export function revokeKey(hash) {
  const db = loadDB();
  const key = db.keys.find(k => k.hash === hash);
  if (!key) return false;
  key.revoked = true;
  key.revokedAt = new Date().toISOString();
  saveDB(db);
  return true;
}

// ─── Revenue Configuration ──────────────────────────────────────────

export function configureRevenue(toolId, model = 'freemium', pricing = {}) {
  const db = loadDB();
  db.tools[toolId] = {
    model,
    pricing: {
      perCall: pricing.perCall || 0,
      monthly: pricing.monthly || 0,
      ...pricing,
    },
    configuredAt: new Date().toISOString(),
  };
  saveDB(db);
}

// ─── Usage Tracking ──────────────────────────────────────────────────

export function recordUsage(toolId, operation = 'call', count = 1, revenue = 0) {
  const db = loadDB();
  const today = new Date().toISOString().slice(0, 10);

  if (!db.usage[toolId]) db.usage[toolId] = {};
  if (!db.usage[toolId][today]) db.usage[toolId][today] = { calls: 0, revenue: 0, operations: {} };

  db.usage[toolId][today].calls += count;
  db.usage[toolId][today].revenue += revenue;
  db.usage[toolId][today].operations[operation] = (db.usage[toolId][today].operations[operation] || 0) + count;

  // Update revenue totals
  if (!db.revenue[toolId]) db.revenue[toolId] = { total: 0, carbon6: 0, partner: 0, calls: 0 };
  db.revenue[toolId].total += revenue;
  db.revenue[toolId].carbon6 += revenue * CARBON6_CUT;
  db.revenue[toolId].partner += revenue * (1 - CARBON6_CUT);
  db.revenue[toolId].calls += count;

  saveDB(db);
}

// ─── Revenue Summary ─────────────────────────────────────────────────

export function getRevenueSummary(toolId = null) {
  const db = loadDB();

  if (toolId) {
    const rev = db.revenue[toolId] || { total: 0, carbon6: 0, partner: 0, calls: 0 };
    const tool = db.tools[toolId] || { model: 'freemium' };
    const keys = db.keys.filter(k => k.toolId === toolId && !k.revoked).length;
    return { toolId, ...rev, model: tool.model, activeKeys: keys };
  }

  // All tools summary
  const tools = {};
  let totalRevenue = 0, totalCarbon6 = 0, totalPartner = 0, totalCalls = 0;

  for (const [id, rev] of Object.entries(db.revenue)) {
    const tool = db.tools[id] || { model: 'freemium' };
    const keys = db.keys.filter(k => k.toolId === id && !k.revoked).length;
    tools[id] = { ...rev, model: tool.model, activeKeys: keys };
    totalRevenue += rev.total;
    totalCarbon6 += rev.carbon6;
    totalPartner += rev.partner;
    totalCalls += rev.calls;
  }

  // Include tools with keys but no revenue yet
  for (const k of db.keys) {
    if (!k.revoked && !tools[k.toolId]) {
      const tool = db.tools[k.toolId] || { model: 'freemium' };
      const keys = db.keys.filter(kk => kk.toolId === k.toolId && !kk.revoked).length;
      tools[k.toolId] = { total: 0, carbon6: 0, partner: 0, calls: 0, model: tool.model, activeKeys: keys };
    }
  }

  return { tools, totalRevenue, totalCarbon6, totalPartner, totalCalls };
}
