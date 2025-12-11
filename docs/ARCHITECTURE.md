# Architecture - Stream Workflow Manager

**Purpose**: Explain how the MCP server works internally.

**Audience**: Claude Code agents who need to understand or modify the system.

---

## System Design

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Claude Code Agent                        │
│  (Receives user request: "Implement feature X")             │
└────────────────────────┬────────────────────────────────────┘
                         │
                         │ Uses MCP tools
                         ▼
┌─────────────────────────────────────────────────────────────┐
│              Stream Workflow Manager MCP Server             │
│                                                             │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐        │
│  │   Tools     │  │  Conflict   │  │   State     │        │
│  │  (12 tools) │  │  Resolver   │  │  Manager    │        │
│  └─────────────┘  └─────────────┘  └─────────────┘        │
│         │                  │                 │             │
│         └──────────────────┴─────────────────┘             │
│                            │                               │
└────────────────────────────┼───────────────────────────────┘
                             │
                             │ Modifies
                             ▼
┌─────────────────────────────────────────────────────────────┐
│                 egirl-platform Repository                   │
│                                                             │
│  ┌──────────────────────────┐  ┌─────────────────────────┐ │
│  │ Main Directory           │  │ Worktrees               │ │
│  │ (Read-only for agents)   │  │ (All work happens here) │ │
│  │                          │  │                         │ │
│  │ - .project/              │  │ stream-12-escrow/       │ │
│  │   - STREAM_STATUS_       │  │ stream-15-payments/     │ │
│  │     DASHBOARD.md         │  │ mcp-enhancement/        │ │
│  │   - plan/streams/        │  │ ...                     │ │
│  │   - history/             │  │                         │ │
│  └──────────────────────────┘  └─────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

---

## Core Components

### 1. MCP Server (`src/server.ts`)

**Responsibilities:**
- Register tools with Model Context Protocol
- Handle tool invocation requests
- Return structured responses
- Include self-improvement metadata in responses

**Key Code:**
```typescript
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

const server = new Server({
  name: 'stream-workflow-manager',
  version: '0.1.0'
}, {
  capabilities: {
    tools: {}
  }
});

// Register all tools
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    { name: 'prepare_merge', description: '...' },
    { name: 'complete_merge', description: '...' },
    // ... 10 more tools
  ]
}));

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  switch (name) {
    case 'prepare_merge':
      return await handlePrepareMerge(args);
    case 'complete_merge':
      return await handleCompleteMerge(args);
    // ...
  }
});
```

### 2. Conflict Resolver (`src/conflict-resolver.ts`)

**Responsibilities:**
- Detect conflicted files after merge
- Delegate to appropriate strategy
- Fallback to Claude AI for complex conflicts
- Validate resolution (no conflict markers)

**Architecture:**
```typescript
class ConflictResolver {
  private strategies: ConflictStrategy[];
  private claude: Anthropic;

  async resolveConflicts(streamId: string): Promise<ResolutionResult> {
    // 1. Get list of conflicted files
    const conflicted = await this.getConflictedFiles();

    // 2. For each file, find appropriate strategy
    for (const file of conflicted) {
      const strategy = this.findStrategy(file);

      if (strategy) {
        // Use specialized strategy
        await strategy.resolve(context);
      } else {
        // Fallback to Claude AI
        await this.resolveWithClaude(file);
      }
    }

    // 3. Validate all resolutions
    await this.validateResolutions(conflicted);

    return { resolved: conflicted, failed: [] };
  }
}
```

**Strategy Selection:**
```typescript
interface ConflictStrategy {
  name: string;
  canHandle(file: string, context: ConflictContext): boolean;
  resolve(context: ConflictContext): Promise<ResolutionResult>;
}

// Example strategies:
class CodeMergeStrategy implements ConflictStrategy {
  canHandle(file: string) {
    return /\.(ts|tsx|js|jsx)$/.test(file);
  }

  async resolve(context: ConflictContext) {
    // Use Claude with code-specific prompt
    return await this.resolveWithClaude(context, 'code-merge-prompt');
  }
}

class ConfigMergeStrategy implements ConflictStrategy {
  canHandle(file: string) {
    return /\.(json|yaml|yml)$/.test(file);
  }

  async resolve(context: ConflictContext) {
    // Structural merge: combine both objects
    return await this.mergeConfigObjects(context);
  }
}
```

