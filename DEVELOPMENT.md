# Development Guide - Stream Workflow Manager

**⚠️ This documentation is for MCP server development only.**

**Audience**: Creator and contributors working on the MCP server itself
**Environment**: Requires `DEVELOPER_MODE=true` to enable self-modification
**Status**: Active development mode enabled

---

## For Claude Code Agents

**You are encouraged to update this MCP server when you encounter limitations.**

This server exists to help you work more efficiently with the egirl-platform worktree workflow. If you find gaps, bugs, or missing features, **you own this code** and should improve it.

---

## Prerequisites

Set `DEVELOPER_MODE=true` in your environment:

```bash
# In .claude/mcp-servers.json
{
  "stream-workflow-manager": {
    "env": {
      "ANTHROPIC_API_KEY": "${ANTHROPIC_API_KEY}",
      "DEVELOPER_MODE": "true"
    }
  }
}

# Or in your shell
export DEVELOPER_MODE=true
```

**Without DEVELOPER_MODE:** Self-modification features are disabled, agents cannot update the MCP server.

---

## Quick Update Workflow

### 1. Create Worktree (NEVER edit in main)

```bash
git worktree add ../egirl-platform-worktrees/mcp-enhancement -b mcp-enhancement
cd ../egirl-platform-worktrees/mcp-enhancement
```

### 2. Edit Source Files

Navigate to MCP server directory:
```bash
cd .claude/mcp-servers/stream-workflow-manager
```

**Key files:**
- `src/tools/*.ts` - MCP tool implementations
- `src/conflict-resolver.ts` - AI conflict resolution engine
- `src/config.ts` - Configuration constants
- `src/strategies/*.ts` - Pluggable conflict strategies
- `prompts/conflict-resolution.txt` - Claude AI prompts

### 3. Test Changes

```bash
# From MCP server directory
pnpm install  # First time only
pnpm test     # Run unit tests
pnpm build    # Compile TypeScript
```

### 4. Restart MCP Server

The MCP server **does NOT hot-reload**. After changes:

**Option A: Restart Claude Code session** (cleanest)
- Exit and restart Claude Code
- Server will auto-start with new code

**Option B: Manual restart** (faster for iteration)
```bash
# Find the process
ps aux | grep stream-workflow-manager

# Kill it
kill <PID>

# Claude Code will auto-restart on next tool call
```

### 5. Validate

Test the tool in Claude Code:
```bash
# Example: Test prepare_merge
mcp__stream-workflow__prepare_merge({ streamId: "stream-test" })
```

Verify it works as expected.

### 6. Merge to Main

```bash
# From worktree root
../../egirl-platform/.git-hooks/merge-worktree-to-main mcp-enhancement --delete-worktree
```

---

## Extension Points

### 1. Add New Conflict Strategy

**When to use:** You encounter a file type that isn't handled well.

**Example:** Binary files, XML files, database migrations

Create `src/strategies/my-strategy.ts`:
```typescript
import { ConflictStrategy, ConflictContext, ResolutionResult } from '../types';

export class MyStrategy implements ConflictStrategy {
  name = 'my-strategy';

  canHandle(file: string, context: ConflictContext): boolean {
    // Return true if this strategy should handle this file
    return file.endsWith('.xml');
  }

  async resolve(context: ConflictContext): Promise<ResolutionResult> {
    // Your custom resolution logic
    const { file, oursContent, theirsContent, mainCommits, streamCommits } = context;

    // Example: Use Claude for intelligent resolution
    const resolved = await this.askClaude(oursContent, theirsContent);

    return {
      resolved: true,
      content: resolved,
      strategy: 'my-strategy',
      confidence: 'high'
    };
  }
}
```

Register in `src/conflict-resolver.ts`:
```typescript
this.strategies = [
  new CodeMergeStrategy(),
  new ConfigMergeStrategy(),
  new MyStrategy(),  // Add here
];
```

See: `docs/EXTENDING.md` for complete guide

### 2. Customize AI Prompts

**When to use:** Claude's conflict resolution isn't making good decisions for specific file types.

