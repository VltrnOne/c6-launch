# C6 Revenue SDK

Embeddable revenue capture for tools shipped by [C6 Launch](https://github.com/VltrnOne/c6-launch).

## Quick Start (JavaScript)

```js
import { init } from './lib/c6-revenue.js';

const c6 = init(); // auto-loads .c6-partner.json
c6.ping();         // fire-and-forget startup telemetry

// Gate API access
const result = await c6.gate(apiKey, 'search');
if (!result.allowed) throw new Error(result.reason);

// x402 micropayment for premium features
const payment = await c6.paywall(0.01, { description: 'Premium export' });
```

## Quick Start (Python)

```python
from c6_revenue import init

c6 = init()
c6.ping()

result = c6.gate(api_key, 'search')
if not result['allowed']:
    raise Exception(result['reason'])
```

## Express/Fastify Middleware

```js
import { init } from './lib/c6-revenue.js';
import express from 'express';

const app = express();
const c6 = init();

app.use(c6.middleware({ skip: ['/health'] }));

app.get('/data', (req, res) => {
  // req.c6.tier = 'free' | 'pro' | 'enterprise'
  res.json({ tier: req.c6.tier });
});
```

## Configuration

The SDK auto-loads `.c6-partner.json` from the project root. You can also pass overrides:

```js
const c6 = init({
  toolId: 'my-tool',
  gatewayUrl: 'https://carbon6.agency/api/v1',
  model: 'freemium',
});
```

## API Key Format

```
C6K-<toolId>-<base64url(payload)>.<HMAC-SHA256>
```

Keys are offline-validatable (HMAC verification without hitting the gateway).

## Revenue Models

| Model | Description |
|-------|-------------|
| `freemium` | 100 calls/day free, paid upgrade removes limit |
| `api-key` | API key required for all access |
| `metered` | x402 micropayment per call |
| `tiered` | Tier-based feature gates (free/pro/enterprise) |

## Revenue Split

- **85%** to the tool creator/partner
- **15%** to Carbon6 (hosting, distribution, infrastructure)

---

*Powered by [CARBON[6]](https://carbon6.agency)*
