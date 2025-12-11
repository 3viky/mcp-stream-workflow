/**
 * Configuration for Stream Workflow Manager MCP Server
 *
 * This file centralizes all configuration values.
 * Values can be overridden via environment variables.
 *
 * To modify: Create worktree, edit this file, test, merge.
 */

import { existsSync, readFileSync } from 'fs';
import { join, basename } from 'path';
import { homedir } from 'os';
import { getMCPServiceSubdir } from '@3viky/mcp-common';
import type { Config } from './types.js';

/**
 * Global MCP Configuration Interface
 * Read from ~/.claude/mcp-config.json
 */
interface GlobalMCPConfig {
  developerMode?: boolean;
  streamWorkflow?: {
    enableScreenshots?: boolean;
  };
  [key: string]: any;
}

/**
 * Read global MCP configuration from ~/.claude/mcp-config.json
 * Returns null if file doesn't exist or is invalid
 */
function readGlobalConfig(): GlobalMCPConfig | null {
  try {
    const globalConfigPath = join(homedir(), '.claude', 'mcp-config.json');
    if (!existsSync(globalConfigPath)) {
      return null;
    }
    const content = readFileSync(globalConfigPath, 'utf-8');
    return JSON.parse(content);
  } catch (error) {
    console.error(
      'Warning: Failed to read ~/.claude/mcp-config.json:',
      error instanceof Error ? error.message : error
    );
    return null;
  }
}

/**
 * Determine DEVELOPER_MODE from multiple sources
 * Priority order:
 *   1. Environment variable (DEVELOPER_MODE from .claude/mcp-servers.json)
 *   2. Global config file (~/.claude/mcp-config.json)
 *   3. Default: false
 *
 * @returns Object with enabled status and source
 */
function resolveDeveloperMode(): { enabled: boolean; source: string } {
  // 1. Check environment variable (highest priority)
  if (process.env.DEVELOPER_MODE !== undefined) {
    return {
      enabled: process.env.DEVELOPER_MODE === 'true',
      source: 'environment variable (.claude/mcp-servers.json)',
    };
  }

  // 2. Check global config file
  const globalConfig = readGlobalConfig();
  if (globalConfig?.developerMode !== undefined) {
    return {
      enabled: globalConfig.developerMode === true,
      source: 'global config (~/.claude/mcp-config.json)',
    };
  }

  // 3. Default to false (user mode)
  return {
    enabled: false,
    source: 'default (user mode)',
  };
}

/**
 * Determine screenshot generation feature from multiple sources
 * Priority order:
 *   1. Environment variable (ENABLE_SCREENSHOTS from .claude/mcp-servers.json)
 *   2. Global config file (~/.claude/mcp-config.json streamWorkflow.enableScreenshots)
 *   3. Default: false (opt-in feature)
 *
 * @returns Object with enabled status and source
 */
function resolveScreenshotGeneration(): { enabled: boolean; source: string } {
  // 1. Check environment variable (highest priority)
  if (process.env.ENABLE_SCREENSHOTS !== undefined) {
    return {
      enabled: process.env.ENABLE_SCREENSHOTS === 'true',
      source: 'environment variable (.claude/mcp-servers.json)',
    };
  }

  // 2. Check global config file
  const globalConfig = readGlobalConfig();
  if (globalConfig?.streamWorkflow?.enableScreenshots !== undefined) {
    return {
      enabled: globalConfig.streamWorkflow.enableScreenshots === true,
      source: 'global config (~/.claude/mcp-config.json)',
    };
  }

  // 3. Default to false (opt-in feature)
  return {
    enabled: false,
    source: 'default (disabled - opt-in feature)',
  };
}

// Resolve DEVELOPER_MODE and screenshot generation, store for later reference
const developerModeConfig = resolveDeveloperMode();
const screenshotConfig = resolveScreenshotGeneration();

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
   *
   * Uses OS-specific cache directory for temporary/ephemeral data:
   * - Linux: ~/.cache/mcp-services/stream-workflow-data/worktrees/<project-name>/
   * - macOS: ~/Library/Caches/mcp-services/stream-workflow-data/worktrees/<project-name>/
   * - Windows: %LOCALAPPDATA%/mcp-services/stream-workflow-data/worktrees/<project-name>/
   *
   * Can be overridden via WORKTREE_ROOT environment variable
   *
   * Benefits:
   * - Follows OS conventions for temporary data
   * - Survives reboots but recognized as ephemeral
   * - Doesn't pollute source code directories
   * - Organizes worktrees by project name
   */
  WORKTREE_ROOT: (() => {
    // Allow override via environment variable
    if (process.env.WORKTREE_ROOT) {
      return process.env.WORKTREE_ROOT;
    }

    // Use OS-specific cache directory with project-specific subdirectory
    const projectRoot = process.env.PROJECT_ROOT ||
      '/var/home/viky/Code/applications/src/@egirl/egirl-platform';
    const projectName = basename(projectRoot);

    return getMCPServiceSubdir('stream-workflow', 'worktrees', projectName);
  })(),

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

    /**
     * Generate screenshots during prepare_merge (IMPLEMENTED)
     * Prevents pre-push hook from generating screenshots in main
     *
     * DEFAULT: false (opt-in feature)
     * Most projects don't have screenshot generation.
     * Enable only if your project has:
     * - A `pnpm screenshots:quick` command
     * - Pre-push hook that generates screenshots
     *
     * Configuration priority order:
     *   1. ENABLE_SCREENSHOTS env var (.claude/mcp-servers.json)
     *   2. Global config (~/.claude/mcp-config.json streamWorkflow.enableScreenshots)
     *   3. Default: false (opt-in feature)
     *
     * When enabled:
     * - Screenshots generated in worktree during prepare_merge
     * - Committed to worktree before merge to main
     * - Pre-push hook detects screenshots present and skips generation
     * - Main branch stays clean (no uncommitted files)
     *
     * When disabled (default):
     * - Screenshot generation skipped
     * - No impact on projects without screenshot tooling
     *
     * Note: Screenshot command handles dev server automatically
     */
    generateScreenshots: screenshotConfig.enabled,
  },

  // ============================================================================
  // Screenshot Generation
  // ============================================================================

  /**
   * Screenshot generation timeout (milliseconds)
   * Allows time for dev server to start if needed
   *
   * The screenshot command handles server management:
   * - Starts dev server if not running
   * - Generates screenshots
   * - Shuts down server if it started it
   */
  SCREENSHOT_TIMEOUT: 300000, // 5 minutes

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
   * Configuration priority order:
   *   1. Per-project: DEVELOPER_MODE env var in .claude/mcp-servers.json
   *   2. Global: ~/.claude/mcp-config.json { "developerMode": true }
   *   3. Default: false (user mode)
   *
   * See: DEVELOPMENT.md for full developer guide
   */
  DEVELOPER_MODE: developerModeConfig.enabled,
};

/**
 * Get the source of DEVELOPER_MODE configuration
 * Useful for logging on server startup
 */
export function getDeveloperModeSource(): string {
  return developerModeConfig.source;
}

/**
 * Get the source of screenshot generation configuration
 * Useful for logging on server startup
 */
export function getScreenshotConfigSource(): string {
  return screenshotConfig.source;
}

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
