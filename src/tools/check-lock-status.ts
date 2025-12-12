/**
 * check_lock_status - Check if a merge lock is active
 *
 * Returns current lock status information, useful for debugging
 * and understanding why merges might be blocked.
 */

import { simpleGit, type SimpleGit } from 'simple-git';

import { config } from '../config.js';
import type { MCPResponse } from '../types.js';
import { checkGitLock } from '../utils/git-lock.js';

export async function checkLockStatus(): Promise<MCPResponse> {
  const git: SimpleGit = simpleGit(config.PROJECT_ROOT);

  try {
    const lockStatus = await checkGitLock(git);

    if (!lockStatus.exists) {
      return {
        content: [
          {
            type: 'text',
            text: formatNoLock(),
          },
        ],
      };
    }

    return {
      content: [
        {
          type: 'text',
          text: formatLockStatus(lockStatus),
        },
      ],
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      content: [
        {
          type: 'text',
          text: `Failed to check lock status: ${errorMessage}`,
        },
      ],
    };
  }
}

function formatNoLock(): string {
  return `
MERGE LOCK STATUS

Status: NO ACTIVE LOCK ✅

All streams are free to complete their merges.
`.trim();
}

function formatLockStatus(status: {
  exists: boolean;
  isStale: boolean;
  ageMs?: number;
  info?: {
    streamId: string;
    pid: number;
    hostname: string;
    timestamp: string;
    operation: 'prepare_merge' | 'complete_merge';
  };
}): string {
  const { info, isStale, ageMs } = status;

  if (!info) {
    return `
MERGE LOCK STATUS

Status: LOCK EXISTS (unknown details)
Stale: ${isStale ? 'Yes ⚠️' : 'No'}

${isStale ? 'Lock is stale and can be removed with:\n  git push origin --delete locks/merge-in-progress' : 'Wait for lock to be released or become stale (5 min timeout)'}
`.trim();
  }

  const ageSeconds = Math.floor((ageMs || 0) / 1000);
  const ageMinutes = Math.floor(ageSeconds / 60);
  const ageDisplay = ageMinutes > 0 ? `${ageMinutes}m ${ageSeconds % 60}s` : `${ageSeconds}s`;

  const statusIcon = isStale ? '⚠️ STALE' : '🔒 ACTIVE';

  return `
MERGE LOCK STATUS

Status: ${statusIcon}
Stream: ${info.streamId}
Operation: ${info.operation}
Started: ${info.timestamp}
Age: ${ageDisplay}
Hostname: ${info.hostname}
PID: ${info.pid}

${isStale ? `
⚠️ LOCK IS STALE (>5 minutes)

This lock can be safely removed:
  git push origin --delete locks/merge-in-progress

Then retry your merge operation.
` : `
🔒 LOCK IS ACTIVE

Another agent is currently merging. Please wait.

Maximum wait time: 5 minutes (then lock becomes stale)
Current age: ${ageDisplay}
Time until stale: ${Math.max(0, Math.floor((300000 - (ageMs || 0)) / 1000))}s

TO PROCEED:
1. Wait for merge to complete (lock will be released)
2. Or wait for lock to become stale (${Math.max(0, Math.floor((300000 - (ageMs || 0)) / 60000))} minutes remaining)
3. Then retry your merge
`}
`.trim();
}
