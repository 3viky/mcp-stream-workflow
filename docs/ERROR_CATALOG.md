# Error Catalog - Stream Workflow Manager

**Purpose**: Catalog of all errors with fix instructions for Claude Code agents.

**When you see an error**: Read the fix instructions below.

---

## Error Categories

1. [Location Violations](#location-violations)
2. [File Size Limitations](#file-size-limitations)
3. [Conflict Resolution Failures](#conflict-resolution-failures)
4. [Validation Failures](#validation-failures)
5. [Locking Issues](#locking-issues)
6. [Configuration Errors](#configuration-errors)

---

## Location Violations

### Error: `WorktreeViolationError: Must run from worktree`

**When it occurs**: Agent attempts to modify files while in main directory

**Why it's blocked**: Worktree-only enforcement prevents conflicts between concurrent agents

**Fix:**
```bash
# 1. Use start_stream MCP tool (recommended), or create worktree manually:
git worktree add <WORKTREE_ROOT>/stream-XX-name -b stream-XX-name

# 2. Navigate to worktree
cd <WORKTREE_ROOT>/stream-XX-name

# 3. Verify location with MCP tool
# Call verify_location MCP tool

# 4. Retry operation
```

**Note**: `<WORKTREE_ROOT>` is determined by `config.WORKTREE_ROOT`, which defaults to an XDG-compliant path:
- Linux: `~/.local/share/claude/mcp/data/stream-workflow/worktrees/<project>/`

**Files to update if this error is wrong:**
- `.claude/mcp-servers/stream-workflow-manager/src/tools/verify-location.ts`
- Detection logic may need adjustment

---

### Error: `Location verification failed: Not in expected worktree pattern`

**When it occurs**: Current directory doesn't match expected pattern

**Expected pattern**: `<WORKTREE_ROOT>/stream-*` (path from config.WORKTREE_ROOT)

**Fix:**
```bash
# Check where you are
pwd

# Use get_active_context MCP tool to see expected location
# Or navigate to correct worktree:
cd <WORKTREE_ROOT>/stream-XX-name

# Verify with MCP tool
# Call verify_location
```

**If pattern detection is wrong**, update:
- File: `src/tools/verify-location.ts`
- Function: `isWorktreePath()`
- Adjust regex pattern

---

## File Size Limitations

### Error: `File exceeds maximum size (250000 > 102400)`

**When it occurs**: Conflicted file is larger than MAX_FILE_SIZE (100KB)

**Why**: Large files consume too many AI tokens

**Fix Option 1: Increase limit** (quick)
```typescript
// File: src/config.ts
export const config = {
  MAX_FILE_SIZE: 500 * 1024,  // Increase to 500KB
  // ...
};
```

```bash
# Rebuild
cd .claude/mcp-servers/stream-workflow-manager
pnpm build

# Restart Claude Code session
```

**Fix Option 2: Implement chunked processing** (better)
```typescript
// File: src/conflict-resolver.ts
async resolveFile(file: string): Promise<void> {
  const stats = await fs.stat(file);

  if (stats.size > config.MAX_FILE_SIZE) {
    // NEW: Handle large files in chunks
    return await this.resolveFileChunked(file);
  }

  // Existing logic for normal files
  return await this.resolveFileStandard(file);
}

async resolveFileChunked(file: string): Promise<void> {
  // Implementation:
  // 1. Split file into logical chunks (functions/classes)
  // 2. Resolve each chunk separately
  // 3. Reassemble file
}
```

**References:**
- `docs/EXTENDING.md#pattern-1-handling-large-files`

---

## Conflict Resolution Failures

### Error: `Binary file conflicts not supported`

**When it occurs**: Merge has conflicted binary file (image, PDF, etc.)

**Current limitation**: AI can't resolve binary conflicts

**Workaround** (manual resolution):
```bash
# Choose one version
git checkout --ours path/to/binary/file
# OR
git checkout --theirs path/to/binary/file

# Stage resolution
git add path/to/binary/file
```

**Permanent fix** (add binary strategy):

Create `src/strategies/binary-conflict.ts`:
```typescript
export class BinaryConflictStrategy implements ConflictStrategy {
  canHandle(file: string): boolean {
    return this.isBinaryFile(file);
  }

  async resolve(context: ConflictContext): Promise<ResolutionResult> {
    // Strategy: Choose newer version by commit timestamp
    const mainTime = context.mainCommits[0]?.date || 0;
    const streamTime = context.streamCommits[0]?.date || 0;

    const chosen = streamTime > mainTime ? 'theirs' : 'ours';

    await git.checkout(['--', chosen, context.file]);

    return {
      resolved: true,
      content: null,
      strategy: 'binary-newer-wins',
      confidence: 'medium',
      reason: `Chose ${chosen} version (newer timestamp)`
    };
  }
}
```

Register in `src/conflict-resolver.ts`:
```typescript
this.strategies = [
  new CodeMergeStrategy(),
  new ConfigMergeStrategy(),
  new BinaryConflictStrategy(),  // Add here
];
```

**References:**
- `docs/EXTENDING.md#extension-point-1-conflict-strategies`

---

### Error: `Claude API returned empty resolution`

**When it occurs**: Claude's response is empty or invalid

**Possible causes:**
1. API timeout
2. File content too large for context window
3. Malformed prompt
4. API error

**Fix:**
```bash
# Check API key is set
echo $ANTHROPIC_API_KEY

# Check Claude API status
# https://status.anthropic.com

# Check file size
ls -lh path/to/conflicted/file

# If file is large, split into chunks (see above)
```

**Debug logging:**
```typescript
// File: src/conflict-resolver.ts
async resolveWithClaude(context: ConflictContext): Promise<string> {
  console.log(`[DEBUG] Resolving ${context.file} (${context.fileType})`);
  console.log(`[DEBUG] Prompt length: ${prompt.length} chars`);

  const response = await this.claude.messages.create({
    model: config.ANTHROPIC_MODEL,
    messages: [{ role: 'user', content: prompt }]
  });

  console.log(`[DEBUG] Response:`, response);

  // ... rest of logic
}
```

---

### Error: `Resolution contains conflict markers`

**When it occurs**: Claude returned code with `<<<<<<<`, `=======`, `>>>>>>>`

**Why**: Claude didn't fully resolve the conflict

**Fix:**

Improve prompt clarity in `prompts/conflict-resolution.txt`:
```
## Output Requirements

**CRITICAL**: Your output must be the COMPLETE, FULLY RESOLVED file.

- NO conflict markers (<<<<<<<, =======, >>>>>>>)
- NO explanations or commentary
- NO markdown code blocks (```typescript, etc.)
- ONLY the resolved file content

If you include conflict markers, the resolution will FAIL.
```

Or add post-processing:
```typescript
// File: src/conflict-resolver.ts
async validateResolution(content: string): Promise<void> {
  const hasMarkers =
    content.includes('<<<<<<<') ||
    content.includes('=======') ||
    content.includes('>>>>>>>');

  if (hasMarkers) {
    // Try to auto-fix (remove markers, merge sections)
    const fixed = this.autoFixMarkers(content);

    if (this.stillHasMarkers(fixed)) {
      throw new Error('Resolution still contains conflict markers after auto-fix');
    }

    return fixed;
  }

  return content;
}
```

---

## Validation Failures

### Error: `TypeScript validation failed: X errors found`

**When it occurs**: `npx tsc --noEmit` fails after conflict resolution

**Why**: Resolved code has type errors

**Fix:**

View the errors:
```bash
# In worktree
npx tsc --noEmit
```

Common issues:
1. **Import mismatch**: Claude didn't merge imports correctly
2. **Type signature mismatch**: Function signature changed in main
3. **Missing types**: New types added in main

**Manual fix**:
```bash
# Edit files with type errors
# Fix type issues
# Retry validation
```

**Improve AI resolution**:

Edit `prompts/conflict-resolution.txt`:
```
## TypeScript-Specific Rules

1. PRESERVE all imports from both sides (merge, don't replace)
2. If function signature changed: apply old logic to new signature
3. If new types added: use them correctly
4. Run type inference: understand what types are expected
```

---

### Error: `Build validation failed: pnpm build returned errors`

**When it occurs**: Build process fails after conflict resolution

**Common causes:**
- Missing dependencies
- Circular imports
- Invalid module exports

**Fix:**
```bash
# View build errors
cd /path/to/worktree
pnpm build

# Fix errors in source
# Retry
```

---

## Locking Issues

### Error: `Failed to acquire lock after 10 attempts`

**When it occurs**: Another agent holds merge lock for >5 minutes

**Why**: Concurrent merge operations

**Check lock status:**
```bash
# View lock info
cat .git/MERGE_LOCK/pid
cat .git/MERGE_LOCK/timestamp
cat .git/MERGE_LOCK/branch

# Check if process still alive
ps -p $(cat .git/MERGE_LOCK/pid)
```

**If process is dead** (stale lock):
```bash
# Remove stale lock
rm -rf .git/MERGE_LOCK
```

**If process is alive**:
- Wait for it to finish
- Check with user if multiple agents are running
- Verify lock timeout in config

**Adjust timeout:**
```typescript
// File: src/config.ts
export const config = {
  LOCK_MAX_RETRIES: 20,  // Increase from 10
  LOCK_RETRY_INTERVAL: 30000,  // 30s
  // ...
};
```

---

### Error: `Dashboard update failed: Lock timeout`

**When it occurs**: Can't update STREAM_STATUS_DASHBOARD.md due to lock

**Similar to merge lock** - follow same troubleshooting

**Check:**
```bash
ls -la .project/.dashboard.lock
```

---

## Configuration Errors

### Error: `ANTHROPIC_API_KEY not set`

**When it occurs**: MCP server starts without API key

**Fix:**

Add to `.claude/mcp-servers.json`:
```json
{
  "mcpServers": {
    "stream-workflow-manager": {
      "env": {
        "ANTHROPIC_API_KEY": "${ANTHROPIC_API_KEY}"
      }
    }
  }
}
```

Or set globally:
```bash
export ANTHROPIC_API_KEY="sk-ant-..."
```

---

### Error: `PROJECT_ROOT not found`

**When it occurs**: MCP server can't locate egirl-platform repository

**Fix:**

Set in `.claude/mcp-servers.json`:
```json
{
  "mcpServers": {
    "stream-workflow-manager": {
      "env": {
        "PROJECT_ROOT": "/path/to/your/project"
      }
    }
  }
}
```

**Note**: `WORKTREE_ROOT` defaults to XDG-compliant location based on PROJECT_ROOT name.
Only override if you need a custom worktree location.

Or update `src/config.ts` defaults:
```typescript
export const config = {
  PROJECT_ROOT: process.env.PROJECT_ROOT || '/correct/path/to/egirl-platform',
  WORKTREE_ROOT: process.env.WORKTREE_ROOT || '/correct/path/to/worktrees',
};
```

---

## MCP Protocol Errors

### Error: `Tool not found: mcp__stream-workflow__*`

**When it occurs**: Claude Code can't find MCP tool

**Causes:**
1. MCP server not registered
2. Server not running
3. Server crashed on startup

**Fix:**

**1. Check registration:**
```bash
cat .claude/mcp-servers.json
# Should contain "stream-workflow-manager" entry
```

**2. Check if server is running:**
```bash
ps aux | grep stream-workflow-manager
```

**3. Check server logs:**
```bash
# Logs shown when Claude Code starts
# Look for errors in server.ts
```

**4. Restart Claude Code:**
```bash
# Exit and restart Claude Code CLI
# MCP servers auto-start
```

---

### Error: `MCP server crashed: Cannot find module`

**When it occurs**: Server tries to import missing dependency

**Fix:**
```bash
cd .claude/mcp-servers/stream-workflow-manager

# Install dependencies
pnpm install

# Rebuild
pnpm build

# Restart Claude Code
```

---

## Adding New Errors

**When you encounter a new error**, add it to this catalog:

1. **Document the error**:
   - When it occurs
   - Why it happens
   - How to fix it

2. **Add fix instructions to error class**:
```typescript
throw new SelfDocumentingError(
  'Your new error message',
  {
    summary: 'One-line fix summary',
    files: ['file1.ts', 'file2.ts'],
    steps: ['Step 1', 'Step 2', 'Step 3'],
    references: ['docs/EXTENDING.md#section']
  }
);
```

3. **Update this catalog**:
   - Add error to relevant section
   - Include code examples
   - Link to references

4. **Merge the improvement** so future agents benefit

---

**Last Updated**: 2025-12-10
**Maintained by**: The Collective
