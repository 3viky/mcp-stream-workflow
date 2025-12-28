#!/usr/bin/env bash
#
# @mcp/stream-workflow Setup Script
#
# Interactive setup for stream workflow MCP server.
# Configures worktree paths, installs git hooks, and generates Claude Code config.
#
set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "Setting up mcp-stream-workflow..."
echo ""

# Install and build first
echo "Installing dependencies..."
pnpm install --silent
echo "Building..."
pnpm build
echo ""
echo "Build complete!"
echo ""

# Interactive configuration
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  CONFIGURATION"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Try to detect git root from original working directory (where user invoked from)
ORIGINAL_DIR="${OLDPWD:-$(pwd)}"
DETECTED_GIT_ROOT=""

# Check if we can detect a git root
pushd "$ORIGINAL_DIR" >/dev/null 2>&1 || true
if git rev-parse --show-toplevel >/dev/null 2>&1; then
  DETECTED_GIT_ROOT=$(git rev-parse --show-toplevel)
fi
popd >/dev/null 2>&1 || true

# Get PROJECT_ROOT
if [[ -n "$DETECTED_GIT_ROOT" ]]; then
  echo "Detected git repository: $DETECTED_GIT_ROOT"
  echo ""
  read -p "Use this as PROJECT_ROOT? [Y/n]: " USE_DETECTED

  if [[ -z "$USE_DETECTED" || "$USE_DETECTED" =~ ^[Yy] ]]; then
    PROJECT_ROOT="$DETECTED_GIT_ROOT"
  else
    echo ""
    echo "Enter the path to your main git repository:"
    read -p "PROJECT_ROOT: " PROJECT_ROOT
  fi
else
  echo "No git repository detected in current directory."
  echo ""
  echo "Enter the path to your main git repository:"
  read -p "PROJECT_ROOT [press Enter to skip]: " PROJECT_ROOT
fi

if [[ -z "$PROJECT_ROOT" ]]; then
  echo ""
  echo "No PROJECT_ROOT specified. You'll need to set this in your Claude config."
  PROJECT_ROOT_DISPLAY="/path/to/your/project"
  WORKTREE_ROOT_DISPLAY="/path/to/your/project-worktrees"
  INSTALL_HOOKS=false
else
  # Expand to absolute path
  PROJECT_ROOT=$(cd "$PROJECT_ROOT" 2>/dev/null && pwd || echo "$PROJECT_ROOT")
  PROJECT_ROOT_DISPLAY="$PROJECT_ROOT"

  # Calculate default worktree root: ../<project-name>-worktrees relative to PROJECT_ROOT
  PROJECT_NAME=$(basename "$PROJECT_ROOT")
  PROJECT_PARENT=$(dirname "$PROJECT_ROOT")
  DEFAULT_WORKTREE_ROOT="${PROJECT_PARENT}/${PROJECT_NAME}-worktrees"

  echo ""
  echo "Worktree directory (where git worktrees will be created):"
  echo "  Default: ${DEFAULT_WORKTREE_ROOT}"
  echo ""
  echo "  This is a sibling directory to your project root."
  echo "  Example: If PROJECT_ROOT is /home/user/my-app"
  echo "           Worktrees go to /home/user/my-app-worktrees/stream-XX-name/"
  echo ""
  read -p "WORKTREE_ROOT [press Enter for default]: " WORKTREE_ROOT

  if [[ -z "$WORKTREE_ROOT" ]]; then
    WORKTREE_ROOT="$DEFAULT_WORKTREE_ROOT"
  fi
  WORKTREE_ROOT_DISPLAY="$WORKTREE_ROOT"

  # Create worktree directory if it doesn't exist
  if [[ ! -d "$WORKTREE_ROOT" ]]; then
    echo ""
    read -p "Create worktree directory at ${WORKTREE_ROOT}? [Y/n]: " CREATE_DIR
    if [[ -z "$CREATE_DIR" || "$CREATE_DIR" =~ ^[Yy] ]]; then
      mkdir -p "$WORKTREE_ROOT"
      echo "Created: ${WORKTREE_ROOT}"
    fi
  else
    echo ""
    echo "Worktree directory exists: ${WORKTREE_ROOT}"
  fi

  INSTALL_HOOKS=true
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  GIT HOOKS"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "This package includes git hooks to enforce worktree workflow:"
echo ""
echo "  pre-commit              - Blocks commits in main directory"
echo "  verify-worktree-location - Manual verification script"
echo "  merge-worktree-to-main   - Safe merge with locking"
echo ""

