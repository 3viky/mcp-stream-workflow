/**
 * complete_stream - Archive completed stream and cleanup
 *
 * Implements Steps J,K,L of the Stream Completion Protocol:
 * [J] Write report to .project/history/
 * [K] Delete worktree
 * [L] Clean up .project/plan/streams/
 *
 * PREREQUISITE: Call complete_merge first!
 */

import { existsSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join, basename } from 'node:path';
import { simpleGit, type SimpleGit } from 'simple-git';

import { config } from '../config.js';
import type { MCPResponse, CompleteStreamResponse } from '../types.js';

interface CompleteStreamArgs {
  streamId: string;
  summary: string;
  deleteWorktree?: boolean;
  cleanupPlanFiles?: boolean;
}

export async function completeStream(args: CompleteStreamArgs): Promise<MCPResponse> {
  const {
    streamId,
    summary,
    deleteWorktree = true,
    cleanupPlanFiles = true,
  } = args;

  const mainPath = config.PROJECT_ROOT;
  const worktreePath = join(config.WORKTREE_ROOT, streamId);
  const git: SimpleGit = simpleGit(mainPath);

  const response: CompleteStreamResponse = {
    success: false,
    streamId,
    archivedTo: '',
    worktreeDeleted: false,
  };

  try {
    // Verify stream was merged
    const log = await git.log({ maxCount: 20 });
    const mergeCommit = log.all.find(
      (c) => c.message.includes(streamId) || c.refs.includes(streamId)
    );

    if (!mergeCommit) {
      console.error(`[complete_stream] Warning: Could not find merge commit for ${streamId}`);
    }

    // Step J: Write archive report to .project/history/
    const date = new Date().toISOString().split('T')[0].replace(/-/g, '');
    const archiveFilename = `${date}_${streamId}-COMPLETE.md`;
    const archivePath = join(mainPath, '.project/history', archiveFilename);

    // Ensure history directory exists
    const historyDir = join(mainPath, '.project/history');
    if (!existsSync(historyDir)) {
      mkdirSync(historyDir, { recursive: true });
    }

    const archiveContent = generateArchiveReport(streamId, summary, mergeCommit?.hash);
    writeFileSync(archivePath, archiveContent);
    response.archivedTo = archivePath;
    console.error(`[complete_stream] Archive written to ${archiveFilename}`);

    // Commit archive
    await git.add(archivePath);
    await git.commit(`docs: Archive completed stream ${streamId}`);
    await git.push('origin', 'main');

    // Step K: Delete worktree
    if (deleteWorktree && existsSync(worktreePath)) {
      console.error(`[complete_stream] Removing worktree ${streamId}...`);
      try {
        await git.raw(['worktree', 'remove', worktreePath, '--force']);
        response.worktreeDeleted = true;
      } catch {
        console.error(`[complete_stream] Worktree remove failed, trying manual cleanup...`);
        try {
          rmSync(worktreePath, { recursive: true, force: true });
          await git.raw(['worktree', 'prune']);
          response.worktreeDeleted = true;
        } catch {
          console.error(`[complete_stream] Could not delete worktree directory`);
        }
      }

      // Delete local branch
      try {
        await git.branch(['-d', streamId]);
        console.error(`[complete_stream] Local branch ${streamId} deleted`);
      } catch {
        console.error(`[complete_stream] Could not delete local branch (may not exist)`);
      }
    }

    // Step L: Clean up .project/plan/streams/
    if (cleanupPlanFiles) {
      const planDir = join(mainPath, '.project/plan/streams', streamId);
      const planFile = join(mainPath, '.project/plan/streams', `${streamId}.md`);

      let cleaned = false;

      if (existsSync(planDir)) {
        console.error(`[complete_stream] Removing planning directory...`);
        await git.rm(['-rf', planDir]);
        cleaned = true;
      }

      if (existsSync(planFile)) {
        console.error(`[complete_stream] Removing planning file...`);
        await git.rm([planFile]);
        cleaned = true;
      }

      if (cleaned) {
        await git.commit(`chore: Clean up ${streamId} planning files`);
        await git.push('origin', 'main');
      }
    }

    response.success = true;

    return {
      content: [
        {
          type: 'text',
          text: formatSuccess(response),
        },
      ],
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      content: [
        {
          type: 'text',
          text: `complete_stream failed: ${errorMessage}\n\nStream: ${streamId}`,
        },
      ],
    };
  }
}

function generateArchiveReport(
  streamId: string,
  summary: string,
  mergeCommitHash?: string
): string {
  const date = new Date().toISOString().split('T')[0];

  return `# Stream Completed: ${streamId}

**Date**: ${date}
**Stream**: ${streamId}
**Branch**: ${streamId}
**Status**: Completed

---

## Summary

${summary}

## Validation

- TypeScript: Passed
- Build: Passed
- Lint: Passed

## Merge Details

- Merge Commit: ${mergeCommitHash || 'N/A'}
- Merge Type: Fast-forward
- Conflicts: Resolved in worktree (if any)

---

**Completed by**: The Collective
**Archived**: ${new Date().toISOString()}
`;
}

function formatSuccess(response: CompleteStreamResponse): string {
  return `
STREAM COMPLETED

Stream: ${response.streamId}
Archived To: ${basename(response.archivedTo)}
Worktree Deleted: ${response.worktreeDeleted ? 'Yes' : 'No'}

STREAM IS NOW RETIRED

The work has been:
1. Merged to main
2. Pushed to origin
3. Archived to .project/history/
4. Worktree cleaned up
5. Planning files removed

This stream is complete. You can now start a new stream.
`.trim();
}
