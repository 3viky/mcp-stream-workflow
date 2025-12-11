# Pre-Push Hook Integration Design

**Created**: 2025-12-11
**Issue**: Pre-push hook generates screenshots on main, creating uncommitted files
**Solution**: Run screenshot generation in worktree BEFORE complete_merge

---

## Problem Statement

### Current Hook Behavior

The `.husky/pre-push` hook:
1. Detects when pushing to main branch
2. Generates screenshots (`pnpm screenshots:quick`)
3. Stages screenshots (`git add product/screenshots/`)
4. Expects them to be included in the push

### The Issue

**In complete_merge workflow:**
```
1. prepare_merge (in worktree) → push to origin/stream-XX ✅
2. complete_merge (switch to main) → merge --ff-only stream-XX
3. Push to origin/main → pre-push hook runs
4. Hook generates screenshots → NEW FILES
5. Push fails or completes without screenshots
6. Main now has uncommitted files ❌
```

**Result**: Main branch left dirty with uncommitted screenshot files.

---

## Root Cause

The pre-push hook runs **AFTER** the fast-forward merge but **BEFORE** the push completes. Since screenshots are generated based on main branch code, they can't be included in the merge commit (which is already complete).

---

## Solution Design

### Option 1: Generate Screenshots in prepare_merge (RECOMMENDED)

**Run screenshot generation in worktree BEFORE merging to main.**

#### Workflow:
```
1. prepare_merge (in worktree):
   a. Merge main into worktree ✅
   b. Resolve conflicts ✅
   c. Run validation ✅
   d. Generate screenshots ← NEW STEP
   e. Commit screenshots to worktree
   f. Push to origin/stream-XX

2. complete_merge (in main):
   a. Fast-forward merge stream-XX
   b. Push to origin/main
   c. Pre-push hook runs
   d. Hook detects screenshots already present
   e. Hook says "nothing to do" ✅
```

#### Benefits:
- ✅ Screenshots generated with final code
- ✅ Included in merge commit
- ✅ Main stays clean
- ✅ Pre-push hook skips work
- ✅ Complete atomic operation

#### Implementation:

**In prepare_merge.ts** (after validation, before final push):

```typescript
// Step E-2: Generate screenshots (if applicable)
if (config.FEATURES.generateScreenshots) {
  console.error(`[prepare_merge] Generating screenshots...`);

  try {
    // Run screenshot generation - it handles dev server automatically
    await execAsync('pnpm screenshots:quick', {
      cwd: worktreePath,
      timeout: 300000, // 5 minutes (allows time for server start)
    });

    // Stage screenshots if generated
    const screenshotsExist = existsSync(join(worktreePath, 'product/screenshots'));
    if (screenshotsExist) {
      await git.add('product/screenshots/');
      await git.commit('chore: Update screenshots for merge');
      console.error(`[prepare_merge] Screenshots generated and committed`);
    }
  } catch (error) {
    console.error(`[prepare_merge] Screenshot generation failed (non-fatal): ${error}`);
    // Continue - screenshots are not critical for merge
  }
}
```

**Configuration** (in config.ts):

```typescript
export const config = {
  // ... existing config ...

  /**
   * Screenshot generation
   * Set to true to auto-generate screenshots during prepare_merge
   */
  FEATURES: {
    // ... existing features ...
    generateScreenshots: true, // Enable screenshot generation
  },

  /**
   * Screenshot generation timeout (milliseconds)
   * Allows time for dev server to start if needed
   */
  SCREENSHOT_TIMEOUT: 300000, // 5 minutes
};
```

**Note**: No server checking needed - `pnpm screenshots:quick` handles dev server automatically (starts if not running).

---

### Option 2: Modify Pre-Push Hook (NOT RECOMMENDED)

**Change hook to NOT generate screenshots on main push.**

#### Approach:
```bash
# In .husky/pre-push
if [ "$current_branch" = "main" ] || [ "$current_branch" = "master" ]; then
  # Check if screenshots already updated
  if git diff --cached --name-only | grep -q "product/screenshots"; then
    echo "✅ Screenshots already included in commit"
  else
    echo "⚠️ Generating screenshots..."
    # Generate and auto-commit
  fi
fi
```

#### Problems:
- ❌ Requires modifying hook in main project
- ❌ Creates additional commit after merge
- ❌ Breaks fast-forward merge guarantee
- ❌ Couples MCP server behavior to project-specific hooks

**Verdict**: Not recommended - breaks architectural principles.

---

### Option 3: Skip Hook in complete_merge (NOT RECOMMENDED)

**Use `--no-verify` or `SKIP_SCREENSHOTS=1` when pushing.**

#### Implementation:
```typescript
// In complete_merge.ts
await git.push(['origin', 'main', '--no-verify']);
// OR
await execAsync('SKIP_SCREENSHOTS=1 git push origin main', { cwd: mainPath });
```

#### Problems:
- ❌ Bypasses ALL pre-push validations (not just screenshots)
- ❌ Could miss other important pre-push checks
- ❌ Screenshots never get generated
- ❌ Manual intervention required later

**Verdict**: Not recommended - defeats purpose of hooks.

---

## Recommended Implementation: Option 1

### Phase 1: Add Screenshot Generation to prepare_merge

**Changes needed:**

1. **Update config.ts**:
   - Add `FEATURES.generateScreenshots` flag
   - Add `SCREENSHOT_TIMEOUT` configuration (5 minutes to allow server start)