### 3. State Manager (`src/state-manager.ts`)

**Responsibilities:**
- Manage stream counter (monotonic ID assignment)
- Atomic dashboard updates (file locking)
- Stream metadata caching
- Worktree registry

**State Storage:**
```typescript
// .project/.stream-state.json
{
  "nextStreamId": 125,
  "streams": {
    "stream-12-escrow": {
      "id": 12,
      "title": "Escrow Service Implementation",
      "status": "active",
      "worktreePath": "/var/home/.../egirl-platform-worktrees/stream-12-escrow",
      "branch": "stream-12-escrow",
      "createdAt": "2025-12-10T14:00:00Z",
      "phases": 4,
      "currentPhase": 2
    }
  },
  "lock": null
}
```

**Locking Mechanism:**
```typescript
class StateManager {
  private lockFile = '.project/.stream-state.lock';

  async withLock<T>(fn: () => Promise<T>): Promise<T> {
    // 1. Acquire lock (mkdir - atomic on all filesystems)
    await this.acquireLock();

    try {
      // 2. Execute operation
      return await fn();
    } finally {
      // 3. Release lock (always, even on error)
      await this.releaseLock();
    }
  }

  async updateDashboard(streamId: string, updates: Partial<Stream>) {
    return this.withLock(async () => {
      // Read current state
      const state = await this.loadState();

      // Apply updates
      state.streams[streamId] = { ...state.streams[streamId], ...updates };

      // Write atomically
      await this.saveState(state);

      // Update STREAM_STATUS_DASHBOARD.md
      await this.syncDashboard(state);
    });
  }
}
```

### 4. Tool Implementations (`src/tools/*.ts`)

Each tool is a separate module that handles one MCP tool:

**Example: `src/tools/prepare-merge.ts`**
```typescript
export async function prepareMerge(args: PrepareMergeArgs): Promise<MCPResponse> {
  const { streamId } = args;

  // 1. Verify we're in worktree
  const location = await verifyWorktreeLocation();
  if (!location.isValid) {
    throw new WorktreeViolationError(
      'Must run from worktree',
      {
        files: ['.git-hooks/verify-worktree-location'],
        steps: ['Create worktree', 'Navigate to worktree'],
        references: ['README.md#quick-update-workflow']
      }
    );
  }

  // 2. Fetch latest main
  await git.fetch('origin', 'main');

  // 3. Attempt merge
  try {
    await git.merge(['origin/main', '--no-commit', '--no-ff']);
  } catch (error) {
    // Merge has conflicts, that's OK - we'll resolve them
  }

  // 4. Check for conflicts
  const status = await git.status();

  if (status.conflicted.length > 0) {
    console.log(`Detected ${status.conflicted.length} conflicts`);

    // 5. AI resolves conflicts
    const resolver = new ConflictResolver(location.currentPath);
    const result = await resolver.resolveConflicts(streamId);

    // 6. Commit merge
    await git.commit(
      `Merge main into ${streamId}\n\n` +
      `Auto-resolved conflicts:\n${result.resolved.map(f => `  - ${f}`).join('\n')}\n\n` +
      `🤖 Resolved by Claude Code AI`
    );
  } else {
    // Clean merge
    await git.commit(`Merge main into ${streamId}`);
  }

  // 7. Validate
  await runValidators(location.currentPath);

  // 8. Push
  await git.push('origin', streamId);

  // 9. Return success with metadata
  return {
    content: [{
      type: 'text',
      text: JSON.stringify({
        success: true,
        conflicts: status.conflicted,
        resolved: result?.resolved || [],
        validated: true
      }, null, 2)
    }],
    _meta: {
      tool: 'prepare_merge',
      version: '0.1.0',
      sourceLocation: {
        this_tool: '.claude/mcp-servers/stream-workflow-manager/src/tools/prepare-merge.ts',
        conflict_resolver: '.claude/mcp-servers/stream-workflow-manager/src/conflict-resolver.ts'
      },
      updateInstructions: { /* ... */ }
    }
  };
}
```

---

## Data Flow

### Stream Creation Flow

