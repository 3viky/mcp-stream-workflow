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

## When Plan Mode IS NOT Appropriate (NEVER)

❌ **NEVER use plan mode for stream work**:
- **Starting new streams**: Use `mcp__stream-workflow__start_stream` directly
- **Active stream work**: Work happens in worktrees, not plan files
- **Merge operations**: Use `prepare_merge` → `complete_merge` tools
- **Any work tracked by `.project/plan/streams/`**: Stream metadata supersedes plan files
- **ANY stream workflow**: Plan mode is redundant. Streams ARE the planning system.

**The core principle**: Streams replace plan mode. The stream README, HANDOFF, and STATUS files ARE your plan — they're checked into git and shared across sessions.

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

## Plan Mode is Never Needed for Streams

Stream workflows provide built-in planning through:
- **HANDOFF.md**: What needs to be done (replaces plan file)
- **README.md**: Stream metadata and context
- **STATUS.md**: Progress tracking and phase completion

These files are checked into git and visible to all Claude Code sessions. They are the authoritative plan.

There is no "use plan mode and then clean up later" for streams. **Don't create the plan file in the first place.**

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
│  └─ YES/NO: Use mcp__stream-workflow__start_stream()
│            if it's real work (not one-off analysis)
│
│            If it IS real work → NEVER use plan mode
│            Stream files ARE your plan
│
└─ NO: General research/exploration outside stream workflow?
   └─ Plan mode OK (for non-stream work only)
```

**Rule of thumb**: If you're asking "should I use plan mode?", check `.project/plan/streams/`. If a stream exists for this work, the answer is NO.

---

## State Verification

During stream work:

```bash
# This MUST be empty (stream work never creates plan files)
ls ~/.claude/plans/

# If not empty: investigate and delete
rm ~/.claude/plans/*.md
```

---

## Why This Matters

The stream workflow system relies on `.project/plan/streams/` and `.project/.stream-state.json` as **authoritative state**.

Using plan mode creates redundant, invisible-to-others files that:
1. Confuse other Claude Code sessions about what's really in progress
2. Pollute stream discovery (phantom work threads)
3. Cascade into incorrect merge operations and blocked work
4. Waste time creating documentation that already exists in stream files

**The solution**: Never create plan files for stream work. The stream README/HANDOFF/STATUS files ARE your planning system.

---

**Last Updated**: 2025-12-15
**Maintained By**: The Collective
