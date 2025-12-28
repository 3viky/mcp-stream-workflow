#!/usr/bin/env bash
#
# Dashboard Sync Script
#
# Purpose: Submit commit data to stream-workflow-status dashboard API
# Called by: post-commit hook (every 3-5 commits)
# Runs in: Background (non-blocking)
#
# This script:
# 1. Collects current commit information
# 2. Posts commit data to dashboard API (POST /api/commits)
# 3. Dashboard updates in real-time via SQLite database
#
# NO GIT COMMITS TO MAIN - uses HTTP API instead
#

set -e

# ============================================================================
# Configuration
# ============================================================================

WORKTREE_DIR="$(git rev-parse --show-toplevel)"
STREAM_ID="$(basename "$WORKTREE_DIR")"
BRANCH="$(git rev-parse --abbrev-ref HEAD)"

# Get API port from git config (default: 3001)
API_PORT="$(git config --get stream-workflow.api-port || echo "3001")"
API_URL="http://localhost:${API_PORT}/api/commits"

# ============================================================================
# Collect Commit Information
# ============================================================================

echo "[sync-dashboard] Collecting commit information for ${STREAM_ID}..."

# Latest commit (full hash for API)
COMMIT_HASH="$(git log -1 --format='%H')"
COMMIT_SHORT="$(git log -1 --format='%h')"
COMMIT_MSG="$(git log -1 --format='%s')"
COMMIT_AUTHOR="$(git log -1 --format='%an <%ae>')"

# Files changed in this commit
FILES_CHANGED="$(git diff-tree --no-commit-id --name-only -r HEAD | wc -l)"

# ISO 8601 timestamp
TIMESTAMP="$(git log -1 --format='%aI')"

echo "[sync-dashboard] Commit: ${COMMIT_SHORT} ${COMMIT_MSG}"
echo "[sync-dashboard] Author: ${COMMIT_AUTHOR}"
echo "[sync-dashboard] Files changed: ${FILES_CHANGED}"

# ============================================================================
# Submit Commit to Dashboard API
# ============================================================================

echo "[sync-dashboard] Submitting commit to dashboard API..."

# Build JSON payload
JSON_PAYLOAD=$(cat <<EOF
{
  "streamId": "${STREAM_ID}",
  "commitHash": "${COMMIT_HASH}",
  "message": "${COMMIT_MSG}",
  "author": "${COMMIT_AUTHOR}",
  "filesChanged": ${FILES_CHANGED},
  "timestamp": "${TIMESTAMP}"
}
EOF
)

# POST to API
HTTP_CODE=$(curl -s -o /tmp/sync-dashboard-response.txt -w "%{http_code}" \
  -X POST "${API_URL}" \
  -H "Content-Type: application/json" \
  -d "${JSON_PAYLOAD}")

# Check response
if [ "$HTTP_CODE" -eq 201 ]; then
  echo "[sync-dashboard] ✅ Commit submitted successfully (HTTP $HTTP_CODE)"
  echo "[sync-dashboard] Dashboard updated via API - no git commits to main"
elif [ "$HTTP_CODE" -eq 404 ]; then
  echo "[sync-dashboard] ⚠️  Stream not found in database (HTTP $HTTP_CODE)"
  echo "[sync-dashboard] Response: $(cat /tmp/sync-dashboard-response.txt)"
  echo "[sync-dashboard] Stream may need to be registered first"
  exit 1
elif [ "$HTTP_CODE" -eq 000 ]; then
  echo "[sync-dashboard] ⚠️  API server not reachable at ${API_URL}"
  echo "[sync-dashboard] Ensure mcp-stream-workflow-status is running"
  echo "[sync-dashboard] Check: curl ${API_URL%/commits}/stats"
  exit 1
else
  echo "[sync-dashboard] ⚠️  API request failed (HTTP $HTTP_CODE)"
  echo "[sync-dashboard] Response: $(cat /tmp/sync-dashboard-response.txt)"
  exit 1
fi

# Cleanup
rm -f /tmp/sync-dashboard-response.txt

echo "[sync-dashboard] Sync complete"
exit 0
