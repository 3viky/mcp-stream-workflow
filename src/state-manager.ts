/**
 * State Manager - Atomic STREAM_STATE.json Management
 *
 * Provides thread-safe operations for stream state persistence:
 * - Stream ID generation (monotonic counter)
 * - Stream registry (metadata storage)
 * - Atomic file operations with directory-based locking
 * - Stale lock detection and recovery
 *
 * LOCKING STRATEGY:
 * Uses atomic directory creation (mkdir with recursive: false) for locking.
 * Same proven pattern as complete-merge.ts.
 *
 * STATE FILE LOCATION:
 * PROJECT_ROOT/.project/.stream-state.json
 */

import {
  existsSync,
  mkdirSync,
  rmdirSync,
  readFileSync,
  writeFileSync,
  renameSync,
} from 'node:fs';
import { join, dirname } from 'node:path';

import { config } from './config.js';
import type { LockInfo, ActiveStreamContext, ActiveStreamsMap } from './types.js';
import { getProjectMajorVersion, formatStreamNumber } from './utils/version.js';

// ============================================================================
// Interfaces
// ============================================================================

/**
 * StreamState: Root state object persisted in STREAM_STATE.json
 *
 * Version-aware format (v0.2.0+):
 *   - version: Current project major version
 *   - versionCounters: Per-version stream counters
 *   - streams: Stream registry
 *
 * Legacy format (v0.1.0):
 *   - nextStreamId: Simple incrementing counter
 *   - streams: Stream registry
 *
 * Migration happens automatically on first access after upgrade.
 */
export interface StreamState {
  // Version-aware fields (v0.2.0+)
  version?: string;  // Current project major version (e.g., "15")
  versionCounters?: Record<string, number>;  // Per-version counters

  // Legacy field (v0.1.0) - deprecated but maintained for migration
  nextStreamId?: number;

  // Common fields
  streams: Record<string, StreamMetadata>;
  lastSync: string; // ISO timestamp

  // Active streams context (v0.3.0+) - survives context compaction
  // Multiple streams can be active simultaneously in different worktrees
  activeStreams?: ActiveStreamsMap;
}

/**
 * StreamMetadata: Minimal stream metadata stored in central state
 * Full metadata lives in .project/plan/streams/{streamId}/METADATA.json
 */
export interface StreamMetadata {
  streamId: string;
  streamNumber: number | string;  // number (legacy) or string (version-aware: "1500", "1500a")
  title: string;
  category: StreamCategory;
  priority: StreamPriority;
  status: StreamStatus;
  createdAt: string; // ISO timestamp
  updatedAt?: string; // ISO timestamp
  worktreePath: string;
  branch: string;
  parentStreamId?: string;  // For sub-streams (e.g., "stream-1500-auth")
}

export type StreamCategory =
  | 'backend'
  | 'frontend'
  | 'infrastructure'
  | 'testing'
  | 'documentation'
  | 'refactoring';

export type StreamPriority = 'critical' | 'high' | 'medium' | 'low';

export type StreamStatus =
  | 'initializing'
  | 'active'
  | 'blocked'
  | 'ready-for-merge'
  | 'completed'
  | 'paused'
  | 'archived';

// ============================================================================
// State File Operations
// ============================================================================

/**
 * Load current state from STREAM_STATE.json
 * Returns initial state if file doesn't exist
 * Throws if file is corrupt beyond recovery
 */
export async function loadState(): Promise<StreamState> {
  const statePath = getStatePath();

  if (!existsSync(statePath)) {
    // No state file = fresh start
    return createInitialState();
  }

  try {
    const content = readFileSync(statePath, 'utf-8');
    const state = JSON.parse(content) as StreamState;

    // Validate structure
    if (!isValidState(state)) {
      throw new Error('State file has invalid structure');
    }

    return state;
  } catch (error) {
    // Corrupt file - backup and start fresh
    if (error instanceof SyntaxError) {
      const backupPath = `${statePath}.corrupt.${Date.now()}`;
      console.error(`[state-manager] Corrupt state file, backing up to ${backupPath}`);
      renameSync(statePath, backupPath);
      return createInitialState();
    }
    throw error;
  }
}

/**
 * Save state to STREAM_STATE.json atomically
 * Uses temp file + atomic rename for crash safety
 */
