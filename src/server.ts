/**
 * Stream Workflow Manager MCP Server
 *
 * AI-powered worktree workflow automation for egirl-platform.
 * Implements the complete merge protocol as MCP tools with distributed git-based locking.
 *
 * Tools implemented:
 * - start_stream: Initialize new development stream [Step A]
 * - verify_location: Enforce worktree-only development
 * - check_lock_status: Check active merge locks (debugging)
 * - prepare_merge: Merge main into worktree + AI conflict resolution [Steps B,C,D,E,F]
 * - complete_merge: Fast-forward main from worktree with distributed lock [Steps G,H,I]
 * - complete_stream: Archive and cleanup [Steps J,K,L]
 *
 * Lock mechanism: Uses git branches (refs/locks/merge-in-progress) for distributed locking
 * that works across multiple machines/agents, preventing concurrent merges to main.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  type Tool,
} from '@modelcontextprotocol/sdk/types.js';

import { config, validateConfig, getDeveloperModeSource, getScreenshotConfigSource } from './config.js';
import type { MCPResponse, ResponseMetadata, NoteToAgent } from './types.js';

// Tool implementations
import { startStream } from './tools/start-stream.js';
import { verifyLocation } from './tools/verify-location.js';
import { prepareMerge } from './tools/prepare-merge.js';
import { completeMerge } from './tools/complete-merge.js';
import { completeStream } from './tools/complete-stream.js';
import { checkLockStatus } from './tools/check-lock-status.js';
import { getVersion } from './tools/get-version.js';
import { getActiveContext } from './tools/get-active-context.js';

const SERVER_VERSION = '0.1.0';

function createMetadata(toolName: string): ResponseMetadata {
  const baseMetadata = {
    tool: toolName,
    version: SERVER_VERSION,
  };

  // Only include self-improvement instructions in DEVELOPER_MODE
  if (config.DEVELOPER_MODE) {
    return {
      ...baseMetadata,
      sourceLocation: {
        repository: 'egirl-platform',
        mcp_server: '.claude/mcp-servers/stream-workflow-manager',
        files: {
          server: 'src/server.ts',
          this_tool: `src/tools/${toolName.replace(/_/g, '-')}.ts`,
          types: 'src/types.ts',
          config: 'src/config.ts',
        },
      },
      updateInstructions: {
        summary: 'This MCP server is self-maintainable by Claude Code agents',
        workflow: [
          `1. Create worktree: git worktree add ${config.WORKTREE_ROOT}/mcp-enhancement -b mcp-enhancement`,
          '2. Edit source files in .claude/mcp-servers/stream-workflow-manager/src/',
          '3. Test: pnpm test',
          '4. Build: pnpm build',
          '5. Restart Claude Code session to reload MCP server',
          '6. Merge to main when tested',
        ],
        hotReload: 'Not supported - restart Claude Code session after changes',
        documentation: 'See DEVELOPMENT.md for complete developer guide',
      },
      limitations: {
        known: [
          'Binary files not supported for conflict resolution',
          'Max file size: 100KB for conflict resolution',
          'Sequential conflict resolution (no parallelization)',
        ],
        reportIssues: '.claude/mcp-servers/stream-workflow-manager/ISSUES.md',
      },
      extensionPoints: {
        addConflictStrategy: 'src/strategies/ - add new file type handlers',
        addValidator: 'src/validators/ - add new validation checks',
        customizePrompts: 'prompts/ - modify AI conflict resolution prompts',
      },
    };
  }

  // User mode: clean metadata without modification instructions
  return baseMetadata;
}

function createNoteToAgent(_toolName: string): NoteToAgent | null {
  // Only provide agent notes in DEVELOPER_MODE
  if (!config.DEVELOPER_MODE) {
    return null;
  }

  return {
    capability: 'This tool is part of the Stream Workflow Manager MCP server.',
    limitation: 'Requires ANTHROPIC_API_KEY for AI conflict resolution.',
    if_you_need: {
      'custom conflict resolution': 'Add strategy in src/strategies/',
      'additional validation': 'Add validator in src/validators/',
      'different AI model': 'Update ANTHROPIC_MODEL in src/config.ts',
    },
    quick_update_guide: 'See DEVELOPMENT.md for complete workflow',
  };
}

const TOOLS: Tool[] = [
  {
    name: 'get_version',
    description:
      'Get version information for this MCP server. ' +
      'Returns package version, capabilities, and usage notes. ' +
      'Safe to call anytime - read-only operation.',
    inputSchema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
  {
    name: 'get_active_context',
    description:
      'CRITICAL: Call this FIRST after context compaction, session resume, or "let\'s continue" requests. ' +
      'Returns which stream you should be working on and whether you are in the correct directory. ' +
      'If in wrong directory, provides navigation instructions. ' +
      'Safe to call frequently - read-only operation. ' +
      'USE THIS to recover your working context after any context loss.',
    inputSchema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
  {
    name: 'start_stream',
    description:
      'Initialize a new development stream. ' +
      'RUNS IN MAIN (only legitimate exception to worktree-only rule). ' +
      'Creates metadata, commits to main, creates worktree, and SETS ACTIVE STREAM CONTEXT. ' +
      'After calling this, navigate to the returned worktree path. ' +
      'Call this BEFORE beginning work on a new feature/fix.',
    inputSchema: {
      type: 'object',
      properties: {
        title: {
          type: 'string',
          description: 'Human-readable stream title (e.g., "Add user authentication")',
        },
        category: {
          type: 'string',
          enum: ['backend', 'frontend', 'infrastructure', 'testing', 'documentation', 'refactoring'],
          description: 'Stream category for organization',
        },
        priority: {
          type: 'string',
          enum: ['critical', 'high', 'medium', 'low'],
          description: 'Stream priority level',
        },
        handoff: {
          type: 'string',
          description: 'HANDOFF.md content - detailed instructions for what the agent should work on',
        },
        description: {
          type: 'string',
          description: 'Additional context for README.md (optional)',
        },
        estimatedPhases: {
          type: 'array',
          items: { type: 'string' },
          description: 'Optional phase names for tracking progress (e.g., ["Planning", "Implementation", "Testing"])',
        },
        tags: {
          type: 'array',
          items: { type: 'string' },
          description: 'Optional tags for categorization (e.g., ["authentication", "security"])',
        },
      },
      required: ['title', 'category', 'priority', 'handoff'],
    },
  },
  {
    name: 'verify_location',
    description:
      'CRITICAL: Call this FIRST after context compaction, session resume, or before file modifications. ' +
      'Verifies current working directory is a valid worktree (not main). ' +
      'Returns stream info if valid, provides navigation instructions if in wrong directory. ' +
      'Safe to call frequently - read-only operation. ' +
      'WHEN TO CALL: After any context loss, before making file modifications, when unsure of location.',
    inputSchema: {
      type: 'object',
      properties: {
        workingDir: {
          type: 'string',
          description: 'Directory to verify (defaults to current working directory)',
        },
      },
      required: [],
    },
  },
  {
    name: 'check_lock_status',
    description:
      'Check if a merge lock is currently active. ' +
      'Returns lock information including which stream holds the lock, when it was acquired, and whether it is stale. ' +
      'Safe to call anytime - read-only operation. ' +
      'Useful for debugging blocked merges.',
    inputSchema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
  {
    name: 'prepare_merge',
    description:
      'REQUIRES EXPLICIT USER DIRECTION. Do NOT call autonomously. ' +
      'PREREQUISITE: Call verify_location or get_active_context first to confirm correct worktree. ' +
      'Merge main into worktree and detect conflicts. ' +
      'User must explicitly request: "merge", "prepare merge", "sync with main", etc. ' +
      'If conflicts detected, returns them for agent resolution, then user must re-request.',
    inputSchema: {
      type: 'object',
      properties: {
        streamId: {
          type: 'string',
          description: 'Stream identifier (e.g., "stream-42-feature-name")',
        },
        validateBeforePush: {
          type: 'boolean',
          description: 'Run typecheck/build/lint before pushing (default: true)',
          default: true,
        },
        skipPush: {
          type: 'boolean',
          description: 'Skip pushing to origin (for testing)',
          default: false,
        },
      },
      required: ['streamId'],
    },
  },
  {
    name: 'complete_merge',
    description:
      'REQUIRES EXPLICIT USER DIRECTION. Do NOT call autonomously. ' +
      'PREREQUISITE: Call verify_location first AND prepare_merge must succeed first. ' +
      'Fast-forward merge worktree into main and push. ' +
      'User must explicitly request: "merge to main", "complete merge", "finish stream", etc.',
    inputSchema: {
      type: 'object',
      properties: {
        streamId: {
          type: 'string',
          description: 'Stream identifier to merge into main',
        },
        deleteRemoteBranch: {
          type: 'boolean',
          description: 'Delete remote branch after merge (default: false)',
          default: false,
        },
      },
      required: ['streamId'],
    },
  },
  {
    name: 'complete_stream',
    description:
      'REQUIRES EXPLICIT USER DIRECTION. Do NOT call autonomously. ' +
      'Archive completed stream and cleanup worktree. ' +
      'User must explicitly request: "archive stream", "cleanup", "retire stream", etc. ' +
      'PREREQUISITE: complete_merge must succeed first.',
    inputSchema: {
      type: 'object',
      properties: {
        streamId: {
          type: 'string',
          description: 'Stream identifier to archive',
        },
        summary: {
          type: 'string',
          description: 'Summary of work completed (for archive)',
        },
        deleteWorktree: {
          type: 'boolean',
          description: 'Delete worktree directory (default: true)',
          default: true,
        },
        cleanupPlanFiles: {
          type: 'boolean',
          description: 'Remove .project/plan/streams/ files (default: true)',
          default: true,
        },
      },
      required: ['streamId', 'summary'],
    },
  },
];

async function main(): Promise<void> {
  // Validate configuration on startup
  try {
    validateConfig();
  } catch (error) {
    console.error('Configuration error:', error);
    process.exit(1);
  }

  const server = new Server(
    {
      name: 'stream-workflow-manager',
      version: SERVER_VERSION,
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  // Handle list tools request
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return { tools: TOOLS };
  });

  // Handle tool calls
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    try {
      let result: MCPResponse;

      switch (name) {
        case 'get_version':
          result = await getVersion();
          break;

        case 'get_active_context':
          result = await getActiveContext();
          break;

        case 'start_stream':
          result = await startStream(args as any);
          break;

        case 'verify_location':
          result = await verifyLocation(args as { workingDir?: string });
          break;

        case 'check_lock_status':
          result = await checkLockStatus();
          break;

        case 'prepare_merge':
          result = await prepareMerge(args as {
            streamId: string;
            validateBeforePush?: boolean;
            skipPush?: boolean;
          });
          break;

        case 'complete_merge':
          result = await completeMerge(args as {
            streamId: string;
            deleteRemoteBranch?: boolean;
          });
          break;

        case 'complete_stream':
          result = await completeStream(args as {
            streamId: string;
            summary: string;
            deleteWorktree?: boolean;
            cleanupPlanFiles?: boolean;
          });
          break;

        default:
          throw new Error(`Unknown tool: ${name}`);
      }

      // Add metadata to all responses (encoded in text for MCP compatibility)
      const metadata = createMetadata(name);
      const noteToAgent = createNoteToAgent(name);

      // Append metadata as JSON comment at end of response
      // In user mode (DEVELOPER_MODE=false), noteToAgent will be null
      const metadataObj: { _meta: ResponseMetadata; _note_to_agent?: NoteToAgent } = {
        _meta: metadata,
      };
      if (noteToAgent) {
        metadataObj._note_to_agent = noteToAgent;
      }

      const metadataText = `\n\n<!-- MCP_META: ${JSON.stringify(metadataObj)} -->`;
      if (result.content[0]?.type === 'text' && result.content[0].text) {
        result.content[0].text += metadataText;
      }

      return {
        content: result.content,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        content: [
          {
            type: 'text' as const,
            text: `Error in ${name}: ${errorMessage}`,
          },
        ],
        isError: true,
      };
    }
  });

  // Start server
  const transport = new StdioServerTransport();
  await server.connect(transport);

  console.error('Stream Workflow Manager MCP Server started');
  console.error(`Version: ${SERVER_VERSION}`);
  console.error(`Project root: ${config.PROJECT_ROOT}`);
  console.error(`Worktree root: ${config.WORKTREE_ROOT}`);
  console.error(
    `Developer mode: ${config.DEVELOPER_MODE ? 'ENABLED (self-modification allowed)' : 'DISABLED (user mode)'}`
  );
  console.error(`  → Source: ${getDeveloperModeSource()}`);
  if (config.DEVELOPER_MODE) {
    console.error(
      '  → Agents will receive self-improvement instructions. See DEVELOPMENT.md'
    );
  }
  console.error(
    `Screenshot generation: ${config.FEATURES.generateScreenshots ? 'ENABLED' : 'DISABLED (opt-in feature)'}`
  );
  console.error(`  → Source: ${getScreenshotConfigSource()}`);
  if (config.FEATURES.generateScreenshots) {
    console.error(
      '  → Screenshots will be generated in prepare_merge. See docs/OPTIONAL_FEATURES.md'
    );
  }
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
