/**
 * Conflict detection and context extraction
 *
 * This module detects conflicts and extracts context for the Claude Code agent.
 * The AGENT (which is Claude) resolves conflicts directly - no API calls needed.
 *
 * Workflow:
 * 1. MCP tool detects conflicts
 * 2. MCP tool extracts conflict context (ours, theirs, commit history)
 * 3. Returns context to Claude Code agent
 * 4. Agent resolves conflicts (it IS Claude)
 * 5. Agent writes resolved files directly
 */

import { readFileSync } from 'node:fs';
import { join, extname } from 'node:path';
import { simpleGit } from 'simple-git';

import type { ConflictType, GitCommit } from './types.js';

export interface ConflictInfo {
  file: string;
  conflictType: ConflictType;
  oursContent: string;
  theirsContent: string;
  conflictMarkers: string;
  mainCommits: GitCommit[];
  streamCommits: GitCommit[];
}

/**
 * Extract conflict information for the agent to resolve
 */
export async function extractConflicts(
  worktreePath: string,
  conflictedFiles: string[],
  _streamId: string
): Promise<ConflictInfo[]> {
  const results: ConflictInfo[] = [];
  const git = simpleGit(worktreePath);

  for (const file of conflictedFiles) {
    try {
      const filePath = join(worktreePath, file);
      const conflictContent = readFileSync(filePath, 'utf-8');

      // Extract ours and theirs from conflict markers
      const { ours, theirs } = parseConflictMarkers(conflictContent);

      // Get commit history for context
      const mainCommits = await getRecentCommits(git, 'origin/main', file, 5);
      const streamCommits = await getRecentCommits(git, 'HEAD', file, 5);

      // Detect conflict type
      const conflictType = detectConflictType(file);

      results.push({
        file,
        conflictType,
        oursContent: ours,
        theirsContent: theirs,
        conflictMarkers: conflictContent,
        mainCommits,
        streamCommits,
      });
    } catch (error) {
      console.error(`[conflict-resolver] Failed to extract: ${file} - ${error}`);
    }
  }

  return results;
}

function parseConflictMarkers(content: string): { ours: string; theirs: string } {
  const lines = content.split('\n');
  let ours = '';
  let theirs = '';
  let inOurs = false;
  let inTheirs = false;

  for (const line of lines) {
    if (line.startsWith('<<<<<<<')) {
      inOurs = true;
      continue;
    }
    if (line.startsWith('=======')) {
      inOurs = false;
      inTheirs = true;
      continue;
    }
    if (line.startsWith('>>>>>>>')) {
      inTheirs = false;
      continue;
    }

    if (inOurs) {
      ours += line + '\n';
    } else if (inTheirs) {
      theirs += line + '\n';
    }
  }

  return { ours: ours.trimEnd(), theirs: theirs.trimEnd() };
}

async function getRecentCommits(
  git: ReturnType<typeof simpleGit>,
  _ref: string,
  file: string,
  count: number
): Promise<GitCommit[]> {
  try {
    const log = await git.log({
      maxCount: count,
      file,
    });

    return log.all.map((commit) => ({
      hash: commit.hash.slice(0, 8),
      message: commit.message,
      author: commit.author_name,
      date: new Date(commit.date),
      files: [],
    }));
  } catch {
    return [];
  }
}

function detectConflictType(file: string): ConflictType {
  const ext = extname(file).toLowerCase();
  const filename = file.toLowerCase();

  if (filename.includes('migration')) return 'migration';
  if (filename.includes('schema') || filename.endsWith('.prisma')) return 'schema';
  if (['.ts', '.tsx', '.js', '.jsx', '.mts', '.mjs'].includes(ext)) return 'code';
  if (['.json', '.yaml', '.yml', '.toml', '.env'].includes(ext)) return 'config';
  if (['.md', '.mdx', '.txt', '.rst'].includes(ext)) return 'docs';
  if (['.png', '.jpg', '.gif', '.pdf', '.zip'].includes(ext)) return 'binary';

  return 'unknown';
}

/**
 * Format conflicts for agent consumption
 */
export function formatConflictsForAgent(conflicts: ConflictInfo[], streamId: string): string {
  if (conflicts.length === 0) {
    return 'No conflicts detected. Merge was clean.';
  }

  let output = `CONFLICTS DETECTED: ${conflicts.length} file(s)\n\n`;
  output += `Stream: ${streamId}\n`;
  output += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;

  for (const conflict of conflicts) {
    output += `FILE: ${conflict.file}\n`;
    output += `Type: ${conflict.conflictType}\n\n`;

    output += `MAIN VERSION (ours):\n`;
    output += '```\n' + conflict.oursContent + '\n```\n\n';

    output += `STREAM VERSION (theirs):\n`;
    output += '```\n' + conflict.theirsContent + '\n```\n\n';

    if (conflict.mainCommits.length > 0) {
      output += `Main commits:\n`;
      for (const c of conflict.mainCommits) {
        output += `  - ${c.hash} ${c.message}\n`;
      }
      output += '\n';
    }

    if (conflict.streamCommits.length > 0) {
      output += `Stream commits:\n`;
      for (const c of conflict.streamCommits) {
        output += `  - ${c.hash} ${c.message}\n`;
      }
      output += '\n';
    }

    output += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
  }

  output += `TO RESOLVE:\n`;
  output += `1. Analyze both versions and commit context\n`;
  output += `2. Write resolved content to each file\n`;
  output += `3. Stage files: git add <file>\n`;
  output += `4. The prepare_merge tool will commit once all conflicts are resolved\n`;

  return output;
}
