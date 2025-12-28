# Extending the Stream Workflow Manager

**Purpose**: Guide for Claude Code agents who need to add features to this MCP server.

**When to use this**: You encounter a limitation or need custom behavior.

---

## Core Principles (Never Forget These)

### 1. ALL Changes Happen in Worktrees

**NEVER modify files in main directory. EVER.**

This applies to:
- ✅ Source code
- ✅ Configuration
- ✅ Documentation
- ✅ Scripts
- ✅ **This MCP server itself**

**To update this MCP server:**
```bash
# Use start_stream MCP tool (recommended), or manually:
git worktree add <WORKTREE_ROOT>/mcp-enhancement -b mcp-enhancement
cd <WORKTREE_ROOT>/mcp-enhancement/.claude/mcp-servers/stream-workflow-manager
# Make changes here
```

**Note**: `<WORKTREE_ROOT>` is determined by `config.WORKTREE_ROOT` (XDG-compliant by default)

### 2. Conflict Resolution Happens in Worktrees

**NEVER resolve merge conflicts in main directory.**

**Correct workflow:**
```
1. In WORKTREE: git merge main          # Bring main's changes in
2. In WORKTREE: AI resolves conflicts   # Safe, isolated
3. In WORKTREE: Commit merge            # All resolution done
4. In MAIN: git merge --ff-only         # Clean merge, no conflicts
```

**Why:** Main should never enter a conflicted state. Multiple agents can prepare merges in parallel.

### 3. Main Receives Only Clean Merges

**Main should only receive fast-forward merges.**

If `git merge --ff-only` fails, the worktree wasn't properly prepared. Go back to the worktree and fix it there.

---

## Extension Points

| What You Need | Extension Point | Template Location |
|---------------|----------------|-------------------|
| Handle new file type | Add ConflictStrategy | `templates/conflict-strategy.template.ts` |
| Custom validation | Add Validator | `templates/validator.template.ts` |
| New workflow step | Add MCP Tool | `templates/mcp-tool.template.ts` |
| Change AI behavior | Edit Prompt | `prompts/conflict-resolution.txt` |
| Adjust limits | Edit Config | `src/config.ts` |

---

## Extension Point 1: Conflict Strategies

### When to Use

You encounter a file type that isn't resolved well:
- Binary files (images, PDFs, etc.)
- Specialized formats (XML, Protobuf, etc.)
- Domain-specific files (database migrations, etc.)

### How to Add

**1. Copy template:**
```bash
cp templates/conflict-strategy.template.ts src/strategies/my-strategy.ts
```

**2. Fill in TODOs:**
- Implement `canHandle()` - When should this strategy run?
- Implement `resolve()` - How to resolve conflicts?
- **CRITICAL**: Resolution happens IN WORKTREE (you already have the conflicted file)

**3. Register in `src/conflict-resolver.ts`:**
```typescript
import { MyStrategy } from './strategies/my-strategy';

this.strategies = [
  new CodeMergeStrategy(),
  new MyStrategy(),  // Add here
];
```

**4. Test thoroughly** before merging.

**Interface:** See `src/types.ts` → `ConflictStrategy`

---

## Extension Point 2: Validators

### When to Use

You need custom validation after conflict resolution:
- Database schema checks
- API contract validation
- Custom linting rules

### How to Add

**1. Copy template:**
```bash
cp templates/validator.template.ts src/validators/my-validator.ts
```

**2. Fill in TODOs:**
- Implement `validate()` - Run your checks
- Return `ValidationResult` - Pass/fail with errors

**3. Register in `src/conflict-resolver.ts`:**
```typescript
import { MyValidator } from './validators/my-validator';

const validators = [
  new TypeScriptValidator(),
  new MyValidator(),  // Add here
];
```

**4. Add config** in `src/config.ts`:
```typescript
VALIDATORS: {
  typescript: true,
  myValidator: true,  // Enable by default
}
```

**Interface:** See `src/types.ts` → `Validator`

---

## Extension Point 3: MCP Tools

### When to Use

You need a new workflow capability:
- Rollback merge
- Export stream history
- Analyze conflicts

### How to Add

**1. Copy template:**
```bash
cp templates/mcp-tool.template.ts src/tools/my-tool.ts
```

**2. Fill in TODOs:**
- Implement tool handler
- **CRITICAL**: Enforce worktree-only (verify location first)
- Include self-documenting errors
- Add `_meta` response metadata

**3. Register in `src/server.ts`:**

