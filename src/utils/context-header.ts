/**
 * Context Header Utility
 *
 * Generates context headers for tool responses to help agents
 * maintain awareness of their working location after compaction.
 *
 * @module utils/context-header
 */

import { simpleGit } from 'simple-git';
import { config } from '../config.js';
import type { ContextInfo } from '../types.js';

/**
 * Generate a context header for tool responses
 * Shows current working directory and stream info prominently
 *
 * @param context - Current context information
 * @returns Formatted header string
 */
export function generateContextHeader(context: ContextInfo): string {
  const locationStatus = context.isWorktree ? 'WORKTREE' : 'NOT IN WORKTREE';
  const statusIcon = context.isWorktree ? '\u2705' : '\u26a0\ufe0f';

  const lines = [
    '\u2501'.repeat(68),
    `CURRENT CONTEXT [${statusIcon} ${locationStatus}]`,
    '\u2501'.repeat(68),
    `Directory: ${context.currentDir}`,
  ];

  if (context.streamId) {
    lines.push(`Stream:    ${context.streamId}`);
  } else {
    lines.push('Stream:    (none active)');
  }

  if (context.branch) {
    lines.push(`Branch:    ${context.branch}`);
  }

  lines.push('\u2501'.repeat(68));

  return lines.join('\n');
}

/**
 * Get current context info from the environment
 * Detects worktree status, branch, and stream ID
 *
 * @returns Promise resolving to current context
 */
export async function getCurrentContext(): Promise<ContextInfo> {
  const currentDir = process.cwd();

  // Check if in worktree directory
  const isInMain =
    currentDir === config.PROJECT_ROOT ||
    currentDir.endsWith('/egirl-platform');
  const isWorktree =
    currentDir.includes('worktrees') && !isInMain;

  // Try to get branch name
  let branch: string | undefined;
  try {
    const git = simpleGit(currentDir);
    branch = (await git.revparse(['--abbrev-ref', 'HEAD'])).trim();
  } catch {
    // Not a git repo or git command failed
  }

  // Extract stream ID from path if in worktree
  let streamId: string | undefined;
  if (isWorktree) {
    const match = currentDir.match(/stream-\d+[a-z]?-[^/]+/);
    if (match) {
      streamId = match[0];
    }
  }

  return { currentDir, streamId, branch, isWorktree };
}

/**
 * Generate a warning header for location mismatches
 * Use when agent is in wrong directory
 *
 * @param expected - Expected worktree path
 * @param actual - Actual current directory
 * @returns Formatted warning string
 */
export function generateLocationWarning(
  expected: string,
  actual: string
): string {
  const isInMain =
    actual === config.PROJECT_ROOT ||
    actual.endsWith('/egirl-platform');

  return `
\u26a0\ufe0f LOCATION MISMATCH DETECTED

You are currently in:
  ${actual} ${isInMain ? '(MAIN DIRECTORY - DO NOT MODIFY FILES HERE)' : ''}

You SHOULD be working in:
  ${expected}

\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501
CRITICAL ACTION REQUIRED
\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501

Navigate to the correct worktree BEFORE making any file modifications:

  cd ${expected}

Then verify with: verify_location tool
`.trim();
}
