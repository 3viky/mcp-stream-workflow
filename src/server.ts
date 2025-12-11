/**
 * Stream Workflow Manager MCP Server
 *
 * AI-powered worktree workflow automation for egirl-platform.
 * Implements the complete merge protocol as MCP tools.
 *
 * Tools implemented:
 * - verify_location: Enforce worktree-only development
 * - prepare_merge: Merge main into worktree + AI conflict resolution [Steps B,C,D,E,F]
 * - complete_merge: Fast-forward main from worktree [Steps G,H,I]
 * - complete_stream: Archive and cleanup [Steps J,K,L]
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  type Tool,
} from '@modelcontextprotocol/sdk/types.js';

import { config, validateConfig, getDeveloperModeSource } from './config.js';
import type { MCPResponse, ResponseMetadata, NoteToAgent } from './types.js';

// Tool implementations
import { verifyLocation } from './tools/verify-location.js';
import { prepareMerge } from './tools/prepare-merge.js';
import { completeMerge } from './tools/complete-merge.js';
import { completeStream } from './tools/complete-stream.js';

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
          '1. Create worktree: git worktree add ../egirl-platform-worktrees/mcp-enhancement -b mcp-enhancement',
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
    name: 'verify_location',
    description:
      'Verify current working directory is a valid worktree (not main). ' +
      'Returns stream info if in valid worktree, error if in main directory. ' +
      'Safe to call anytime - read-only operation.',
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
    name: 'prepare_merge',
    description:
      'REQUIRES EXPLICIT USER DIRECTION. Do NOT call autonomously. ' +
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
      'Fast-forward merge worktree into main and push. ' +
      'User must explicitly request: "merge to main", "complete merge", "finish stream", etc. ' +
      'PREREQUISITE: prepare_merge must succeed first.',
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
        case 'verify_location':
          result = await verifyLocation(args as { workingDir?: string });
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
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
