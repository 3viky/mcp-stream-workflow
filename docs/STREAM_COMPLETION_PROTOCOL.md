# Stream Completion Protocol

**Purpose**: Step-by-step protocol for completing and retiring workstreams.

**CRITICAL**: Follow this protocol EXACTLY when finishing work in a stream worktree.

---

## Flowchart Overview

```
START: Work complete in worktree
  ↓
[A] Verify work is committed
  ↓
[B] Merge main → worktree
  ↓
  Conflicts? ─→ YES → [C] Resolve intelligently → [D] Commit merge
            └→ NO ──→ [D] Commit merge
  ↓
[E] Run validation (tests, typecheck, build)
  ↓
  Pass? ─→ NO → Fix issues → [E]
        └→ YES
  ↓
[F] Push worktree to origin
  ↓
[G] Switch to main directory
  ↓
[H] Merge worktree → main (--ff-only)
  ↓
  Success? ─→ NO → ERROR: Worktree not prepared
           └→ YES
  ↓
[I] Push main to origin
  ↓
[J] Archive to .project/history/
  ↓
[K] Delete worktree
  ↓
[L] Clean up .project/plan/streams/ (if exists)
  ↓
DONE: Stream retired
```

---

## Detailed Steps

### [A] Verify Work is Committed

**Location**: Worktree

**Commands**:
```bash
cd /path/to/worktree/stream-XX-name
git status
```

**Decision**:
- **If clean** → Proceed to [B]
- **If uncommitted changes** → Commit them first:
  ```bash
  git add .
  git commit -m "feat(stream-XX): Final changes before merge"
  ```

---

### [B] Merge Main into Worktree

**Location**: Worktree

**Purpose**: Bring latest main changes into worktree so conflicts are resolved HERE, not in main

**Commands**:
```bash
git fetch origin main
git merge origin/main --no-edit
```

**Decision**:
- **If clean merge** → Proceed to [D]
- **If conflicts** → Proceed to [C]

---

### [C] Resolve Conflicts Intelligently

**Location**: Worktree

**CRITICAL**: You are resolving conflicts IN THE WORKTREE. Main stays clean.

**Process**:

1. **List conflicted files**:
   ```bash
   git status | grep "both modified"
   ```

2. **For each conflicted file**:
   - Read BOTH versions (ours = worktree, theirs = main)
   - Understand INTENT from commit messages
   - **Preserve both changes** thoughtfully
   - **NEVER** blindly choose one side
   - **NEVER** remove features to avoid complexity

3. **Resolve conflicts**:
   - Edit files manually
   - Remove conflict markers (`<<<<<<<`, `=======`, `>>>>>>>`)
   - Integrate both changes intelligently
   - Stage resolved files:
     ```bash
     git add path/to/resolved/file
     ```

4. **Verification**:
   ```bash
   # Ensure no conflict markers remain
   grep -r "<<<<<<< HEAD" .
   grep -r "=======" .
   grep -r ">>>>>>>" .
   # Should return nothing
   ```

**Conflict Resolution Principles**:
- **Preserve both intents** - Both changes were intentional
- **Understand context** - Read commit messages for WHY
- **Integrate thoughtfully** - Combine, don't discard
- **Maintain correctness** - TypeScript must compile, tests must pass

**Common patterns**:
- **Refactor + Feature**: Apply feature to refactored code
- **Import merge**: Combine both import lists, deduplicate
- **Config merge**: Union of both configurations
- **Function signature change**: Adapt old logic to new signature

**Proceed to**: [D]

---

### [D] Commit Merge

**Location**: Worktree

**Commands**:
```bash
git commit -m "$(cat <<'EOF'
Merge main into stream-XX-name

Resolved conflicts in:
  - path/to/file1
  - path/to/file2

Both changes preserved and integrated thoughtfully.

🤖 Generated with Claude Code
EOF
)"
```

**Proceed to**: [E]

---

### [E] Run Validation

**Location**: Worktree

**Purpose**: Ensure merge didn't break anything

**Commands**:
```bash
# TypeScript check
npx tsc --noEmit

# Build check
pnpm build

# Lint check
pnpm lint

# Tests (if applicable)
pnpm test
```

**Decision**:
- **If all pass** → Proceed to [E-2]
- **If failures** → Fix issues, commit fixes, repeat [E]

