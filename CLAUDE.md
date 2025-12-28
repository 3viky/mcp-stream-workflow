# MCP Stream Workflow - Development Context

**Purpose**: This directory is for **developing the MCP server itself**, not for using it.

---

## Development vs. Usage Context

### ❌ DO NOT Use MCP Tools Here
This directory is where we **build** the stream-workflow MCP server. Do not use `mcp__stream-workflow__*` tools in this workspace - they're for projects that **consume** this MCP server.

### ✅ Development Workflow
```bash
# 1. Edit source files
vim src/tools/start-stream.ts
vim src/state-manager.ts

# 2. Build
pnpm build

# 3. Test
pnpm test

# 4. Verify
pnpm verify

# 5. Commit changes
git add . && git commit -m "feat: improve X"

# 6. Restart Claude Code session to reload MCP
# (MCP servers don't support hot reload)
```

---

## Key Files

**Source code**:
- `src/server.ts` - MCP server entry point
- `src/tools/*.ts` - Tool implementations
- `src/state-manager.ts` - Stream state management
- `src/types.ts` - TypeScript definitions

**Configuration**:
- `src/config.ts` - Environment configuration
- `package.json` - Dependencies and scripts

**Documentation**:
- `README.md` - User-facing documentation
- `DEVELOPMENT.md` - Developer guide
- `docs/*.md` - Design documents

**Testing**:
- `tests/` - Test suites (if present)

---

## Common Development Tasks

### Adding New Tool
1. Create `src/tools/new-tool.ts`
2. Implement handler function
3. Export from `src/server.ts`
4. Build and test
5. Document in README.md

### Updating Existing Tool
1. Edit `src/tools/existing-tool.ts`
2. Update types if needed (`src/types.ts`)
3. Build and verify: `pnpm build && pnpm verify`
4. Test with Claude Code (restart session)

### Testing Changes
```bash
# Build
pnpm build

# Restart Claude Code to reload MCP
# Then test in a project that uses this MCP
```

---

## Agent Cleanup Protocol

**This directory is subject to agent cleanup rules.**

**Pollution to remove**:
- `*_SUMMARY.md` (e.g., BUILD_VERIFICATION_REPORT.md)
- `*_REPORT.md` (e.g., SCREENSHOT_CONFIG_UPDATE.md)
- `*_COMPLETE.md` (e.g., IMPLEMENTATION_COMPLETE.md)
- `*_PLAN.md` (archive valuable plans to `.project/history/`)
- `*.bak`, `*.old` files

**Keep**:
- `README.md` - User documentation
- `DEVELOPMENT.md` - Developer guide
- `docs/*.md` - Design documents (if in dedicated docs/ folder)
- Source code and tests

**Archive valuable information** to `.project/history/YYYYMMDD_description.md` if needed, then delete the pollution.

---

## Current Development Focus

**Version-aware stream numbering** (v0.2.0):
- ✅ Implemented version-scoped IDs (e.g., `stream-1500-auth`)
- ✅ Sub-stream support (e.g., `stream-1500a-tests`)
- 🚧 **IN PROGRESS**: Improve uncommitted changes handling in start_stream

**Atomic commit workflow** (future):
- Design complete: `docs/ATOMIC_COMMIT_WORKFLOW.md`
- Hooks implemented: `hooks/post-commit`, `hooks/sync-dashboard.sh`
- Implementation: Not yet integrated into MCP tools

---

## Last Updated
2025-12-11
