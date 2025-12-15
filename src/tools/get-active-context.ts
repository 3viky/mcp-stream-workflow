/**
 * get_active_context - Recover working context after compaction
 *
 * CRITICAL tool for maintaining worktree discipline after context loss.
 * Supports MULTIPLE simultaneous active streams.
 *
 * Behavior:
 * - If in a worktree: confirms location, shows that stream's context
 * - If in main: lists ALL active streams, suggests most recent
 *
 * @module tools/get-active-context
 */

import { simpleGit } from 'simple-git';
import { config } from '../config.js';
import { getAllActiveStreams, getMostRecentActiveStream } from '../state-manager.js';
import type { MCPResponse, ActiveStreamContext } from '../types.js';

/**
 * Get active context to help agents recover after compaction
 * Supports multiple simultaneous streams
 */
export async function getActiveContext(): Promise<MCPResponse> {
  const activeStreams = await getAllActiveStreams();
  const mostRecent = await getMostRecentActiveStream();
  const currentDir = process.cwd();

  // Check current location type
  const isInMain =
    currentDir === config.PROJECT_ROOT ||
    currentDir.endsWith('/egirl-platform');

  // Check if we're already in a worktree
  const worktreeMatch = currentDir.match(/stream-\d+[a-z]?-[^/]+/);
  const currentStreamId = worktreeMatch ? worktreeMatch[0] : null;

  // Get current git branch if possible
  let currentBranch = 'unknown';
  try {
    const git = simpleGit(currentDir);
    currentBranch = (await git.revparse(['--abbrev-ref', 'HEAD'])).trim();
  } catch {
    // Not a git repo or git failed
  }

  const streamCount = Object.keys(activeStreams).length;

  // Case 1: Already in a worktree
  if (currentStreamId && !isInMain) {
    const streamContext = activeStreams[currentStreamId];
    return {
      content: [
        {
          type: 'text',
          text: formatInWorktree(currentStreamId, currentDir, currentBranch, streamContext, streamCount),
        },
      ],
    };
  }

  // Case 2: In main directory
  if (streamCount === 0) {
    return {
      content: [
        {
          type: 'text',
          text: formatNoActiveStreams(currentDir),
        },
      ],
    };
  }

  // Case 3: In main with active streams available
  return {
    content: [
      {
        type: 'text',
        text: formatInMainWithStreams(currentDir, activeStreams, mostRecent),
      },
    ],
  };
}

/**
 * Format: Already in a worktree - good location
 */
function formatInWorktree(
  streamId: string,
  currentDir: string,
  branch: string,
  context: ActiveStreamContext | undefined,
  totalActiveStreams: number
): string {
  const lastAccessed = context?.lastAccessedAt
    ? new Date(context.lastAccessedAt).toLocaleString()
    : 'unknown';

  const otherStreamsNote = totalActiveStreams > 1
    ? `\n\nNOTE: ${totalActiveStreams - 1} other active stream(s) available. Use get_active_context from main to see all.`
    : '';

  return `
\u2705 CONTEXT VERIFIED - IN WORKTREE

\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501
CURRENT WORKING CONTEXT
\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501
Stream ID:      ${streamId}
Directory:      ${currentDir}
Branch:         ${branch}
Last Accessed:  ${lastAccessed}
\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501

You are in the correct worktree. Safe to proceed with file modifications.

NEXT STEPS:
1. Read HANDOFF.md for task details: cat HANDOFF.md
2. Continue development work
3. When ready: Call prepare_merge (requires user direction)${otherStreamsNote}
`.trim();
}

/**
 * Format: No active streams tracked
 */
function formatNoActiveStreams(currentDir: string): string {
  return `
NO ACTIVE STREAMS

Current Directory: ${currentDir}

No streams are currently being tracked as active.

POSSIBLE ACTIONS:
1. If starting new work: Call start_stream to create a new stream
2. If resuming existing work: Navigate to the worktree manually
   cd ${config.WORKTREE_ROOT}/stream-XXXX-name
3. Use verify_location to check if a directory is a valid worktree

NOTE: Always work in worktrees, never modify files in the main directory.
`.trim();
}

/**
 * Format: In main directory with active streams available
 */
function formatInMainWithStreams(
  currentDir: string,
  activeStreams: Record<string, ActiveStreamContext>,
  mostRecent: ActiveStreamContext | null
): string {
  const streamList = Object.values(activeStreams)
    .sort((a, b) => new Date(b.lastAccessedAt).getTime() - new Date(a.lastAccessedAt).getTime())
    .map((s, i) => {
      const lastAccessed = new Date(s.lastAccessedAt).toLocaleString();
      const marker = i === 0 ? ' \u2190 MOST RECENT' : '';
      return `  ${i + 1}. ${s.streamId}${marker}\n     Path: ${s.worktreePath}\n     Last: ${lastAccessed}`;
    })
    .join('\n\n');

  const suggestedCommand = mostRecent
    ? `cd ${mostRecent.worktreePath}`
    : 'cd <worktree-path>';

  return `
\u26a0\ufe0f IN MAIN DIRECTORY - SELECT A STREAM

Current Directory: ${currentDir}
Status: DO NOT MODIFY FILES HERE

\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501
ACTIVE STREAMS (${Object.keys(activeStreams).length})
\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501

${streamList}

\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501
ACTION REQUIRED
\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501

To continue on most recent stream:
  ${suggestedCommand}

Or navigate to any stream listed above.

WHY: File modifications in main cause merge conflicts and lost work.
`.trim();
}
