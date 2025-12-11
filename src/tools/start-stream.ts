/**
 * start_stream - Initialize New Development Stream
 *
 * This is the ONLY tool that legitimately runs in main directory and modifies main.
 * All other tools MUST run in worktrees.
 *
 * WORKFLOW:
 * 1. Validation - Verify clean main, on main branch, up-to-date with origin
 * 2. Generate Stream ID - Use state-manager for monotonic IDs, slugify title
 * 3. Create Metadata Files - HANDOFF.md, README.md, STATUS.md, METADATA.json
 * 4. Update Dashboard & State - Add to STATUS_DASHBOARD.md and STREAM_STATE.json
 * 5. Git Commit - Commit metadata to main with standardized message
 * 6. Create Worktree - Create worktree with new branch
 * 7. Return Response - Provide path and next steps
 *
 * Implementation of Phase 4 from IMPLEMENTATION_PLAN.md
 *
 * @module tools/start-stream
 */

import {
  existsSync,
  mkdirSync,
  writeFileSync,
  copyFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { simpleGit, type SimpleGit } from 'simple-git';

import { config } from '../config.js';
import { getNextStreamId, registerStream } from '../state-manager.js';
import { addStream } from '../dashboard-manager.js';
import { renderTemplate } from '../utils/template-renderer.js';
import type { StartStreamArgs, MCPResponse } from '../types.js';

// ============================================================================
// Response Types
// ============================================================================

interface StartStreamResponse {
  success: boolean;
  streamId: string;
  streamNumber: number;
  worktreePath: string;
  branchName: string;
  metadata: {
    planDir: string;
    filesCreated: string[];
    commitHash: string;
  };
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const changes = status.files.map((f) => `  - ${f.path} (${(f as any).working_dir})`).join('\n');
    throw new Error(
      `Cannot start stream with uncommitted changes in main.\n\n` +
        `Uncommitted changes:\n${changes}\n\n` +
        `Fix: Commit or stash changes before starting stream`
    );
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
  title: string
): Promise<{ streamId: string; streamNumber: number }> {
  // Get next stream number from state manager
  const streamNumber = await getNextStreamId();

  // Slugify title
  // - Convert to lowercase
  // - Replace non-alphanumeric with hyphens
  // - Remove leading/trailing hyphens
  // - Limit to 50 characters
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .substring(0, 50);

  // Format: stream-042-add-authentication
  const streamId = `stream-${streamNumber.toString().padStart(3, '0')}-${slug}`;

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
// Phase 3: Create Metadata Files
// ============================================================================

/**
 * Create all stream metadata files in .project/plan/streams/{streamId}/
 *
 * Files created:
 * - HANDOFF.md - Agent instructions for what to work on
 * - README.md - Stream overview and timeline
 * - STATUS.md - Current progress and phase tracking
 * - METADATA.json - Machine-readable stream metadata
 *
 * @param args User-provided stream parameters
 * @param streamInfo Generated stream ID and number
 * @returns Array of created file paths (absolute)
 */
async function createMetadataFiles(
  args: StartStreamArgs,
  streamInfo: { streamId: string; streamNumber: number }
): Promise<string[]> {
  const { streamId, streamNumber } = streamInfo;
  const streamDir = join(config.PROJECT_ROOT, '.project/plan/streams', streamId);

  // Create stream directory
  mkdirSync(streamDir, { recursive: true });

  const filesCreated: string[] = [];
  const timestamp = new Date().toISOString();
  const worktreePath = join(config.WORKTREE_ROOT, streamId);

  // 1. HANDOFF.md - Agent instructions
  const handoffPath = join(streamDir, 'HANDOFF.md');
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
  filesCreated.push(handoffPath);

  // 2. README.md - Stream overview
  const readmePath = join(streamDir, 'README.md');
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
  filesCreated.push(readmePath);

  // 3. STATUS.md - Progress tracking
  const statusPath = join(streamDir, 'STATUS.md');
  const statusContent = renderTemplate('STATUS.template.md', {
    STREAM_ID: streamId,
    UPDATED_AT: timestamp,
    CURRENT_PHASE: 'Not started',
    PROGRESS: 0,
    PHASES: phases,
    NOTES: '',
  });
  writeFileSync(statusPath, statusContent, 'utf-8');
  filesCreated.push(statusPath);

  // 4. METADATA.json - Machine-readable metadata
  const metadataPath = join(streamDir, 'METADATA.json');
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
  filesCreated.push(metadataPath);

  return filesCreated;
}

// ============================================================================
// Phase 4: Update Dashboard and State
// ============================================================================

/**
 * Update central state and dashboard with new stream
 *
 * Updates:
 * - STREAM_STATE.json - Add to stream registry
 * - STREAM_STATUS_DASHBOARD.md - Add to active streams section
 *
 * Both operations are atomic and locked via respective managers.
 *
 * @param args User-provided stream parameters
 * @param streamInfo Generated stream ID and number
 */
async function updateDashboardAndState(
  args: StartStreamArgs,
  streamInfo: { streamId: string; streamNumber: number }
): Promise<void> {
  const { streamId, streamNumber } = streamInfo;
  const timestamp = new Date().toISOString();
  const worktreePath = join(config.WORKTREE_ROOT, streamId);

  // 1. Update STREAM_STATE.json
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

  // 2. Update STATUS_DASHBOARD.md
  // Convert to dashboard format (uses Stream interface)
  await addStream({
    id: streamId,
    number: streamNumber,
    title: args.title,
    category: args.category,
    priority: args.priority,
    status: 'active', // Dashboard shows as active immediately
    worktreePath,
    branch: streamId,
    createdAt: new Date(timestamp),
    updatedAt: new Date(timestamp),
    phases: (args.estimatedPhases || []).map((name) => ({
      name,
      status: 'pending',
    })),
    currentPhase: null,
    progress: 0,
  });
}

// ============================================================================
// Phase 5: Git Commit
// ============================================================================

/**
 * Commit stream metadata to main branch
 *
 * Commit message format:
 * ```
 * 🚀 Initialize {streamId}: {title}
 *
 * Stream initialization by MCP Stream Workflow Manager
 *
 * Category: {category}
 * Priority: {priority}
 * Branch: {streamId}
 * Worktree: {worktreePath}
 *
 * This commit creates stream metadata in main before worktree creation.
 * This is the ONLY operation that legitimately modifies main directly.
 * All development work will occur in the worktree.
 *
 * Metadata files:
 * - .project/plan/streams/{streamId}/HANDOFF.md
 * - .project/plan/streams/{streamId}/README.md
 * - .project/plan/streams/{streamId}/STATUS.md
 * - .project/plan/streams/{streamId}/METADATA.json
 * ```
 *
 * @param args User-provided stream parameters
 * @param streamInfo Generated stream ID and number
 * @param filesCreated Array of created file paths
 * @returns Commit hash
 */
async function commitMetadata(
  args: StartStreamArgs,
  streamInfo: { streamId: string; streamNumber: number },
  filesCreated: string[]
): Promise<string> {
  const { streamId } = streamInfo;
  const git: SimpleGit = simpleGit(config.PROJECT_ROOT);
  const worktreePath = join(config.WORKTREE_ROOT, streamId);

  // Stage all metadata files
  await git.add(`.project/plan/streams/${streamId}`);
  await git.add('.project/STREAM_STATUS_DASHBOARD.md');
  await git.add('.project/.stream-state.json');

  // Create commit with standardized message
  const fileList = filesCreated
    .map((f) => '- ' + f.replace(config.PROJECT_ROOT, '.'))
    .join('\n');

  const commitMessage = `🚀 Initialize ${streamId}: ${args.title}

Stream initialization by MCP Stream Workflow Manager

Category: ${args.category}
Priority: ${args.priority}
Branch: ${streamId}
Worktree: ${worktreePath}

This commit creates stream metadata in main before worktree creation.
This is the ONLY operation that legitimately modifies main directly.
All development work will occur in the worktree.

Metadata files:
${fileList}
`;

  await git.commit(commitMessage);

  // Push to origin (if remote exists)
  try {
    await git.push('origin', 'main');
  } catch (error) {
    // Push might fail if no remote exists (local-only repo)
    console.error('[start-stream] Warning: Could not push to origin:', error);
  }

  // Get commit hash
  const log = await git.log({ maxCount: 1 });
  return log.latest?.hash || '';
}

// ============================================================================
// Phase 6: Create Worktree
// ============================================================================

/**
 * Create git worktree for stream development
 *
 * Creates worktree at {WORKTREE_ROOT}/{streamId} with new branch {streamId}.
 * Copies HANDOFF.md to worktree root for easy agent access.
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

  // Copy HANDOFF.md to worktree root for easy access
  const handoffSource = join(
    config.PROJECT_ROOT,
    '.project/plan/streams',
    streamId,
    'HANDOFF.md'
  );
  const handoffDest = join(worktreePath, 'HANDOFF.md');
  copyFileSync(handoffSource, handoffDest);

  return worktreePath;
}

// ============================================================================
// Phase 7: Format Response
// ============================================================================

/**
 * Format successful response with all stream information
 *
 * @param response Stream creation details
 * @returns Formatted response string
 */
function formatSuccessResponse(response: StartStreamResponse): string {
  const { streamId, streamNumber, worktreePath, branchName, metadata, handoffPath } =
    response;

  return `✅ Stream initialized successfully!

STREAM DETAILS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Stream ID:      ${streamId}
Stream Number:  ${streamNumber}
Branch:         ${branchName}
Worktree Path:  ${worktreePath}

METADATA CREATED
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Plan Directory: ${metadata.planDir}
Files Created:
${metadata.filesCreated.map((f) => `  - ${f}`).join('\n')}

Committed to main: ${metadata.commitHash.substring(0, 8)}

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
 * RUNS IN MAIN (only legitimate exception to worktree-only rule)
 *
 * This tool orchestrates the complete stream initialization workflow:
 * 1. Validates environment (clean main, up-to-date)
 * 2. Generates unique stream ID
 * 3. Creates metadata files in main
 * 4. Updates dashboard and state
 * 5. Commits metadata to main
 * 6. Creates worktree for development
 * 7. Returns path and next steps
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

    // Phase 2: Generate stream ID
    const streamInfo = await generateStreamId(args.title);
    const { streamId, streamNumber } = streamInfo;

    // Phase 3: Create metadata files
    const filesCreated = await createMetadataFiles(args, streamInfo);

    // Phase 4: Update dashboard and state
    await updateDashboardAndState(args, streamInfo);

    // Phase 5: Commit metadata to main
    const commitHash = await commitMetadata(args, streamInfo, filesCreated);

    // Phase 6: Create worktree
    const worktreePath = await createWorktree(streamId);

    // Phase 7: Format response
    const response: StartStreamResponse = {
      success: true,
      streamId,
      streamNumber,
      worktreePath,
      branchName: streamId,
      metadata: {
        planDir: `.project/plan/streams/${streamId}`,
        filesCreated: filesCreated.map((f) => f.replace(config.PROJECT_ROOT, '.')),
        commitHash,
      },
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
