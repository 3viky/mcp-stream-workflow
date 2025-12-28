/**
 * start_stream - Initialize New Development Stream
 *
 * WORKTREE-FIRST ARCHITECTURE (v0.3.0+)
 * This tool runs in main directory. Stream metadata lives in worktree.
 * Only .stream-state.json is committed to main (shared ID registry).
 *
 * WORKFLOW:
 * 1. Validation - Verify clean main, on main branch, up-to-date with origin
 * 2. Generate Stream ID - Use state-manager for monotonic IDs, slugify title
 * 3. Update State - Register in .stream-state.json (auto-committed to main)
 * 4. Create Worktree - Create worktree with new branch from main
 * 5. Create Docset in Worktree - HANDOFF.md, README.md, STATUS.md, METADATA.json
 * 6. First Commit in Worktree - Commit docset files (stream's first commit)
 * 7. Install Hooks - Auto-install post-commit hooks for dashboard sync
 * 8. Register with Dashboard - Call API to register stream in database
 * 9. Return Response - Provide path and next steps
 *
 * KEY CHANGES FROM v0.2.0:
 * - Stream metadata in worktree only (was: committed to main before worktree)
 * - .stream-state.json auto-committed to main (shared ID source of truth)
 * - Stream docset is first commit in worktree (was: copied HANDOFF.md after worktree)
 * - Dashboard registration via API (was: git commit to STATUS_DASHBOARD.md)
 * - Hooks auto-installed (was: manual setup required)
 *
 * @module tools/start-stream
 */

import {
  existsSync,
  mkdirSync,
  writeFileSync,
  copyFileSync,
  chmodSync,
} from 'node:fs';
import { join, dirname } from 'node:path';
import { simpleGit, type SimpleGit } from 'simple-git';

import { config } from '../config.js';
import { getNextStreamId, registerStream, setActiveStream } from '../state-manager.js';
import { renderTemplate } from '../utils/template-renderer.js';
import type { StartStreamArgs, MCPResponse } from '../types.js';
import { categorizeFiles, generateUncommittedChangesError } from '../utils/file-categorizer.js';

// ============================================================================
// Response Types
// ============================================================================

interface StartStreamResponse {
  success: boolean;
  streamId: string;
  streamNumber: string;
  worktreePath: string;
  branchName: string;
  worktreeCommit: {
    hash: string;
    message: string;
    filesCreated: string[];
  };
  hooksInstalled: boolean;
  dashboardRegistered: boolean;
  nextSteps: string[];
  handoffPath: string;
}

// ============================================================================
// Phase 1: Validation
// ============================================================================

/**
 * Validate environment is ready for stream creation
 *
 * Checks:
 * - Running in main directory (PROJECT_ROOT)
 * - On main branch
 * - Working tree is clean (no uncommitted changes)
 * - Main is up-to-date with origin/main
 *
 * @throws Error with clear message if validation fails
 */
async function validateEnvironment(): Promise<void> {
  // 1. Verify in main directory
  const cwd = process.cwd();
  if (cwd !== config.PROJECT_ROOT) {
    throw new Error(
      `start_stream must run from main directory.\n\n` +
        `Current:  ${cwd}\n` +
        `Expected: ${config.PROJECT_ROOT}\n\n` +
        `Fix: cd ${config.PROJECT_ROOT}`
    );
  }

  const git: SimpleGit = simpleGit(config.PROJECT_ROOT);

  // 2. Verify on main branch
  const branch = await git.revparse(['--abbrev-ref', 'HEAD']);
  const currentBranch = branch.trim();
  if (currentBranch !== 'main') {
    throw new Error(
      `start_stream must run from main branch.\n\n` +
        `Current branch: ${currentBranch}\n\n` +
        `Fix: git checkout main`
    );
  }

  // 3. Verify main is clean
  const status = await git.status();
  if (!status.isClean()) {
    // Extract file paths and categorize
    const filePaths = status.files.map((f) => f.path);
    const category = categorizeFiles(filePaths);

    // Generate smart error message based on categorization
    const errorMessage = generateUncommittedChangesError(category);
    throw new Error(errorMessage);
  }

  // 4. Verify main is up-to-date with origin
  try {
    await git.fetch('origin', 'main');
    const behind = await git.raw(['rev-list', 'HEAD..origin/main', '--count']);
    const behindCount = parseInt(behind.trim(), 10);

    if (behindCount > 0) {
      throw new Error(
        `Main branch is ${behindCount} commit(s) behind origin/main.\n\n` +
          `Fix: git pull origin main`
      );
    }
  } catch (error) {
    // Fetch might fail if remote doesn't exist (local-only repo)
    // This is acceptable for development/testing
    if (error instanceof Error && error.message.includes('behind origin/main')) {
      throw error; // Re-throw our error
    }
    // Otherwise, log warning but continue
    console.error('[start-stream] Warning: Could not fetch origin/main:', error);
  }
}

