# Atomic Commit Workflow for Agents

**Date**: 2025-12-11
**Status**: Design Complete
**Purpose**: Enable agents to commit atomically and sync dashboard periodically

---

## Problem Statement

**Current behavior**:
- Agents work on entire features before committing
- One massive commit at the end of stream
- No visibility into progress while agent is working
- STATUS_DASHBOARD.md only updated when stream completes

**Problems**:
1. ❌ **Lost work**: If agent crashes, all uncommitted work is lost
2. ❌ **No progress visibility**: Can't see what agent is doing mid-stream
3. ❌ **Poor git history**: Single massive commit instead of logical progression
4. ❌ **Dashboard stale**: STATUS_DASHBOARD shows "in progress" with no details

---

## Solution: Atomic Commits + Periodic Dashboard Sync

### Core Principles

1. **Commit atomically** - After each logical unit of work (function, component, fix)
2. **Meaningful messages** - Each commit describes what was done and why
3. **Dashboard sync every 3-5 commits** - Quick status update to main project
4. **Non-blocking** - Don't slow down agent workflow

### Workflow

```
Agent starts working in worktree:
  ↓
[Work on task 1]
  ↓
✅ git add + git commit (atomic commit #1)
  ↓
[Work on task 2]
  ↓
✅ git add + git commit (atomic commit #2)
  ↓
[Work on task 3]
  ↓
✅ git add + git commit (atomic commit #3)
  ↓
📊 CHECKPOINT: Update STATUS_DASHBOARD.md
  ↓
  Switch to main directory
  ↓
  Update STATUS_DASHBOARD.md with current progress
  ↓
  git add .project/STREAM_STATUS_DASHBOARD.md
  ↓
  git commit --no-verify -m "chore: Update stream status [stream-1500-auth]"
  ↓
  Switch back to worktree
  ↓
[Continue working...]
  ↓
✅ git add + git commit (atomic commit #4)
  ↓
✅ git add + git commit (atomic commit #5)
  ↓
📊 CHECKPOINT: Update STATUS_DASHBOARD again
  ↓
[Repeat...]
```

---

## Implementation Design

### 1. Commit Counter Tracking

**Location**: Worktree `.git/info/` (git-ignored metadata)

```bash
# File: .git/info/commit-count
5
```

Track commits since last dashboard sync.

### 2. Post-Commit Hook (Worktree)

**Location**: Each worktree's `.git/hooks/post-commit`

```bash
#!/usr/bin/env bash
#
# Post-commit hook for stream worktrees
# Tracks commit count and triggers dashboard sync every 3-5 commits
#

HOOK_DIR="$(cd "$(dirname "$0")" && pwd)"
WORKTREE_DIR="$(git rev-parse --show-toplevel)"
COUNT_FILE="${WORKTREE_DIR}/.git/info/commit-count"

# Increment counter
if [ -f "$COUNT_FILE" ]; then
  COUNT=$(cat "$COUNT_FILE")
else
  COUNT=0
fi

COUNT=$((COUNT + 1))
echo "$COUNT" > "$COUNT_FILE"

# Sync dashboard every 3-5 commits
if [ $COUNT -ge 3 ]; then
  echo "[post-commit] ${COUNT} commits since last sync - updating dashboard..."

  # Call MCP tool or script to sync dashboard
  # (Non-blocking - runs in background)
  "${HOOK_DIR}/sync-dashboard.sh" &

  # Reset counter
  echo "0" > "$COUNT_FILE"
fi
```

### 3. Dashboard Sync Script

**Location**: `.git/hooks/sync-dashboard.sh`

