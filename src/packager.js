// C6 Launch — Solution Packager
// Isolates a solution from the ecosystem with everything it needs to run standalone

import { existsSync, readFileSync, writeFileSync, mkdirSync, cpSync, readdirSync, statSync } from 'fs';
import { join, basename, relative } from 'path';
import { execSync } from 'child_process';
import { homedir } from 'os';
import chalk from 'chalk';
import ora from 'ora';
import { findSolution, sanitizeName } from './selector.js';

const STAGING_DIR = join(homedir(), '.c6', 'launch', 'staging');
const SKIP_COPY = new Set([
  'node_modules', '.git', '.next', '__pycache__', 'venv', '.venv',
  'dist', 'build', '.cache', 'coverage', '.turbo', 'target',
  '.DS_Store', '.env', 'pump_bot.db',
]);

/**
 * Package a solution into a ship-ready directory
 */
export async function packageSolution(name, options = {}) {
  const spinner = ora(`Finding solution: ${name}`).start();

  // 1. Find the solution in OceanDeep results
  const solution = findSolution(name);
  if (!solution) {
    spinner.fail(`Solution "${name}" not found. Run: c6-launch list`);
    return null;
  }

  const repoName = sanitizeName(solution.name);
  const stagingPath = join(STAGING_DIR, repoName);

  spinner.text = `Packaging: ${solution.name} (${solution.score}/100)`;

  // 2. Locate the source
  const sourcePath = resolveSourcePath(solution);
  if (!sourcePath) {
    spinner.fail(`Cannot locate source for "${solution.name}". Manual packaging needed.`);
    return null;
  }

  spinner.text = `Copying from ${sourcePath}`;

  // 3. Clean staging directory
  mkdirSync(stagingPath, { recursive: true });
  // Clear old staging
  try { execSync(`rm -rf "${stagingPath}"/*`, { timeout: 5000 }); } catch {}

  // 4. Copy source files (excluding heavy/sensitive files)
  copyClean(sourcePath, stagingPath);

  // 5. Generate supporting files
  spinner.text = 'Generating README, LICENSE, .gitignore...';

  generateReadme(stagingPath, solution, repoName, options);
  generateLicense(stagingPath);
  generateGitignore(stagingPath, solution);
  fixPackageJson(stagingPath, solution, repoName, options);
  generatePartnerFile(stagingPath, solution, options);

  // 6. Inject C6 Revenue SDK
  spinner.text = 'Injecting C6 Revenue SDK...';
  try {
    const { injectSDK } = await import('./injector.js');
    const sdkResult = injectSDK(stagingPath, solution, {
      model: options.model || 'freemium',
      solution,
    });
    if (sdkResult.injected) {
      spinner.text = `SDK injected (${sdkResult.language}, ${sdkResult.files.length} files)`;
    }
  } catch {}


  // 7. Count what we packaged
  const fileCount = countFiles(stagingPath);
  const sizeBytes = getDirSize(stagingPath);
  const sizeMB = (sizeBytes / 1024 / 1024).toFixed(1);

  spinner.succeed(`Packaged ${chalk.green(solution.name)} → ${chalk.cyan(stagingPath)}`);
  console.log(chalk.gray(`  Files: ${fileCount} | Size: ${sizeMB}MB | Score: ${solution.score}/100`));
  console.log(chalk.gray(`  Status: ${solution.status} | Type: ${solution.type}`));

  if (options.dryRun) {
    console.log(chalk.yellow(`  Dry run — not pushing to GitHub`));
  }

  return { stagingPath, repoName, solution, fileCount };
}

/**
 * Resolve where the solution's source code lives
 */