// ============================================================================
// Phase 2: Generate Stream ID
// ============================================================================

/**
 * Generate unique stream ID from title
 *
 * Format: stream-{number}-{slug}
 * - number: Zero-padded 3-digit sequential ID (001, 002, ...)
 * - slug: Sanitized title (lowercase, alphanumeric + hyphens, max 50 chars)
 *
 * @param title User-provided stream title
 * @returns Stream ID and number
 * @throws Error if worktree already exists at target path
 */
async function generateStreamId(
  title: string,
  subStreamOf?: string
): Promise<{ streamId: string; streamNumber: string }> {
  // Get next version-aware stream ID from state manager
  const { streamId, streamNumber } = await getNextStreamId(title, subStreamOf);

  // Verify worktree doesn't already exist
  const worktreePath = join(config.WORKTREE_ROOT, streamId);
  if (existsSync(worktreePath)) {
    throw new Error(
      `Worktree already exists: ${worktreePath}\n\n` +
        `This stream ID is already in use.\n` +
        `If this is an error, remove the worktree:\n` +
        `  git worktree remove ${worktreePath}`
    );
  }

  return { streamId, streamNumber };
}

// ============================================================================
// Phase 3: Create Worktree
// ============================================================================

/**
 * Create git worktree for stream development
 *
 * Creates worktree at {WORKTREE_ROOT}/{streamId} with new branch {streamId}.
 * This happens BEFORE creating any metadata files.
 *
 * @param streamId Stream identifier
 * @returns Absolute path to worktree
 */
async function createWorktree(streamId: string): Promise<string> {
  const worktreePath = join(config.WORKTREE_ROOT, streamId);
  const git: SimpleGit = simpleGit(config.PROJECT_ROOT);

  // Ensure worktree root directory exists
  const worktreeRoot = config.WORKTREE_ROOT;
  if (!existsSync(worktreeRoot)) {
    mkdirSync(worktreeRoot, { recursive: true });
  }

  // Create worktree with new branch
  // Command: git worktree add <path> -b <branch>
  await git.raw(['worktree', 'add', worktreePath, '-b', streamId]);

  return worktreePath;
}

// ============================================================================
// Phase 4: Create Docset in Worktree
// ============================================================================

/**
 * Create stream docset files IN the worktree
 *
 * Files created in worktree root:
 * - HANDOFF.md - Agent instructions for what to work on
 * - README.md - Stream overview and timeline
 * - STATUS.md - Current progress and phase tracking
 * - METADATA.json - Machine-readable stream metadata
 *
 * These files will be the FIRST commit in the worktree branch.
 *
 * @param worktreePath Absolute path to worktree
 * @param args User-provided stream parameters
 * @param streamInfo Generated stream ID and number
 * @returns Array of created file paths (relative to worktree)
 */
