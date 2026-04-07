// C6 Launch — Hosted Partner Registry
// Tracks all solutions hosted under Carbon6's org

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import chalk from 'chalk';
import { getRevenueSummary } from './revenue.js';

const REGISTRY_PATH = join(homedir(), '.c6', 'launch', 'registry.json');

/**
 * Load the hosted partner registry
 */
export function loadRegistry() {
  mkdirSync(join(homedir(), '.c6', 'launch'), { recursive: true });
  try {
    return JSON.parse(readFileSync(REGISTRY_PATH, 'utf8'));
  } catch {
    return { partners: [], updated: null };
  }
}

/**
 * Register a new hosted solution
 */
export function registerHosted(entry) {
  const registry = loadRegistry();

  // Avoid duplicates
  const existing = registry.partners.findIndex(p => p.repoName === entry.repoName);
  if (existing >= 0) {
    registry.partners[existing] = { ...registry.partners[existing], ...entry };
  } else {
    registry.partners.push(entry);
  }

  registry.updated = new Date().toISOString();
  writeFileSync(REGISTRY_PATH, JSON.stringify(registry, null, 2) + '\n', 'utf8');
}

/**
 * List all hosted partner solutions
 */
export async function listHosted() {
  const registry = loadRegistry();

  console.log('');
  console.log(chalk.cyan.bold('  C6 Launch — Hosted Partner Registry'));
  console.log(chalk.gray(`  Revenue model: Carbon6 hosts at 15% rev share`));
  console.log('');

  if (registry.partners.length === 0) {
    console.log(chalk.gray('  No hosted solutions yet.'));
    console.log(chalk.gray('  Ship one: c6-launch ship <name> --hosted'));
    console.log('');
    return;
  }

  console.log(chalk.gray('  Name                           Score  Rev Share  Calls    Revenue    Repo'));
  console.log(chalk.gray('  ────────────────────────────── ───── ───────── ──────── ────────── ─────────────────────'));

  const revSummary = getRevenueSummary();

  for (const p of registry.partners) {
    const name = (p.name || p.repoName).padEnd(30);
    const score = String(p.score || '?').padStart(5);
    const rev = (p.revenueShare || '15%').padEnd(9);
    const toolRev = revSummary.tools?.[p.repoName] || { calls: 0, total: 0 };
    const calls = String(toolRev.calls).padStart(8);
    const revenue = `$${toolRev.total.toFixed(2)}`.padStart(10);
    console.log(`  ${chalk.white(name)} ${chalk.cyan(score)} ${chalk.green(rev)} ${chalk.yellow(calls)} ${chalk.green(revenue)} ${chalk.gray(p.repoUrl || '')}`);
  }

  console.log('');
  console.log(chalk.gray(`  Total: ${registry.partners.length} hosted solutions | Revenue: $${revSummary.totalRevenue.toFixed(2)} (C6: $${revSummary.totalCarbon6.toFixed(2)} / Partner: $${revSummary.totalPartner.toFixed(2)})`));
  console.log('');
}