```
Agent: "create stream for escrow implementation"
  │
  ▼
mcp__stream-workflow__create_stream({
  title: "Escrow Service Implementation",
  category: "backend",
  priority: "high"
})
  │
  ▼
StateManager.withLock(async () => {
  // 1. Assign next stream ID (atomic)
  const streamId = state.nextStreamId++;  // 12

  // 2. Create worktree
  await git.worktree.add(
    '../egirl-platform-worktrees/stream-12-escrow',
    '-b', 'stream-12-escrow'
  );

  // 3. Initialize stream file
  await createStreamFile(streamId, {
    title: "Escrow Service Implementation",
    category: "backend",
    phases: [
      "Database Schema",
      "API Endpoints",
      "Integration Tests",
      "Documentation"
    ]
  });

  // 4. Update dashboard
  await updateDashboard(streamId, {
    status: 'active',
    progress: 0,
    currentPhase: null
  });

  return { streamId: 'stream-12-escrow', worktreePath: '...' };
})
```

### Merge Preparation Flow

```
Agent: "ready to merge stream-12-escrow"
  │
  ▼
mcp__stream-workflow__prepare_merge({ streamId: "stream-12-escrow" })
  │
  ▼
IN WORKTREE (stream-12-escrow):
  │
  ├─ git fetch origin main
  ├─ git merge origin/main --no-commit --no-ff
  │
  ├─ CONFLICTS DETECTED: ["services/api/src/payment/service.ts"]
  │
  ├─ ConflictResolver.resolve():
  │   ├─ Read both versions (ours, theirs)
  │   ├─ Read commit history for context
  │   ├─ Find strategy: CodeMergeStrategy.canHandle() → true
  │   ├─ CodeMergeStrategy.resolve():
  │   │   ├─ Build prompt with both versions + context
  │   │   ├─ Call Claude AI:
  │   │   │     "Merge these two versions thoughtfully.
  │   │   │      Main added: PaymentProvider abstraction
  │   │   │      Stream added: Escrow integration
  │   │   │      Combine both features..."
  │   │   ├─ Claude returns: merged code
  │   │   └─ Write to file
  │   └─ git add services/api/src/payment/service.ts
  │
  ├─ Validate resolution:
  │   ├─ TypeScriptValidator: npx tsc --noEmit ✓
  │   ├─ BuildValidator: pnpm build --dry-run ✓
  │   └─ LintValidator: pnpm lint ✓
  │
  ├─ git commit -m "Merge main into stream-12-escrow [auto-resolved]"
  ├─ git push origin stream-12-escrow
  │
  └─ Return: { success: true, ready: true }
```

### Merge Completion Flow

```
Agent: "stream is prepared, merge to main"
  │
  ▼
mcp__stream-workflow__complete_merge({ streamId: "stream-12-escrow" })
  │
  ▼
StateManager.withMergeLock(async () => {
  // Lock prevents concurrent merges

  IN MAIN DIRECTORY:
    ├─ Verify main is clean (no uncommitted changes)
    ├─ git checkout main
    ├─ git pull origin main
    ├─ git merge --ff-only stream-12-escrow
    │   └─ Fast-forward (no conflicts, already resolved in worktree)
    ├─ git push origin main
    └─ Return: { success: true, mergeType: 'fast-forward' }
})
```

---

## Self-Improvement System

### Error Message Architecture

Every error includes fix instructions:

```typescript
class SelfDocumentingError extends Error {
  constructor(
    message: string,
    public fixInstructions: {
      summary: string;
      files: string[];
      steps: string[];
      references: string[];
    }
  ) {
    super(
      `${message}\n\n` +
      `💡 TO FIX THIS LIMITATION:\n` +
      `${fixInstructions.summary}\n\n` +
      `Files to edit:\n${fixInstructions.files.map(f => `  - ${f}`).join('\n')}\n\n` +
      `Steps:\n${fixInstructions.steps.map((s, i) => `  ${i+1}. ${s}`).join('\n')}\n\n` +
      `References:\n${fixInstructions.references.map(r => `  - ${r}`).join('\n')}`
    );
  }
}

// Usage
throw new SelfDocumentingError(
  'File exceeds maximum size (250KB > 100KB)',
  {
    summary: 'Increase MAX_FILE_SIZE or implement chunked processing',
    files: [
      '.claude/mcp-servers/stream-workflow-manager/src/config.ts',
      '.claude/mcp-servers/stream-workflow-manager/src/conflict-resolver.ts'
    ],
    steps: [
      'Edit config.ts and increase MAX_FILE_SIZE constant',
      'OR implement chunked file processing in conflict-resolver.ts',
      'Run tests: pnpm test',
      'Rebuild: pnpm build',
      'Restart Claude Code session'
    ],
    references: [
      'README.md#quick-update-workflow',
      'docs/EXTENDING.md#handling-large-files'
    ]
  }
);
```