Edit `prompts/conflict-resolution.txt`:
```
# Merge Conflict Resolution Task

[Add your custom instructions here]

## Special Handling for Database Migrations

When resolving conflicts in files matching `migrations/*.ts`:
- NEVER merge migration timestamps (choose most recent)
- NEVER merge database schema changes (both migrations must run)
- ... your custom logic ...
```

### 3. Add New Validator

**When to use:** You want additional validation after conflict resolution.

Create `src/validators/my-validator.ts`:
```typescript
import { Validator, ValidationResult } from '../types';

export class MyValidator implements Validator {
  name = 'my-validator';

  async validate(workingDir: string): Promise<ValidationResult> {
    // Run your validation
    const result = await runMyCheck(workingDir);

    return {
      passed: result.success,
      errors: result.errors,
      warnings: result.warnings
    };
  }
}
```

Register in `src/conflict-resolver.ts` (validators section).

### 4. Modify Configuration

Edit `src/config.ts`:
```typescript
export const config = {
  // File size limits
  MAX_FILE_SIZE: 100 * 1024,  // Increase if needed

  // Timeout settings
  CONFLICT_RESOLUTION_TIMEOUT: 60000,  // 60s per file
  MERGE_LOCK_TIMEOUT: 300000,          // 5 minutes

  // AI settings
  ANTHROPIC_MODEL: 'claude-sonnet-4-5-20250929',
  MAX_TOKENS: 8192,

  // Paths
  PROJECT_ROOT: process.env.PROJECT_ROOT || '/var/home/viky/Code/applications/src/@egirl/egirl-platform',
  WORKTREE_ROOT: process.env.WORKTREE_ROOT || '/var/home/viky/Code/applications/src/@egirl/egirl-platform-worktrees',

  // Development mode
  DEVELOPER_MODE: process.env.DEVELOPER_MODE === 'true',

  // Add your config here
};
```

---

## Known Limitations

**Current limitations** (as of v0.1.0):

| Limitation | Workaround | Fix Location |
|------------|------------|--------------|
| Binary files not supported | Manual resolution | `src/strategies/binary-conflict.ts` (create) |
| Max file size: 100KB | Increase in config | `src/config.ts` line 8 |
| No parallel conflict resolution | Sequential is safer for v1 | `src/conflict-resolver.ts` line 45 |
| Requires ANTHROPIC_API_KEY | Set in environment | `.claude/mcp-servers.json` |
| No hot-reload | Restart Claude Code | Not fixable (MCP limitation) |

**When you encounter a limitation:**
1. Read the error message (includes fix instructions)
2. Create worktree for MCP enhancement
3. Make the fix
4. Test and merge
5. Update this table

---

## Debugging

### View MCP Server Logs

**Check if server is running:**
```bash
ps aux | grep stream-workflow-manager
```

**View logs** (if logging configured):
```bash
# Logs location
tail -f ~/.claude/logs/mcp-stream-workflow.log

# Or check Claude Code's MCP server output
# (shown in terminal when Claude Code starts)
```

### Test Tool Directly

**From MCP server directory:**
```bash
# Run specific test
pnpm test:tool prepare_merge

# Or run all tests
pnpm test

# With verbose output
pnpm test -- --verbose
```

### Common Issues

**Issue: "Command not found: mcp__stream-workflow__*"**

**Cause:** MCP server not registered or not running

**Fix:**
1. Check `.claude/mcp-servers.json` exists
2. Restart Claude Code session
3. Check server logs for startup errors

---

**Issue: "ANTHROPIC_API_KEY not set"**

**Cause:** Environment variable missing

**Fix:**
```bash
# Add to .claude/mcp-servers.json
{
  "stream-workflow-manager": {
    "env": {
      "ANTHROPIC_API_KEY": "${ANTHROPIC_API_KEY}"
    }
  }
}

# Or set globally
export ANTHROPIC_API_KEY="sk-ant-..."
```

---

**Issue: "Tool not found" after update**

**Cause:** MCP server still running old code

**Fix:**
1. Find process: `ps aux | grep stream-workflow-manager`
2. Kill it: `kill <PID>`
3. Retry tool call (will auto-restart with new code)
4. OR restart Claude Code session

---

**Issue: "DEVELOPER_MODE required for this operation"**

**Cause:** Attempting to modify MCP server without DEVELOPER_MODE=true

**Fix:**
```bash
# Add to .claude/mcp-servers.json
{
  "stream-workflow-manager": {
    "env": {
      "DEVELOPER_MODE": "true"
    }
  }
}
```

This prevents agents from accidentally modifying the MCP server in production use.

---

## Meta-Improvement

**This documentation is version-controlled.**

If you find this documentation:
- Unclear or confusing
- Missing important information
- Containing errors
- Lacking examples

**YOU SHOULD UPDATE IT:**
1. Create worktree
2. Edit the docs
3. Commit improvement
4. Merge to main

The next agent will benefit from your improvements.

This is a living system maintained by the collective.

---

## Architecture Deep Dive

### Directory Structure

```
stream-workflow-manager/
├── README.md              # User-facing documentation
├── DEVELOPMENT.md         # This file (developer guide)
├── package.json           # Dependencies and scripts
├── tsconfig.json          # TypeScript configuration
│
├── src/
│   ├── server.ts              # MCP server entry point
│   ├── config.ts              # Configuration constants
│   ├── types.ts               # TypeScript interfaces
│   ├── conflict-resolver.ts   # AI-powered conflict resolution
│   │
│   ├── tools/                 # MCP tool implementations
│   │   ├── prepare-merge.ts       # Merge main into worktree + AI resolution
│   │   ├── complete-merge.ts      # Fast-forward main (with locking)
│   │   ├── create-stream.ts       # Create worktree + stream file
│   │   ├── verify-location.ts     # Enforce worktree-only rule
│   │   ├── update-status.ts       # Update STREAM_STATUS_DASHBOARD
│   │   └── complete-stream.ts     # Archive and cleanup
│   │
│   ├── strategies/            # Pluggable conflict resolution strategies
│   │   ├── code-merge.ts          # TypeScript/JavaScript conflicts
│   │   ├── config-merge.ts        # JSON/YAML config conflicts
│   │   └── docs-merge.ts          # Markdown documentation conflicts
│   │
│   └── validators/            # Post-resolution validation
│       ├── typescript.ts          # npx tsc --noEmit
│       ├── build.ts               # pnpm build --dry-run
│       └── lint.ts                # pnpm lint
│
├── prompts/
│   └── conflict-resolution.txt    # Claude AI prompt template
│
├── tests/
│   ├── prepare-merge.test.ts
│   ├── conflict-resolver.test.ts
│   └── ...
│
└── docs/
    ├── ARCHITECTURE.md            # System design
    ├── EXTENDING.md               # Extension guide
    ├── ERROR_CATALOG.md           # All errors with fix instructions
    └── EXAMPLES.md                # Usage examples
```

### Design Philosophy

**Agent-First Design Principles:**

1. **Self-Documenting Errors** - Every error teaches you how to fix it
2. **Zero Trust, Full Enforcement** - Technical controls, not protocol reliance
3. **Fail-Safe Defaults** - Worktree-only, locking, validation
4. **Progressive Enhancement** - Start simple, add features as needed
5. **Living Documentation** - Maintained by the collective as it evolves

**Workflow Philosophy:**

- **Main is sacred** - Never resolve conflicts in main
- **Worktrees are disposable** - Experiment freely, merge when ready
- **AI resolves conflicts** - Claude understands intent better than git
- **Validation before merge** - TypeScript, build, lint must pass
- **Atomic operations** - Dashboard updates, merges, all-or-nothing

---

## Testing Strategy

### Unit Tests

```bash
# Run all tests
pnpm test

# Run specific test suite
pnpm test conflict-resolver

# Watch mode
pnpm test:watch

# Coverage report
pnpm test:coverage
```

### Integration Tests

```bash
# Test full workflow (requires test project)
pnpm test:integration

# Test specific scenarios
pnpm test:integration -- --grep "merge conflict resolution"
```

### Manual Testing Checklist

Before merging changes:

- [ ] All unit tests pass
- [ ] Integration tests pass
- [ ] MCP server starts without errors
- [ ] Tools can be invoked from Claude Code
- [ ] Error messages are clear and actionable
- [ ] Documentation updated for new features
- [ ] No console warnings or errors

---

## Release Process

### Version Bumping

```bash
# Patch version (bug fixes)
pnpm version patch

# Minor version (new features)
pnpm version minor

# Major version (breaking changes)
pnpm version major
```

### Changelog Updates

Update `CHANGELOG.md` with:
- New features
- Bug fixes
- Breaking changes
- Migration instructions

### Publishing

```bash
# Build production version
pnpm build

# Publish to npm (if applicable)
pnpm publish

# Tag release
git tag -a v0.2.0 -m "Release v0.2.0"
git push origin v0.2.0
```

---

## Getting Help

**For developers:**
- Read `docs/ARCHITECTURE.md` - System design deep dive
- Read `docs/EXTENDING.md` - Step-by-step extension guide
- Read error messages - Include fix instructions
- Read test files - See usage examples
- Check `docs/ERROR_CATALOG.md` - All known errors documented

**For contributors:**
- Open issues for bugs or feature requests
- Submit PRs with tests and documentation
- Follow the code style (enforced by linter)
- Update relevant documentation

---

## Code Style Guidelines

### TypeScript Conventions

- Use strict type checking (no `any`)
- Prefer interfaces over types for objects
- Use async/await over promises
- Document public APIs with JSDoc
- Keep functions small and focused

### Error Handling

- Always provide context in errors
- Include fix instructions in error messages
- Use custom error classes for categorization
- Log errors with stack traces

### Testing Conventions

- One test file per source file
- Use descriptive test names
- Test happy path and error cases
- Mock external dependencies
- Aim for >80% code coverage

---

## Version History

**v0.1.0** (2025-12-10)
- Initial documentation
- Architecture design
- Extension point specifications
- Development mode implementation

---

**Last Updated**: 2025-12-11
**Maintained by**: The Collective (DEVELOPER_MODE=true)
**Status**: Active development
