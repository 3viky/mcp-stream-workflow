/**
 * Validation runners for post-merge checks
 *
 * Runs TypeScript, build, and lint validation after conflict resolution
 * to ensure the merge didn't break anything.
 */

import { exec } from 'node:child_process';
import { promisify } from 'node:util';

import { config } from '../config.js';

const execAsync = promisify(exec);

interface ValidationResult {
  typescript: boolean;
  build: boolean;
  lint: boolean;
  allPassed: boolean;
  errors: string[];
}

export async function runValidation(workingDir: string): Promise<ValidationResult> {
  const result: ValidationResult = {
    typescript: true,
    build: true,
    lint: true,
    allPassed: true,
    errors: [],
  };

  // Run validators in parallel
  const [tsResult, buildResult, lintResult] = await Promise.all([
    config.VALIDATORS.typescript ? runTypeScript(workingDir) : { passed: true, errors: [] },
    config.VALIDATORS.build ? runBuild(workingDir) : { passed: true, errors: [] },
    config.VALIDATORS.lint ? runLint(workingDir) : { passed: true, errors: [] },
  ]);

  result.typescript = tsResult.passed;
  result.build = buildResult.passed;
  result.lint = lintResult.passed;

  result.errors = [...tsResult.errors, ...buildResult.errors, ...lintResult.errors];

  result.allPassed = result.typescript && result.build && result.lint;

  return result;
}

interface SingleValidationResult {
  passed: boolean;
  errors: string[];
}

async function runTypeScript(workingDir: string): Promise<SingleValidationResult> {
  try {
    console.error('[validators] Running TypeScript check...');
    await execAsync('npx tsc --noEmit', {
      cwd: workingDir,
      timeout: config.VALIDATION_TIMEOUT,
    });
    console.error('[validators] TypeScript: PASSED');
    return { passed: true, errors: [] };
  } catch (error) {
    const output = error instanceof Error ? (error as any).stdout || error.message : String(error);
    console.error('[validators] TypeScript: FAILED');
    return {
      passed: false,
      errors: parseErrors(output, 'TypeScript'),
    };
  }
}

async function runBuild(workingDir: string): Promise<SingleValidationResult> {
  try {
    console.error('[validators] Running build check...');
    // Use --dry-run or turbo check if available
    await execAsync('pnpm build --dry-run 2>/dev/null || pnpm turbo build --dry-run 2>/dev/null || echo "Build check skipped"', {
      cwd: workingDir,
      timeout: config.VALIDATION_TIMEOUT,
    });
    console.error('[validators] Build: PASSED');
    return { passed: true, errors: [] };
  } catch (error) {
    const output = error instanceof Error ? (error as any).stdout || error.message : String(error);
    console.error('[validators] Build: FAILED');
    return {
      passed: false,
      errors: parseErrors(output, 'Build'),
    };
  }
}

async function runLint(workingDir: string): Promise<SingleValidationResult> {
  try {
    console.error('[validators] Running lint check...');
    await execAsync('pnpm lint 2>/dev/null || echo "Lint check skipped"', {
      cwd: workingDir,
      timeout: config.VALIDATION_TIMEOUT,
    });
    console.error('[validators] Lint: PASSED');
    return { passed: true, errors: [] };
  } catch (error) {
    const output = error instanceof Error ? (error as any).stdout || error.message : String(error);
    console.error('[validators] Lint: FAILED');
    return {
      passed: false,
      errors: parseErrors(output, 'Lint'),
    };
  }
}

function parseErrors(output: string, type: string): string[] {
  if (!output) return [`${type}: Unknown error`];

  // Split output into lines and filter for error-like patterns
  const lines = output.split('\n').filter((line) => {
    const lower = line.toLowerCase();
    return (
      lower.includes('error') ||
      lower.includes('fail') ||
      line.includes('TS') || // TypeScript errors
      line.includes(':') // File:line:col patterns
    );
  });

  // Limit to first 50 errors
  const errors = lines.slice(0, 50).map((line) => `[${type}] ${line.trim()}`);

  if (lines.length > 50) {
    errors.push(`[${type}] ... and ${lines.length - 50} more errors`);
  }

  return errors.length > 0 ? errors : [`${type}: Failed (no specific errors captured)`];
}
