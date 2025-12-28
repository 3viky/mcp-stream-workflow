# Optional Features

**Purpose**: Document opt-in features for specific project needs

---

## Screenshot Generation (Opt-In)

**Status**: Available but disabled by default
**Use Case**: Projects with automated screenshot generation in pre-push hooks

### When to Enable

Enable this feature **ONLY IF** your project has:
1. ✅ A `pnpm screenshots:quick` command (or similar)
2. ✅ Pre-push hook that generates screenshots on push to main
3. ✅ Screenshots stored in a directory like `product/screenshots/`

### Problem It Solves

**Without this feature**:
```
prepare_merge → complete_merge → push to main
                                  ↓
                           pre-push hook runs
                                  ↓
                        Generates screenshots
                                  ↓
                        ❌ Uncommitted files in main
                        ❌ Manual commit required
```

**With this feature enabled**:
```
prepare_merge:
  ✅ Generates screenshots in worktree
  ✅ Commits them before merge

complete_merge:
  ✅ Merge includes screenshots
  ✅ Pre-push hook detects them → skips generation
  ✅ Main stays clean
```

### How to Enable

**Option 1: Global User Configuration (Recommended)**

Edit `~/.claude/mcp-config.json`:
```json
{
  "developerMode": true,
  "streamWorkflow": {
    "enableScreenshots": true
  }
}
```

No rebuild needed - restart Claude Code to apply.

**Option 2: Per-Project Environment Variable**

Edit `~/.claude.json`:
```json
{
  "mcpServers": {
    "stream-workflow": {
      "env": {
        "ENABLE_SCREENSHOTS": "true",
        "PROJECT_ROOT": "/path/to/project",
        "WORKTREE_ROOT": "/path/to/worktrees"
      }
    }
  }
}
```

**Option 3: Per-Merge Override**

```typescript
// Enable for this specific merge
await prepare_merge({
  streamId: "stream-042",
  generateScreenshots: true
});
```

**Configuration Priority**:
1. Per-merge override (function argument) - highest priority
2. Environment variable (`ENABLE_SCREENSHOTS` in `~/.claude.json`)
3. Global config (`~/.claude/mcp-config.json` `streamWorkflow.enableScreenshots`)
4. Default: `false` - lowest priority

### Configuration

```typescript
// In src/config.ts

FEATURES: {
  generateScreenshots: false, // Default: disabled
},

SCREENSHOT_TIMEOUT: 300000, // 5 minutes
```

### Requirements

Your project must have:
- A screenshot generation command (e.g., `pnpm screenshots:quick`)
- Command should handle dev server automatically
- Screenshots output to a predictable directory

### Example Commands

**Compatible commands**:
```json
{
  "scripts": {
    "screenshots:quick": "playwright test --config screenshots.config.ts",
    "screenshots:generate": "node scripts/generate-screenshots.js"
  }
}
```

**Expected behavior**:
- Command starts dev server if not running
- Generates screenshots
- Exits cleanly (shuts down server if it started it)
- Screenshots saved to `product/screenshots/` (or similar)

### Non-Fatal Behavior

Screenshot generation is **non-fatal**:
- If generation fails → Warning logged, merge continues
- If command doesn't exist → Warning logged, merge continues
- If server can't start → Warning logged, merge continues

This ensures the merge workflow isn't blocked by screenshot issues.

### For Projects Without Screenshots

**Default behavior (no configuration needed)**:
- Feature is disabled by default
- No screenshot generation attempted
- No warnings or errors
- Zero impact on workflow

Simply ignore this feature if your project doesn't need it.

---

## Future Optional Features

### Binary Conflict Resolution (Not Yet Implemented)

**Status**: Planned
**Use Case**: Projects with binary files that need merge handling

When implemented, this will handle conflicts in:
- Images (PNG, JPG, etc.)
- PDFs
- Compiled assets
- Other binary formats

### AI Auto-Resolution (Not Yet Implemented)

**Status**: Planned
**Use Case**: Fully automated conflict resolution

Currently, agents resolve conflicts manually. When implemented, this will:
- Call Anthropic API automatically
- Resolve conflicts without agent intervention
- Require `ANTHROPIC_API_KEY` to be set

---

## Enabling Features for Your Fork

If you're publishing this MCP server for your organization:

**1. Edit defaults in `src/config.ts`**:
```typescript
FEATURES: {
  generateScreenshots: true, // Enable for your org
  // ... other features
}
```

**2. Update documentation**:
- Note which features are enabled by default
- Document your organization's screenshot setup
- Provide examples from your project

**3. Rebuild and publish**:
```bash
pnpm build
npm publish
```

**4. In your `.claude/mcp-servers.json`**:
```json
{
  "stream-workflow-manager": {
    "command": "npx",
    "args": ["@your-org/mcp-stream-workflow"],
    "env": {
      "PROJECT_ROOT": "/path/to/project",
      "WORKTREE_ROOT": "/path/to/worktrees"
    }
  }
}
```

---

## Documentation

- **Screenshot Integration Design**: [PRE-PUSH-HOOK-INTEGRATION.md](./PRE-PUSH-HOOK-INTEGRATION.md)
- **Screenshot Setup Complete**: [../SCREENSHOT_INTEGRATION_COMPLETE.md](../SCREENSHOT_INTEGRATION_COMPLETE.md)
- **Main README**: [../README.md](../README.md)

---

**Last Updated**: 2025-12-11
**Maintained By**: The Collective
