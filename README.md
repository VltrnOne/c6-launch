<p align="center">
  <img src="https://img.shields.io/badge/C6%20Launch-v2.0.0-00b4d8?style=for-the-badge&labelColor=0a0a0f" />
  <img src="https://img.shields.io/badge/Powered%20by-CARBON%5B6%5D-00b4d8?style=for-the-badge&labelColor=0a0a0f" />
  <img src="https://img.shields.io/badge/OceanDeep-Verified-10b981?style=for-the-badge&labelColor=0a0a0f" />
</p>

# C6 Launch

**Auto-package and ship OceanDeep-identified solutions to GitHub with built-in revenue capture.**

C6 Launch takes solutions discovered by [OceanDeep](https://github.com/VltrnOne/oceandeep) ecosystem intelligence, packages them into standalone repos, and ships them to GitHub — with an embedded revenue SDK that captures 15% for Carbon6 infrastructure.

## Install

```bash
npm install -g @carbon6/launch
# or run directly
npx @carbon6/launch
```

## Quick Start

```bash
# List shippable solutions from last OceanDeep scan
c6-launch list

# Package a solution (isolate, readme, license, SDK injection)
c6-launch package c6-forge

# Ship to GitHub (package + create repo + push)
c6-launch ship c6-forge --hosted

# Start the revenue gateway
c6-launch gateway

# Generate API keys
c6-launch keys generate c6-forge --tier=pro

# View revenue
c6-launch revenue
```

## Architecture

```
Shipped Tool (c6-forge, vdoc, cat3na, etc.)
  │  imports sdk/c6-revenue.js
  │
  ├─ ping()          → startup telemetry
  ├─ gate(apiKey)    → key validation + rate limiting
  ├─ paywall(amount) → x402 micropayment
  └─ middleware()     → Express/Fastify wrapper
        │
        ▼
C6 Revenue Gateway (:6100)
  ├─ /api/v1/ping, /gate, /usage/batch
  ├─ /api/v1/keys/generate, /list, /revoke
  ├─ /api/v1/revenue, /revenue/html
  └─ /api/v1/x402/*
```

## Revenue Model

| Path | Model |
|------|-------|
| **Carbon6 Hosted** | 15% Carbon6 / 85% partner — hosted under VltrnOne org |
| **Client Repo** | Free — repo created under client's GitHub account |

### Revenue Models per Tool

| Model | How it works |
|-------|-------------|
| `freemium` | 100 calls/day free, paid upgrade removes limit |
| `api-key` | API key required for all access |
| `metered` | x402 micropayment per call |
| `tiered` | Tier-based feature gates (free/pro/enterprise) |

## SDK

The C6 Revenue SDK is automatically injected into every shipped tool. Zero dependencies, single file.

- **JavaScript**: `lib/c6-revenue.js` — Node.js built-ins only
- **Python**: `lib/c6_revenue.py` — stdlib only

See [sdk/README.md](sdk/README.md) for integration docs.

## Commands

```
c6-launch list                          Show shippable solutions
c6-launch package <name>                Package a solution
c6-launch ship <name>                   Full ship pipeline
c6-launch hosted                        List hosted partner repos
c6-launch gateway                       Start revenue gateway (:6100)
c6-launch keys generate <tool>          Generate API key
c6-launch keys list <tool>              List active keys
c6-launch keys revoke <hash>            Revoke a key
c6-launch revenue                       Revenue summary
c6-launch revenue <tool>                Per-tool revenue
```

## Shipped Solutions

Solutions currently shipped via C6 Launch:

| Solution | Type | Score | Repo |
|----------|------|-------|------|
| c6 | CLI | — | [VltrnOne/c6](https://github.com/VltrnOne/c6) |
| c6-forge | CLI | — | [VltrnOne/c6-forge](https://github.com/VltrnOne/c6-forge) |
| council-reprompt-system | Service | — | [VltrnOne/council-reprompt-system](https://github.com/VltrnOne/council-reprompt-system) |
| vdoc | CLI | — | [VltrnOne/vdoc](https://github.com/VltrnOne/vdoc) |
| cat3na | Service | — | [VltrnOne/cat3na](https://github.com/VltrnOne/cat3na) |

## License

MIT

---

<p align="center">
  <em>Powered by <a href="https://carbon6.agency">CARBON[6]</a> — Ecosystem Intelligence by <a href="https://github.com/VltrnOne/oceandeep">OceanDeep</a></em>
</p>
