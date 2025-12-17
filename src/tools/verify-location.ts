/**
 * verify_location - Worktree enforcement tool
 *
 * Verifies current working directory is a valid worktree, not main.
 * CRITICAL: Call this before any file modifications.
 */

import { existsSync, readFileSync } from 'node:fs';
import { join, basename } from 'node:path';
import { simpleGit } from 'simple-git';

import { config } from '../config.js';
import type { MCPResponse, VerifyLocationResponse } from '../types.js';

interface VerifyLocationArgs {
  workingDir?: string;
}

export async function verifyLocation(args: VerifyLocationArgs): Promise<MCPResponse> {
  const workingDir = args.workingDir || process.cwd();

  const response: VerifyLocationResponse = {
    isValid: false,
    currentPath: workingDir,
  };

  // Check 1: Is this the main directory?
  const projectName = config.PROJECT_ROOT.split('/').pop() || 'egirl-platform';
  if (workingDir === config.PROJECT_ROOT || workingDir.endsWith(`/${projectName}`)) {
    response.isValid = false;
    response.error = 'WORKTREE_VIOLATION: Currently in main directory, not a worktree';

    return {
      content: [
        {
          type: 'text',
          text: formatError(workingDir),
        },
      ],
    };
  }

  // Check 2: Is this in the worktrees directory?
  // Use config.WORKTREE_ROOT to determine the expected worktree location
  if (!workingDir.startsWith(config.WORKTREE_ROOT)) {
    response.isValid = false;
    response.error = `NOT_IN_WORKTREES: Directory is not in ${config.WORKTREE_ROOT}`;

    return {
      content: [
        {
          type: 'text',
          text: formatError(workingDir),
        },
      ],
    };
  }

  // Check 3: Does it have a valid .git file (worktree marker)?
  const gitFile = join(workingDir, '.git');
  if (!existsSync(gitFile)) {
    response.isValid = false;
    response.error = 'NO_GIT_FILE: Missing .git file (not a valid worktree)';

    return {
      content: [
        {
          type: 'text',
          text: `Not a valid git worktree: ${workingDir}\n\nMissing .git file.`,
        },
      ],
    };
  }

  // Check 4: Verify .git file points to valid worktree metadata
  try {
    const gitContent = readFileSync(gitFile, 'utf-8').trim();
    if (!gitContent.startsWith('gitdir:')) {
      response.isValid = false;
      response.error = 'INVALID_GIT_FILE: .git file does not point to worktree';

      return {
        content: [
          {
            type: 'text',
            text: `Invalid .git file format: ${workingDir}\n\nExpected 'gitdir:' pointer.`,
          },
        ],
      };
    }
  } catch {
    response.isValid = false;
    response.error = 'GIT_FILE_READ_ERROR: Could not read .git file';

    return {
      content: [
        {
          type: 'text',
          text: `Could not read .git file: ${workingDir}`,
        },
      ],
    };
  }

  // Check 5: Get branch and stream info
  try {
    const git = simpleGit(workingDir);
    const branch = await git.revparse(['--abbrev-ref', 'HEAD']);
    const streamId = basename(workingDir);

    response.isValid = true;
    response.streamId = streamId;
    response.branch = branch.trim();

    return {
      content: [
        {
          type: 'text',
          text: formatSuccess(response),
        },
      ],
    };
  } catch (error) {
    // Git operations failed but location might still be valid worktree
    response.isValid = true;
    response.streamId = basename(workingDir);
    response.error = `Git operations failed: ${error instanceof Error ? error.message : String(error)}`;

    return {
      content: [
        {
          type: 'text',
          text: `Warning: In worktree but git operations failed.\n\nLocation: ${workingDir}\nStream: ${response.streamId}\nError: ${response.error}`,
        },
      ],
    };
  }
}

function formatSuccess(response: VerifyLocationResponse): string {
  return `
LOCATION VALID

Path: ${response.currentPath}
Stream: ${response.streamId}
Branch: ${response.branch}
Status: Ready for development

You are in a valid worktree. File modifications are allowed.
`.trim();
}

function formatError(workingDir: string): string {
  return `
WORKTREE VIOLATION

Current location: ${workingDir}
Status: BLOCKED - Cannot modify files in main directory

All development work MUST be done in worktrees.

TO FIX:
1. Use start_stream tool to create a new stream with worktree, OR
2. Create worktree manually:
   git worktree add ${config.WORKTREE_ROOT}/stream-XX-name -b stream-XX-name

3. Navigate to worktree:
   cd ${config.WORKTREE_ROOT}/stream-XX-name

4. Verify location:
   Call verify_location tool again

WHY THIS EXISTS:
- Prevents agent collisions during concurrent development
- Ensures clean merge workflow (conflicts resolved in worktrees)
- Protects main branch from accidental pollution

NO EXCEPTIONS.
`.trim();
}
