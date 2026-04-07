// C6 Launch — Solution Selector
// Reads OceanDeep scan results and presents shippable solutions

import { readFileSync, readdirSync, mkdirSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import chalk from 'chalk';

const OCEANDEEP_DIR = join(homedir(), '.c6', 'oceandeep');

/**
 * Load the latest OceanDeep scan report
 */
export function loadLatestScan() {
  mkdirSync(OCEANDEEP_DIR, { recursive: true });
  const files = readdirSync(OCEANDEEP_DIR).filter(f => f.endsWith('.json')).sort().reverse();
  if (files.length === 0) return null;
  return JSON.parse(readFileSync(join(OCEANDEEP_DIR, files[0]), 'utf8'));
}

/**
 * List all shippable solutions from the latest scan
 */
export async function listShippable({ minScore = 40 } = {}) {
  const scan = loadLatestScan();
  if (!scan) {
    console.log(chalk.red('  No OceanDeep scan found. Run: oceandeep scan'));
    return [];
  }

  const solutions = (scan.solutions || []).filter(s => s.score >= minScore);

  console.log('');
  console.log(chalk.cyan.bold('  C6 Launch — Shippable Solutions'));
  console.log(chalk.gray(`  From scan: ${scan.timestamp}`));
  console.log(chalk.gray(`  Minimum score: ${minScore}/100`));
  console.log('');

  if (solutions.length === 0) {
    console.log(chalk.yellow('  No solutions meet the minimum score.'));
    return [];
  }

  console.log(chalk.gray('  #   Score  Status      Name                          Ship Command'));
  console.log(chalk.gray('  ─── ───── ─────────── ───────────────────────────── ─────────────────────────────'));

  solutions.forEach((sol, i) => {
    const num = String(i + 1).padStart(3);
    const score = colorScore(sol.score);
    const status = colorStatus(sol.status);
    const name = sol.name.padEnd(30);
    const shipName = sanitizeName(sol.name);
    console.log(`  ${num} ${score} ${status} ${chalk.white(name)} ${chalk.gray(`c6-launch ship ${shipName}`)}`);
  });

  console.log('');
  console.log(chalk.gray(`  ${solutions.length} solutions ready. Run: c6-launch ship <name>`));
  console.log(chalk.gray(`  Add --github=<user> for client repo, or --hosted for Carbon6 partnership (15% rev share)`));
  console.log('');

  return solutions;
}

/**
 * Find a specific solution by name (fuzzy match)
 */
export function findSolution(name) {
  const scan = loadLatestScan();
  if (!scan) return null;

  const target = name.toLowerCase().replace(/[^a-z0-9]/g, '');
  const solutions = scan.solutions || [];

  // Prefer exact match first
  const exact = solutions.find(s => {
    const sName = s.name.toLowerCase().replace(/[^a-z0-9]/g, '');
    return sName === target;
  });
  if (exact) return exact;

  // Then prefer target-includes-sName where lengths are close
  const close = solutions.find(s => {
    const sName = s.name.toLowerCase().replace(/[^a-z0-9]/g, '');
    return sName.includes(target) && sName.length <= target.length + 5;
  });
  if (close) return close;

  // Fallback to any includes
  return solutions.find(s => {
    const sName = s.name.toLowerCase().replace(/[^a-z0-9]/g, '');
    return sName.includes(target) || target.includes(sName);
  });
}

/**
 * Sanitize a solution name for use as a repo/dir name
 */
export function sanitizeName(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function colorScore(score) {
  const str = String(score).padStart(5);
  if (score >= 70) return chalk.green(str);
  if (score >= 50) return chalk.yellow(str);
  return chalk.gray(str);
}

function colorStatus(status) {
  const str = status.padEnd(11);
  switch (status) {
    case 'LIVE': return chalk.green(str);
    case 'WORKING': return chalk.cyan(str);
    case 'DEPLOYABLE': return chalk.yellow(str);
    case 'BUILDABLE': return chalk.blue(str);
    default: return chalk.gray(str);
  }
}
