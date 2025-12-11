/**
 * Test Helpers and Utilities
 *
 * Shared utilities for test setup, mocking, and assertions
 */

import { tmpdir } from 'os';
import { join } from 'path';
import { mkdirSync, rmSync, existsSync, writeFileSync } from 'fs';
import { simpleGit, SimpleGit } from 'simple-git';

// ============================================================================
// Test Environment Setup
// ============================================================================

export interface TestEnvironment {
  projectRoot: string;
  worktreeRoot: string;
  git: SimpleGit;
}

/**
 * Create a test git repository with proper structure
 *
 * Creates:
 * - Temporary project directory
 * - Temporary worktree directory
 * - Initialized git repository
 * - Initial commit on main branch
 * - .project directory structure
 *
 * @returns Test environment with paths and git instance
 */
export async function createTestGitRepo(): Promise<TestEnvironment> {
  const testRoot = join(
    tmpdir(),
    `mcp-test-${Date.now()}-${Math.random().toString(36).slice(2)}`
  );
  const projectRoot = join(testRoot, 'project');
  const worktreeRoot = join(testRoot, 'worktrees');

  // Create directories
  mkdirSync(projectRoot, { recursive: true });
  mkdirSync(worktreeRoot, { recursive: true });
  mkdirSync(join(projectRoot, '.project/plan/streams'), { recursive: true });
  mkdirSync(join(projectRoot, '.project/history'), { recursive: true });

  // Initialize git repo
  const git = simpleGit(projectRoot);
  await git.init();
  await git.addConfig('user.name', 'Test User');
  await git.addConfig('user.email', 'test@example.com');

  // Create initial commit on main
  writeFileSync(join(projectRoot, 'README.md'), '# Test Project\n');
  writeFileSync(join(projectRoot, 'package.json'), '{"name":"test","version":"1.0.0"}');
  await git.add('.');
  await git.commit('Initial commit');

  return { projectRoot, worktreeRoot, git };
}

/**
 * Clean up test environment
 *
 * Removes all temporary directories and files
 *
 * @param env Test environment to clean up
 */
export function cleanupTestEnv(env: TestEnvironment): void {
  try {
    const testRoot = join(env.projectRoot, '..');
    if (existsSync(testRoot)) {
      rmSync(testRoot, { recursive: true, force: true, maxRetries: 3 });
    }
  } catch (error) {
    console.error('Cleanup error:', error);
    // Don't fail tests on cleanup errors
  }
}

// ============================================================================
// Mock Data Creation
// ============================================================================

/**
 * Create mock stream state file
 */
export function createMockState(
  projectRoot: string,
  nextId: number = 1,
  streams: Record<string, any> = {}
): void {
  const statePath = join(projectRoot, '.project/.stream-state.json');
  const state = {
    nextStreamId: nextId,
    streams,
    lastSync: new Date().toISOString(),
  };
  writeFileSync(statePath, JSON.stringify(state, null, 2));
}

/**
 * Create mock dashboard file
 */
export function createMockDashboard(projectRoot: string, content?: string): void {
  const dashboardPath = join(projectRoot, '.project/STREAM_STATUS_DASHBOARD.md');
  const defaultContent = `# Stream Status Dashboard

**Last Updated**: ${new Date().toISOString()}

---

## Active Streams (0)

---

## Completed Streams (0)

See [.project/history/](./history/) for archived streams.

---

🤖 Managed by Stream Workflow Manager
`;
  writeFileSync(dashboardPath, content || defaultContent);
}

/**
 * Create mock stream metadata
 */
export function createMockStreamMetadata(streamId: string, overrides: any = {}) {
  return {
    streamId,
    streamNumber: parseInt(streamId.match(/\d+/)?.[0] || '1'),
    title: overrides.title || 'Test Stream',
    category: overrides.category || 'backend',
    priority: overrides.priority || 'medium',
    status: overrides.status || 'active',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    worktreePath: overrides.worktreePath || `/test/worktrees/${streamId}`,
    branch: streamId,
    ...overrides,
  };
}

// ============================================================================
// Git Helpers
// ============================================================================

/**
 * Create an uncommitted change in repository
 */
export function createUncommittedChange(projectRoot: string, filename: string = 'test.txt'): void {
  writeFileSync(join(projectRoot, filename), 'uncommitted content');
}

/**
 * Create a branch in repository
 */
export async function createBranch(git: SimpleGit, branchName: string): Promise<void> {
  await git.checkoutLocalBranch(branchName);
}

