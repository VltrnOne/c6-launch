# C6 Launch — Revenue Model

## Overview

C6 Launch captures revenue from shipped tools via an embedded SDK and lightweight API gateway. All revenue is split **15% Carbon6 / 85% partner**.

## How It Works

1. **OceanDeep** scans the ecosystem and identifies shippable solutions
2. **C6 Launch** packages them with the Revenue SDK auto-injected
3. Every API call, key validation, and x402 payment flows through the SDK
4. The **Revenue Gateway** tracks usage, validates keys, and records revenue
5. Revenue is split 15/85 between Carbon6 and the tool partner

## API Key Format

```
C6K-<toolId>-<base64url(payload)>.<HMAC-SHA256>
```

**Payload:** `{ tier, createdAt, expiresAt, rateLimit }`

Keys are **offline-validatable** — the SDK can verify the HMAC signature without hitting the gateway, using the per-tool secret derived from the tool ID.

### Key Tiers

| Tier | Rate Limit | Use Case |
|------|-----------|----------|
| `free` | 100/day | Default, testing |
| `pro` | 10,000/day | Production use |
| `enterprise` | Unlimited | Enterprise contracts |

## Revenue Models

### Freemium (default)
- 100 API calls/day on free tier
- Upgrade to pro/enterprise for higher limits
- Best for: CLI tools, utilities

### API Key Required
- All access requires a valid API key
- No free tier
- Best for: Professional APIs

### Metered (x402)
- Pay-per-call via x402 micropayments
- No key required, payment is the gate
- Best for: Premium data, AI features

### Tiered
- Feature gates based on API key tier
- Free tier gets basic features, pro/enterprise get full access
- Best for: SaaS-style tools

## Revenue Gateway

The gateway runs on port 6100 (configurable) and provides:

- Key validation and rate limiting
- Usage tracking and batch upload
- Revenue dashboard (JSON and HTML)
- x402 micropayment processing

### Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/v1/ping` | POST | Startup telemetry |
| `/api/v1/gate` | POST | Key validation + rate check |
| `/api/v1/usage/batch` | POST | Bulk usage upload |
| `/api/v1/keys/generate` | POST | Create API key |
| `/api/v1/keys/list` | GET | List keys by tool |
| `/api/v1/keys/revoke` | POST | Revoke a key |
| `/api/v1/revenue` | GET | Revenue data (JSON) |
| `/api/v1/revenue/html` | GET | Revenue dashboard (HTML) |
| `/api/v1/x402/charge` | POST | x402 micropayment |

## Production

In production, the SDK's `gatewayUrl` swaps to `https://carbon6.agency/api/v1` — same protocol, hits the platform connector API.

Set via `.c6-partner.json`:
```json
{
  "revenue": {
    "gatewayUrl": "https://carbon6.agency/api/v1"
  }
}
```

Or environment variable: `C6_GATEWAY_URL=https://carbon6.agency/api/v1`

---

*Powered by [CARBON[6]](https://carbon6.agency)*
