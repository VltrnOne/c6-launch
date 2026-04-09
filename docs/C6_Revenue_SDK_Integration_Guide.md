---
title: "C6 Revenue SDK — Integration Guide"
subtitle: "Revenue capture for Carbon6-shipped tools"
author: "CARBON[6]"
date: "April 2026"
geometry: margin=1in
fontsize: 11pt
colorlinks: true
linkcolor: blue
header-includes: |
  \usepackage{fancyhdr}
  \pagestyle{fancy}
  \fancyhead[L]{C6 Revenue SDK}
  \fancyhead[R]{CARBON[6]}
  \fancyfoot[C]{\thepage}
  \usepackage{xcolor}
  \definecolor{c6blue}{HTML}{00B4D8}
---

\begin{center}
\Large\textbf{C6 Revenue SDK — Integration Guide}\\[0.5em]
\normalsize Revenue capture for tools shipped by C6 Launch\\[0.3em]
\textit{Version 2.0.0 — April 2026}
\end{center}

\vspace{1em}

---

# Overview

The C6 Revenue SDK is a zero-dependency, single-file library that enables API key gating, usage metering, and x402 micropayments for any tool shipped through C6 Launch.

**Revenue split:** 15% Carbon6 / 85% Partner

**Key features:**

- Offline-first — caches gateway responses, queues usage locally
- Single file — no npm install, no pip install
- Auto-config — reads `.c6-partner.json` automatically
- Non-blocking — startup ping has a 3-second timeout

---

# If Your Tool Was Shipped via `c6-launch ship`

**You don't need to do anything.** The SDK is auto-injected during packaging:

1. `lib/c6-revenue.js` (or `.py`) is copied into your tool
2. `.c6-partner.json` is configured with revenue settings
3. CLI tools get `init().ping()` prepended to the entry point
4. Services get integration instructions in the README

---

# Manual Integration

## Step 1 — Copy the SDK

```bash
# JavaScript
cp sdk/c6-revenue.js your-tool/lib/c6-revenue.js

# Python
cp sdk/c6-revenue.py your-tool/lib/c6_revenue.py
```

## Step 2 — Initialize in Your Entry Point

### JavaScript — CLI Tool

```javascript
import { init } from './lib/c6-revenue.js';
init({ toolId: 'your-tool-name' }).ping();

// ... rest of your CLI code
```

### JavaScript — Express/Fastify API

```javascript
import { init } from './lib/c6-revenue.js';
import express from 'express';

const app = express();
const c6 = init({ toolId: 'your-tool-name' });
c6.ping();

// Gate all routes with API key
app.use(c6.middleware());

app.get('/data', (req, res) => {
  // req.c6.tier = 'free' | 'pro' | 'enterprise'
  // req.c6.remaining = calls remaining today
  res.json({ data: '...' });
});
```

### Python

```python
from lib.c6_revenue import init

c6 = init({"toolId": "your-tool-name"})
c6.ping()

# Gate a specific operation
result = c6.gate(api_key, "search")
if not result["allowed"]:
    print(f"Access denied: {result['reason']}")
```

---

# Step 3 — Generate API Keys

```bash
# Free tier (100 calls/day)
c6-launch keys generate your-tool-name

# Pro tier (10,000 calls/day)
c6-launch keys generate your-tool-name --tier=pro

# Enterprise (unlimited)
c6-launch keys generate your-tool-name --tier=enterprise

# List all keys
c6-launch keys list your-tool-name

# Revoke a key
c6-launch keys revoke <hash>
```

**Key format:** `C6K-<toolId>-<base64url(payload)>.<HMAC-SHA256>`

Keys are offline-validatable — the SDK can verify the HMAC without hitting the gateway.

---

# Step 4 — Start the Revenue Gateway (Development)

```bash
c6-launch gateway          # default port 6100
c6-launch gateway --port=7000   # custom port
```

**Gateway endpoints:**

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/v1/ping` | POST | Startup telemetry |
| `/api/v1/gate` | POST | Key validation + rate check |
| `/api/v1/usage/batch` | POST | Bulk usage upload |
| `/api/v1/keys/generate` | POST | Create API key |
| `/api/v1/keys/list` | GET | List keys by tool |
| `/api/v1/revenue` | GET | Revenue data (JSON) |
| `/api/v1/revenue/html` | GET | Revenue dashboard (HTML) |
| `/api/v1/x402/charge` | POST | x402 micropayment |

**Dashboard:** Open `http://localhost:6100/api/v1/revenue/html` in your browser.

---

# Step 5 — Production Configuration

Swap the gateway URL in `.c6-partner.json`:

```json
{
  "revenue": {
    "toolId": "your-tool-name",
    "model": "freemium",
    "gatewayUrl": "https://carbon6.agency/api/v1",
    "split": { "carbon6": 0.15, "partner": 0.85 }
  }
}
```

The SDK hits the same endpoints — routed to the Carbon6 platform connector instead of localhost.

---

# Revenue Models

| Model | Description | Best For |
|-------|-------------|----------|
| **freemium** | 100 calls/day free, paid upgrade | CLI tools, utilities |
| **api-key** | Key required for all access | Professional APIs |
| **metered** | x402 micropayment per call | Premium data, AI |
| **tiered** | Feature gates by tier | SaaS-style tools |

Set during ship: `c6-launch ship my-tool --model=metered`

---

# What End Users See

Users pass their API key via header or environment variable:

```bash
# CLI tools
export C6_API_KEY=C6K-your-tool-...
your-tool do-something

# API tools
curl -H "x-api-key: C6K-your-tool-..." \
  https://your-api/endpoint
```

---

# SDK API Reference

## JavaScript

| Method | Description |
|--------|-------------|
| `init(config?)` | Initialize SDK, returns C6Revenue instance |
| `c6.ping()` | Fire-and-forget startup telemetry |
| `c6.gate(apiKey, op?)` | Validate key + check rate limit |
| `c6.paywall(amount, meta?)` | x402 micropayment request |
| `c6.recordUsage(op?)` | Record usage locally |
| `c6.flush()` | Batch upload cached usage |
| `c6.middleware(opts?)` | Express/Fastify middleware |

## Python

| Method | Description |
|--------|-------------|
| `init(config?)` | Initialize SDK, returns C6Revenue instance |
| `c6.ping()` | Fire-and-forget startup telemetry (threaded) |
| `c6.gate(api_key, op?)` | Validate key + check rate limit |
| `c6.paywall(amount, meta?)` | x402 micropayment request |
| `c6.record_usage(op?)` | Record usage locally |
| `c6.flush()` | Batch upload cached usage |

---

# Monitoring Revenue

```bash
# All tools
c6-launch revenue

# Specific tool
c6-launch revenue your-tool-name

# Export to CSV
c6-launch revenue --export=csv
```

---

\begin{center}
\vspace{2em}
\textit{Powered by CARBON[6] — https://carbon6.agency}\\
\textit{https://github.com/VltrnOne/c6-launch}
\end{center}