export async function saveState(state: StreamState): Promise<void> {
  const statePath = getStatePath();
  const tempPath = `${statePath}.tmp.${process.pid}`;

  // Update lastSync timestamp
  state.lastSync = new Date().toISOString();

  // Ensure directory exists
  const dir = dirname(statePath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  try {
    // Write to temp file
    writeFileSync(tempPath, JSON.stringify(state, null, 2), 'utf-8');

    // Atomic rename
    renameSync(tempPath, statePath);
  } catch (error) {
    // Clean up temp file on error
    if (existsSync(tempPath)) {
      try {
        rmdirSync(tempPath);
      } catch {
        // Ignore cleanup errors
      }
    }
    throw error;
  }
}

/**
 * Execute function with state lock held
 * Prevents concurrent state modifications
 *
 * @param fn Function to execute while holding lock
 * @returns Result of fn()
 */
export async function withStateLock<T>(fn: () => Promise<T>): Promise<T> {
  const lockPath = getLockPath();
  let lockAcquired = false;

  try {
    // Acquire lock
    lockAcquired = await acquireLock(lockPath);
    if (!lockAcquired) {
      throw new Error(formatLockTimeoutError(lockPath));
    }

    // Execute function
    const result = await fn();

    // Release lock
    releaseLock(lockPath);

    return result;
  } catch (error) {
    // Always release lock on error
    if (lockAcquired) {
      releaseLock(lockPath);
    }
    throw error;
  }
}

// ============================================================================
// Stream ID Management (Version-Aware)
// ============================================================================

/**
 * Get next version-aware stream ID
 * Thread-safe via withStateLock
 *
 * Format: stream-{VERSION}{COUNTER}{SUFFIX}-{title}
 * Examples:
 *   - stream-1500-user-auth (v15, counter 0)
 *   - stream-1523-api-refactor (v15, counter 23)
 *   - stream-1500a-auth-tests (v15, counter 0, sub-stream a)
 *
 * @param title - Stream title for slug generation
 * @param subStreamOf - Optional parent stream ID for sub-streams
 * @returns Stream ID and formatted stream number
 * @throws Error if capacity exhausted or invalid parent
 */
export async function getNextStreamId(
  title: string,
  subStreamOf?: string
): Promise<{ streamId: string; streamNumber: string }> {
  return withStateLock(async () => {
    const state = await loadState();

    // Ensure state is migrated to version-aware format
    const migratedState = await ensureVersionAwareState(state);

    const projectVersion = getProjectMajorVersion();

    // Detect version change
    if (migratedState.version !== projectVersion) {
      console.error(
        `[state-manager] Project version changed: ${migratedState.version} → ${projectVersion}`
      );
      console.error(
        `[state-manager] Starting new version counter at ${projectVersion}00`
      );

      migratedState.version = projectVersion;
      // Don't reset old version counters (preserve history)
      if (!migratedState.versionCounters![projectVersion]) {
        migratedState.versionCounters![projectVersion] = 0;
      }
    }

    // Handle sub-streams
    if (subStreamOf) {
      const result = generateSubStreamId(migratedState, subStreamOf, title);
      await saveState(migratedState);
      return result;
    }

    // Generate main stream ID
    const counter = migratedState.versionCounters![projectVersion] || 0;

    if (counter >= 100) {
      throw new Error(
        `Stream capacity exhausted for version ${projectVersion}. ` +
          `Maximum 100 main streams (00-99) per version.\n` +
          `Suggestions:\n` +
          `  1. Create sub-stream of existing stream (e.g., stream-${projectVersion}00a)\n` +
          `  2. Increment project version (${projectVersion} → ${parseInt(projectVersion) + 1})\n` +
          `  3. Archive/cleanup old streams if no longer needed`
      );
    }

    const streamNumber = formatStreamNumber(projectVersion, counter);
    const slug = slugify(title);
    const streamId = `stream-${streamNumber}-${slug}`;

    // Increment counter
    migratedState.versionCounters![projectVersion] = counter + 1;
    await saveState(migratedState);

    return { streamId, streamNumber };
  });
}

/**
 * Generate sub-stream ID (e.g., stream-1500a-tests)
 * Sub-streams share the same version and counter as parent, with letter suffix
 *
 * @param state - Current stream state
 * @param parentStreamId - Parent stream ID (e.g., "stream-1500-auth")
 * @param title - Sub-stream title
 * @returns Stream ID and formatted stream number
 * @throws Error if parent invalid or capacity exhausted
 */
function generateSubStreamId(
  state: StreamState,
  parentStreamId: string,
  title: string
): { streamId: string; streamNumber: string } {
  // Extract parent stream number (e.g., "stream-1500-auth" -> "1500")
  const match = parentStreamId.match(/^stream-(\d{4})([a-z]?)-/);
  if (!match) {
    throw new Error(
      `Invalid parent stream ID format: ${parentStreamId}\n` +
        `Expected format: stream-{VERSION}{COUNTER}-{title}\n` +
        `Example: stream-1500-user-auth`
    );
  }

  const parentNumber = match[1]; // "1500"
  const parentSuffix = match[2]; // "" or "a"

  if (parentSuffix) {
    throw new Error(
      `Cannot create sub-stream of sub-stream: ${parentStreamId}\n` +
        `Sub-streams can only be created from main streams.\n` +
        `Create sub-stream of the parent stream instead.`
    );
  }

  // Verify parent exists
  if (!state.streams[parentStreamId]) {
    throw new Error(
      `Parent stream not found: ${parentStreamId}\n` +
        `Ensure the parent stream exists before creating sub-streams.`
    );
  }

  // Find next available letter suffix
  const existingSubStreams = Object.keys(state.streams).filter(
    (id) => id.startsWith(`stream-${parentNumber}`) && /stream-\d{4}[a-z]-/.test(id)
  );

  const usedSuffixes = existingSubStreams
    .map((id) => {
      const m = id.match(/stream-\d{4}([a-z])-/);
      return m ? m[1] : null;
    })
    .filter(Boolean) as string[];

  // Find first available letter
  let suffix = 'a';
  for (let i = 0; i < 26; i++) {
    const letter = String.fromCharCode(97 + i); // a-z
    if (!usedSuffixes.includes(letter)) {
      suffix = letter;
      break;
    }
  }

  if (usedSuffixes.length >= 26) {
    throw new Error(
      `Sub-stream capacity exhausted for ${parentStreamId}\n` +
        `Maximum 26 sub-streams (a-z) allowed per main stream.\n` +
        `Consider creating a new main stream instead.`
    );
  }

  const slug = slugify(title);
  const streamNumber = `${parentNumber}${suffix}`;
  const streamId = `stream-${streamNumber}-${slug}`;

  return { streamId, streamNumber };
}

/**
 * Ensure state is in version-aware format
 * Migrates legacy format (nextStreamId) to version-aware format
 *
 * @param state - Stream state (legacy or version-aware)
 * @returns Version-aware state
 */
async function ensureVersionAwareState(state: StreamState): Promise<StreamState> {
  // Already version-aware
  if (state.version && state.versionCounters) {
    // Migrate version counter keys from unpadded to padded format
    const migratedState = migrateVersionCounterKeys(state);
    return migratedState;
  }

  // Migrate legacy state
  console.error('[state-manager] Migrating to version-aware state format...');

  const projectVersion = getProjectMajorVersion();

  // Create version-aware state
  const migratedState: StreamState = {
    version: projectVersion,
    versionCounters: {
      [projectVersion]: 0, // Start fresh for current version
    },
    streams: state.streams,
    lastSync: state.lastSync,
  };

  // Log legacy stream count
  const legacyStreamCount = Object.keys(state.streams).length;
  if (legacyStreamCount > 0) {
    console.error(
      `[state-manager] Preserved ${legacyStreamCount} existing streams in registry`
    );
    console.error(
      `[state-manager] New streams will use version-aware numbering (e.g., stream-${projectVersion}00-*)`
    );
  }

  return migratedState;
}

/**
 * Migrate version counter keys from unpadded to padded format
 * Ensures all version keys are 2-digit padded (e.g., "1" -> "01", "15" -> "15")
 *
 * @param state - Version-aware state
 * @returns State with padded version counter keys
 */
function migrateVersionCounterKeys(state: StreamState): StreamState {
  const projectVersion = getProjectMajorVersion();
  let needsMigration = false;

  // Check if current version is unpadded
  if (state.version !== projectVersion) {
    console.error(
      `[state-manager] Migrating version key: "${state.version}" -> "${projectVersion}"`
    );
    state.version = projectVersion;
    needsMigration = true;
  }

  // Check if any version counter keys are unpadded
  const migratedCounters: Record<string, number> = {};
  for (const [version, counter] of Object.entries(state.versionCounters || {})) {
    const versionNum = parseInt(version, 10);
    if (isNaN(versionNum)) {
      console.error(`[state-manager] Warning: Invalid version key "${version}", skipping`);
      continue;
    }

    // Pad version to 2 digits (unless > 99)
    const paddedVersion = versionNum < 100 ? versionNum.toString().padStart(2, '0') : versionNum.toString();

    if (version !== paddedVersion) {
      console.error(
        `[state-manager] Migrating version counter: "${version}" -> "${paddedVersion}" (counter: ${counter})`
      );
      needsMigration = true;
    }

    // Merge counters if both padded and unpadded versions exist (use max)
    if (migratedCounters[paddedVersion] !== undefined) {
      migratedCounters[paddedVersion] = Math.max(migratedCounters[paddedVersion], counter);
    } else {
      migratedCounters[paddedVersion] = counter;
    }
  }

  if (needsMigration) {
    state.versionCounters = migratedCounters;
    console.error('[state-manager] Version counter migration complete');
  }

  return state;
}

/**
 * Slugify title for stream ID
 * Converts title to lowercase, replaces spaces/special chars with hyphens
 *
 * @param title - Human-readable title
 * @returns URL-safe slug
 *
 * Examples:
 *   "User Authentication" -> "user-authentication"
 *   "API Refactor (v2)" -> "api-refactor-v2"
 */
function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-') // Replace non-alphanumeric with hyphens
    .replace(/^-+|-+$/g, '') // Trim leading/trailing hyphens
    .substring(0, 50); // Limit length
}