---

### [E-2] Generate Screenshots (if applicable)

**Location**: Worktree

**Purpose**: Generate screenshots before merging to main

**Why this step exists**:
- Pre-push hook generates screenshots when pushing to main
- If screenshots are generated in worktree FIRST:
  - They're included in the merge commit
  - Pre-push hook detects them and skips generation
  - Main branch stays clean (no uncommitted files)

**Commands**:
```bash
# Screenshot generation (handles dev server automatically)
pnpm screenshots:quick
```

**Behavior**:
- Screenshot command automatically:
  - Starts dev server if not running
  - Generates screenshots
  - Shuts down server if it started it
- If screenshots generated:
  ```bash
  git add product/screenshots/
  git commit -m "chore: Update screenshots for merge"
  ```
- If generation fails: Log warning, continue merge (non-fatal)

**Configuration**:
- Enabled by default (`config.FEATURES.generateScreenshots = true`)
- Can be disabled per-project or per-merge
- Timeout: 5 minutes (allows server startup time)

**Decision**:
- **If screenshots generated** → Committed automatically, proceed to [F]
- **If failed** → Warning logged, proceed to [F] (non-fatal)
- **If disabled** → Skip to [F]

---

### [F] Push Worktree to Origin

**Location**: Worktree

**Commands**:
```bash
git push origin stream-XX-name
```

**Purpose**: Backup work, enable code review if needed

**Proceed to**: [G]

---

### [G] Switch to Main Directory

**Location**: Change directories

**Commands**:
```bash
cd /path/to/egirl-platform  # Main directory
```

**Verification**:
```bash
pwd
# Should show: /path/to/egirl-platform (NOT worktree)

git branch --show-current
# Should show: main
```

**Proceed to**: [H]

---

### [H] Merge Worktree into Main (Fast-Forward Only)

**Location**: Main directory

**CRITICAL**: This should be a FAST-FORWARD merge (no conflicts)

**Commands**:
```bash
# Fetch latest
git fetch origin main
git pull origin main

# Merge with --ff-only
git merge --ff-only stream-XX-name
```

**Decision**:
- **If success** → Proceed to [I]
- **If fails** with "Not possible to fast-forward":
  ```
  ERROR: Worktree was not properly prepared.

  This means either:
  1. You didn't merge main into worktree (skip [B])
  2. Main has new commits since you merged

  FIX:
  1. cd back to worktree
  2. Repeat [B] (merge main into worktree)
  3. Repeat [E] (validate)
  4. Repeat [F] (push)
  5. Try [H] again
  ```

**Why --ff-only?**
- Ensures main never enters conflicted state
- Proves worktree was properly prepared
- All conflict resolution happened in worktree (safe)

**Proceed to**: [I]

---

### [I] Push Main to Origin

**Location**: Main directory

**Commands**:
```bash
git push origin main
```

**Verification**:
```bash
git log -1
# Should show the merge commit from worktree
```

**Proceed to**: [J]

---

### [J] Archive to .project/history/

**Location**: Main directory

**Purpose**: Permanent record of completed work

**Commands**:
```bash
# Generate filename
DATE=$(date +%Y%m%d)
STREAM_NAME="stream-XX-name"  # Replace with actual stream name

# Create archive file
cat > .project/history/${DATE}_${STREAM_NAME}-COMPLETE.md <<'EOF'
# Stream Completed: [Stream Title]

**Date**: YYYY-MM-DD
**Stream**: stream-XX-name
**Branch**: stream-XX-name
**Status**: ✅ Complete

---

## Summary

[Brief 2-3 sentence summary of what was accomplished]

## Changes Made

- Change 1
- Change 2
- Change 3

## Files Modified

[List key files changed, or run: git diff --name-only main~1 main]

## Conflicts Resolved

[If any conflicts during merge, describe how they were resolved]

## Validation

- ✅ TypeScript: Passed
- ✅ Build: Passed
- ✅ Lint: Passed
- ✅ Tests: Passed (or N/A)

## Notes

[Any important notes for future reference]

---

**Completed by**: The Collective
**Merged to main**: [commit hash]
EOF

# Edit the file to fill in details
vim .project/history/${DATE}_${STREAM_NAME}-COMPLETE.md

# Commit the archive
git add .project/history/${DATE}_${STREAM_NAME}-COMPLETE.md
git commit -m "docs: Archive completed stream ${STREAM_NAME}"
git push origin main
```