```typescript
// Add to ListToolsRequestSchema handler
{
  name: 'my_tool',
  description: 'What this tool does',
  inputSchema: { /* ... */ }
}

// Add to CallToolRequestSchema handler
case 'my_tool':
  return await myTool(args);
```

**Interface:** See `src/types.ts` → `MCPToolHandler`

---

## Extension Point 4: AI Prompts

### When to Use

Claude's conflict resolution isn't making good decisions for:
- Specific file types
- Project patterns
- Domain logic

### How to Customize

**Edit `prompts/conflict-resolution.txt`:**

Add project-specific patterns:
```
## PROJECT-SPECIFIC PATTERNS:

### For Database Migrations
- NEVER merge migration timestamps
- NEVER merge schema changes
- Both migrations must run separately

### For [Your Domain]
- [Your rules here]
```

**Or create file-type specific prompts:**
```
prompts/
  conflict-resolution.txt        # Default
  migrations-conflict.txt        # For database migrations
  routes-conflict.txt            # For API routes
```

**Then use in strategy:**
```typescript
// In src/strategies/code-merge.ts
const promptFile = context.file.includes('migrations/')
  ? 'migrations-conflict.txt'
  : 'conflict-resolution.txt';
```

---

## Extension Point 5: Configuration

### When to Adjust

You need to change behavior:
- Increase file size limits
- Change timeouts
- Adjust model settings

### How to Configure

**Edit `src/config.ts`:**

All settings are documented with comments explaining:
- What the setting does
- When to change it
- What the impact is

**Example:**
```typescript
export const config = {
  // Increase if needed, or implement chunked processing
  MAX_FILE_SIZE: 500 * 1024,  // Was 100KB, now 500KB

  // Your new settings
  MY_FEATURE: {
    enabled: true,
    timeout: 30000,
  }
};
```

**Rebuild and restart** after config changes.

---

## Templates

### Conflict Strategy Template

`templates/conflict-strategy.template.ts`:
```typescript
import { ConflictStrategy, ConflictContext, ResolutionResult } from '../types';

export class MyStrategy implements ConflictStrategy {
  name = 'my-strategy';

  canHandle(file: string, context: ConflictContext): boolean {
    // TODO: Return true if this strategy should handle this file
    return false;
  }

  async resolve(context: ConflictContext): Promise<ResolutionResult> {
    // TODO: Implement your resolution logic
    //
    // Available in context:
    // - file: string (path to conflicted file)
    // - oursContent: string (main's version)
    // - theirsContent: string (stream's version)
    // - conflictContent: string (with markers)
    // - mainCommits: GitCommit[] (what main was doing)
    // - streamCommits: GitCommit[] (what stream was doing)
    //
    // REMEMBER: You're in a WORKTREE. The file is already here.
    // Write your resolved content to the file, then return success.

    throw new Error('Not implemented');
  }
}
```

### Validator Template

`templates/validator.template.ts`:
```typescript
import { Validator, ValidationResult } from '../types';

export class MyValidator implements Validator {
  name = 'my-validator';

  async validate(workingDir: string): Promise<ValidationResult> {
    // TODO: Run your validation checks
    //
    // You're IN THE WORKTREE (workingDir points to it)
    // Run commands, check files, etc.
    //
    // Return:
    // - passed: boolean
    // - errors: string[] (empty if passed)
    // - warnings: string[] (optional)
    // - details?: string (optional debug info)

    return {
      passed: true,
      errors: [],
      warnings: []
    };
  }
}
```

### MCP Tool Template

`templates/mcp-tool.template.ts`:
```typescript
import { MCPToolHandler, MCPResponse } from '../types';
import { verifyWorktreeLocation } from './verify-location';
import { WorktreeViolationError } from '../types';

export const myTool: MCPToolHandler = async (args) => {
  // STEP 1: ALWAYS verify we're in a worktree
  const location = await verifyWorktreeLocation();
  if (!location.isValid) {
    throw new WorktreeViolationError('This tool must run from a worktree');
  }

  // STEP 2: Your tool logic here
  // TODO: Implement your tool
  //
  // REMEMBER: You're in a WORKTREE (location.currentPath)
  // - All file operations happen here
  // - Git operations happen here
  // - NO operations in main directory

  // STEP 3: Return response with self-improvement metadata
  return {
    content: [{
      type: 'text',
      text: JSON.stringify({ success: true }, null, 2)
    }],
    _meta: {
      tool: 'my_tool',
      version: '0.1.0',
      sourceLocation: {
        this_tool: '.claude/mcp-servers/stream-workflow-manager/src/tools/my-tool.ts'
      },
      updateInstructions: {
        summary: 'Create worktree, edit this file, test, merge',
        workflow: [
          '1. Use start_stream MCP tool, or: git worktree add <WORKTREE_ROOT>/mcp-enhancement -b mcp-enhancement',
          '2. cd <WORKTREE_ROOT>/mcp-enhancement/.claude/mcp-servers/stream-workflow-manager',
          '3. Edit src/tools/my-tool.ts',
          '4. pnpm test && pnpm build',
          '5. Restart Claude Code',
          '6. Merge to main'
        ]
      }
    }
  };
};
```

