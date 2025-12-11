/**
 * get_version - Version information tool
 *
 * Returns version, build info, and capabilities of the MCP server.
 * Use this to verify which version of the MCP server is running.
 */

import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createVersionInfo, getPackageJsonPath } from '@3viky/mcp-common';

import type { MCPResponse } from '../types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export async function getVersion(): Promise<MCPResponse> {
  try {
    const packagePath = getPackageJsonPath(__dirname);

    const versionInfo = createVersionInfo(
      packagePath,
      [
        'get_version - Get version and capabilities (safe, read-only)',
        'start_stream - Initialize new development stream',
        'verify_location - Verify worktree location (safe, read-only)',
        'prepare_merge - Merge main into worktree with conflict resolution',
        'complete_merge - Fast-forward merge worktree to main',
        'complete_stream - Archive and cleanup completed stream',
      ],
      {
        safeToCall: ['get_version', 'verify_location'],
        requiresUserApproval: ['prepare_merge', 'complete_merge', 'complete_stream'],
        runInMain: ['start_stream'],
        runInWorktree: ['verify_location', 'prepare_merge', 'complete_merge', 'complete_stream'],
      }
    );

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(versionInfo, null, 2),
        },
      ],
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            error: 'Failed to read version information',
            details: errorMessage,
          }, null, 2),
        },
      ],
    };
  }
}