2. **Update prepare_merge.ts**:
   - Add screenshot generation step after validation
   - Call `pnpm screenshots:quick` (handles server automatically)
   - Make it optional (feature flag)
   - Make it non-fatal (continue on error)

3. **Update types.ts**:
   - Add `generateScreenshots?: boolean` to PrepareMergeArgs (optional override)

4. **Update STREAM_COMPLETION_PROTOCOL.md**:
   - Document screenshot generation step
   - Note when it runs (after validation, before push)
   - Note that screenshot command handles dev server automatically

### Phase 2: Update Pre-Push Hook Awareness

**Document in complete_merge.ts**:

```typescript
/**
 * complete_merge - Fast-forward merge worktree into main
 *
 * IMPORTANT: This assumes screenshots were generated in prepare_merge.
 * The pre-push hook will detect them and skip generation.
 *
 * If screenshots were NOT generated (dev server wasn't running),
 * the pre-push hook will attempt to generate them and may leave
 * uncommitted files in main. This is expected behavior.
 */
```

### Phase 3: Handle Edge Cases

**If screenshot generation fails:**

```
Screenshot command handles dev server automatically:
- Starts server if not running
- Generates screenshots
- Shuts down server if it started it

If screenshot generation fails for other reasons:
- Log error message
- Continue with merge (non-fatal)
- Pre-push hook may retry on next push to main

RECOMMENDATION: Non-fatal error handling
```

---

## Implementation Checklist

### Immediate (Required):
- [ ] Add `FEATURES.generateScreenshots` to config.ts
- [ ] Add `SCREENSHOT_TIMEOUT` to config.ts (5 minutes)
- [ ] Add screenshot generation step in prepare_merge.ts (after validation)
- [ ] Call `pnpm screenshots:quick` (no server checking needed)
- [ ] Make screenshot generation non-fatal (log error, continue)
- [ ] Update PrepareMergeArgs to include `generateScreenshots?: boolean`
- [ ] Test screenshot generation during prepare_merge
- [ ] Verify pre-push hook says "nothing to do" after complete_merge
- [ ] Update STREAM_COMPLETION_PROTOCOL.md

### Optional (Future Enhancement):
- [ ] Add `--skip-screenshots` flag to prepare_merge arguments
- [ ] Add screenshot validation (check if screenshots are stale)
- [ ] Add automatic dev server start if not running
- [ ] Add screenshot diff report (what changed)

---

## Testing Strategy

### Test Case 1: Screenshots Generated Successfully
```
1. Develop feature in worktree
2. Run prepare_merge
3. Verify screenshot command runs (may start dev server)
4. Verify screenshots generated in product/screenshots/
5. Verify screenshots committed to worktree
6. Run complete_merge
7. Verify pre-push hook says "nothing to do"
8. Verify main has no uncommitted files ✅
```

### Test Case 2: Screenshot Generation Disabled
```
1. Set FEATURES.generateScreenshots = false
2. Develop feature in worktree
3. Run prepare_merge
4. Verify screenshot generation skipped
5. Run complete_merge
6. Pre-push hook will generate screenshots
7. Verify appropriate handling (may require manual commit)
```

### Test Case 3: Screenshot Generation Failure
```
1. Start dev server
2. Develop feature in worktree
3. Inject screenshot generation error
4. Run prepare_merge
5. Verify error logged but prepare_merge continues
6. Verify merge still succeeds
```

---

## Migration Guide

### For Existing Workflows

**Before this change:**
```
1. prepare_merge → push to origin/stream-XX
2. complete_merge → push to origin/main
3. Pre-push hook generates screenshots
4. Manual commit required ❌
```

**After this change:**
```
1. prepare_merge → generates screenshots → push
2. complete_merge → push to origin/main
3. Pre-push hook detects screenshots → skips
4. No manual intervention needed ✅
```

### For Users Without Screenshot Hooks

**Impact**: None
- Screenshot generation only runs if `FEATURES.generateScreenshots = true`
- Default can be `false` for projects without this requirement
- Can be overridden per-call with `generateScreenshots: false` argument

---

## Documentation Updates Required

1. **README.md**:
   - Mention screenshot generation in prepare_merge
   - Note that screenshot command handles dev server automatically

2. **STREAM_COMPLETION_PROTOCOL.md**:
   - Add Step E-2: Generate Screenshots
   - Note that screenshot command manages dev server automatically

3. **DEVELOPMENT.md**:
   - Note screenshot generation feature
   - Document configuration options

4. **START_STREAM_DESIGN.md**:
   - Mention screenshots are generated during prepare_merge
   - Not during start_stream (no code to screenshot yet)

---

## Conclusion

**Recommended Solution**: Option 1 - Generate screenshots in prepare_merge

**Benefits**:
- ✅ Clean separation of concerns
- ✅ Atomic merge operation
- ✅ Main branch stays clean
- ✅ Pre-push hook has nothing to do
- ✅ Works with existing infrastructure

**Implementation Effort**: ~1-2 hours
- Config changes: 15 min
- prepare_merge changes: 30 min
- Testing: 30 min
- Documentation: 15 min

**Risk**: Low - Non-fatal feature, doesn't break existing functionality

---

**Status**: Design Complete - Ready for Implementation
**Priority**: 🟡 HIGH (prevents dirty main branch)
**Estimated Effort**: 2-3 hours
