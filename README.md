# Stream Workflow Manager MCP Server

AI-powered worktree workflow automation for egirl-platform.

**Version**: 0.2.0
**Status**: Production Ready

> **🤖 Automated Releases:** This package uses conventional commits for automatic versioning. Push commits with `feat:` or `fix:` prefixes to trigger releases. See [COMMIT_CONVENTION.md](.github/COMMIT_CONVENTION.md)

---

## Overview

Stream Workflow Manager is a Model Context Protocol (MCP) server that automates git worktree workflows for Claude Code agents. It enforces safe development practices, provides AI-powered conflict resolution, and manages parallel development streams.

### Key Features

- **Worktree Enforcement**: Automatically blocks file modifications in main directory, guides agents to create isolated worktrees
- **Stream Lifecycle Management**: Creates, tracks, and archives development streams with progress monitoring
- **AI-Powered Merge Resolution**: Uses Claude to intelligently resolve merge conflicts with context-aware strategies
- **Concurrency Control**: Prevents merge conflicts through atomic operations and locking
- **Validation Pipeline**: Runs TypeScript, build, and lint checks after conflict resolution
- **Post-Compaction Recovery**: Maintains active stream context that survives Claude Code context compaction

---

## Post-Compaction Recovery (v0.3.0+)

When Claude Code compacts context (during long sessions or after breaks), agents may lose awareness of which worktree they should be working in. This can cause the agent to accidentally work in the main directory.

### The Problem

After compaction, agents might:
1. Forget they were working in a worktree
2. Start making changes in the main directory
3. Cause merge conflicts or lost work

### The Solution

The MCP server tracks **multiple active streams** that persist across compaction:

```typescript
// After starting a stream, context is automatically saved
await mcp__stream-workflow__start_stream({ ... });
// Stream is now tracked as active

// Multiple streams can be active simultaneously!
await mcp__stream-workflow__start_stream({ title: "Feature A", ... });
await mcp__stream-workflow__start_stream({ title: "Feature B", ... });

// After compaction or session resume, recover context:
await mcp__stream-workflow__get_active_context();
// Returns: list of ALL active streams if in main, or current stream if in worktree
```

### Multi-Stream Support

The system supports multiple simultaneous active streams:
- Each `start_stream` call adds to the active streams list
- `get_active_context` lists ALL active streams when called from main
- Streams sorted by "last accessed" to help identify most relevant
- `complete_stream` removes only that specific stream from tracking

### When to Use

| Scenario | Tool to Call |
|----------|-------------|
| After "let's continue" or session resume | `get_active_context` |
| After context compaction message | `get_active_context` |
| Before making file modifications | `verify_location` |
| Unsure which stream you're working on | `get_active_context` |

### Example Response - Multiple Streams

When in main directory with multiple active streams:
```
⚠️ IN MAIN DIRECTORY - SELECT A STREAM

Current Directory: /path/to/main
Status: DO NOT MODIFY FILES HERE

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ACTIVE STREAMS (3)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  1. stream-1502-api-refactor ← MOST RECENT
     Path: /path/to/worktrees/stream-1502-api-refactor
     Last: 12/14/2025, 3:45:00 PM

  2. stream-1501-auth-system
     Path: /path/to/worktrees/stream-1501-auth-system
     Last: 12/14/2025, 2:30:00 PM

  3. stream-1500-ui-updates
     Path: /path/to/worktrees/stream-1500-ui-updates
     Last: 12/14/2025, 10:15:00 AM

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ACTION REQUIRED
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

To continue on most recent stream:
  cd /path/to/worktrees/stream-1502-api-refactor

Or navigate to any stream listed above.
```

---

## Installation

### Prerequisites

- Node.js 18+ and pnpm
- Claude Code CLI
- Git worktrees enabled
- Anthropic API key

### Setup

1. **Install dependencies:**

```bash
cd .claude/mcp-servers/stream-workflow-manager
pnpm install
```

2. **Configure MCP server:**

Add to `.claude/mcp-servers.json`:

```json
{
  "stream-workflow-manager": {
    "command": "node",
    "args": [".claude/mcp-servers/stream-workflow-manager/dist/server.js"],
    "env": {
      "ANTHROPIC_API_KEY": "${ANTHROPIC_API_KEY}",
      "PROJECT_ROOT": "/path/to/your/project",
      "WORKTREE_ROOT": "/path/to/worktrees"
    }
  }
}
```

3. **Build the server:**

```bash
pnpm build
```

4. **Restart Claude Code:**

Exit and restart Claude Code to load the MCP server.

---

## Available Tools