---

## Workflow for Extensions

**Every extension follows this pattern:**

1. **Create worktree** (NEVER work in main)
   ```bash
   # Use start_stream MCP tool (recommended), or manually:
   git worktree add <WORKTREE_ROOT>/mcp-enhancement -b mcp-enhancement
   ```

2. **Navigate to MCP server in worktree**
   ```bash
   cd <WORKTREE_ROOT>/mcp-enhancement/.claude/mcp-servers/stream-workflow-manager
   ```

3. **Copy template and implement**
   ```bash
   cp templates/X.template.ts src/X/my-feature.ts
   # Edit, fill in TODOs
   ```

4. **Test**
   ```bash
   pnpm test
   pnpm build
   ```

5. **Restart Claude Code** (MCP server reloads)

6. **Validate** the tool works

7. **Merge to main** (using merge script)
   ```bash
   ../../egirl-platform/.git-hooks/merge-worktree-to-main mcp-enhancement --delete-worktree
   ```

---

## Common Mistakes to Avoid

### ❌ Working in Main Directory

**NEVER:**
```bash
cd /path/to/egirl-platform
vim .claude/mcp-servers/stream-workflow-manager/src/server.ts  # WRONG!
```

**ALWAYS:**
```bash
cd <WORKTREE_ROOT>/mcp-enhancement
vim .claude/mcp-servers/stream-workflow-manager/src/server.ts  # CORRECT
```

### ❌ Resolving Conflicts in Main

**NEVER:**
```bash
cd /path/to/egirl-platform  # Main directory
git merge worktree-branch
# Conflicts! Resolve them here? NO!
```

**ALWAYS:**
```bash
cd <WORKTREE_ROOT>/stream-XX  # Worktree
git merge main
# Conflicts! Resolve them here? YES!
```

### ❌ Skipping Worktree Verification

**NEVER:**
```typescript
export const myTool: MCPToolHandler = async (args) => {
  // Just start working...
  await modifyFiles();  // WRONG! Might be in main!
};
```

**ALWAYS:**
```typescript
export const myTool: MCPToolHandler = async (args) => {
  // Verify location FIRST
  const location = await verifyWorktreeLocation();
  if (!location.isValid) {
    throw new WorktreeViolationError('Must run from worktree');
  }

  // NOW safe to work
  await modifyFiles();
};
```

---

## Testing Your Extension

### Unit Tests

```bash
# Create test file
vim tests/my-feature.test.ts

# Run tests
pnpm test

# Run specific test
pnpm test my-feature.test.ts
```

### Integration Tests

```bash
# Create test repository
pnpm test:integration:setup

# Run integration tests
pnpm test:integration

# Cleanup
pnpm test:integration:teardown
```

### Manual Tests

```bash
# Build
pnpm build

# Restart Claude Code (MCP server reloads)

# Test your tool
mcp__stream-workflow__my_tool({ /* args */ })

# Verify it works
```

---

## Checklist Before Merging

- [ ] Working in worktree (not main)
- [ ] Tool verifies worktree location (if applicable)
- [ ] Tests written and passing
- [ ] Types updated (`src/types.ts`)
- [ ] Config documented (`src/config.ts`)
- [ ] Errors include fix instructions
- [ ] Response includes `_meta` (for tools)
- [ ] No work done in main directory
- [ ] Built and tested in worktree
- [ ] Ready to merge

---

## Remember

**The two most important things:**

1. **ALL changes in worktrees** - No exceptions
2. **Conflicts resolved in worktrees** - Main stays clean

Everything else is implementation detail.

---

**Last Updated**: 2025-12-10
**Maintained by**: The Collective
**Lines**: ~330 (down from 814)
