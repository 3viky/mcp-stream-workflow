/**
 * File-based merge lock (SSOT)
 *
 * Uses .git/MERGE_LOCK directory for coordination with git hooks.
 * Single source of truth - no parallel git branch mechanism.
 *
 * Lock mechanism:
 * - Lock directory: .git/MERGE_LOCK/
 * - Atomic acquisition via mkdir (atomic filesystem operation)
 * - Stale lock detection via PID liveness check
 * - Compatible with .git-hooks/merge-worktree-to-main script
 */

import fs from 'fs';
import path from 'path';
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

const LOCK_TIMEOUT_MS = 300000; // 5 minutes

/**
 * Get lock directory path from git instance
 */
async function getLockDir(git: SimpleGit): Promise<string> {
  const gitDir = await git.revparse(['--git-dir']);
  return path.join(gitDir.trim(), 'MERGE_LOCK');
}

/**
 * Check if process is still running
 */
function isProcessAlive(pid: number): boolean {
  try {
    // Signal 0 checks if process exists without killing it
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/**
 * Acquire file-based merge lock
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
  const lockDir = await getLockDir(git);

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

      // Attempt atomic lock acquisition via mkdir
      const lockInfo: GitLockInfo = {
        streamId,
        pid: process.pid,
        hostname: getHostname(),
        timestamp: new Date().toISOString(),
        operation,
      };

      try {
        // mkdir is atomic - either succeeds or fails if already exists
        fs.mkdirSync(lockDir, { recursive: false });

        // Write lock metadata to files
        fs.writeFileSync(path.join(lockDir, 'pid'), String(process.pid));
        fs.writeFileSync(path.join(lockDir, 'timestamp'), new Date().toISOString());
        fs.writeFileSync(path.join(lockDir, 'branch'), streamId);
        fs.writeFileSync(path.join(lockDir, 'hostname'), getHostname());
        fs.writeFileSync(path.join(lockDir, 'operation'), operation);

        console.error(`[git-lock] Lock acquired on attempt ${attempt + 1}`);

        return {
          acquired: true,
          lockInfo,
        };
      } catch (mkdirError: any) {
        // EEXIST means lock already exists - another process won the race
        if (mkdirError.code === 'EEXIST') {
          console.error(`[git-lock] Lock acquisition race lost, retrying...`);

          if (attempt < maxRetries - 1) {
            await sleep(retryInterval);
            continue;
          }

          return {
            acquired: false,
            error: 'Lock acquisition race condition - another merge started first',
          };
        }

        // Other error - propagate
        throw mkdirError;
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
 * Release file-based merge lock
 *
 * @param git - SimpleGit instance
 */
export async function releaseGitLock(git: SimpleGit): Promise<void> {
  try {
    const lockDir = await getLockDir(git);

    if (fs.existsSync(lockDir)) {
      // Remove lock directory and all contents
      fs.rmSync(lockDir, { recursive: true, force: true });
      console.error(`[git-lock] Lock released`);
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error(`[git-lock] Warning: Could not release lock: ${errorMsg}`);
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
    const lockDir = await getLockDir(git);

    // Check if lock directory exists
    if (!fs.existsSync(lockDir)) {
      return { exists: false, isStale: false };
    }

    // Read lock metadata
    const pidFile = path.join(lockDir, 'pid');
    const timestampFile = path.join(lockDir, 'timestamp');
    const branchFile = path.join(lockDir, 'branch');
    const hostnameFile = path.join(lockDir, 'hostname');
    const operationFile = path.join(lockDir, 'operation');

    // Check if PID file exists
    if (!fs.existsSync(pidFile)) {
      // Lock directory exists but no PID file - definitely stale
      return {
        exists: true,
        isStale: true,
      };
    }

    // Read lock info
    const pid = parseInt(fs.readFileSync(pidFile, 'utf-8').trim(), 10);
    const timestamp = fs.readFileSync(timestampFile, 'utf-8').trim();
    const streamId = fs.readFileSync(branchFile, 'utf-8').trim();
    const hostname = fs.existsSync(hostnameFile)
      ? fs.readFileSync(hostnameFile, 'utf-8').trim()
      : 'unknown';
    const operation = (fs.existsSync(operationFile)
      ? fs.readFileSync(operationFile, 'utf-8').trim()
      : 'prepare_merge') as 'prepare_merge' | 'complete_merge';

    const lockInfo: GitLockInfo = {
      streamId,
      pid,
      hostname,
      timestamp,
      operation,
    };

    // Check if process is still alive
    const processAlive = isProcessAlive(pid);

    if (!processAlive) {
      // Process is dead - lock is stale
      return {
        exists: true,
        isStale: true,
        info: lockInfo,
      };
    }

    // Check age-based staleness
    const lockAge = Date.now() - new Date(timestamp).getTime();
    const isStale = lockAge > LOCK_TIMEOUT_MS;

    return {
      exists: true,
      isStale,
      ageMs: lockAge,
      info: lockInfo,
    };
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
Lock Type: File-based Lock (SSOT)
Lock Location: .git/MERGE_LOCK

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
2. If stuck, check lock status with check_lock_status tool

3. If lock is stale (>5 min) or process is dead, manually remove:
   rm -rf .git/MERGE_LOCK

4. Retry your merge operation

WHY: Only one agent can merge to main at a time to prevent conflicts.
This lock mechanism is shared with git hooks for consistency.
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
