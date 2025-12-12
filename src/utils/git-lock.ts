/**
 * Git-based distributed merge lock
 *
 * Uses git branches as distributed locks that work across machines/agents.
 * More robust than file-system locks for distributed workflows.
 *
 * Lock mechanism:
 * - Lock branch: refs/locks/merge-in-progress
 * - Atomic acquisition via git push
 * - Stale lock detection via branch metadata
 * - Works across different environments
 */

import type { SimpleGit } from 'simple-git';
import { config } from '../config.js';

export interface GitLockInfo {
  streamId: string;
  pid: number;
  hostname: string;
  timestamp: string; // ISO 8601
  operation: 'prepare_merge' | 'complete_merge';
}

export interface GitLockResult {
  acquired: boolean;
  lockInfo?: GitLockInfo;
  error?: string;
}

const LOCK_BRANCH = 'refs/locks/merge-in-progress';
const LOCK_TIMEOUT_MS = 300000; // 5 minutes

/**
 * Acquire distributed git-based merge lock
 *
 * @param git - SimpleGit instance (should be in main project directory)
 * @param streamId - Stream attempting to acquire lock
 * @param operation - Operation type (prepare_merge or complete_merge)
 * @returns Lock acquisition result
 */
export async function acquireGitLock(
  git: SimpleGit,
  streamId: string,
  operation: 'prepare_merge' | 'complete_merge'
): Promise<GitLockResult> {
  const maxRetries = config.LOCK_MAX_RETRIES;
  const retryInterval = config.LOCK_RETRY_INTERVAL;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      // Check if lock already exists
      const existingLock = await checkGitLock(git);

      if (existingLock.exists) {
        // Check if stale
        if (existingLock.isStale) {
          console.error(`[git-lock] Removing stale lock (age: ${existingLock.ageMs}ms)...`);
          await releaseGitLock(git);
          continue; // Retry acquisition
        }

        // Lock is held by another process
        if (attempt < maxRetries - 1) {
          console.error(
            `[git-lock] Lock held by stream ${existingLock.info?.streamId}, waiting ${retryInterval / 1000}s (attempt ${attempt + 1}/${maxRetries})...`
          );
          await sleep(retryInterval);
          continue;
        }

        return {
          acquired: false,
          lockInfo: existingLock.info,
          error: 'Lock acquisition timeout - another merge in progress',
        };
      }

      // Attempt atomic lock acquisition
      const lockInfo: GitLockInfo = {
        streamId,
        pid: process.pid,
        hostname: getHostname(),
        timestamp: new Date().toISOString(),
        operation,
      };

      // Create lock commit with metadata
      const lockMessage = JSON.stringify(lockInfo, null, 2);

      // Create empty commit on lock branch
      // Use --allow-empty because we don't need file changes
      await git.checkout(['-B', LOCK_BRANCH.replace('refs/', '')]); // Create/switch to lock branch
      await git.commit(lockMessage, { '--allow-empty': null });

      // Atomically push lock branch to origin
      // This will fail if another agent pushed first (race condition protection)
      try {
        await git.push(['origin', LOCK_BRANCH, '--force']);
        console.error(`[git-lock] Lock acquired on attempt ${attempt + 1}`);

        // Switch back to previous branch
        await git.checkout('-'); // Switch back to previous branch

        return {
          acquired: true,
          lockInfo,
        };
      } catch (pushError) {
        // Push failed - another agent acquired the lock first
        console.error(`[git-lock] Lock acquisition race lost, retrying...`);
        await git.checkout('-'); // Switch back

        if (attempt < maxRetries - 1) {
          await sleep(retryInterval);
          continue;
        }

        return {
          acquired: false,
          error: 'Lock acquisition race condition - another merge started first',
        };
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error(`[git-lock] Error during lock acquisition: ${errorMsg}`);

      if (attempt < maxRetries - 1) {
        await sleep(retryInterval);
        continue;
      }

      return {
        acquired: false,
        error: `Lock acquisition failed: ${errorMsg}`,
      };
    }
  }

  return {
    acquired: false,
    error: 'Lock acquisition failed after max retries',
  };
}

