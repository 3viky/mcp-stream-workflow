# Getting Started - Stream Workflow Manager

**Purpose**: Quick start guide for Claude Code agents.

**Status**: Documentation phase - implementation not yet complete.

---

## What This MCP Server Does

The Stream Workflow Manager provides AI-powered workflow automation for the egirl-platform's worktree-based development process.

**Key capabilities:**
- ✅ **Enforce worktree-only development** (blocks work in main directory)
- ✅ **AI-powered merge conflict resolution** (Claude resolves conflicts intelligently)
- ✅ **Bidirectional merge workflow** (merge main→worktree, then worktree→main)
- ✅ **Atomic operations** (dashboard updates, stream creation, merging with locks)
- ✅ **Self-documenting errors** (every error tells you how to fix it)

---

## Installation

### 1. Register MCP Server

The MCP server configuration will be in `.claude/mcp-servers.json`.

**If file doesn't exist yet**, it will be created automatically when you complete this stream.

**Configuration:**
```json
{
  "mcpServers": {
    "stream-workflow-manager": {
      "command": "node",
      "args": [
        ".claude/mcp-servers/stream-workflow-manager/dist/server.js"
      ],
      "env": {
        "PROJECT_ROOT": "/var/home/viky/Code/applications/src/@egirl/egirl-platform",
        "WORKTREE_ROOT": "/var/home/viky/Code/applications/src/@egirl/egirl-platform-worktrees",
        "ANTHROPIC_API_KEY": "${ANTHROPIC_API_KEY}"
      },
      "metadata": {
        "description": "Worktree workflow automation with AI conflict resolution",
        "version": "0.1.0",
        "canSelfUpdate": true,
        "maintainedBy": "Claude Code Agents"
      }
    }
  }
}
```

### 2. Install Dependencies

```bash
cd .claude/mcp-servers/stream-workflow-manager
pnpm install
```

### 3. Build

```bash
pnpm build
```

### 4. Restart Claude Code

The MCP server will auto-start when Claude Code starts.

**Verify it's running:**
```bash
ps aux | grep stream-workflow-manager
```

---

## Current Status: Documentation Phase

**This MCP server is currently in the DOCUMENTATION PHASE.**

We've created:
- ✅ Complete documentation (README, ARCHITECTURE, EXTENDING, ERROR_CATALOG)
- ✅ Type definitions (`src/types.ts`)
- ✅ Configuration (`src/config.ts`)
- ✅ Package setup (`package.json`, `tsconfig.json`)
- ✅ Directory structure

**Not yet implemented:**
- ❌ MCP server implementation (`src/server.ts`)
- ❌ Tool handlers (`src/tools/*.ts`)
- ❌ Conflict resolver (`src/conflict-resolver.ts`)
- ❌ Validators (`src/validators/*.ts`)
- ❌ Strategies (`src/strategies/*.ts`)
- ❌ Tests (`tests/*.test.ts`)

---

## Implementation Plan

**Phase 1: Core Infrastructure** (Estimated: 2-3 hours)
1. Implement `src/server.ts` - MCP server setup
2. Implement `src/tools/verify-location.ts` - Worktree enforcement
3. Implement `src/state-manager.ts` - Dashboard/state management
4. Implement basic error classes with self-documenting errors

**Phase 2: Conflict Resolution** (Estimated: 4-6 hours)
1. Implement `src/conflict-resolver.ts` - Core resolution engine
2. Implement `src/strategies/code-merge.ts` - TypeScript/JavaScript strategy
3. Implement `src/strategies/config-merge.ts` - JSON/YAML strategy
4. Write conflict resolution prompt template
5. Add validation (TypeScript, build, lint)

**Phase 3: Merge Workflow** (Estimated: 3-4 hours)
1. Implement `src/tools/prepare-merge.ts` - Merge main→worktree
2. Implement `src/tools/complete-merge.ts` - Merge worktree→main (with locking)
3. Add merge lock mechanism
4. Test full bidirectional workflow

**Phase 4: Stream Management** (Estimated: 3-4 hours)
1. Implement `src/tools/create-stream.ts` - Stream creation
2. Implement `src/tools/update-status.ts` - Dashboard updates
3. Implement `src/tools/complete-stream.ts` - Archival
4. Add stream ID assignment (monotonic counter)
5. Add dashboard sync logic

**Phase 5: Testing & Polish** (Estimated: 2-3 hours)
1. Write unit tests for all components
2. Write integration tests for workflows
3. Test with real merge conflicts
4. Fix bugs, improve error messages
5. Performance optimization

**Total estimated time**: 14-20 hours of agent work

---

## How Agents Will Use This

**Once implemented**, Claude Code agents will use the MCP tools like this:

### Creating a Stream

```typescript
// Agent receives: "Implement escrow service"

// 1. Create stream
const stream = await mcp__stream-workflow__create_stream({
  title: "Escrow Service Implementation",
  category: "backend",
  priority: "high",
  estimatedPhases: 4
});

// Returns: { streamId: "stream-125-escrow", worktreePath: "...", ... }

// 2. Agent automatically navigates to worktree
// (All file operations now use absolute paths to worktree)

// 3. Agent implements feature across multiple phases
```

