import { MCPToolHandler, MCPResponse } from '../types';
import { verifyWorktreeLocation } from './verify-location';
import { WorktreeViolationError } from '../types';

/**
 * TODO: Rename this to match your tool
 * Example: rollbackMerge, exportStreamHistory, analyzeConflicts, etc.
 */
export const myTool: MCPToolHandler = async (args) => {
  // STEP 1: ALWAYS verify we're in a worktree
  // This is CRITICAL - prevents working in main directory
  const location = await verifyWorktreeLocation();
  if (!location.isValid) {
    throw new WorktreeViolationError('This tool must run from a worktree');
  }

  // TODO: Extract and validate arguments
  // const { argName } = args;
  // if (!argName) {
  //   throw new Error('argName is required');
  // }

  // STEP 2: Your tool logic here
  // TODO: Implement your tool
  //
  // REMEMBER: You're in a WORKTREE (location.currentPath)
  // - All file operations happen here
  // - Git operations happen here
  // - NO operations in main directory
  //
  // Examples:
  // - Read files: await fs.readFile(path.join(location.currentPath, 'file.ts'))
  // - Git operations: await git.log(), git.diff(), etc.
  // - Modify files: await fs.writeFile(...)
  // - Run commands: await exec('pnpm build', { cwd: location.currentPath })

  // TODO: Your implementation here
  throw new Error('Not implemented - fill in your tool logic');

  // STEP 3: Return response with self-improvement metadata
  return {
    content: [{
      type: 'text',
      text: JSON.stringify({
        success: true,
        // TODO: Add your result data here
      }, null, 2)
    }],

    // Self-improvement metadata - tells agents how to update this tool
    _meta: {
      tool: 'my_tool',  // TODO: Change to your tool name
      version: '0.1.0',
      sourceLocation: {
        this_tool: '.claude/mcp-servers/stream-workflow-manager/src/tools/my-tool.ts'  // TODO: Update path
      },
      updateInstructions: {
        summary: 'Create worktree, edit this file, test, merge',
        workflow: [
          '1. git worktree add ../egirl-platform-worktrees/mcp-enhancement -b mcp-enhancement',
          '2. cd .claude/mcp-servers/stream-workflow-manager',
          '3. Edit src/tools/my-tool.ts',  // TODO: Update filename
          '4. pnpm test && pnpm build',
          '5. Restart Claude Code',
          '6. Merge to main'
        ]
      },
      limitations: {
        known: [
          // TODO: List any known limitations
          // 'Only works with text files',
          // 'Requires X environment variable',
        ]
      }
    },

    // Optional: Note to agent about this tool's capabilities
    _note_to_agent: {
      capability: 'TODO: What this tool does',
      if_you_need: {
        // TODO: Suggest how agents can extend this
        // 'handle_large_files': 'Implement chunked processing in resolve()',
      }
    }
  };
};