```bash
#!/usr/bin/env bash
#
# Sync STATUS_DASHBOARD.md with current stream progress
# Called from post-commit hook every 3-5 commits
#

set -e

WORKTREE_DIR="$(git rev-parse --show-toplevel)"
STREAM_ID="$(basename "$WORKTREE_DIR")"
PROJECT_ROOT="$(git config --get stream-workflow.project-root)"

if [ -z "$PROJECT_ROOT" ]; then
  echo "[sync-dashboard] Error: PROJECT_ROOT not configured"
  exit 1
fi

# Get current stream status
BRANCH="$(git rev-parse --abbrev-ref HEAD)"
COMMIT_COUNT="$(git rev-list --count HEAD)"
LATEST_COMMIT="$(git log -1 --format='%h %s')"
CHANGED_FILES="$(git diff --name-status HEAD~5..HEAD | wc -l)"

# Update dashboard in main project
cd "$PROJECT_ROOT"

DASHBOARD=".project/STREAM_STATUS_DASHBOARD.md"

# Find stream section and update status
# (Use sed or awk to update inline)

# Example update:
python3 <<'EOF'
import re
import sys

dashboard_path = ".project/STREAM_STATUS_DASHBOARD.md"

with open(dashboard_path, 'r') as f:
    content = f.read()

# Find stream section
stream_id = "$STREAM_ID"
pattern = rf"(## {stream_id}.*?)(?=\n##|\Z)"

# Update status line
updated = re.sub(
    pattern,
    lambda m: update_stream_status(m.group(1)),
    content,
    flags=re.DOTALL
)

with open(dashboard_path, 'w') as f:
    f.write(updated)

def update_stream_status(section):
    # Update "Last Updated" timestamp
    # Update commit count
    # Update latest commit message
    return section  # (simplified)
EOF

# Commit dashboard update (--no-verify to skip pre-commit hook)
git add "$DASHBOARD"
git commit --no-verify -m "chore: Update stream status [${STREAM_ID}]

Commits: ${COMMIT_COUNT}
Latest: ${LATEST_COMMIT}
Files changed: ${CHANGED_FILES}

🤖 Auto-synced by post-commit hook"

echo "[sync-dashboard] Dashboard updated successfully"
```

### 4. Agent Instructions

**Add to HANDOFF.md template**:

```markdown
## Commit Guidelines

**IMPORTANT**: Commit your work atomically as you go.

### When to Commit

✅ **DO commit** after:
- Implementing a complete function
- Fixing a bug
- Adding a component
- Completing a logical unit of work
- Passing tests for a feature

❌ **DON'T commit**:
- Broken/incomplete code
- Code that doesn't compile
- Failed tests

### Commit Message Format

```
<type>(<scope>): <description>

<body - optional>

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>
```

**Types**:
- `feat`: New feature
- `fix`: Bug fix
- `refactor`: Code refactoring
- `test`: Add/update tests
- `docs`: Documentation
- `chore`: Maintenance tasks

**Examples**:
```
feat(auth): Add JWT authentication middleware

Implements token generation and validation using jsonwebtoken library.
Includes expiry handling and refresh token support.

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>
```

```
fix(api): Handle null response in user endpoint

Added null check before accessing user.profile to prevent crashes.
Returns 404 if user not found instead of 500 error.

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>
```

### Dashboard Sync

The system automatically syncs STATUS_DASHBOARD.md every 3-5 commits.
You don't need to do anything - just keep committing atomically.

The dashboard will show:
- Your progress (commits, files changed)
- Latest commit message
- Current phase/status
```

---

## Dashboard Status Format

### Stream Section Update

**Before**:
```markdown
## stream-1500-user-authentication

**Status**: 🔄 In Progress
**Priority**: High
**Category**: Backend
**Created**: 2025-12-11 10:00
**Last Updated**: 2025-12-11 10:00

*No progress updates yet*
```

**After (3 commits)**:
```markdown
## stream-1500-user-authentication

**Status**: 🔄 In Progress
**Priority**: High
**Category**: Backend
**Created**: 2025-12-11 10:00
**Last Updated**: 2025-12-11 10:15

**Progress**:
- Commits: 3
- Files changed: 8
- Latest: `feat(auth): Add JWT middleware`

**Recent Activity** (auto-synced):
- 10:15 - feat(auth): Add JWT middleware
- 10:12 - feat(auth): Add user model
- 10:10 - feat(auth): Create auth routes
```

**After (6 commits)**:
```markdown
## stream-1500-user-authentication

**Status**: 🔄 In Progress
**Priority**: High
**Category**: Backend
**Created**: 2025-12-11 10:00
**Last Updated**: 2025-12-11 10:25

**Progress**:
- Commits: 6
- Files changed: 15
- Latest: `test(auth): Add JWT validation tests`

**Recent Activity** (auto-synced):
- 10:25 - test(auth): Add JWT validation tests
- 10:23 - test(auth): Add user model tests
- 10:20 - refactor(auth): Extract token utilities
- 10:15 - feat(auth): Add JWT middleware
- 10:12 - feat(auth): Add user model
- 10:10 - feat(auth): Create auth routes
```