async function createDocsetInWorktree(
  worktreePath: string,
  args: StartStreamArgs,
  streamInfo: { streamId: string; streamNumber: string }
): Promise<string[]> {
  const { streamId, streamNumber } = streamInfo;
  const filesCreated: string[] = [];
  const timestamp = new Date().toISOString();

  // 1. HANDOFF.md - Agent instructions
  const handoffPath = join(worktreePath, 'HANDOFF.md');
  const handoffContent = renderTemplate('HANDOFF.template.md', {
    STREAM_TITLE: args.title,
    STREAM_ID: streamId,
    CATEGORY: args.category,
    PRIORITY: args.priority,
    CREATED_AT: timestamp,
    HANDOFF_CONTENT: args.handoff,
    WORKTREE_PATH: worktreePath,
    BRANCH_NAME: streamId,
    PROJECT_ROOT: config.PROJECT_ROOT,
  });
  writeFileSync(handoffPath, handoffContent, 'utf-8');
  filesCreated.push('HANDOFF.md');

  // 2. README.md - Stream overview
  const readmePath = join(worktreePath, 'README.md');
  const phases = (args.estimatedPhases || []).map((phase) => ({ PHASE_NAME: phase }));
  const readmeContent = renderTemplate('README.template.md', {
    STREAM_TITLE: args.title,
    STREAM_ID: streamId,
    STATUS: 'initializing',
    CATEGORY: args.category,
    PRIORITY: args.priority,
    DESCRIPTION: args.description || 'No description provided',
    CREATED_AT: timestamp,
    UPDATED_AT: timestamp,
    COMPLETED_AT: '',
    WORKTREE_PATH: worktreePath,
    BRANCH_NAME: streamId,
    PHASES: phases,
  });
  writeFileSync(readmePath, readmeContent, 'utf-8');
  filesCreated.push('README.md');

  // 3. STATUS.md - Progress tracking
  const statusPath = join(worktreePath, 'STATUS.md');
  const statusContent = renderTemplate('STATUS.template.md', {
    STREAM_ID: streamId,
    UPDATED_AT: timestamp,
    CURRENT_PHASE: 'Not started',
    PROGRESS: 0,
    PHASES: phases,
    NOTES: '',
  });
  writeFileSync(statusPath, statusContent, 'utf-8');
  filesCreated.push('STATUS.md');

  // 4. METADATA.json - Machine-readable metadata
  const metadataPath = join(worktreePath, 'METADATA.json');
  const metadata = {
    streamId,
    streamNumber,
    title: args.title,
    category: args.category,
    priority: args.priority,
    status: 'initializing',
    createdAt: timestamp,
    updatedAt: timestamp,
    completedAt: null,
    branch: streamId,
    worktreePath,
    phases: args.estimatedPhases || [],
    currentPhase: null,
    progress: 0,
    tags: args.tags || [],
    blockedReason: null,
  };
  writeFileSync(metadataPath, JSON.stringify(metadata, null, 2), 'utf-8');
  filesCreated.push('METADATA.json');

  return filesCreated;
}

// ============================================================================
// Phase 5: First Commit in Worktree
// ============================================================================

/**
 * Create first commit in worktree with stream docset files
 *
 * This commit contains only the stream metadata files (HANDOFF.md, README.md,
 * STATUS.md, METADATA.json). It serves as the stream's initialization commit
 * and establishes the worktree's independent history.
 *
 * @param worktreePath Absolute path to worktree
 * @param streamId Stream identifier
 * @param streamInfo Stream ID and number
 * @param filesCreated Array of file paths to commit
 * @returns Commit hash
 */
async function commitDocsetInWorktree(
  worktreePath: string,
  streamId: string,
  streamInfo: { streamId: string; streamNumber: string },
  filesCreated: string[],
  args: StartStreamArgs
): Promise<string> {
  const git: SimpleGit = simpleGit(worktreePath);

  // Stage all docset files
  await git.add(filesCreated);

  // Create commit with standardized message
  const commitMessage = `chore(${streamId}): initialize stream docset - ${args.title}

Stream initialization by MCP Stream Workflow Manager

Category: ${args.category}
Priority: ${args.priority}
Stream Number: ${streamInfo.streamNumber}
Worktree: ${worktreePath}

This is the FIRST commit in the ${streamId} worktree branch.
It contains the stream docset that guides development work.

Docset files:
${filesCreated.map((f) => '- ' + f).join('\n')}

All development work will follow this initialization commit.
`;

  await git.commit(commitMessage);

  // Get commit hash
  const log = await git.log({ maxCount: 1 });
  return log.latest?.hash || '';
}

// ============================================================================
// Phase 6: Install Hooks
// ============================================================================

/**
 * Install post-commit hooks in worktree for automatic dashboard sync
 *
 * Copies hooks from mcp-stream-workflow/hooks/ to worktree/.git/hooks/
 * and makes them executable. Also configures git config for hook operation.
 *
 * @param worktreePath Absolute path to worktree
 * @returns true if hooks installed successfully
 */
