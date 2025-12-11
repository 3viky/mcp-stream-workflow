/**
 * prepare_merge - Merge main into worktree, detect conflicts
 *
 * Implements Steps B,C,D,E,F of the Stream Completion Protocol:
 * [B] Merge main into worktree
 * [C] Detect conflicts (agent resolves them)
 * [D] Commit merge (after agent resolves)
 * [E] Run validation (typecheck, build, lint)
 * [F] Push to origin
 *
 * IMPORTANT: This tool does NOT resolve conflicts itself.
 * If conflicts are detected, it returns them to the Claude Code agent,
 * which resolves them directly (because the agent IS Claude).
 */

import { join } from 'node:path';
import { simpleGit, type SimpleGit } from 'simple-git';

import { config } from '../config.js';
import type { MCPResponse } from '../types.js';
import { extractConflicts, formatConflictsForAgent } from '../conflict-resolver.js';
import { runValidation } from '../validators/index.js';

interface PrepareMergeArgs {
  streamId: string;
  validateBeforePush?: boolean;
  skipPush?: boolean;
}

export async function prepareMerge(args: PrepareMergeArgs): Promise<MCPResponse> {
  const { streamId, validateBeforePush = true, skipPush = false } = args;

  const worktreePath = join(config.WORKTREE_ROOT, streamId);
  const git: SimpleGit = simpleGit(worktreePath);

  try {
    // Step A: Verify work is committed
    const status = await git.status();
    if (!status.isClean()) {
      return {
        content: [
          {
            type: 'text',
            text: formatUncommittedError(streamId, status.files.map((f) => f.path)),
          },
        ],
      };
    }

    // Step B: Fetch and merge main into worktree
    console.error(`[prepare_merge] Fetching origin/main...`);
    await git.fetch('origin', 'main');

    console.error(`[prepare_merge] Merging origin/main into ${streamId}...`);
    try {
      await git.merge(['origin/main', '--no-edit']);
      console.error(`[prepare_merge] Clean merge - no conflicts`);
    } catch (mergeError) {
      // Merge failed - check for conflicts
      const conflictStatus = await git.status();
      const conflictedFiles = conflictStatus.conflicted;

      if (conflictedFiles.length === 0) {
        // Some other error
        throw mergeError;
      }

      // Step C: Extract conflicts for agent resolution
      console.error(`[prepare_merge] Conflicts detected: ${conflictedFiles.length} files`);
      const conflicts = await extractConflicts(worktreePath, conflictedFiles, streamId);
      const conflictReport = formatConflictsForAgent(conflicts, streamId);

      // Return conflicts to agent for resolution
      return {
        content: [
          {
            type: 'text',
            text: `MERGE PAUSED - CONFLICTS NEED RESOLUTION

${conflictReport}

AFTER RESOLVING:
1. Write resolved content to each conflicted file (use Edit tool)
2. Stage all resolved files: git add <file>
3. Call prepare_merge again to continue

The merge is paused in the worktree. Resolve conflicts and re-run this tool.`,
          },
        ],
      };
    }

    // If we get here, merge was clean or conflicts were already resolved
    // Check if there are still conflicts
    const postMergeStatus = await git.status();
    if (postMergeStatus.conflicted.length > 0) {
      return {
        content: [
          {
            type: 'text',
            text: `UNRESOLVED CONFLICTS REMAIN

Files still in conflict:
${postMergeStatus.conflicted.map((f) => `  - ${f}`).join('\n')}

Resolve these files and run prepare_merge again.`,
          },
        ],
      };
    }

    // Step D: Commit if needed
    if (!postMergeStatus.isClean()) {
      await git.add('.');
      await git.commit(`Merge main into ${streamId}`);
      console.error(`[prepare_merge] Merge committed`);
    }

    // Get commit hash
    const log = await git.log({ maxCount: 1 });
    const commitHash = log.latest?.hash || '';

    // Step E: Run validation
    let validationPassed = true;
    let validationResult = { typescript: true, build: true, lint: true, allPassed: true, errors: [] as string[] };

    if (validateBeforePush) {
      console.error(`[prepare_merge] Running validation...`);
      validationResult = await runValidation(worktreePath);
      validationPassed = validationResult.allPassed;

      if (!validationPassed) {
        return {
          content: [
            {
              type: 'text',
              text: formatValidationFailure(streamId, validationResult),
            },
          ],
        };
      }
    }

    // Step F: Push to origin
    if (!skipPush) {
      console.error(`[prepare_merge] Pushing to origin/${streamId}...`);
      await git.push('origin', streamId);
    }

    return {
      content: [
        {
          type: 'text',
          text: `PREPARE_MERGE COMPLETE

Stream: ${streamId}
Merge: Clean (no conflicts)
Commit: ${commitHash.slice(0, 8)}

VALIDATION:
  TypeScript: ${validationResult.typescript ? 'PASSED' : 'FAILED'}
  Build: ${validationResult.build ? 'PASSED' : 'FAILED'}
  Lint: ${validationResult.lint ? 'PASSED' : 'FAILED'}

Pushed to origin: ${skipPush ? 'No (skipped)' : 'Yes'}

READY FOR MERGE TO MAIN

Next step: Call complete_merge({ streamId: "${streamId}" })`,
        },
      ],
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      content: [
        {
          type: 'text',
          text: `prepare_merge failed: ${errorMessage}\n\nStream: ${streamId}\nWorktree: ${worktreePath}`,
        },
      ],
    };
  }
}

function formatUncommittedError(streamId: string, files: string[]): string {
  return `UNCOMMITTED CHANGES DETECTED

Stream: ${streamId}
Files with changes:
${files.slice(0, 10).map((f) => `  - ${f}`).join('\n')}
${files.length > 10 ? `  ... and ${files.length - 10} more` : ''}

TO FIX:
1. Commit your changes:
   git add .
   git commit -m "feat(${streamId}): Your changes"

2. Then run prepare_merge again

WHY: Merge cannot proceed with uncommitted changes.`;
}

function formatValidationFailure(
  streamId: string,
  result: { typescript: boolean; build: boolean; lint: boolean; errors: string[] }
): string {
  return `VALIDATION FAILED

Stream: ${streamId}

Results:
  TypeScript: ${result.typescript ? 'PASSED' : 'FAILED'}
  Build: ${result.build ? 'PASSED' : 'FAILED'}
  Lint: ${result.lint ? 'PASSED' : 'FAILED'}

Errors:
${result.errors.slice(0, 20).map((e) => `  ${e}`).join('\n')}
${result.errors.length > 20 ? `  ... and ${result.errors.length - 20} more` : ''}

TO FIX:
1. Fix validation errors in worktree
2. Commit fixes
3. Run prepare_merge again

The merge commit was created but NOT pushed.`;
}
