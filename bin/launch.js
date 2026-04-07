#!/usr/bin/env node

// C6 Launch — Package & ship OceanDeep solutions to GitHub
// If client has no GitHub, Carbon6 hosts under VltrnOne org at 15% rev share

import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { readFileSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(join(__dirname, '..', 'package.json'), 'utf8'));

const args = process.argv.slice(2);
const command = args[0] || 'list';
const flags = {};
const positional = [];

for (let i = 1; i < args.length; i++) {
  if (args[i].startsWith('--')) {
    const [k, v] = args[i].slice(2).split('=');
    flags[k] = v ?? args[++i] ?? true;
  } else {
    positional.push(args[i]);
  }
}

async function main() {
  switch (command) {
    case 'list': {
      const { listShippable } = await import('../src/selector.js');
      await listShippable({ minScore: parseInt(flags.min || '40') });
      break;
    }

    case 'package': {
      const { packageSolution } = await import('../src/packager.js');
      const name = positional[0];
      if (!name) {
        console.error('Usage: c6-launch package <solution-name> [--github=user] [--hosted]');
        process.exit(1);
      }
      await packageSolution(name, {
        github: flags.github || null,
        hosted: flags.hosted === 'true' || flags.hosted === true || !flags.github,
        org: flags.org || 'VltrnOne',
        private: flags.private === 'true',
        dryRun: flags['dry-run'] === 'true',
        model: flags.model || 'freemium',
      });
      break;
    }

    case 'ship': {
      const { shipSolution } = await import('../src/shipper.js');
      const name = positional[0];
      if (!name) {
        console.error('Usage: c6-launch ship <solution-name> [--github=user] [--hosted]');
        process.exit(1);
      }
      await shipSolution(name, {
        github: flags.github || null,
        hosted: flags.hosted === 'true' || flags.hosted === true || !flags.github,
        org: flags.org || 'VltrnOne',
        model: flags.model || 'freemium',
      });
      break;
    }

    case 'hosted': {
      const { listHosted } = await import('../src/registry.js');
      await listHosted();
      break;
    }

    case 'gateway': {
      const { startGateway } = await import('../src/gateway.js');
      const port = parseInt(flags.port || '6100');
      startGateway(port);
      break;
    }

    case 'keys': {
      const subcommand = positional[0];
      const toolId = positional[1];

      if (subcommand === 'generate') {
        if (!toolId) { console.error('Usage: c6-launch keys generate <tool> [--tier=free]'); process.exit(1); }
        const { generateApiKey } = await import('../src/revenue.js');
        const result = generateApiKey(toolId, flags.tier || 'free', { label: flags.label });
        console.log(`\n  API Key generated for ${toolId}:`);
        console.log(`  ${result.key}`);
        console.log(`  Hash: ${result.hash}\n`);
      } else if (subcommand === 'list') {
        if (!toolId) { console.error('Usage: c6-launch keys list <tool>'); process.exit(1); }
        const { listKeys } = await import('../src/revenue.js');
        const keys = listKeys(toolId);
        console.log(`\n  API Keys for ${toolId}: ${keys.length}`);
        for (const k of keys) {
          console.log(`  ${k.hash}  tier=${k.tier}  limit=${k.rateLimit}  created=${k.createdAt.slice(0,10)}`);
        }
        console.log('');
      } else if (subcommand === 'revoke') {
        const hash = toolId; // positional[1] is the hash here
        if (!hash) { console.error('Usage: c6-launch keys revoke <hash>'); process.exit(1); }
        const { revokeKey } = await import('../src/revenue.js');
        const ok = revokeKey(hash);
        console.log(ok ? `  Key ${hash} revoked.` : `  Key ${hash} not found.`);
      } else {
        console.error('Usage: c6-launch keys <generate|list|revoke> <tool|hash>');
        process.exit(1);
      }
      break;
    }

    case 'revenue': {
      const { getRevenueSummary } = await import('../src/revenue.js');
      const toolId = positional[0];

      if (toolId) {
        const s = getRevenueSummary(toolId);
        console.log(`\n  Revenue for ${toolId}:`);
        console.log(`  Model:    ${s.model}`);
        console.log(`  Calls:    ${s.calls}`);
        console.log(`  Revenue:  $${s.total.toFixed(2)}`);
        console.log(`  C6 (15%): $${s.carbon6.toFixed(2)}`);
        console.log(`  Partner:  $${s.partner.toFixed(2)}`);
        console.log(`  Keys:     ${s.activeKeys}\n`);
      } else {
        const s = getRevenueSummary();
        console.log(`\n  C6 Revenue Summary`);
        console.log(`  ──────────────────────────────────`);
        console.log(`  Total Revenue:  $${s.totalRevenue.toFixed(2)}`);
        console.log(`  Carbon6 (15%):  $${s.totalCarbon6.toFixed(2)}`);
        console.log(`  Partner (85%):  $${s.totalPartner.toFixed(2)}`);
        console.log(`  Total Calls:    ${s.totalCalls}`);
        console.log(`  Active Tools:   ${Object.keys(s.tools).length}`);

        if (Object.keys(s.tools).length > 0) {
          console.log(`\n  Tool                Calls     Revenue   Model`);
          console.log(`  ─────────────────── ───────── ───────── ─────────`);
          for (const [id, t] of Object.entries(s.tools)) {
            console.log(`  ${id.padEnd(19)} ${String(t.calls).padStart(9)} $${t.total.toFixed(2).padStart(8)} ${t.model}`);
          }
        }

        if (flags.export === 'csv') {
          let csv = 'tool,model,calls,revenue,carbon6,partner,keys\n';
          for (const [id, t] of Object.entries(s.tools)) {
            csv += `${id},${t.model},${t.calls},${t.total.toFixed(2)},${t.carbon6.toFixed(2)},${t.partner.toFixed(2)},${t.activeKeys}\n`;
          }
          const { writeFileSync } = await import('fs');
          writeFileSync('c6-revenue-export.csv', csv, 'utf8');
          console.log(`\n  Exported to c6-revenue-export.csv`);
        }
        console.log('');
      }
      break;
    }

    case '--version':
    case '-v':
      console.log(`c6-launch v${pkg.version}`);
      break;

    case '--help':
    case '-h':
      console.log(`
  C6 Launch v${pkg.version} — Package & Ship OceanDeep Solutions

  Commands:
    list                          Show all shippable solutions from last OceanDeep scan
    package <name>                Package a solution (isolate, readme, license, gitignore)
    ship <name>                   Package + create GitHub repo + push (full pipeline)
    hosted                        List all Carbon6-hosted partner repos
    gateway                       Start the C6 Revenue Gateway server
    keys generate <tool>          Generate API key (--tier=free|pro|enterprise)
    keys list <tool>              List active API keys for a tool
    keys revoke <hash>            Revoke an API key by hash
    revenue                       Revenue summary for all tools
    revenue <tool>                Revenue for a specific tool (--export=csv)

  Options:
    --github=<username>           Client's GitHub account (creates repo there)
    --hosted                      Host under Carbon6 org (15% rev share partnership)
    --org=<name>                  GitHub org to use (default: VltrnOne)
    --min=<score>                 Minimum readiness score for list (default: 40)
    --private                     Create as private repo
    --dry-run                     Package without pushing to GitHub
    --model=<model>               Revenue model: freemium|api-key|metered|tiered
    --port=<port>                 Gateway port (default: 6100)
    --tier=<tier>                 API key tier: free|pro|enterprise
    --export=csv                  Export revenue data as CSV

  Revenue Model:
    Client has GitHub → repo created under their account (free)
    Client has no GitHub → hosted under VltrnOne at 15% revenue share
    All metered calls: 15% Carbon6 / 85% partner
`);
      break;

    default:
      console.error(`Unknown command: ${command}. Run: c6-launch --help`);
      process.exit(1);
  }
}

main().catch(err => { console.error(`Error: ${err.message}`); process.exit(1); });
