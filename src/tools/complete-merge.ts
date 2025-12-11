/**
 * complete_merge - Fast-forward merge worktree into main
 *
 * Implements Steps G,H,I of the Stream Completion Protocol:
 * [G] Switch to main directory
 * [H] Merge --ff-only (fast-forward only)
 * [I] Push to origin
 *
 * PREREQUISITE: Call prepare_merge first!
 */

import { existsSync, mkdirSync, rmdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { simpleGit, type SimpleGit } from 'simple-git';

import { config } from '../config.js';
import type { MCPResponse, CompleteMergeResponse, LockInfo } from '../types.js';

interface CompleteMergeArgs {
  streamId: string;
  deleteRemoteBranch?: boolean;
}

export async function completeMerge(args: CompleteMergeArgs): Promise<MCPResponse> {
  const { streamId, deleteRemoteBranch = false } = args;

  const mainPath = config.PROJECT_ROOT;
  const git: SimpleGit = simpleGit(mainPath);
  const lockPath = join(mainPath, config.MERGE_LOCK_DIR);

  const response: CompleteMergeResponse = {
    success: false,
    mergeType: 'fast-forward',
    mainCommitHash: '',
    pushedToOrigin: false,
    remoteBranchDeleted: false,
  };

  let lockAcquired = false;

  try {
    // Step 0: Acquire merge lock
    lockAcquired = await acquireLock(lockPath, streamId);
    if (!lockAcquired) {
      return {
        content: [
          {
            type: 'text',
            text: formatLockError(streamId, lockPath),
          },
        ],
      };
    }

    // Step G: Verify we're in main directory context
    const currentBranch = await git.revparse(['--abbrev-ref', 'HEAD']);
    if (currentBranch.trim() !== 'main') {
      // Switch to main
      console.error(`[complete_merge] Switching to main branch...`);
      await git.checkout('main');
    }

    // Verify main is clean
    const status = await git.status();
    if (!status.isClean()) {
      releaseLock(lockPath);
      return {
        content: [
          {
            type: 'text',
            text: formatDirtyMainError(streamId, status.files.map((f) => f.path)),
          },
        ],
      };
    }

    // Pull latest main
    console.error(`[complete_merge] Pulling latest main...`);
    await git.pull('origin', 'main');

    // Step H: Fast-forward merge
    console.error(`[complete_merge] Merging ${streamId} into main (--ff-only)...`);
    try {
      await git.merge([streamId, '--ff-only']);
    } catch (mergeError) {
      releaseLock(lockPath);
      return {
        content: [
          {
            type: 'text',
            text: formatFFFailure(streamId, mergeError),
          },
        ],
      };
    }

    // Get new commit hash
    const log = await git.log({ maxCount: 1 });
    response.mainCommitHash = log.latest?.hash || '';

    // Step I: Push to origin
    console.error(`[complete_merge] Pushing main to origin...`);
    await git.push('origin', 'main');
    response.pushedToOrigin = true;

    // Optional: Delete remote branch
    if (deleteRemoteBranch) {
      try {
        console.error(`[complete_merge] Deleting remote branch origin/${streamId}...`);
        await git.push(['origin', '--delete', streamId]);
        response.remoteBranchDeleted = true;
      } catch {
        console.error(`[complete_merge] Warning: Could not delete remote branch`);
      }
    }

    response.success = true;

    // Release lock
    releaseLock(lockPath);

    return {
      content: [
        {
          type: 'text',
          text: formatSuccess(response, streamId),
        },
      ],
    };
  } catch (error) {
    // Always release lock on error
    if (lockAcquired) {
      releaseLock(lockPath);
    }

    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      content: [
        {
          type: 'text',
          text: `complete_merge failed: ${errorMessage}\n\nStream: ${streamId}\nMain: ${mainPath}`,
        },
      ],
    };
  }
}