### Response Metadata

Every tool response includes:

```typescript
{
  content: [{ type: 'text', text: '{ /* result */ }' }],

  _meta: {
    tool: 'prepare_merge',
    version: '0.1.0',

    sourceLocation: {
      repository: '/var/home/viky/Code/applications/src/@egirl/egirl-platform',
      mcp_server: '.claude/mcp-servers/stream-workflow-manager/',
      files: {
        server: 'src/server.ts',
        this_tool: 'src/tools/prepare-merge.ts',
        conflict_resolver: 'src/conflict-resolver.ts'
      }
    },

    updateInstructions: {
      summary: 'Create worktree, edit source, test, merge',
      workflow: [
        '1. git worktree add ../egirl-platform-worktrees/mcp-enhancement -b mcp-enhancement',
        '2. cd ../egirl-platform-worktrees/mcp-enhancement/.claude/mcp-servers/stream-workflow-manager',
        '3. Edit files, run tests (pnpm test), build (pnpm build)',
        '4. Restart Claude Code session',
        '5. Merge to main'
      ]
    },

    limitations: {
      known: [
        'Binary files not supported',
        'Max file size: 100KB',
        'Requires ANTHROPIC_API_KEY'
      ]
    },

    extensionPoints: {
      strategies: 'src/strategies/',
      validators: 'src/validators/',
      prompts: 'prompts/'
    }
  },

  _note_to_agent: {
    capability: 'AI-powered merge conflict resolution',
    if_you_need: {
      binary_support: 'Create src/strategies/binary-conflict.ts',
      larger_files: 'Increase MAX_FILE_SIZE in src/config.ts',
      custom_strategy: 'Add to src/strategies/'
    }
  }
}
```

---

## Concurrency and Safety

### File Locking

**Dashboard updates** (`.project/STREAM_STATUS_DASHBOARD.md`):
```typescript
async updateDashboard(updates) {
  // 1. Create lock directory (atomic)
  await fs.mkdir('.project/.dashboard.lock');

  try {
    // 2. Read current state
    const content = await fs.readFile('.project/STREAM_STATUS_DASHBOARD.md');

    // 3. Apply updates
    const updated = applyUpdates(content, updates);

    // 4. Write atomically (write to temp, then rename)
    await fs.writeFile('.project/STREAM_STATUS_DASHBOARD.md.tmp', updated);
    await fs.rename(
      '.project/STREAM_STATUS_DASHBOARD.md.tmp',
      '.project/STREAM_STATUS_DASHBOARD.md'
    );
  } finally {
    // 5. Release lock (always)
    await fs.rmdir('.project/.dashboard.lock');
  }
}
```

**Merge locking** (`.git/MERGE_LOCK`):
```typescript
async completeMerge(streamId) {
  const lockDir = '.git/MERGE_LOCK';

  // Retry logic (30s intervals, max 10 attempts)
  for (let i = 0; i < 10; i++) {
    try {
      await fs.mkdir(lockDir);
      // Lock acquired!
      break;
    } catch (error) {
      // Lock exists, check if stale
      const lockPid = await fs.readFile(`${lockDir}/pid`);
      const isAlive = await processExists(lockPid);

      if (!isAlive) {
        // Stale lock, remove it
        await fs.rmdir(lockDir, { recursive: true });
        continue;
      }

      // Lock is active, wait and retry
      await sleep(30000);
    }
  }

  try {
    // Perform merge in main
    await doMerge(streamId);
  } finally {
    // Always release lock
    await fs.rmdir(lockDir, { recursive: true });
  }
}
```

### Race Condition Prevention

**Stream ID assignment**:
```typescript
async createStream(title) {
  return StateManager.withLock(async () => {
    const state = await loadState();

    // Monotonic counter (never reuses IDs)
    const streamId = state.nextStreamId++;

    await saveState(state);

    return { id: streamId, name: `stream-${streamId}-${slugify(title)}` };
  });
}
```

