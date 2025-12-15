# Plan Mode & Stream Workflow Interaction

**Purpose**: Clarify when plan mode is appropriate and how it interacts with stream workflow state.

---

## The Problem: Plan Mode Pollution

When agents use `EnterPlanMode` during stream work, they create plan files in `~/.claude/plans/` with random names:
- `golden-snacking-wombat.md`
- `cryptic-wandering-hopper.md`
- `binary-frolicking-pascal.md`

**These look like real work to other Claude Code sessions** and pollute the stream workflow state.

---

## When Plan Mode IS Appropriate

✅ Use plan mode for:
- **Non-stream work**: One-off research, general coding tasks, feature design
- **External projects**: Work outside the stream workflow system
- **Exploratory analysis**: Understanding complex systems before implementation

---

## When Plan Mode IS NOT Appropriate

❌ DO NOT use plan mode for:
- **Starting new streams**: Use `mcp__stream-workflow__start_stream` directly
- **Active stream work**: Work happens in worktrees, not plan files
- **Merge operations**: Plan mode doesn't help with merge complexity
- **Any work tracked by `.project/plan/streams/`**: Stream metadata supersedes plan files

---

## Correct Stream Workflow Pattern

### ✅ CORRECT: Direct Implementation

```
User: "Add user authentication to the payment system"
  │
  ├─ Agent: Use mcp__stream-workflow__start_stream()
  │   └─ Creates: worktree, branch, metadata (NO plan file)
  │
  ├─ Agent: Navigate to worktree
  │
  ├─ Agent: Implement directly (code in git, not planning)
  │
  ├─ Agent: Commit changes
  │   └─ git commit -m "feat(auth): Add OAuth2 provider"
  │
  └─ Done: Implementation complete, ready to merge
       (Stream state updated automatically)
```

**Result**: Zero plan files created. Clean stream state.

---

### ❌ WRONG: Plan Mode Pollution

```
User: "Add user authentication to the payment system"
  │
  ├─ Agent: Uses EnterPlanMode
  │   └─ Creates: ~/.claude/plans/fluffy-dancing-penguin.md
  │
  ├─ Agent: Develops plan (hours of planning)
  │   └─ Plan file grows to 15KB
  │
  ├─ Agent: Implements (leaves plan file behind)
  │
  ├─ Other Claude session starts:
  │   └─ Sees plan file, thinks work is in progress
  │   └─ Confusion about stream state
  │
  └─ Done: Implementation complete, BUT pollution remains
       (Plan file never deleted)
```

**Result**: Stream state polluted. Other sessions confused.

---

## If You DO Use Plan Mode

**MANDATORY cleanup**:

1. Create plan file (temporary)
2. Implement per plan (code changes in git)
3. **IMMEDIATELY after implementation completes** → Delete plan file:
   ```bash
   rm ~/.claude/plans/fluffy-dancing-penguin.md
   ```

**NO EXCEPTIONS**: Even partial work → delete plan file after done.

---

## Exception: Pre-Stream Analysis

If you need to analyze a project BEFORE starting a stream:

✅ **CORRECT**:
```bash
# 1. Use plan mode to analyze & design
mcp__stream-workflow__start_stream()  # ← BEFORE creating plan

# 2. Plan what you'll do (temporary planning)
# 3. Delete plan file after analysis
rm ~/.claude/plans/analysis-*.md

# 4. Then use stream workflow
mcp__stream-workflow__start_stream()
```

✅ **ALTERNATIVE** (recommended):
```bash
# Skip plan mode entirely
mcp__stream-workflow__start_stream()

# Document findings in README.md INSIDE the stream
# (use stream status file to capture decisions)
```

---

## Stream Workflow State vs. Plan Files

| Aspect | Stream Workflow | Plan Mode |
|--------|-----------------|-----------|
| **Location** | `.project/plan/streams/`, `.project/.stream-state.json` | `~/.claude/plans/` |
| **Scope** | Project-specific, authoritative | Global, ephemeral |
| **Persistence** | Survives sessions (needed for merge) | Should be deleted after execution |
| **Visibility** | Only current project sees it | All Claude sessions see it |
| **Purpose** | Track active work | Design before implementation |
| **Cleanup** | Automatic (after stream completes) | Manual (MANDATORY delete) |

---

## Decision Tree

```
Starting work on a project?
├─ YES: Is it tracked by stream workflow?
│  ├─ YES: Use mcp__stream-workflow__start_stream()
│  │       (NO plan mode)
│  │
│  └─ NO: Is it complex enough to need pre-planning?
│     ├─ YES: Use plan mode TEMPORARILY
│     │       Then DELETE plan file after analysis
│     │
│     └─ NO: Start coding directly (skip plan mode)
│
└─ NO: General research/exploration?
   └─ Plan mode OK (with cleanup after)
```

---

## Cleanup Verification

After using plan mode:

```bash
# MUST return empty
ls ~/.claude/plans/

# If not empty:
rm ~/.claude/plans/*.md
```

---

## Why This Matters

The stream workflow system relies on `.project/plan/streams/` and `.project/.stream-state.json` as **authoritative state**. When old plan files accumulate in `~/.claude/plans/`, they:

1. Confuse other Claude Code sessions about active work
2. Pollute stream discovery (agents think work is in progress when it's not)
3. Cascade into incorrect merge operations
4. Create phantom streams that block real work

**The fix**: Use stream workflow directly. Skip plan mode for stream work. Delete plan files immediately after use.

---

**Last Updated**: 2025-12-15
**Maintained By**: The Collective
