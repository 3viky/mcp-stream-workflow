#!/usr/bin/env bash
#
# Dashboard Sync Script
#
# Purpose: Update STATUS_DASHBOARD.md with current stream progress
# Called by: post-commit hook (every 3-5 commits)
# Runs in: Background (non-blocking)
#
# This script:
# 1. Collects current stream progress (commits, files, latest message)
# 2. Switches to main project directory
# 3. Updates STATUS_DASHBOARD.md with new progress info
# 4. Commits the dashboard update with --no-verify (bypasses pre-commit hook)
# 5. Returns to worktree
#

set -e

# ============================================================================
# Configuration
# ============================================================================

WORKTREE_DIR="$(git rev-parse --show-toplevel)"
STREAM_ID="$(basename "$WORKTREE_DIR")"
BRANCH="$(git rev-parse --abbrev-ref HEAD)"

# Get PROJECT_ROOT from git config
PROJECT_ROOT="$(git config --get stream-workflow.project-root || echo "")"

if [ -z "$PROJECT_ROOT" ]; then
  echo "[sync-dashboard] Error: PROJECT_ROOT not configured"
  echo "[sync-dashboard] Run: git config stream-workflow.project-root /path/to/main"
  exit 1
fi

DASHBOARD="${PROJECT_ROOT}/.project/STREAM_STATUS_DASHBOARD.md"

# ============================================================================
# Collect Progress Information
# ============================================================================

echo "[sync-dashboard] Collecting progress for ${STREAM_ID}..."

# Total commits on this branch
COMMIT_COUNT="$(git rev-list --count HEAD)"

# Latest commit
LATEST_COMMIT_HASH="$(git log -1 --format='%h')"
LATEST_COMMIT_MSG="$(git log -1 --format='%s')"

# Files changed in last 5 commits
CHANGED_FILES="$(git diff --name-only HEAD~5..HEAD 2>/dev/null | wc -l || echo "0")"

# Current timestamp
TIMESTAMP="$(date '+%Y-%m-%d %H:%M')"

echo "[sync-dashboard] Progress: ${COMMIT_COUNT} commits, ${CHANGED_FILES} files changed"
echo "[sync-dashboard] Latest: ${LATEST_COMMIT_HASH} ${LATEST_COMMIT_MSG}"

# ============================================================================
# Update Dashboard
# ============================================================================

echo "[sync-dashboard] Updating dashboard in main project..."

cd "$PROJECT_ROOT"

# Check if dashboard exists
if [ ! -f "$DASHBOARD" ]; then
  echo "[sync-dashboard] Warning: Dashboard not found at ${DASHBOARD}"
  echo "[sync-dashboard] Creating new dashboard..."
  mkdir -p "$(dirname "$DASHBOARD")"
  cat > "$DASHBOARD" << 'EOF'
# Stream Status Dashboard

**Last Updated**: Auto-synced

## Active Streams

No active streams yet.
EOF
fi

# Update dashboard using Python for robust parsing
python3 << PYTHON_SCRIPT
import re
import sys
from datetime import datetime

dashboard_path = "${DASHBOARD}"
stream_id = "${STREAM_ID}"
commit_count = "${COMMIT_COUNT}"
latest_hash = "${LATEST_COMMIT_HASH}"
latest_msg = "${LATEST_COMMIT_MSG}"
changed_files = "${CHANGED_FILES}"
timestamp = "${TIMESTAMP}"

try:
    with open(dashboard_path, 'r') as f:
        content = f.read()

    # Find stream section
    pattern = rf"## {re.escape(stream_id)}.*?(?=\n##|\Z)"
    match = re.search(pattern, content, re.DOTALL)

    if match:
        # Update existing stream section
        old_section = match.group(0)

        # Update Last Updated timestamp
        new_section = re.sub(
            r'\*\*Last Updated\*\*:.*',
            f"**Last Updated**: {timestamp} (auto-synced)",
            old_section
        )

        # Update or add Progress section
        if "**Progress**:" in new_section:
            # Replace existing progress
            new_section = re.sub(
                r'\*\*Progress\*\*:.*?(?=\n\*\*|\n\n|\Z)',
                f"""**Progress**:
- Commits: {commit_count}
- Files changed: {changed_files}
- Latest: \`{latest_hash} {latest_msg}\`
""",
                new_section,
                flags=re.DOTALL
            )
        else:
            # Add progress section after Last Updated
            new_section = re.sub(
                r'(\*\*Last Updated\*\*:.*\n)',
                rf'\1\n**Progress**:\n- Commits: {commit_count}\n- Files changed: {changed_files}\n- Latest: `{latest_hash} {latest_msg}`\n',
                new_section
            )

        content = content.replace(old_section, new_section)
    else:
        print(f"[sync-dashboard] Warning: Stream {stream_id} not found in dashboard", file=sys.stderr)
        print(f"[sync-dashboard] Dashboard may need manual update", file=sys.stderr)

    # Write updated dashboard
    with open(dashboard_path, 'w') as f:
        f.write(content)

    print(f"[sync-dashboard] Dashboard updated successfully", file=sys.stderr)
    sys.exit(0)

except Exception as e:
    print(f"[sync-dashboard] Error updating dashboard: {e}", file=sys.stderr)
    sys.exit(1)

PYTHON_SCRIPT

# Check if update succeeded
if [ $? -ne 0 ]; then
  echo "[sync-dashboard] Failed to update dashboard"
  exit 1
fi

# ============================================================================
# Commit Dashboard Update
# ============================================================================

echo "[sync-dashboard] Committing dashboard update..."

# Check if there are changes
if git diff --quiet "$DASHBOARD"; then
  echo "[sync-dashboard] No changes to commit"
  exit 0
fi

# Commit with --no-verify to bypass pre-commit hook
# (pre-commit hook blocks commits in main, but dashboard updates are allowed)
git add "$DASHBOARD"
git commit --no-verify -m "chore: Update stream status [${STREAM_ID}]

Commits: ${COMMIT_COUNT}
Latest: ${LATEST_COMMIT_HASH} ${LATEST_COMMIT_MSG}
Files changed: ${CHANGED_FILES}

🤖 Auto-synced by post-commit hook" > /dev/null 2>&1

if [ $? -eq 0 ]; then
  echo "[sync-dashboard] ✅ Dashboard committed successfully"
else
  echo "[sync-dashboard] ⚠️  Failed to commit dashboard (non-fatal)"
fi

echo "[sync-dashboard] Sync complete"
exit 0