/**
 * DEPRECATED: Legacy function for backward compatibility
 * Use getNextStreamId(title, subStreamOf?) instead
 *
 * @deprecated Since v0.2.0 - Use version-aware getNextStreamId
 * @returns Simple incrementing number (legacy format)
 */
export async function getNextStreamIdLegacy(): Promise<number> {
  return withStateLock(async () => {
    const state = await loadState();

    // If already migrated, return error
    if (state.version && state.versionCounters) {
      throw new Error(
        'State has been migrated to version-aware format. ' +
          'Use getNextStreamId(title, subStreamOf?) instead of getNextStreamIdLegacy().'
      );
    }

    const streamNumber = state.nextStreamId || 1;

    // Increment for next time
    state.nextStreamId = streamNumber + 1;
    await saveState(state);

    return streamNumber;
  });
}

// ============================================================================
// Stream Registry Operations
// ============================================================================

/**
 * Register new stream in state
 * Thread-safe via withStateLock
 *
 * @param metadata Stream metadata to register
 * @throws If stream ID already exists
 */
export async function registerStream(metadata: StreamMetadata): Promise<void> {
  return withStateLock(async () => {
    const state = await loadState();

    // Check for duplicate
    if (state.streams[metadata.streamId]) {
      throw new Error(
        `Stream ${metadata.streamId} already exists. Cannot register duplicate.`
      );
    }

    // Add to registry
    metadata.updatedAt = new Date().toISOString();
    state.streams[metadata.streamId] = metadata;

    await saveState(state);
  });
}