function resolveSourcePath(solution) {
  // CLI tools — check source.path
  if (solution.source?.path) {
    const p = solution.source.path;
    // If it's a file path, get the directory
    if (existsSync(p)) {
      const stat = statSync(p);
      if (stat.isDirectory()) return p;
      // bin file — go up to project
      const parent = join(p, '..');
      if (existsSync(join(parent, 'package.json'))) return parent;
      return join(parent, '..');
    }
  }

  // Project type — check source.path directly
  if (solution.source?.path && existsSync(solution.source.path)) {
    return solution.source.path;
  }

  // Service type — try to find project by name
  if (solution.source?.port) {
    const guesses = [
      join('/Users/Morpheous', sanitizeName(solution.name)),
      join('/Users/Morpheous/Carbon6', sanitizeName(solution.name)),
    ];
    for (const g of guesses) {
      if (existsSync(g) && existsSync(join(g, 'package.json'))) return g;
    }
  }

  // Composite — use first component's source
  if (solution.type === 'composite' && solution.components) {
    // For composites, we create a meta-package
    return null;
  }

  return null;
}

/**
 * Copy directory, skipping node_modules, .git, .env, etc.
 */
function copyClean(src, dest) {
  mkdirSync(dest, { recursive: true });
  const entries = readdirSync(src, { withFileTypes: true });

  for (const entry of entries) {
    if (SKIP_COPY.has(entry.name)) continue;
    if (entry.name.startsWith('.env') && entry.name !== '.env.example' && entry.name !== '.env.template') continue;
    if (entry.name.endsWith('.db') || entry.name.endsWith('.sqlite')) continue;

    const srcPath = join(src, entry.name);
    const destPath = join(dest, entry.name);

    if (entry.isDirectory()) {
      copyClean(srcPath, destPath);
    } else {
      // Skip large files (>2MB)
      try {
        const stat = statSync(srcPath);
        if (stat.size > 2 * 1024 * 1024) continue;
      } catch { continue; }

      try {
        cpSync(srcPath, destPath);
      } catch {}
    }
  }
}

/**
 * Generate a consumer-facing README
 */
function generateReadme(dir, solution, repoName, options) {
  const hosted = options.hosted;
  const badge = hosted
    ? `<p align="center">\n  <img src="https://img.shields.io/badge/Powered%20by-CARBON%5B6%5D-00b4d8?style=for-the-badge&labelColor=0a0a0f" />\n  <img src="https://img.shields.io/badge/OceanDeep-Verified-10b981?style=for-the-badge&labelColor=0a0a0f" />\n</p>\n\n`
    : '';

  const desc = solution.source?.description || solution.packaging?.description || `${solution.name} — identified and packaged by OceanDeep.`;

  const installSection = solution.type === 'cli'
    ? `## Install\n\n\`\`\`bash\nnpm install -g ${repoName}\n# or\nnpx ${repoName}\n\`\`\`\n`
    : solution.source?.hasDocker
      ? `## Quick Start\n\n\`\`\`bash\ndocker compose up -d\n\`\`\`\n`
      : `## Quick Start\n\n\`\`\`bash\nnpm install\nnpm start\n\`\`\`\n`;

  const partnerNote = hosted
    ? `\n---\n\n<p align="center">\n  <em>Hosted by <a href="https://carbon6.agency">CARBON[6]</a> — Partner Program (15% revenue share)</em><br/>\n  <em>Discovered by <a href="https://github.com/VltrnOne/oceandeep">OceanDeep</a> Ecosystem Intelligence</em>\n</p>\n`
    : `\n---\n\n<p align="center">\n  <em>Packaged by <a href="https://github.com/VltrnOne/oceandeep">OceanDeep</a> — Powered by <a href="https://carbon6.agency">CARBON[6]</a></em>\n</p>\n`;

  const readme = `${badge}# ${solution.name}

${desc}

**Readiness Score:** ${solution.score}/100 | **Status:** ${solution.status}

${installSection}
## About

${getAboutSection(solution)}

## License

MIT
${partnerNote}`;

  writeFileSync(join(dir, 'README.md'), readme, 'utf8');
}