**No race conditions** because:
- File lock prevents concurrent reads/writes
- State loaded → modified → saved within lock
- Other agents wait for lock to release

---

## Testing Strategy

### Unit Tests

**Test each component in isolation:**

```typescript
// tests/conflict-resolver.test.ts
describe('ConflictResolver', () => {
  it('should resolve TypeScript conflicts', async () => {
    const resolver = new ConflictResolver('/tmp/test-repo');

    // Mock git status
    mockGit.status.returns({
      conflicted: ['src/service.ts']
    });

    // Mock file contents
    mockFs.readFile.returns(conflictedContent);

    // Mock Claude API
    mockClaude.messages.create.returns({
      content: [{ type: 'text', text: resolvedContent }]
    });

    const result = await resolver.resolveConflicts('stream-12');

    expect(result.resolved).toContain('src/service.ts');
    expect(mockFs.writeFile).toHaveBeenCalledWith('src/service.ts', resolvedContent);
  });
});
```

### Integration Tests

**Test complete workflows:**

```typescript
// tests/integration/merge-workflow.test.ts
describe('Merge Workflow', () => {
  it('should complete full merge workflow', async () => {
    // 1. Create test stream
    const stream = await createStream({ title: 'Test Feature' });

    // 2. Make conflicting changes
    await makeChangesInMain();
    await makeChangesInStream(stream.id);

    // 3. Prepare merge (should resolve conflicts)
    const prepared = await prepareMerge({ streamId: stream.id });
    expect(prepared.success).toBe(true);
    expect(prepared.conflicts.length).toBeGreaterThan(0);
    expect(prepared.resolved.length).toBe(prepared.conflicts.length);

    // 4. Complete merge (should fast-forward)
    const completed = await completeMerge({ streamId: stream.id });
    expect(completed.success).toBe(true);
    expect(completed.mergeType).toBe('fast-forward');

    // 5. Verify main has both changes
    const mainContent = await readFileInMain('src/feature.ts');
    expect(mainContent).toContain('change from main');
    expect(mainContent).toContain('change from stream');
  });
});
```

---

## Performance Considerations

### Conflict Resolution

**Current**: Sequential (one file at a time)
- **Pros**: Simpler, maintains context between files
- **Cons**: Slower for many conflicts

**Future Enhancement**: Parallel resolution
```typescript
// Resolve conflicts in parallel
const results = await Promise.all(
  conflicted.map(file => this.resolveFile(file, streamId))
);
```

### Dashboard Updates

**Current**: Read full file, modify, write back
- **Pros**: Simple, works with markdown
- **Cons**: Slower for large dashboards

**Future Enhancement**: Append-only log + materialized view
```typescript
// Append change to log (fast)
await appendToLog({ streamId, updates });

// Rebuild dashboard asynchronously
debounce(() => rebuildDashboard(), 5000);
```

---

## Security Considerations

### API Key Handling

**ANTHROPIC_API_KEY** must be:
- Set in environment variables
- Never logged
- Never in git repository

```typescript
const apiKey = process.env.ANTHROPIC_API_KEY;
if (!apiKey) {
  throw new Error(
    'ANTHROPIC_API_KEY not set\n\n' +
    'Add to .claude/mcp-servers.json:\n' +
    '"env": { "ANTHROPIC_API_KEY": "${ANTHROPIC_API_KEY}" }'
  );
}
```

### Code Injection Prevention

**Conflict resolution prompts** include code from both sides:
- Never use `eval()` or `Function()`
- Never execute resolved code
- Validate TypeScript syntax after resolution

```typescript
// After Claude returns resolved code:
await validateSyntax(resolved);  // npx tsc --noEmit
await scanForMalicious(resolved);  // Basic security scan
```

---

## Future Enhancements

**Planned Features:**

1. **Dependency Tracking** - Block merge if dependencies not met
2. **Stream Templates** - Pre-filled phases for common patterns
3. **Conflict Analytics** - Learn which strategies work best
4. **Binary File Support** - Handle images, videos, etc.
5. **Parallel Resolution** - Faster conflict resolution
6. **Web UI** - Visualize streams and progress

See: `docs/ROADMAP.md` (to be created)

---

**Last Updated**: 2025-12-10
**Maintained by**: The Collective