/**
 * Update existing stream in state
 * Thread-safe via withStateLock
 *
 * @param streamId Stream to update
 * @param updates Partial metadata to merge
 * @throws If stream doesn't exist
 */
export async function updateStream(
  streamId: string,
  updates: Partial<StreamMetadata>
): Promise<void> {
  return withStateLock(async () => {
    const state = await loadState();

    // Check stream exists
    if (!state.streams[streamId]) {
      throw new Error(`Stream ${streamId} not found. Cannot update.`);
    }

    // Merge updates
    state.streams[streamId] = {
      ...state.streams[streamId],
      ...updates,
      updatedAt: new Date().toISOString(),
    };

    await saveState(state);
  });
}

/**
 * Remove stream from state
 * Used when archiving completed streams
 *
 * @param streamId Stream to remove
 * @returns true if removed, false if not found
 */
export async function removeStream(streamId: string): Promise<boolean> {
  return withStateLock(async () => {
    const state = await loadState();

    if (!state.streams[streamId]) {
      return false;
    }

    delete state.streams[streamId];
    await saveState(state);

    return true;
  });
}

/**
 * Get single stream metadata
 * No lock needed - read-only operation
 *
 * @param streamId Stream to retrieve
 * @returns Stream metadata or null if not found
 */
export async function getStream(streamId: string): Promise<StreamMetadata | null> {
  const state = await loadState();
  return state.streams[streamId] || null;
}