| Tool | Description | Status |
|------|-------------|--------|
| `get_active_context` | **CRITICAL**: Recovers working context after compaction/session resume | ✅ NEW |
| `start_stream` | Initialize new stream with metadata in main, create worktree | ✅ Implemented |
| `verify_location` | Checks if current directory is a worktree, blocks operations in main | ✅ Implemented |
| `create_stream` | Creates new worktree + branch + stream tracking file | ✅ Implemented |
| `update_stream_status` | Updates stream progress in STREAM_STATUS_DASHBOARD.md | ✅ Implemented |
| `get_stream_info` | Retrieves stream metadata and current status | ✅ Implemented |
| `list_streams` | Lists all active/completed streams by category | ✅ Implemented |
| `complete_phase` | Marks stream phase as complete, updates progress | ✅ Implemented |
| `prepare_merge` | Merges main into worktree with AI conflict resolution | ✅ Implemented |
| `complete_merge` | Fast-forwards main branch (with locking) | ✅ Implemented |
| `complete_stream` | Archives stream to history, cleanup worktree | ✅ Implemented |
| `validate_stream` | Checks stream health, detects configuration issues | ✅ Implemented |
| `sync_dashboard` | Reconciles dashboard with actual worktree state | ✅ Implemented |

---

## Usage Examples

### Full Stream Lifecycle

```typescript
// Step 1: Initialize new stream (from main directory)
const initResult = await mcp__stream-workflow__start_stream({
  category: "feature",
  description: "Implement user authentication",
  scope: "Add JWT authentication middleware and login endpoint"
});

// Result: Creates metadata in main, creates worktree at stream-001
// Location: ../egirl-platform-worktrees/stream-001

// Step 2: Work in the worktree...
// (make changes, commit to branch)

// Step 3: Merge main into worktree (AI resolves conflicts)
const prepareResult = await mcp__stream-workflow__prepare_merge({
  streamId: "stream-001"
});

// Step 4: Fast-forward main (clean merge, no conflicts)
const completeResult = await mcp__stream-workflow__complete_merge({
  streamId: "stream-001"
});

// Step 5: Archive stream and cleanup
const archiveResult = await mcp__stream-workflow__complete_stream({
  streamId: "stream-001",
  outcome: "merged",
  summary: "Authentication implemented and tested"
});
```

### Creating a New Stream (Alternative Method)

```typescript
// Legacy method (if start_stream unavailable)
const result = await mcp__stream-workflow__create_stream({
  category: "feature",
  description: "Implement user authentication"
});

// Result: Creates worktree, branch, and stream tracking file
// Location: ../egirl-platform-worktrees/stream-001
```

### Merging Changes

```typescript
// Phase 1: Merge main into worktree (AI resolves conflicts)
const prepareResult = await mcp__stream-workflow__prepare_merge({
  streamId: "stream-001"
});

// Phase 2: Fast-forward main (clean merge, no conflicts)
const completeResult = await mcp__stream-workflow__complete_merge({
  streamId: "stream-001"
});
```

### Completing a Stream

```typescript
// Archive stream and cleanup
const result = await mcp__stream-workflow__complete_stream({
  streamId: "stream-001",
  outcome: "merged",
  summary: "Authentication implemented and tested"
});
```

---

## Architecture

```
stream-workflow-manager/
├── src/
│   ├── server.ts              # MCP server entry point
│   ├── config.ts              # Configuration
│   ├── types.ts               # TypeScript interfaces
│   ├── conflict-resolver.ts   # AI conflict resolution engine
│   │
│   ├── tools/                 # MCP tool implementations
│   │   ├── start-stream.ts    # Initialize stream lifecycle
│   │   ├── prepare-merge.ts
│   │   ├── complete-merge.ts
│   │   └── ...
│   │
│   ├── strategies/            # Conflict resolution strategies
│   │   ├── code-merge.ts      # TypeScript/JavaScript
│   │   ├── config-merge.ts    # JSON/YAML
│   │   └── docs-merge.ts      # Markdown
│   │
│   └── validators/            # Post-merge validation
│       ├── typescript.ts
│       ├── build.ts
│       └── lint.ts
│
├── prompts/
│   └── conflict-resolution.txt    # AI prompts
│
└── docs/
    ├── ARCHITECTURE.md        # System design
    ├── EXTENDING.md           # Extension guide
    └── ERROR_CATALOG.md       # Error reference
```

---

## Configuration

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `ANTHROPIC_API_KEY` | Yes | API key for Claude AI conflict resolution |
| `PROJECT_ROOT` | Yes | Path to main project directory |
| `WORKTREE_ROOT` | Yes | Path to worktrees parent directory |
| `DEVELOPER_MODE` | No | Enable self-modification features (see below) |

### DEVELOPER_MODE Configuration

**For regular users**: Omit this setting. It defaults to `false` (user mode).

**For MCP developers**: Enable self-modification features using either:

1. **Global configuration** (recommended for creators):
   - Create `~/.claude/mcp-config.json`:
     ```json
     {
       "developerMode": true
     }
     ```
   - Applies to all projects automatically
   - See `mcp-config.json.example` for full template

