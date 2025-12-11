/**
 * Configuration for Stream Workflow Manager MCP Server
 *
 * This file centralizes all configuration values.
 * Values can be overridden via environment variables.
 *
 * To modify: Create worktree, edit this file, test, merge.
 */

import type { Config } from './types.js';

export const config: Config = {
  // ============================================================================
  // File Processing
  // ============================================================================

  /**
   * Maximum file size for conflict resolution (bytes)
   * Files larger than this will fail with error.
   *
   * To increase: Change value, rebuild, restart Claude Code
   * Better solution: Implement chunked processing (see docs/EXTENDING.md)
   */
  MAX_FILE_SIZE: 100 * 1024, // 100KB

  /**
   * Maximum number of conflicts to resolve in single merge
   * Safety limit to prevent runaway AI costs.
   */
  MAX_CONFLICTS_PER_MERGE: 50,

  // ============================================================================
  // Timeouts
  // ============================================================================

  /**
   * Timeout for resolving a single conflict (milliseconds)
   * Includes: Reading file, calling Claude API, writing resolution
   */
  CONFLICT_RESOLUTION_TIMEOUT: 60000, // 60 seconds

  /**
   * Maximum time to wait for merge lock (milliseconds)
   * Total wait time = LOCK_RETRY_INTERVAL * LOCK_MAX_RETRIES
   */
  MERGE_LOCK_TIMEOUT: 300000, // 5 minutes

  /**
   * Timeout for validation commands (milliseconds)
   * Includes: tsc, build, lint
   */
  VALIDATION_TIMEOUT: 120000, // 2 minutes

  // ============================================================================
  // AI Configuration
  // ============================================================================

  /**
   * Anthropic model to use for conflict resolution
   * Options: 'claude-sonnet-4-5-20250929', 'claude-opus-4-5-20251101'
   */
  ANTHROPIC_MODEL:
    process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-5-20250929',

  /**
   * Maximum tokens for Claude responses
   * Should be large enough for full file content
   */
  MAX_TOKENS: 8192,

  /**
   * Temperature for AI responses (0.0 = deterministic, 1.0 = creative)
   * Use 0.0 for code to ensure consistent output
   */
  TEMPERATURE: 0.0,

  // ============================================================================
  // Paths
  // ============================================================================

  /**
   * Absolute path to egirl-platform main directory
   * Can be overridden via PROJECT_ROOT environment variable
   */
  PROJECT_ROOT:
    process.env.PROJECT_ROOT ||
    '/var/home/viky/Code/applications/src/@egirl/egirl-platform',

  /**
   * Absolute path to worktrees directory
   * Can be overridden via WORKTREE_ROOT environment variable
   */
  WORKTREE_ROOT:
    process.env.WORKTREE_ROOT ||
    '/var/home/viky/Code/applications/src/@egirl/egirl-platform-worktrees',

  /**
   * Path to stream status dashboard (relative to PROJECT_ROOT)
   */
  DASHBOARD_PATH: '.project/STREAM_STATUS_DASHBOARD.md',

  /**
   * Path to stream state file (relative to PROJECT_ROOT)
   */
  STREAM_STATE_PATH: '.project/.stream-state.json',

  // ============================================================================
  // Locking
  // ============================================================================

  /**
   * Directory for merge lock (relative to PROJECT_ROOT)
   * Atomic directory creation provides locking mechanism
   */
  MERGE_LOCK_DIR: '.git/MERGE_LOCK',

  /**
   * Directory for dashboard lock (relative to PROJECT_ROOT)
   */
  DASHBOARD_LOCK_DIR: '.project/.dashboard.lock',

  /**
   * Time to wait between lock acquisition retries (milliseconds)
   */
  LOCK_RETRY_INTERVAL: 30000, // 30 seconds

  /**
   * Maximum number of lock acquisition attempts
   * Total wait time = LOCK_RETRY_INTERVAL * LOCK_MAX_RETRIES
   */
  LOCK_MAX_RETRIES: 10, // 10 attempts = 5 minutes max wait

  // ============================================================================
  // Validation
  // ============================================================================

  /**
   * Which validators to run after conflict resolution
   * Set to false to disable specific validators
   */
  VALIDATORS: {
    typescript: true, // npx tsc --noEmit
    build: true, // pnpm build --dry-run
    lint: true, // pnpm lint
  },

  // ============================================================================
  // Feature Flags
  // ============================================================================

  /**
   * Enable/disable experimental features
   */
  FEATURES: {
    /**
     * Resolve conflicts in parallel (NOT IMPLEMENTED)
     * Currently sequential for safety
     */
    parallelConflictResolution: false,

    /**
     * Support binary file conflicts (NOT IMPLEMENTED)
     * Currently only text files supported
     */
    binaryFileSupport: false,

    /**
     * Track conflict resolution metrics (NOT IMPLEMENTED)
     * Future: Learn which strategies work best
     */
    conflictAnalytics: false,
  },

  // ============================================================================
  // Development Mode
  // ============================================================================

  /**
   * DEVELOPER_MODE: Enable self-modification features
   *
   * When enabled (DEVELOPER_MODE=true):
   * - MCP tool responses include self-improvement instructions
   * - Agents receive extension points and update workflows
   * - Error messages include fix instructions for the MCP server itself
   *
   * When disabled (default for users):
   * - MCP tool responses are clean and user-focused
   * - No agent instructions for modifying the MCP server
   * - Error messages focus on usage, not internal implementation
   *
   * Set via environment variable:
   *   DEVELOPER_MODE=true in .claude/mcp-servers.json
   *
   * See: DEVELOPMENT.md for full developer guide
   */
  DEVELOPER_MODE: process.env.DEVELOPER_MODE === 'true',
};

/**
 * Validate configuration
 * Called on server startup
 */
export function validateConfig(): void {
  // No external API keys required - this MCP server is used BY Claude Code,
  // and Claude Code (the agent) handles AI operations directly

  // Validate paths exist
  // (Skipped for now - will be checked at runtime)
}