/**
 * Get the latest commit message
 */
export async function getLatestCommitMessage(git: SimpleGit): Promise<string> {
  const log = await git.log({ maxCount: 1 });
  return log.latest?.message || '';
}

/**
 * Check if a branch exists
 */
export async function branchExists(git: SimpleGit, branchName: string): Promise<boolean> {
  const branches = await git.branchLocal();
  return branches.all.includes(branchName);
}

// ============================================================================
// File System Helpers
// ============================================================================

/**
 * Check if stream directory exists with all required files
 */
export function streamDirectoryIsComplete(projectRoot: string, streamId: string): boolean {
  const streamDir = join(projectRoot, '.project/plan/streams', streamId);

  return (
    existsSync(join(streamDir, 'HANDOFF.md')) &&
    existsSync(join(streamDir, 'README.md')) &&
    existsSync(join(streamDir, 'STATUS.md')) &&
    existsSync(join(streamDir, 'METADATA.json'))
  );
}

/**
 * Check if worktree is properly created
 */
export function worktreeIsComplete(worktreeRoot: string, streamId: string): boolean {
  const worktreePath = join(worktreeRoot, streamId);

  return (
    existsSync(worktreePath) &&
    existsSync(join(worktreePath, 'HANDOFF.md')) &&
    existsSync(join(worktreePath, '.git'))
  );
}

// ============================================================================
// Assertion Helpers
// ============================================================================

/**
 * Assert response is successful
 */
export function assertSuccessResponse(result: any): void {
  if (!result.content || !result.content[0] || !result.content[0].text) {
    throw new Error('Invalid response structure');
  }

  const text = result.content[0].text;
  if (text.includes('failed') || text.includes('error')) {
    throw new Error(`Expected success but got: ${text}`);
  }
}

/**
 * Assert response is an error
 */
export function assertErrorResponse(result: any, expectedError?: string): void {
  if (!result.content || !result.content[0] || !result.content[0].text) {
    throw new Error('Invalid response structure');
  }

  const text = result.content[0].text;
  if (!text.includes('failed') && !text.includes('error')) {
    throw new Error(`Expected error but got: ${text}`);
  }

  if (expectedError && !text.includes(expectedError)) {
    throw new Error(`Expected error "${expectedError}" but got: ${text}`);
  }
}

// ============================================================================
// Mock Builders
// ============================================================================

/**
 * Build mock start_stream arguments
 */
export function buildStartStreamArgs(overrides: any = {}) {
  return {
    title: overrides.title || 'Test Stream',
    category: overrides.category || 'backend',
    priority: overrides.priority || 'medium',
    handoff: overrides.handoff || 'Test handoff content',
    description: overrides.description,
    estimatedPhases: overrides.estimatedPhases,
    tags: overrides.tags,
  };
}

// ============================================================================
// Test Data Generators
// ============================================================================

/**
 * Generate a unique stream ID
 */
export function generateStreamId(number: number, title: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .substring(0, 50);

  return `stream-${number.toString().padStart(3, '0')}-${slug}`;
}

/**
 * Generate test titles with various characteristics
 */
export function getTestTitles() {
  return {
    simple: 'Simple Feature',
    withNumbers: 'Feature #123',
    withSpecialChars: 'Fix: Bug (urgent!) & Critical',
    withSpaces: 'Feature With Many Spaces',
    long: 'This is a very long feature title that should be truncated appropriately when converted to a filesystem-safe slug',
    unicode: 'Add 日本語 Support',
    camelCase: 'addNewFeatureWithCamelCase',
    withDashes: 'feature-with-dashes',
    withUnderscores: 'feature_with_underscores',
  };
}

// ============================================================================
// Timing Helpers
// ============================================================================

/**
 * Wait for a condition to be true
 */
export async function waitFor(
  condition: () => boolean | Promise<boolean>,
  timeout: number = 5000,
  interval: number = 100
): Promise<void> {
  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    if (await condition()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, interval));
  }

  throw new Error(`Condition not met within ${timeout}ms`);
}

/**
 * Retry an operation with backoff
 */
export async function retryOperation<T>(
  operation: () => Promise<T>,
  maxAttempts: number = 3,
  delayMs: number = 100
): Promise<T> {
  let lastError: Error | undefined;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      if (attempt < maxAttempts - 1) {
        await new Promise((resolve) => setTimeout(resolve, delayMs * (attempt + 1)));
      }
    }
  }

  throw lastError || new Error('Operation failed after all retries');
}