**Proceed to**: [K]

---

### [K] Delete Worktree

**Location**: Main directory

**Purpose**: Clean up completed work

**Commands**:
```bash
# Remove worktree
git worktree remove ../egirl-platform-worktrees/stream-XX-name

# If worktree has uncommitted changes, force remove:
git worktree remove --force ../egirl-platform-worktrees/stream-XX-name

# Delete local branch (optional, but recommended)
git branch -d stream-XX-name

# Delete remote branch (optional)
git push origin --delete stream-XX-name
```

**Verification**:
```bash
# List remaining worktrees
git worktree list

# stream-XX-name should NOT be in the list
```

**Proceed to**: [L]

---

### [L] Clean Up .project/plan/streams/

**Location**: Main directory

**Purpose**: Remove ephemeral planning files

**Decision**:
- **If .project/plan/streams/stream-XX-name/ exists** → Delete it
- **If doesn't exist** → Skip this step

**Commands**:
```bash
# Check if exists
if [ -d ".project/plan/streams/stream-XX-name" ]; then
  # Remove planning files
  git rm -rf .project/plan/streams/stream-XX-name

  # Commit cleanup
  git commit -m "chore: Clean up stream-XX-name planning files"
  git push origin main
fi
```

**Why delete?**
- Planning files are ephemeral (only needed during active work)
- Permanent record is in `.project/history/`
- Keeps `.project/plan/streams/` clean (only active streams)

**Proceed to**: DONE

---

## DONE: Stream Retired

**Final verification**:
```bash
# Worktree should be gone
git worktree list | grep stream-XX-name
# Should return nothing

# Archive should exist
ls .project/history/ | grep stream-XX-name
# Should show: YYYYMMDD_stream-XX-name-COMPLETE.md

# Main should have the work
git log --oneline -5 | grep stream-XX-name
# Should show merge commit
```

**Stream is now retired.**

---

## Quick Reference Checklist

Use this checklist when completing a stream:

```
Location: Worktree
[ ] A. Verify work committed (git status)
[ ] B. Merge main into worktree (git merge origin/main)
[ ] C. Resolve conflicts intelligently (if any)
[ ] D. Commit merge
[ ] E. Run validation (tsc, build, lint, test)
[ ] F. Push worktree to origin

Location: Main
[ ] G. Switch to main directory (cd /path/to/egirl-platform)
[ ] H. Merge worktree → main (git merge --ff-only)
[ ] I. Push main to origin
[ ] J. Archive to .project/history/YYYYMMDD_stream-XX-COMPLETE.md
[ ] K. Delete worktree (git worktree remove)
[ ] L. Clean up .project/plan/streams/ (if exists)

[ ] DONE: Stream retired
```

---

## Common Issues

### Issue: "Not possible to fast-forward"

**Cause**: Worktree wasn't prepared (didn't merge main into it first)

**Fix**: Go back to worktree, merge main, validate, push, try again

---

### Issue: Conflicts during [B]

**Normal**: This is expected and GOOD - conflicts resolved in worktree (safe)

**Action**: Follow [C] carefully, preserve both intents

---

### Issue: Validation fails at [E]

**Cause**: Conflict resolution introduced errors

**Fix**: Fix errors in worktree, commit, repeat [E]

---

### Issue: Worktree has uncommitted changes at [K]

**Cause**: Forgot to commit something

**Fix**: Use `git worktree remove --force` OR go back and commit first

---

## Philosophy

**This protocol ensures:**

1. ✅ **Main never conflicted** - All conflicts resolved in worktree
2. ✅ **Bidirectional merge** - main → worktree, then worktree → main
3. ✅ **Validation before merge** - Broken code never reaches main
4. ✅ **Permanent record** - .project/history/ keeps all work
5. ✅ **Clean repository** - Completed worktrees removed
6. ✅ **Traceable** - Git history shows all merges

**Why this matters:**
- Multiple agents can work in parallel safely
- Main branch is always stable
- Easy to review what was done
- No lost work
- No pollution from old worktrees

---

**Last Updated**: 2025-12-10
**Maintained by**: The Collective