async function acquireLock(lockPath: string, streamId: string): Promise<boolean> {
  const maxRetries = config.LOCK_MAX_RETRIES;
  const retryInterval = config.LOCK_RETRY_INTERVAL;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      // Atomic directory creation = lock acquisition
      mkdirSync(lockPath, { recursive: false });

      // Write lock info
      const lockInfo: LockInfo = {
        pid: process.pid,
        timestamp: new Date(),
        streamId,
        operation: 'complete_merge',
      };
      writeFileSync(join(lockPath, 'info.json'), JSON.stringify(lockInfo, null, 2));

      console.error(`[complete_merge] Lock acquired on attempt ${attempt + 1}`);
      return true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
        // Lock exists - check if stale
        const isStale = await checkStaleLock(lockPath);
        if (isStale) {
          console.error(`[complete_merge] Removing stale lock...`);
          rmdirSync(lockPath, { recursive: true });
          continue; // Retry
        }

        if (attempt < maxRetries - 1) {
          console.error(
            `[complete_merge] Lock held by another process, waiting ${retryInterval / 1000}s (attempt ${attempt + 1}/${maxRetries})...`
          );
          await sleep(retryInterval);
        }
      } else {
        throw error;
      }
    }
  }

  return false;
}

async function checkStaleLock(lockPath: string): Promise<boolean> {
  try {
    const infoPath = join(lockPath, 'info.json');
    if (!existsSync(infoPath)) {
      return true; // No info file = stale
    }

    const info: LockInfo = JSON.parse(readFileSync(infoPath, 'utf-8'));
    const lockAge = Date.now() - new Date(info.timestamp).getTime();

    // Lock is stale if older than timeout
    return lockAge > config.MERGE_LOCK_TIMEOUT;
  } catch {
    return true; // Error reading = stale
  }
}

function releaseLock(lockPath: string): void {
  try {
    rmdirSync(lockPath, { recursive: true });
    console.error(`[complete_merge] Lock released`);
  } catch {
    console.error(`[complete_merge] Warning: Could not release lock`);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function formatSuccess(response: CompleteMergeResponse, streamId: string): string {
  return `
COMPLETE_MERGE SUCCESS

Stream: ${streamId}
Merge Type: ${response.mergeType}
Main Commit: ${response.mainCommitHash}
Pushed to Origin: ${response.pushedToOrigin ? 'Yes' : 'No'}
Remote Branch Deleted: ${response.remoteBranchDeleted ? 'Yes' : 'No'}

STREAM WORK IS NOW IN MAIN

NEXT STEP:
  Call complete_stream to archive and cleanup
`.trim();
}

function formatLockError(streamId: string, lockPath: string): string {
  return `
MERGE LOCK FAILED

Stream: ${streamId}
Lock Path: ${lockPath}

Another merge operation is in progress.

Waited ${(config.LOCK_RETRY_INTERVAL * config.LOCK_MAX_RETRIES) / 1000} seconds but lock was not released.

TO FIX:
1. Wait for other merge to complete
2. If stuck, manually remove lock:
   rm -rf ${lockPath}
3. Retry complete_merge

WHY: Only one agent can merge to main at a time to prevent conflicts.
`.trim();
}

function formatDirtyMainError(streamId: string, files: string[]): string {
  return `
MAIN HAS UNCOMMITTED CHANGES

Stream: ${streamId}
Files with changes:
${files.slice(0, 10).map((f) => `  - ${f}`).join('\n')}
${files.length > 10 ? `  ... and ${files.length - 10} more` : ''}

TO FIX:
1. Main should NEVER have uncommitted changes
2. Either commit or stash changes in main
3. Retry complete_merge

WARNING: Main directory should only contain committed work.
This suggests a workflow violation.
`.trim();
}

function formatFFFailure(streamId: string, error: unknown): string {
  const errorMsg = error instanceof Error ? error.message : String(error);
  return `
FAST-FORWARD MERGE FAILED

Stream: ${streamId}
Error: ${errorMsg}

This means the worktree was NOT properly prepared.

COMMON CAUSES:
1. Did not call prepare_merge first
2. Main has new commits since prepare_merge was called

TO FIX:
1. Go back to worktree:
   cd ../egirl-platform-worktrees/${streamId}

2. Run prepare_merge again:
   prepare_merge({ streamId: "${streamId}" })

3. Then retry complete_merge

WHY --ff-only:
- Ensures main never enters conflicted state
- All conflict resolution happens in worktree (safe)
- Guarantees clean merge history
`.trim();
}