---

## Benefits

### For Agents
✅ **Safety**: Work preserved after each atomic commit
✅ **Clear history**: Logical progression visible in git log
✅ **Automatic sync**: Don't think about dashboard updates

### For Developers
✅ **Visibility**: See agent progress in real-time
✅ **Context**: Understand what agent is working on
✅ **History**: Review logical commits instead of one massive change

### For Team
✅ **Transparency**: Know status of all active streams
✅ **Coordination**: See which agents are working on what
✅ **Progress tracking**: Estimate completion based on commit velocity

---

## Implementation Phases

### Phase 1: Core Infrastructure
- [ ] Add commit counter tracking (`.git/info/commit-count`)
- [ ] Create post-commit hook template
- [ ] Create dashboard sync script
- [ ] Test on single worktree

### Phase 2: MCP Integration
- [ ] Add `sync_dashboard` MCP tool
- [ ] Update `start_stream` to install hooks
- [ ] Add dashboard sync to post-commit

### Phase 3: Agent Instructions
- [ ] Update HANDOFF.md template
- [ ] Add commit guidelines
- [ ] Document atomic commit workflow

### Phase 4: Dashboard Updates
- [ ] Enhance dashboard parser
- [ ] Add progress tracking section
- [ ] Add recent activity log
- [ ] Format timestamps nicely

---

## Configuration

### Git Config (Per-Worktree)

```bash
# Store PROJECT_ROOT for dashboard sync
git config stream-workflow.project-root "/path/to/main"

# Enable post-commit hook
git config core.hooksPath .git/hooks

# Set commit counter threshold
git config stream-workflow.sync-threshold 3
```

### Environment Variables

```bash
# In ~/.claude/mcp-servers.json
{
  "stream-workflow": {
    "env": {
      "PROJECT_ROOT": "/path/to/project",
      "WORKTREE_ROOT": "/path/to/worktrees",
      "DASHBOARD_SYNC_THRESHOLD": "3"  # Commits between syncs
    }
  }
}
```

---

## Edge Cases

### Agent Crashes Mid-Work

**Scenario**: Agent commits 2 times, then crashes

**Result**:
- ✅ 2 atomic commits preserved
- ✅ Work recoverable from git history
- ❌ Dashboard not synced (< 3 commits)

**Recovery**:
- Resume stream
- Agent picks up from last commit
- Next commit triggers dashboard sync

### Concurrent Dashboard Updates

**Scenario**: Two agents sync dashboard simultaneously

**Handling**:
- Use git locking mechanism (same as complete_merge)
- Retry with exponential backoff
- Non-critical if occasional sync fails

### Dashboard Sync Fails

**Scenario**: Dashboard sync script errors

**Handling**:
- Log error to stderr
- Don't block agent workflow
- Retry on next sync interval
- Manual sync via MCP tool

---

## Testing Plan

### Unit Tests
- Commit counter increment/reset
- Dashboard parser and updater
- Stream status formatting

### Integration Tests
- Post-commit hook triggers sync
- Dashboard updates correctly
- Multiple concurrent streams

### End-to-End Tests
- Agent creates 10 atomic commits
- Dashboard syncs twice (at 3 and 6 commits)
- Verify commit history and dashboard match

---

## Future Enhancements

### 1. Commit Velocity Metrics
Track commits per hour to estimate completion:
```markdown
**Velocity**: 2.5 commits/hour
**Estimated completion**: 2-3 hours remaining
```

### 2. File Change Heatmap
Show which files agent is modifying most:
```markdown
**Hot Files**:
- src/auth/jwt.ts (12 changes)
- src/auth/routes.ts (8 changes)
- src/models/user.ts (5 changes)
```

### 3. Auto-Generated Progress Summary
Use Claude to summarize progress from commit messages:
```markdown
**AI Summary**: Agent has implemented JWT authentication
middleware, added user model, and created auth routes.
Currently writing tests for token validation.
```

---

**Status**: Design Complete - Ready for Implementation
**Next**: Implement Phase 1 (Core Infrastructure)
**Dependencies**: Version-aware stream numbering (in progress)
