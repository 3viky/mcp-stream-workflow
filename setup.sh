#!/usr/bin/env bash
#
# @mcp/stream-workflow Setup Script
#
# Interactive setup for stream workflow MCP server.
# Configures worktree paths and generates Claude Code config.
#
set -e
cd "$(dirname "${BASH_SOURCE[0]}")"

echo "Setting up mcp-stream-workflow..."
echo ""

# Install and build first
echo "Installing dependencies..."
pnpm install --silent
echo "Building..."
pnpm build
echo ""
echo "✓ Build complete!"
echo ""

# Interactive configuration
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  CONFIGURATION"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Try to detect git root from current working directory (where user invoked from)
DETECTED_GIT_ROOT=""
if git rev-parse --show-toplevel >/dev/null 2>&1; then
    DETECTED_GIT_ROOT=$(git rev-parse --show-toplevel)
fi

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
    echo "⚠ No PROJECT_ROOT specified. You'll need to set this in your Claude config."
    PROJECT_ROOT_DISPLAY="/path/to/your/project"
    WORKTREE_ROOT_DISPLAY="/path/to/your/project-worktrees"
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
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  CLAUDE CODE CONFIGURATION"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Add this to your ~/.claude.json under \"mcpServers\":"
echo ""

THIS_DIR=$(pwd)
cat << EOF
  "stream-workflow": {
    "type": "stdio",
    "command": "node",
    "args": ["${THIS_DIR}/dist/server.js"],
    "env": {
      "PROJECT_ROOT": "${PROJECT_ROOT_DISPLAY}",
      "WORKTREE_ROOT": "${WORKTREE_ROOT_DISPLAY}"
    }
  }
EOF

echo ""

# Create worktree directory if it doesn't exist and path is valid
if [[ -n "$WORKTREE_ROOT" && "$WORKTREE_ROOT" != "/path/to/your/project-worktrees" ]]; then
    if [[ ! -d "$WORKTREE_ROOT" ]]; then
        read -p "Create worktree directory at ${WORKTREE_ROOT}? [Y/n]: " CREATE_DIR
        if [[ -z "$CREATE_DIR" || "$CREATE_DIR" =~ ^[Yy] ]]; then
            mkdir -p "$WORKTREE_ROOT"
            echo "✓ Created: ${WORKTREE_ROOT}"
        fi
    else
        echo "✓ Worktree directory exists: ${WORKTREE_ROOT}"
    fi
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  ✓ Setup complete!"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "How it works:"
echo "  - Claude Code runs from anywhere in your project (any subdirectory)"
echo "  - Stream workflow knows PROJECT_ROOT is: ${PROJECT_ROOT_DISPLAY}"
echo "  - Worktrees are created at: ${WORKTREE_ROOT_DISPLAY}/<stream-name>/"
echo ""
echo "Next steps:"
echo "  1. Add the config above to ~/.claude.json"
echo "  2. Restart Claude Code to load the MCP server"
echo "  3. Use stream workflow tools in your conversations"
echo ""
