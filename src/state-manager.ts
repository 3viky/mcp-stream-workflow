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
import type { LockInfo } from './types.js';

// ============================================================================
// Interfaces
// ============================================================================

/**
 * StreamState: Root state object persisted in STREAM_STATE.json
 */
export interface StreamState {
  nextStreamId: number;
  streams: Record<string, StreamMetadata>;
  lastSync: string; // ISO timestamp
}

/**
 * StreamMetadata: Minimal stream metadata stored in central state
 * Full metadata lives in .project/plan/streams/{streamId}/METADATA.json
 */
export interface StreamMetadata {
  streamId: string;
  streamNumber: number;
  title: string;
  category: StreamCategory;
  priority: StreamPriority;
  status: StreamStatus;
  createdAt: string; // ISO timestamp
  updatedAt?: string; // ISO timestamp
  worktreePath: string;
  branch: string;
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
// Stream ID Management
// ============================================================================

/**
 * Get next stream ID and increment counter
 * Thread-safe via withStateLock
 *
 * @returns Next stream number (1, 2, 3, ...)
 */
export async function getNextStreamId(): Promise<number> {
  return withStateLock(async () => {
    const state = await loadState();
    const streamNumber = state.nextStreamId;

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
  streams.sort((a, b) => b.streamNumber - a.streamNumber);

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
  return join(config.PROJECT_ROOT, config.DASHBOARD_LOCK_DIR);
}

/**
 * Create initial state structure
 */
function createInitialState(): StreamState {
  return {
    nextStreamId: 1,
    streams: {},
    lastSync: new Date().toISOString(),
  };
}

/**
 * Validate state structure
 */
function isValidState(state: any): state is StreamState {
  return (
    typeof state === 'object' &&
    state !== null &&
    typeof state.nextStreamId === 'number' &&
    state.nextStreamId > 0 &&
    typeof state.streams === 'object' &&
    typeof state.lastSync === 'string'
  );
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
