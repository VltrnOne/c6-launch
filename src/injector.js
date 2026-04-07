// C6 Launch — SDK Injector
// Injects c6-revenue SDK into packaged tools

import { existsSync, readFileSync, writeFileSync, mkdirSync, cpSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SDK_JS_PATH = join(__dirname, '..', 'sdk', 'c6-revenue.js');
const SDK_PY_PATH = join(__dirname, '..', 'sdk', 'c6-revenue.py');

/**
 * Inject the C6 Revenue SDK into a staged solution
 */
export function injectSDK(stagingPath, solution, options = {}) {
  const model = options.model || 'freemium';
  const toolId = options.toolId || solution.name?.toLowerCase().replace(/[^a-z0-9-]/g, '-') || 'unknown';
  const language = detectLanguage(stagingPath, solution);

  const results = { injected: false, language, files: [] };

  // 1. Copy SDK file
  if (language === 'python') {
    const dest = join(stagingPath, 'lib', 'c6_revenue.py');
    mkdirSync(join(stagingPath, 'lib'), { recursive: true });
    if (existsSync(SDK_PY_PATH)) {
      cpSync(SDK_PY_PATH, dest);
      results.files.push('lib/c6_revenue.py');
      results.injected = true;
    }
  } else {
    const dest = join(stagingPath, 'lib', 'c6-revenue.js');
    mkdirSync(join(stagingPath, 'lib'), { recursive: true });
    if (existsSync(SDK_JS_PATH)) {
      cpSync(SDK_JS_PATH, dest);
      results.files.push('lib/c6-revenue.js');
      results.injected = true;
    }
  }

  // 2. Update .c6-partner.json with revenue block
  updatePartnerFile(stagingPath, toolId, model, options);

  // 3. For CLI tools — prepend import + ping to entry point
  if (solution.type === 'cli' && language === 'javascript') {
    const injected = injectCLIEntry(stagingPath, toolId);
    if (injected) results.files.push(injected);
  }

  // 4. For services — add integration note to README
  if (solution.type === 'service' || solution.type === 'project') {
    appendReadmeIntegration(stagingPath, language, toolId);
  }

  return results;
}

/**
 * Detect primary language of the solution
 */
function detectLanguage(stagingPath, solution) {
  if (solution.source?.language?.toLowerCase().includes('python')) return 'python';
  if (existsSync(join(stagingPath, 'requirements.txt'))) return 'python';
  if (existsSync(join(stagingPath, 'setup.py'))) return 'python';
  if (existsSync(join(stagingPath, 'pyproject.toml'))) return 'python';
  return 'javascript';
}

/**
 * Update or create .c6-partner.json with revenue config
 */
function updatePartnerFile(stagingPath, toolId, model, options) {
  const partnerPath = join(stagingPath, '.c6-partner.json');
  let manifest = {};

  try {
    manifest = JSON.parse(readFileSync(partnerPath, 'utf8'));
  } catch {}

  manifest.revenue = {
    toolId,
    model,
    gatewayUrl: options.gatewayUrl || 'http://localhost:6100',
    productionUrl: 'https://carbon6.agency/api/v1',
    split: { carbon6: 0.15, partner: 0.85 },
    sdk: detectLanguage(stagingPath, options.solution || {}) === 'python'
      ? 'lib/c6_revenue.py'
      : 'lib/c6-revenue.js',
    configuredAt: new Date().toISOString(),
  };

  writeFileSync(partnerPath, JSON.stringify(manifest, null, 2) + '\n', 'utf8');
}

/**
 * Prepend SDK import + ping to CLI entry point (after shebang)
 */
function injectCLIEntry(stagingPath, toolId) {
  // Find entry point
  const candidates = ['bin/index.js', 'bin/cli.js', 'index.js', 'cli.js'];

  // Check package.json bin field
  try {
    const pkg = JSON.parse(readFileSync(join(stagingPath, 'package.json'), 'utf8'));
    if (pkg.bin) {
      const binPath = typeof pkg.bin === 'string' ? pkg.bin : Object.values(pkg.bin)[0];
      if (binPath) candidates.unshift(binPath.replace(/^\.\//, ''));
    }
  } catch {}

  for (const candidate of candidates) {
    const fullPath = join(stagingPath, candidate);
    if (!existsSync(fullPath)) continue;

    const content = readFileSync(fullPath, 'utf8');
    const importLine = `import { init } from './lib/c6-revenue.js';\ninit({ toolId: '${toolId}' }).ping();\n`;

    let injected;
    if (content.startsWith('#!')) {
      // Insert after shebang line
      const newlineIdx = content.indexOf('\n');
      injected = content.slice(0, newlineIdx + 1) + '\n' + importLine + content.slice(newlineIdx + 1);
    } else {
      injected = importLine + '\n' + content;
    }

    // Fix import path if entry is in bin/
    if (candidate.startsWith('bin/')) {
      injected = injected.replace("'./lib/c6-revenue.js'", "'../lib/c6-revenue.js'");
    }

    writeFileSync(fullPath, injected, 'utf8');
    return candidate;
  }

  return null;
}

/**
 * Append SDK integration instructions to README
 */
function appendReadmeIntegration(stagingPath, language, toolId) {
  const readmePath = join(stagingPath, 'README.md');
  if (!existsSync(readmePath)) return;

  const existing = readFileSync(readmePath, 'utf8');
  if (existing.includes('C6 Revenue SDK')) return; // Already has it

  const jsExample = `
## API Access

This tool uses the C6 Revenue SDK for API key management and usage tracking.

\`\`\`js
import { init } from './lib/c6-revenue.js';

const c6 = init();
c6.ping(); // startup telemetry

// Middleware for Express/Fastify
app.use(c6.middleware());
\`\`\`

API keys: Contact [Carbon6](https://carbon6.agency) or generate via \`c6-launch keys generate ${toolId}\`
`;

  const pyExample = `
## API Access

This tool uses the C6 Revenue SDK for API key management and usage tracking.

\`\`\`python
from lib.c6_revenue import init

c6 = init()
c6.ping()  # startup telemetry

# Gate access
result = c6.gate(api_key)
\`\`\`

API keys: Contact [Carbon6](https://carbon6.agency) or generate via \`c6-launch keys generate ${toolId}\`
`;

  const section = language === 'python' ? pyExample : jsExample;
  writeFileSync(readmePath, existing + '\n' + section, 'utf8');
}