async function installHooks(worktreePath: string): Promise<boolean> {
  try {
    // Hooks are in the mcp-stream-workflow package directory
    const mcpPackageDir = dirname(dirname(dirname(__filename))); // src/tools/start-stream.ts -> src -> mcp-stream-workflow
    const hooksSourceDir = join(mcpPackageDir, 'hooks');
    const hooksDestDir = join(worktreePath, '.git', 'hooks');

    // Ensure hooks destination exists
    if (!existsSync(hooksDestDir)) {
      mkdirSync(hooksDestDir, { recursive: true });
    }

    // Copy post-commit hook
    const postCommitSource = join(hooksSourceDir, 'post-commit');
    const postCommitDest = join(hooksDestDir, 'post-commit');

    if (!existsSync(postCommitSource)) {
      console.error(`[start-stream] Warning: post-commit hook not found at ${postCommitSource}`);
      return false;
    }

    copyFileSync(postCommitSource, postCommitDest);
    chmodSync(postCommitDest, 0o755); // Make executable

    // Copy sync-dashboard.sh
    const syncDashboardSource = join(hooksSourceDir, 'sync-dashboard.sh');
    const syncDashboardDest = join(hooksDestDir, 'sync-dashboard.sh');

    if (existsSync(syncDashboardSource)) {
      copyFileSync(syncDashboardSource, syncDashboardDest);
      chmodSync(syncDashboardDest, 0o755); // Make executable
    }

    // Configure git for hook operation
    const git: SimpleGit = simpleGit(worktreePath);
    await git.addConfig('stream-workflow.project-root', config.PROJECT_ROOT);
    await git.addConfig('stream-workflow.sync-threshold', '3'); // Sync every 3 commits
    await git.addConfig('stream-workflow.api-port', process.env.API_PORT || '3001');

    console.error(`[start-stream] ✅ Hooks installed in worktree .git/hooks/`);
    return true;
  } catch (error) {
    console.error(`[start-stream] ⚠️  Failed to install hooks:`, error);
    return false;
  }
}

// ============================================================================
// Phase 7: Register with Dashboard
// ============================================================================

/**
 * Register new stream with dashboard via API
 *
 * Calls POST /api/streams (or uses add_stream MCP tool) to register the
 * stream in the dashboard database for real-time tracking.
 *
 * @param args Stream parameters
 * @param streamInfo Stream ID and number
 * @param worktreePath Absolute path to worktree
 * @returns true if registered successfully
 */
async function registerStreamWithDashboard(
  args: StartStreamArgs,
  streamInfo: { streamId: string; streamNumber: string },
  worktreePath: string
): Promise<boolean> {
  try {
    const apiPort = process.env.API_PORT || '3001';
    const apiUrl = `http://localhost:${apiPort}/api/streams`;

    const payload = {
      streamId: streamInfo.streamId,
      streamNumber: streamInfo.streamNumber,
      title: args.title,
      category: args.category,
      priority: args.priority,
      worktreePath,
      branch: streamInfo.streamId,
      estimatedPhases: args.estimatedPhases || [],
    };

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (response.ok) {
      console.error(`[start-stream] ✅ Stream registered with dashboard (HTTP ${response.status})`);
      return true;
    } else {
      const errorText = await response.text();
      console.error(`[start-stream] ⚠️  Dashboard registration failed (HTTP ${response.status}): ${errorText}`);
      return false;
    }
  } catch (error) {
    console.error(`[start-stream] ⚠️  Dashboard registration failed:`, error);
    console.error(`[start-stream] Dashboard may not be running. Stream will work but won't appear in dashboard.`);
    return false;
  }
}

// ============================================================================
// Phase 8: Update State
// ============================================================================

/**
 * Update central state with new stream
 *
 * Updates:
 * - STREAM_STATE.json - Add to stream registry
 *
 * Stream status tracking is now handled by the separate
 * @mcp/mcp-stream-workflow-status service.
 *
 * @param args User-provided stream parameters
 * @param streamInfo Generated stream ID and number
 */
async function updateState(
  args: StartStreamArgs,
  streamInfo: { streamId: string; streamNumber: string }
): Promise<void> {
  const { streamId, streamNumber } = streamInfo;
  const timestamp = new Date().toISOString();
  const worktreePath = join(config.WORKTREE_ROOT, streamId);

  // Update STREAM_STATE.json
  await registerStream({
    streamId,
    streamNumber,
    title: args.title,
    category: args.category,
    priority: args.priority,
    status: 'initializing',
    createdAt: timestamp,
    worktreePath,
    branch: streamId,
  });
}

// ============================================================================
// Phase 9: Format Response
// ============================================================================

/**
 * Format successful response with all stream information
 *
 * @param response Stream creation details
 * @returns Formatted response string
 */