if [[ "$INSTALL_HOOKS" == "true" ]]; then
  read -p "Install git hooks to ${PROJECT_ROOT}? [Y/n]: " INSTALL_HOOKS_CONFIRM

  if [[ -z "$INSTALL_HOOKS_CONFIRM" || "$INSTALL_HOOKS_CONFIRM" =~ ^[Yy] ]]; then
    # Create .git-hooks directory in project
    HOOKS_TARGET="${PROJECT_ROOT}/.git-hooks"
    mkdir -p "$HOOKS_TARGET"

    # Copy hooks
    cp "${SCRIPT_DIR}/hooks/pre-commit" "$HOOKS_TARGET/"
    cp "${SCRIPT_DIR}/hooks/verify-worktree-location" "$HOOKS_TARGET/"
    cp "${SCRIPT_DIR}/hooks/merge-worktree-to-main" "$HOOKS_TARGET/"
    chmod +x "$HOOKS_TARGET"/*

    echo "Installed hooks to: ${HOOKS_TARGET}/"

    # Ask about enabling pre-commit hook
    echo ""
    read -p "Enable pre-commit hook (blocks commits in main)? [Y/n]: " ENABLE_PRECOMMIT

    if [[ -z "$ENABLE_PRECOMMIT" || "$ENABLE_PRECOMMIT" =~ ^[Yy] ]]; then
      # Symlink or copy to .git/hooks
      GIT_HOOKS_DIR="${PROJECT_ROOT}/.git/hooks"
      if [[ -d "$GIT_HOOKS_DIR" ]]; then
        cp "${HOOKS_TARGET}/pre-commit" "${GIT_HOOKS_DIR}/pre-commit"
        chmod +x "${GIT_HOOKS_DIR}/pre-commit"
        echo "Enabled pre-commit hook in: ${GIT_HOOKS_DIR}/"
      else
        echo "Warning: ${GIT_HOOKS_DIR} not found. Is this a git repository?"
      fi
    fi

    echo ""
    echo "Hooks installed!"
  else
    echo "Skipped hook installation."
  fi
else
  echo "Skipping hook installation (no PROJECT_ROOT specified)."
  echo ""
  echo "To install hooks later, run:"
  echo "  cp ${SCRIPT_DIR}/hooks/* /path/to/project/.git-hooks/"
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  OPTIONAL FEATURES"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Screenshot Generation (OPTIONAL):"
echo "  Automatically generates screenshots during prepare_merge"
echo "  Prevents pre-push hooks from creating uncommitted files in main"
echo ""
echo "  Enable ONLY if your project has:"
echo "    - A 'pnpm screenshots:quick' command"
echo "    - A pre-push hook that generates screenshots"
echo ""

ENABLE_SCREENSHOTS=false
read -p "Enable screenshot generation? [y/N]: " ENABLE_SCREENSHOTS_INPUT

if [[ "$ENABLE_SCREENSHOTS_INPUT" =~ ^[Yy] ]]; then
  ENABLE_SCREENSHOTS=true
  SCREENSHOT_ENV_CONFIG="      \"ENABLE_SCREENSHOTS\": \"true\","
  echo ""
  echo "✅ Screenshot generation will be ENABLED"
else
  SCREENSHOT_ENV_CONFIG=""
  echo ""
  echo "Screenshot generation will be DISABLED (default)"
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  CLAUDE CODE CONFIGURATION"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Add this to your ~/.claude.json under \"mcpServers\":"
echo ""

if [[ -n "$SCREENSHOT_ENV_CONFIG" ]]; then
cat << EOF
  "stream-workflow": {
    "type": "stdio",
    "command": "node",
    "args": ["${SCRIPT_DIR}/dist/server.js"],
    "env": {
$SCREENSHOT_ENV_CONFIG
      "PROJECT_ROOT": "${PROJECT_ROOT_DISPLAY}",
      "WORKTREE_ROOT": "${WORKTREE_ROOT_DISPLAY}"
    }
  }
EOF
else
cat << EOF
  "stream-workflow": {
    "type": "stdio",
    "command": "node",
    "args": ["${SCRIPT_DIR}/dist/server.js"],
    "env": {
      "PROJECT_ROOT": "${PROJECT_ROOT_DISPLAY}",
      "WORKTREE_ROOT": "${WORKTREE_ROOT_DISPLAY}"
    }
  }
EOF
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Setup complete!"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "How it works:"
echo "  - Claude Code runs from anywhere in your project (any subdirectory)"
echo "  - MCP server knows PROJECT_ROOT is: ${PROJECT_ROOT_DISPLAY}"
echo "  - Worktrees are created at: ${WORKTREE_ROOT_DISPLAY}/<stream-name>/"
echo "  - Git hooks enforce worktree-only commits"
if [[ "$ENABLE_SCREENSHOTS" == "true" ]]; then
echo "  - Screenshot generation: ENABLED (via env var)"
else
echo "  - Screenshot generation: DISABLED (default)"
fi
echo ""
echo "Available hooks (in .git-hooks/):"
echo "  verify-worktree-location  - Check if you're in a worktree"
echo "  merge-worktree-to-main    - Safe merge with locking"
echo ""
echo "Configuration options:"
echo "  - Per-project: Add ENABLE_SCREENSHOTS to env in ~/.claude.json (shown above)"
echo "  - Global: Add to ~/.claude/mcp-config.json:"
echo "    {\"streamWorkflow\": {\"enableScreenshots\": true}}"
echo "  - See docs/OPTIONAL_FEATURES.md for more details"
echo ""
echo "Next steps:"
echo "  1. Add the config above to ~/.claude.json"
echo "  2. Restart Claude Code to load the MCP server"
echo "  3. Use stream workflow tools in your conversations"
echo ""
