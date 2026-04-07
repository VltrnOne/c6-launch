// C6 Launch — Shipper
// Full pipeline: package → create repo → push → return URL

import { execSync } from 'child_process';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import chalk from 'chalk';
import ora from 'ora';
import { packageSolution } from './packager.js';
import { sanitizeName } from './selector.js';
import { registerHosted } from './registry.js';

/**
 * Full ship pipeline: package + GitHub repo + push
 */
export async function shipSolution(name, options = {}) {
  const { github, hosted, org = 'VltrnOne' } = options;

  console.log('');
  console.log(chalk.cyan.bold('  ╔═══════════════════════════════════════╗'));
  console.log(chalk.cyan.bold('  ║        C6 Launch — Ship Pipeline      ║'));
  console.log(chalk.cyan.bold('  ╚═══════════════════════════════════════╝'));
  console.log('');

  // Step 1: Package the solution
  const result = await packageSolution(name, { ...options, dryRun: false });
  if (!result) return null;

  const { stagingPath, repoName, solution } = result;

  // Step 2: Determine where to create the repo
  const repoOwner = github || org;
  const isHosted = !github || hosted;
  const visibility = options.private ? '--private' : '--public';

  console.log('');
  if (isHosted) {
    console.log(chalk.yellow(`  ⚡ Hosted Mode — Carbon6 Partnership (15% rev share)`));
    console.log(chalk.gray(`  Repo: ${repoOwner}/${repoName}`));
  } else {
    console.log(chalk.green(`  ⚡ Client Mode — Repo under ${github}'s account`));
    console.log(chalk.gray(`  Repo: ${github}/${repoName}`));
  }
  console.log('');

  // Step 3: Init git in staging
  const spinner = ora('Initializing repository...').start();

  try {
    execSync('git init', { cwd: stagingPath, encoding: 'utf8', timeout: 5000 });
    execSync('git add -A', { cwd: stagingPath, encoding: 'utf8', timeout: 10000 });

    const commitMsg = `feat: ${solution.name} — packaged by C6 Launch

OceanDeep Score: ${solution.score}/100
Status: ${solution.status}
Type: ${solution.type}
${isHosted ? 'Hosted by Carbon6 (15% rev share partnership)' : `Client repo: ${github}`}

Packaged by C6 Launch — Powered by CARBON[6]
https://github.com/VltrnOne/oceandeep`;

    execSync(`git commit -m ${JSON.stringify(commitMsg)}`, {
      cwd: stagingPath, encoding: 'utf8', timeout: 10000,
    });

    spinner.succeed('Git initialized and committed');
  } catch (err) {
    spinner.fail(`Git init failed: ${err.message}`);
    return null;
  }

  // Step 4: Create GitHub repo
  const spinner2 = ora(`Creating GitHub repo: ${repoOwner}/${repoName}`).start();

  try {
    // Get description from solution
    const desc = solution.source?.description || solution.packaging?.description || `${solution.name} — Powered by CARBON[6]`;
    const safeDesc = desc.slice(0, 200).replace(/"/g, '\\"');

    const repoUrl = execSync(
      `gh repo create ${repoOwner}/${repoName} ${visibility} --description "${safeDesc}" 2>&1`,
      { encoding: 'utf8', timeout: 15000, cwd: stagingPath }
    ).trim();

    spinner2.succeed(`Created: ${chalk.cyan(repoUrl)}`);

    // Step 5: Push
    const spinner3 = ora('Pushing to GitHub...').start();

    // Use gh-authenticated URL for push
    const ghToken = execSync('gh auth token', { encoding: 'utf8', timeout: 5000 }).trim();
    const authUrl = `https://x-access-token:${ghToken}@github.com/${repoOwner}/${repoName}.git`;
    execSync(`git remote add origin "${authUrl}"`, {
      cwd: stagingPath, encoding: 'utf8', timeout: 5000,
    });
    execSync('git branch -M main', { cwd: stagingPath, encoding: 'utf8', timeout: 5000 });
    execSync('git push -u origin main', { cwd: stagingPath, encoding: 'utf8', timeout: 60000 });

    spinner3.succeed('Pushed to GitHub');

    // Step 6: Add topics
    try {
      const topics = ['carbon6', 'oceandeep', solution.type || 'tool']
        .filter(Boolean).join(',');
      execSync(`gh repo edit ${repoOwner}/${repoName} --add-topic "${topics}"`, {
        encoding: 'utf8', timeout: 10000,
      });
    } catch {}

    // Step 7: Register if hosted
    if (isHosted) {
      registerHosted({
        name: solution.name,
        repoName,
        repoUrl: `https://github.com/${repoOwner}/${repoName}`,
        owner: repoOwner,
        score: solution.score,
        status: solution.status,
        type: solution.type,
        revenueShare: '15%',
        launchedAt: new Date().toISOString(),
      });
    }

    // Final summary
    console.log('');
    console.log(chalk.green.bold('  ✓ SHIPPED'));
    console.log('');
    console.log(chalk.white(`  ${solution.name}`));
    console.log(chalk.gray(`  ${repoUrl || `https://github.com/${repoOwner}/${repoName}`}`));
    console.log('');
    console.log(chalk.gray(`  Score:    ${solution.score}/100`));
    console.log(chalk.gray(`  Files:    ${result.fileCount}`));
    console.log(chalk.gray(`  Mode:     ${isHosted ? 'Carbon6 Hosted (15% rev share)' : `Client (${github})`}`));
    console.log(chalk.gray(`  Status:   ${solution.status}`));
    console.log('');

    return {
      url: `https://github.com/${repoOwner}/${repoName}`,
      repoName,
      owner: repoOwner,
      hosted: isHosted,
    };

  } catch (err) {
    spinner2.fail(`GitHub creation failed: ${err.message}`);
    console.log(chalk.yellow(`  Staged files are still at: ${stagingPath}`));
    console.log(chalk.yellow(`  You can manually create the repo and push.`));
    return null;
  }
}