function formatSuccessResponse(response: StartStreamResponse): string {
  const { streamId, streamNumber, worktreePath, branchName, worktreeCommit, hooksInstalled, dashboardRegistered, handoffPath } =
    response;

  const hookStatus = hooksInstalled ? '✅ Installed' : '⚠️  Not installed';
  const dashboardStatus = dashboardRegistered ? '✅ Registered' : '⚠️  Not registered';

  return `✅ Stream initialized successfully!

STREAM DETAILS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Stream ID:      ${streamId}
Stream Number:  ${streamNumber}
Branch:         ${branchName}
Worktree Path:  ${worktreePath}

WORKTREE INITIALIZATION
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
First Commit:   ${worktreeCommit.hash.substring(0, 8)} - ${worktreeCommit.message}
Docset Files:
${worktreeCommit.filesCreated.map((f) => `  - ${f}`).join('\n')}

AUTOMATION STATUS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Post-commit hooks:  ${hookStatus}
Dashboard tracking: ${dashboardStatus}

KEY CHANGES (v0.3.0+)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✅ NO commits to main (stream docset lives in worktree)
✅ Docset is FIRST commit in worktree branch
✅ Hooks auto-installed for dashboard sync via API
✅ Dashboard updates via HTTP API (no git commits)

NEXT STEPS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${response.nextSteps.map((step, i) => `${i + 1}. ${step}`).join('\n')}

HANDOFF LOCATION
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${handoffPath}

The stream is ready for development. Navigate to the worktree and begin work.
`;
}

// ============================================================================
// Main Tool Handler
// ============================================================================

/**
 * start_stream - Initialize new development stream
 *
 * RUNS IN MAIN but makes ZERO commits to main (v0.3.0+)
 *
 * This tool orchestrates the complete worktree-first stream initialization:
 * 1. Validates environment (clean main, up-to-date)
 * 2. Generates unique stream ID
 * 3. Updates state registry (local file, not committed)
 * 4. Creates worktree with new branch
 * 5. Creates docset files IN worktree
 * 6. Makes FIRST commit in worktree with docset
 * 7. Installs post-commit hooks for dashboard sync
 * 8. Registers stream with dashboard via API
 * 9. Returns path and next steps
 *
 * @param args Stream parameters (title, category, priority, handoff, etc.)
 * @returns MCP response with stream details and next steps
 *
 * @example
 * ```typescript
 * const result = await startStream({
 *   title: 'Add user authentication',
 *   category: 'backend',
 *   priority: 'high',
 *   handoff: 'Implement JWT-based authentication with refresh tokens...',
 *   estimatedPhases: ['Planning', 'Implementation', 'Testing', 'Documentation']
 * });
 * ```
 */
export async function startStream(args: StartStreamArgs): Promise<MCPResponse> {
  try {
    // Phase 1: Validation
    await validateEnvironment();

    // Phase 2: Generate stream ID (version-aware)
    const streamInfo = await generateStreamId(args.title, args.subStreamOf);
    const { streamId, streamNumber } = streamInfo;

    // Phase 3: Update state (local registry, not committed to git)
    await updateState(args, streamInfo);

    // Phase 4: Create worktree
    const worktreePath = await createWorktree(streamId);

    // Phase 5: Create docset files in worktree
    const filesCreated = await createDocsetInWorktree(worktreePath, args, streamInfo);

    // Phase 6: First commit in worktree (docset files)
    const commitHash = await commitDocsetInWorktree(
      worktreePath,
      streamId,
      streamInfo,
      filesCreated,
      args
    );

    // Phase 7: Install post-commit hooks
    const hooksInstalled = await installHooks(worktreePath);

    // Phase 8: Register with dashboard API
    const dashboardRegistered = await registerStreamWithDashboard(
      args,
      streamInfo,
      worktreePath
    );

    // Phase 9: Set active stream context (for post-compaction recovery)
    await setActiveStream({
      streamId,
      worktreePath,
      lastAccessedAt: new Date().toISOString(),
    });

    // Phase 10: Format response
    const commitMessage = `chore(${streamId}): initialize stream docset - ${args.title}`;
    const response: StartStreamResponse = {
      success: true,
      streamId,
      streamNumber,
      worktreePath,
      branchName: streamId,
      worktreeCommit: {
        hash: commitHash,
        message: commitMessage,
        filesCreated,
      },
      hooksInstalled,
      dashboardRegistered,
      nextSteps: [
        `Navigate to worktree: cd ${worktreePath}`,
        `Review handoff: cat HANDOFF.md`,
        `Begin development work`,
        `When ready to merge: call prepare_merge`,
      ],
      handoffPath: join(worktreePath, 'HANDOFF.md'),
    };

    return {
      content: [
        {
          type: 'text',
          text: formatSuccessResponse(response),
        },
      ],
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    return {
      content: [
        {
          type: 'text',
          text: `❌ start_stream failed\n\n${errorMessage}`,
        },
      ],
    };
  }
}