function getAboutSection(solution) {
  const lines = [];

  if (solution.type === 'cli') {
    lines.push(`This is a command-line tool that was identified as consumer-ready by OceanDeep's ecosystem intelligence scanner.`);
    if (solution.source?.npmName) lines.push(`\n**npm:** \`${solution.source.npmName}\``);
  } else if (solution.type === 'service') {
    lines.push(`This is a live service/API identified as consumer-ready.`);
    if (solution.source?.capabilities?.length) {
      lines.push(`\n**Capabilities:** ${solution.source.capabilities.join(', ')}`);
    }
  } else if (solution.type === 'project') {
    lines.push(`${solution.source?.language || 'Multi-language'} project${solution.source?.framework ? ` built with ${solution.source.framework}` : ''}.`);
  } else if (solution.type === 'composite') {
    lines.push('This is a composite solution combining multiple services:\n');
    for (const comp of (solution.components || [])) {
      lines.push(`- ${comp}`);
    }
  }

  if (solution.packaging?.monetization) {
    lines.push(`\n**Revenue Model:** ${solution.packaging.monetization}`);
  }

  lines.push(`\n### API Access\n\nThis tool supports API key authentication via the C6 Revenue SDK.\nGenerate a key: \`c6-launch keys generate ${(solution.name || '').toLowerCase().replace(/[^a-z0-9-]/g, '-')}\``);

  return lines.join('\n');
}

function generateLicense(dir) {
  if (existsSync(join(dir, 'LICENSE'))) return;
  writeFileSync(join(dir, 'LICENSE'), `MIT License

Copyright (c) ${new Date().getFullYear()} Carbon6

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
`, 'utf8');
}

function generateGitignore(dir, solution) {
  if (existsSync(join(dir, '.gitignore'))) return;
  writeFileSync(join(dir, '.gitignore'), `node_modules/
.DS_Store
*.log
.env
.env.*
!.env.example
!.env.template
*.db
*.sqlite
package-lock.json
dist/
build/
.next/
.cache/
coverage/
__pycache__/
venv/
.venv/
*.pem
*.key
`, 'utf8');
}

function fixPackageJson(dir, solution, repoName, options) {
  const pkgPath = join(dir, 'package.json');
  if (!existsSync(pkgPath)) return;

  try {
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));

    // Ensure clean metadata
    if (!pkg.description) pkg.description = solution.source?.description || solution.name;
    if (!pkg.license) pkg.license = 'MIT';
    if (!pkg.keywords) pkg.keywords = ['carbon6', 'oceandeep'];
    if (!pkg.repository) {
      const org = options.hosted ? (options.org || 'VltrnOne') : (options.github || options.org || 'VltrnOne');
      pkg.repository = { type: 'git', url: `https://github.com/${org}/${repoName}.git` };
    }

    writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n', 'utf8');
  } catch {}
}

/**
 * Generate the Carbon6 partner manifest (for hosted solutions)
 */
function generatePartnerFile(dir, solution, options) {
  if (!options.hosted) return;

  const manifest = {
    partner: 'carbon6',
    program: 'OceanDeep Launch — Hosted Partner',
    revenueShare: '15%',
    terms: 'Carbon6 hosts, maintains infrastructure, and distributes. Partner retains IP and receives 85% of all revenue.',
    solution: {
      name: solution.name,
      score: solution.score,
      status: solution.status,
      type: solution.type,
    },
    hosted: {
      org: options.org || 'VltrnOne',
      launchedAt: new Date().toISOString(),
      poweredBy: 'OceanDeep Ecosystem Intelligence',
    },
    revenue: {
      model: options.model || 'freemium',
      split: { carbon6: 0.15, partner: 0.85 },
    },
  };

  writeFileSync(join(dir, '.c6-partner.json'), JSON.stringify(manifest, null, 2) + '\n', 'utf8');
}

function countFiles(dir) {
  let count = 0;
  function walk(d) {
    for (const entry of readdirSync(d, { withFileTypes: true })) {
      if (entry.isDirectory()) walk(join(d, entry.name));
      else count++;
    }
  }
  walk(dir);
  return count;
}

function getDirSize(dir) {
  let size = 0;
  function walk(d) {
    for (const entry of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, entry.name);
      if (entry.isDirectory()) walk(p);
      else { try { size += statSync(p).size; } catch {} }
    }
  }
  walk(dir);
  return size;
}