/**
 * List all streams, optionally filtered
 * No lock needed - read-only operation
 *
 * @param filter Optional filter criteria
 * @returns Array of matching streams
 */
export async function listStreams(
  filter?: Partial<StreamMetadata>
): Promise<StreamMetadata[]> {
  const state = await loadState();
  let streams = Object.values(state.streams);

  // Apply filters
  if (filter) {
    streams = streams.filter((stream) => {
      return Object.entries(filter).every(([key, value]) => {
        return stream[key as keyof StreamMetadata] === value;
      });
    });
  }

  // Sort by stream number (newest first)
  // Handle both string (version-aware) and number (legacy) formats
  streams.sort((a, b) => {
    const aNum = typeof a.streamNumber === 'string'
      ? parseInt(a.streamNumber.replace(/[a-z]/g, ''), 10)
      : a.streamNumber;
    const bNum = typeof b.streamNumber === 'string'
      ? parseInt(b.streamNumber.replace(/[a-z]/g, ''), 10)
      : b.streamNumber;
    return bNum - aNum;
  });

  return streams;
}

// ============================================================================
// Lock Management (Atomic Directory Pattern)
// ============================================================================

/**
 * Acquire lock using atomic directory creation
 * Same pattern as complete-merge.ts
 *
 * @param lockPath Path to lock directory
 * @returns true if lock acquired, false if timeout
 */