/**
 * Release git-based merge lock
 *
 * @param git - SimpleGit instance
 */
export async function releaseGitLock(git: SimpleGit): Promise<void> {
  try {
    // Delete lock branch from origin
    await git.push(['origin', '--delete', LOCK_BRANCH.replace('refs/', '')]);
    console.error(`[git-lock] Lock released`);
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);

    // Only warn if branch exists (ignore "not found" errors)
    if (!errorMsg.includes('not found') && !errorMsg.includes("couldn't find remote ref")) {
      console.error(`[git-lock] Warning: Could not release lock: ${errorMsg}`);
    }
  }

  // Clean up local lock branch
  try {
    await git.deleteLocalBranch(LOCK_BRANCH.replace('refs/', ''), true);
  } catch {
    // Ignore - local cleanup is non-critical
  }
}

/**
 * Check current git lock status
 *
 * @param git - SimpleGit instance
 * @returns Lock status information
 */
export async function checkGitLock(git: SimpleGit): Promise<{
  exists: boolean;
  isStale: boolean;
  ageMs?: number;
  info?: GitLockInfo;
}> {
  try {
    // Fetch latest lock state from origin
    await git.fetch(['origin', LOCK_BRANCH, '--prune']).catch(() => {
      // Ignore fetch errors - lock might not exist
    });

    // Check if lock branch exists on origin
    const branches = await git.branch(['-r']);
    const lockBranchName = LOCK_BRANCH.replace('refs/', '');
    const lockExists = branches.all.some(
      (branch) => branch.includes(lockBranchName) || branch.includes('locks/merge-in-progress')
    );

    if (!lockExists) {
      return { exists: false, isStale: false };
    }

    // Get lock info from commit message
    try {
      const log = await git.log([`origin/${lockBranchName}`, '-1']);
      const commitMessage = log.latest?.message || '{}';

      const lockInfo: GitLockInfo = JSON.parse(commitMessage);
      const lockAge = Date.now() - new Date(lockInfo.timestamp).getTime();
      const isStale = lockAge > LOCK_TIMEOUT_MS;

      return {
        exists: true,
        isStale,
        ageMs: lockAge,
        info: lockInfo,
      };
    } catch {
      // Can't parse lock info - treat as stale
      return {
        exists: true,
        isStale: true,
      };
    }
  } catch (error) {
    console.error(`[git-lock] Error checking lock status:`, error);
    return { exists: false, isStale: false };
  }
}

/**
 * Format lock error message for user
 */
export function formatGitLockError(streamId: string, lockInfo?: GitLockInfo): string {
  const waitedSeconds = (config.LOCK_RETRY_INTERVAL * config.LOCK_MAX_RETRIES) / 1000;

  return `
MERGE LOCK FAILED

Stream: ${streamId}
Lock Type: Distributed Git Lock
Lock Branch: ${LOCK_BRANCH}

${lockInfo ? `CURRENT LOCK HOLDER:
  Stream: ${lockInfo.streamId}
  Operation: ${lockInfo.operation}
  Started: ${lockInfo.timestamp}
  Hostname: ${lockInfo.hostname}
  PID: ${lockInfo.pid}
` : ''}
Waited ${waitedSeconds} seconds but lock was not released.

TO FIX:
1. Wait for other merge to complete
2. If stuck, check lock status:
   git fetch origin ${LOCK_BRANCH}
   git log origin/locks/merge-in-progress -1

3. If lock is stale (>5 min), manually remove:
   git push origin --delete locks/merge-in-progress

4. Retry your merge operation

WHY: Only one agent can merge to main at a time to prevent conflicts.
This is a distributed lock - works across all environments.
`.trim();
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getHostname(): string {
  try {
    return require('os').hostname();
  } catch {
    return 'unknown';
  }
}