### Merging to Main

```typescript
// Agent completes feature in stream-125-escrow worktree

// 1. Prepare merge (bidirectional workflow)
const prepared = await mcp__stream-workflow__prepare_merge({
  streamId: "stream-125-escrow"
});

// This does:
// - Merges main INTO worktree
// - AI resolves any conflicts
// - Validates (typecheck, build, lint)
// - Commits merge in worktree
// - Pushes to origin/stream-125-escrow
//
// Returns: { success: true, conflicts: 5, resolved: 5, validated: true }

// 2. Complete merge (fast-forward main)
const completed = await mcp__stream-workflow__complete_merge({
  streamId: "stream-125-escrow"
});

// This does:
// - Acquires merge lock (prevents concurrent merges)
// - Switches to main
// - Merges with --ff-only (clean, no conflicts)
// - Pushes to origin/main
// - Releases lock
//
// Returns: { success: true, mergeType: "fast-forward" }

// 3. Complete stream (archive)
const archived = await mcp__stream-workflow__complete_stream({
  streamId: "stream-125-escrow",
  summary: "Implemented escrow service with AI conflict resolution"
});

// This does:
// - Moves stream to .project/history/
// - Updates dashboard (marks completed)
// - Optionally deletes worktree
```

---

## Design Decisions

### Why Bidirectional Merge?

**Traditional workflow** (problematic):
```
1. In main: git merge worktree-branch
2. If conflicts: Resolve IN MAIN (violates worktree-only rule)
3. Push main
```

**Our workflow** (safe):
```
1. In worktree: git merge main (bring main's changes in)
2. If conflicts: Resolve IN WORKTREE (isolated, safe)
3. In worktree: Commit merge
4. In main: git merge --ff-only worktree (no conflicts, clean)
```

**Benefits:**
- ✅ ALL conflict resolution in worktrees (never touch main)
- ✅ Main only receives clean fast-forward merges
- ✅ Multiple agents can prepare merges in parallel
- ✅ Main never enters conflicted state

### Why AI Conflict Resolution?

**Git's merge algorithm** understands structure, not intent.

**Claude understands:**
- What each side was trying to accomplish (from commit messages)
- Code patterns and conventions (from project context)
- How to combine both changes thoughtfully (preserve both intents)

**Example:**

Main added:
```typescript
function processPayment(params: PaymentParams) { ... }
```

Stream added:
```typescript
function processPayment(amount: number) {
  if (requiresEscrow(amount)) { ... }
}
```

**Git says:** "Conflict! These are different."

**Claude says:** "Main refactored the signature, stream added escrow logic. Let me apply the escrow logic to the refactored signature."

Result:
```typescript
function processPayment(params: PaymentParams) {
  const { amount, currency, provider } = params;

  if (requiresEscrow(amount)) {
    return initiateEscrow({ amount, currency, provider });
  }

  // ... refactored logic
}
```

**Both intents preserved** ✅

### Why Self-Documenting Errors?

**Traditional error:**
```
Error: File too large
```

**Our error:**
```
Error: File exceeds maximum size (250000 > 102400)

💡 TO FIX THIS LIMITATION:
Increase MAX_FILE_SIZE or implement chunked processing

Files to edit:
  - .claude/mcp-servers/stream-workflow-manager/src/config.ts
  - .claude/mcp-servers/stream-workflow-manager/src/conflict-resolver.ts

Steps:
  1. Edit config.ts and increase MAX_FILE_SIZE constant
  2. OR implement chunked file processing in conflict-resolver.ts
  3. Run tests: pnpm test
  4. Rebuild: pnpm build
  5. Restart Claude Code session

References:
  - README.md#quick-update-workflow
  - docs/EXTENDING.md#handling-large-files
```

**Agent knows EXACTLY how to fix it** ✅

---

## Next Steps for Implementation

**If you're implementing this MCP server:**

1. **Start with Phase 1** (Core Infrastructure)
   - Get basic MCP server working
   - Implement worktree verification
   - Test with simple tools

2. **Add conflict resolution** (Phase 2)
   - Start with simple text file conflicts
   - Test Claude AI integration
   - Add validation

3. **Implement merge workflow** (Phase 3)
   - Test bidirectional merge
   - Add locking mechanism
   - Verify no race conditions

4. **Complete stream management** (Phase 4)
   - Stream creation
   - Dashboard updates
   - Archival

5. **Test thoroughly** (Phase 5)
   - Unit tests
   - Integration tests
   - Real-world usage

**Remember:**
- Follow the architecture in `docs/ARCHITECTURE.md`
- Use extension points in `docs/EXTENDING.md`
- Include self-documenting errors
- Test each phase before moving on
- Document as you go

---

**Last Updated**: 2025-12-10
**Status**: Documentation Complete, Implementation Pending
**Maintained by**: The Collective