async function acquireLock(lockPath: string): Promise<boolean> {
  const maxRetries = config.LOCK_MAX_RETRIES;
  const retryInterval = config.LOCK_RETRY_INTERVAL;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      // Atomic directory creation = lock acquisition
      mkdirSync(lockPath, { recursive: false });

      // Write lock info for debugging
      const lockInfo: LockInfo = {
        pid: process.pid,
        timestamp: new Date(),
        operation: 'state-manager',
      };
      writeFileSync(join(lockPath, 'info.json'), JSON.stringify(lockInfo, null, 2));

      console.error(`[state-manager] Lock acquired on attempt ${attempt + 1}`);
      return true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
        // Lock exists - check if stale
        const isStale = checkStaleLock(lockPath);
        if (isStale) {
          console.error(`[state-manager] Removing stale lock...`);
          rmdirSync(lockPath, { recursive: true });
          continue; // Retry
        }

        if (attempt < maxRetries - 1) {
          console.error(
            `[state-manager] Lock held, waiting ${retryInterval / 1000}s (attempt ${attempt + 1}/${maxRetries})...`
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

/**
 * Check if lock is stale and should be removed
 *
 * @param lockPath Path to lock directory
 * @returns true if lock is stale
 */
function checkStaleLock(lockPath: string): boolean {
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

/**
 * Release lock by removing directory
 *
 * @param lockPath Path to lock directory
 */
function releaseLock(lockPath: string): void {
  try {
    rmdirSync(lockPath, { recursive: true });
    console.error(`[state-manager] Lock released`);
  } catch {
    console.error(`[state-manager] Warning: Could not release lock`);
  }
}

// ============================================================================
// Utilities
// ============================================================================

/**
 * Get absolute path to state file
 */
function getStatePath(): string {
  return join(config.PROJECT_ROOT, config.STREAM_STATE_PATH);
}

/**
 * Get absolute path to state lock directory
 */
function getLockPath(): string {
  return join(config.PROJECT_ROOT, config.STATE_LOCK_DIR);
}

/**
 * Create initial state structure (version-aware)
 */
function createInitialState(): StreamState {
  const projectVersion = getProjectMajorVersion();

  return {
    version: projectVersion,
    versionCounters: {
      [projectVersion]: 0,
    },
    streams: {},
    lastSync: new Date().toISOString(),
  };
}

/**
 * Validate state structure
 * Supports both legacy and version-aware formats
 */
function isValidState(state: any): state is StreamState {
  if (typeof state !== 'object' || state === null) {
    return false;
  }

  // Must have streams and lastSync
  if (typeof state.streams !== 'object' || typeof state.lastSync !== 'string') {
    return false;
  }

  // Version-aware format (v0.2.0+)
  if (state.version && state.versionCounters) {
    return (
      typeof state.version === 'string' &&
      typeof state.versionCounters === 'object' &&
      Object.values(state.versionCounters).every((v) => typeof v === 'number' && v >= 0)
    );
  }

  // Legacy format (v0.1.0) - for migration
  if (state.nextStreamId !== undefined) {
    return typeof state.nextStreamId === 'number' && state.nextStreamId > 0;
  }

  // Invalid if neither format
  return false;
}

/**
 * Sleep utility
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Format lock timeout error message
 */
function formatLockTimeoutError(lockPath: string): string {
  const waitTime = (config.LOCK_RETRY_INTERVAL * config.LOCK_MAX_RETRIES) / 1000;
  return `
STATE LOCK TIMEOUT

Lock Path: ${lockPath}

Could not acquire state lock after ${waitTime} seconds.
Another operation is modifying stream state.

TO FIX:
1. Wait for other operation to complete
2. If stuck, manually remove lock:
   rm -rf ${lockPath}
3. Retry operation

WHY: State file modifications must be serialized to prevent corruption.
`.trim();
}

// ============================================================================
// Active Stream Context Management (Post-Compaction Recovery)
// ============================================================================

/**
 * Set/update an active stream context
 * Call this when starting or resuming work on a stream
 * Multiple streams can be active simultaneously
 *
 * @param context - Active stream information
 */
export async function setActiveStream(context: ActiveStreamContext): Promise<void> {
  return withStateLock(async () => {
    const state = await loadState();
    if (!state.activeStreams) {
      state.activeStreams = {};
    }
    state.activeStreams[context.streamId] = {
      ...context,
      lastAccessedAt: context.lastAccessedAt || new Date().toISOString(),
    };
    await saveState(state);
    console.error(`[state-manager] Active stream set: ${context.streamId}`);
  });
}

/**
 * Clear a specific stream from active context
 * Call this when completing a stream
 *
 * @param streamId - Stream to remove from active tracking
 */
export async function clearActiveStream(streamId?: string): Promise<void> {
  return withStateLock(async () => {
    const state = await loadState();
    if (!state.activeStreams) return;

    if (streamId) {
      // Clear specific stream
      if (state.activeStreams[streamId]) {
        delete state.activeStreams[streamId];
        console.error(`[state-manager] Active stream cleared: ${streamId}`);
      }
    } else {
      // Clear all (legacy behavior)
      state.activeStreams = {};
      console.error(`[state-manager] All active streams cleared`);
    }
    await saveState(state);
  });
}

/**
 * Get all active stream contexts
 * Returns empty object if no streams are active
 *
 * This is a read-only operation - no lock needed
 */
export async function getAllActiveStreams(): Promise<ActiveStreamsMap> {
  const state = await loadState();
  return state.activeStreams || {};
}

/**
 * Get the most recently accessed active stream
 * Useful as a hint when agent is in main directory
 * Returns null if no streams are active
 */
export async function getMostRecentActiveStream(): Promise<ActiveStreamContext | null> {
  const state = await loadState();
  if (!state.activeStreams) return null;

  const streams = Object.values(state.activeStreams);
  if (streams.length === 0) return null;

  // Sort by lastAccessedAt descending, return most recent
  streams.sort((a, b) =>
    new Date(b.lastAccessedAt).getTime() - new Date(a.lastAccessedAt).getTime()
  );

  return streams[0];
}

/**
 * Get a specific active stream by ID
 * Returns null if stream is not in active tracking
 */
export async function getActiveStream(streamId: string): Promise<ActiveStreamContext | null> {
  const state = await loadState();
  return state.activeStreams?.[streamId] || null;
}