2. **Per-project configuration** (for specific projects):
   - Add to `.claude/mcp-servers.json`:
     ```json
     {
       "stream-workflow-manager": {
         "env": {
           "DEVELOPER_MODE": "true"
         }
       }
     }
     ```

**Configuration hierarchy** (highest priority first):
1. Per-project environment variable (`.claude/mcp-servers.json`)
2. Global config file (`~/.claude/mcp-config.json`)
3. Default: `false` (user mode)

**What changes when enabled:**
- MCP tool responses include self-improvement instructions
- Agents receive extension points and update workflows
- Error messages include fix instructions for the MCP server itself

See [DEVELOPMENT.md](./DEVELOPMENT.md) for complete developer guide.

### Optional Features

The MCP server supports optional features that can be enabled globally or per-project:

**Screenshot Generation** (opt-in):
- Automatically generates screenshots during `prepare_merge`
- Prevents pre-push hooks from creating uncommitted files in main
- Requires: `pnpm screenshots:quick` command in your project

Enable globally in `~/.claude/mcp-config.json`:
```json
{
  "streamWorkflow": {
    "enableScreenshots": true
  }
}
```

Or per-project via environment variable (see setup script).

See [docs/OPTIONAL_FEATURES.md](./docs/OPTIONAL_FEATURES.md) for complete details.

### Advanced Configuration

Edit `src/config.ts` to customize:

- File size limits for conflict resolution
- Timeout settings for AI operations
- AI model and token limits
- Path configurations

---

## Troubleshooting

### Server Not Starting

**Symptoms**: MCP tools not available in Claude Code

**Solutions**:
1. Check `.claude/mcp-servers.json` configuration
2. Verify `ANTHROPIC_API_KEY` is set
3. Check server logs: `~/.claude/logs/mcp-stream-workflow.log`
4. Rebuild server: `pnpm build`
5. Restart Claude Code

### Tools Not Found After Update

**Symptoms**: "Tool not found" errors after modifying server

**Cause**: MCP server caches old code

**Solution**:
```bash
# Find and kill the server process
ps aux | grep stream-workflow-manager
kill <PID>

# Restart Claude Code (will auto-restart server)
```

### Conflict Resolution Failures

**Symptoms**: AI conflict resolution fails or produces invalid code

**Solutions**:
1. Check file size (default limit: 100KB)
2. Review `prompts/conflict-resolution.txt` for your file type
3. Increase timeout in `src/config.ts`
4. Check API key has sufficient quota
5. Review error in logs for specific failure reason

### Merge Lock Timeout

**Symptoms**: "Merge lock timeout" error

**Cause**: Previous merge operation didn't release lock

**Solution**:
```bash
# Check for stale lock files
ls -la /path/to/project/.git/

# Remove stale lock (if safe)
rm /path/to/project/.git/merge.lock

# Retry operation
```

---

## How It Works

### Worktree Workflow

1. **Initialization**: start_stream creates metadata in main, then creates worktree
2. **Isolation**: Each development stream gets its own worktree
3. **Safety**: Main branch is protected, all edits happen in worktrees
4. **Merging**: Two-phase merge ensures conflicts are resolved in isolation
5. **Validation**: TypeScript, build, and lint checks run after merging
6. **Cleanup**: Completed streams are archived to `.project/history/`

### AI Conflict Resolution

When conflicts occur during `prepare_merge`:

1. **Detection**: Identifies conflicting files and conflict markers
2. **Context Gathering**: Extracts commits from both branches
3. **Strategy Selection**: Chooses appropriate resolution strategy (code/config/docs)
4. **AI Resolution**: Sends context to Claude for intelligent merging
5. **Validation**: Runs TypeScript/build/lint to verify result
6. **Commit**: Creates merge commit with resolved conflicts

### Stream States

- **active**: Work in progress
- **ready-for-merge**: Ready to merge to main
- **merged**: Successfully merged to main
- **abandoned**: Discarded without merging
- **archived**: Completed and moved to history

---

## Contributing

Contributions are welcome! See [DEVELOPMENT.md](./DEVELOPMENT.md) for:

- Development setup with `DEVELOPER_MODE=true`
- Code modification workflow
- Extension points and customization
- Testing guidelines
- Release process

---

## Support

**For users:**
- Check [ERROR_CATALOG.md](./docs/ERROR_CATALOG.md) for error solutions
- Review [ARCHITECTURE.md](./docs/ARCHITECTURE.md) for system design
- See [EXTENDING.md](./docs/EXTENDING.md) for customization

**For developers:**
- See [DEVELOPMENT.md](./DEVELOPMENT.md) for contribution guide
- Review test files in `tests/` for usage examples

---

## License

MIT

---

## Version History

**v0.1.0** (2025-12-10)
- Initial release
- Core workflow tools including start_stream
- AI conflict resolution
- Documentation suite

---

**Last Updated**: 2025-12-11
**Maintained by**: [Your Name/Organization]
