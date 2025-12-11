/**
 * Dashboard Manager - Atomic STATUS_DASHBOARD.md Management
 *
 * Manages STREAM_STATUS_DASHBOARD.md with atomic updates and locking.
 * Provides markdown-based stream visualization and status tracking.
 *
 * Phase 3 of IMPLEMENTATION_PLAN.md
 */

import {
  existsSync,
  mkdirSync,
  rmdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { config } from './config.js';
import type { Stream, LockInfo, StreamStatus, StreamCategory, StreamPriority } from './types.js';

// ============================================================================
// Dashboard Data Structures
// ============================================================================

export interface DashboardData {
  lastUpdated: Date;
  activeStreams: DashboardStream[];
  completedCount: number;
}

export interface DashboardStream {
  streamId: string;
  streamNumber: number;
  title: string;
  status: StreamStatus;
  category: StreamCategory;
  priority: StreamPriority;
  branch: string;
  createdAt: Date;
  progress: number;
  currentPhase?: string;
  worktreePath: string;
}

// ============================================================================
// Status Icon Mapping
// ============================================================================

const STATUS_ICONS: Record<StreamStatus, string> = {
  active: '🟡',
  blocked: '🔴',
  completed: '✅',
  paused: '⏸️',
  archived: '📦',
};

// Add additional status for "ready to merge"
function getStatusIcon(stream: DashboardStream): string {
  if (stream.status === 'active' && stream.progress === 100) {
    return '🟢'; // Ready for Merge
  }
  return STATUS_ICONS[stream.status] || '⚪';
}

function getStatusText(stream: DashboardStream): string {
  if (stream.status === 'active' && stream.progress === 100) {
    return 'Ready for Merge';
  }
  const statusMap: Record<StreamStatus, string> = {
    active: 'In Progress',
    blocked: 'Blocked',
    completed: 'Completed',
    paused: 'Paused',
    archived: 'Archived',
  };
  return statusMap[stream.status] || 'Unknown';
}

// ============================================================================
// Locking Utilities (Same pattern as complete-merge.ts)
// ============================================================================

async function acquireDashboardLock(operation: string): Promise<boolean> {
  const lockPath = join(config.PROJECT_ROOT, config.DASHBOARD_LOCK_DIR);
  const maxRetries = config.LOCK_MAX_RETRIES;
  const retryInterval = config.LOCK_RETRY_INTERVAL;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      // Atomic directory creation = lock acquisition
      mkdirSync(lockPath, { recursive: false });

      // Write lock info
      const lockInfo: LockInfo = {
        pid: process.pid,
        timestamp: new Date(),
        operation: `dashboard_${operation}`,
      };
      writeFileSync(join(lockPath, 'info.json'), JSON.stringify(lockInfo, null, 2));

      return true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
        // Lock exists - check if stale
        const isStale = await checkStaleDashboardLock(lockPath);
        if (isStale) {
          rmdirSync(lockPath, { recursive: true });
          continue; // Retry
        }

        if (attempt < maxRetries - 1) {
          await sleep(retryInterval);
        }
      } else {
        throw error;
      }
    }
  }

  return false;
}

async function checkStaleDashboardLock(lockPath: string): Promise<boolean> {
  try {
    const infoPath = join(lockPath, 'info.json');
    if (!existsSync(infoPath)) {
      return true; // No info file = stale
    }

    const info: LockInfo = JSON.parse(readFileSync(infoPath, 'utf-8'));
    const lockAge = Date.now() - new Date(info.timestamp).getTime();

    // Lock is stale if older than timeout
    return lockAge > config.MERGE_LOCK_TIMEOUT;
  } catch {
    return true; // Error reading = stale
  }
}

function releaseDashboardLock(): void {
  try {
    const lockPath = join(config.PROJECT_ROOT, config.DASHBOARD_LOCK_DIR);
    rmdirSync(lockPath, { recursive: true });
  } catch {
    // Ignore errors during release
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ============================================================================
// Lock Wrapper
// ============================================================================

export async function withDashboardLock<T>(
  operation: string,
  fn: () => Promise<T>
): Promise<T> {
  const acquired = await acquireDashboardLock(operation);
  if (!acquired) {
    throw new Error(
      `Failed to acquire dashboard lock after ${config.LOCK_MAX_RETRIES} attempts. ` +
        `Another operation may be in progress.`
    );
  }

  try {
    return await fn();
  } finally {
    releaseDashboardLock();
  }
}

// ============================================================================
// Dashboard File I/O
// ============================================================================

export async function loadDashboard(): Promise<string> {
  const dashboardPath = join(config.PROJECT_ROOT, config.DASHBOARD_PATH);

  if (!existsSync(dashboardPath)) {
    // Return initial dashboard template
    return formatDashboard({
      lastUpdated: new Date(),
      activeStreams: [],
      completedCount: 0,
    });
  }

  return readFileSync(dashboardPath, 'utf-8');
}

export async function saveDashboard(content: string): Promise<void> {
  const dashboardPath = join(config.PROJECT_ROOT, config.DASHBOARD_PATH);
  const dashboardDir = join(config.PROJECT_ROOT, '.project');

  // Ensure .project directory exists
  if (!existsSync(dashboardDir)) {
    mkdirSync(dashboardDir, { recursive: true });
  }

  // Atomic write: write to temp file, then rename
  const tempPath = `${dashboardPath}.tmp`;
  writeFileSync(tempPath, content, 'utf-8');

  // Rename is atomic on most filesystems
  if (existsSync(dashboardPath)) {
    // Backup current version
    const backupPath = `${dashboardPath}.bak`;
    if (existsSync(backupPath)) {
      // Remove old backup
      try {
        require('node:fs').unlinkSync(backupPath);
      } catch {
        // Ignore
      }
    }
    require('node:fs').renameSync(dashboardPath, backupPath);
  }

  require('node:fs').renameSync(tempPath, dashboardPath);

  // Remove backup after successful write
  const backupPath = `${dashboardPath}.bak`;
  if (existsSync(backupPath)) {
    try {
      require('node:fs').unlinkSync(backupPath);
    } catch {
      // Ignore
    }
  }
}

// ============================================================================
// Dashboard Parsing
// ============================================================================

export function parseDashboard(content: string): DashboardData {
  const data: DashboardData = {
    lastUpdated: new Date(),
    activeStreams: [],
    completedCount: 0,
  };

  const lines = content.split('\n');

  // Parse last updated
  const updatedMatch = content.match(/\*\*Last Updated\*\*:\s*(.+)/);
  if (updatedMatch) {
    try {
      data.lastUpdated = new Date(updatedMatch[1].trim());
    } catch {
      // Use current date if parse fails
    }
  }

  // Parse completed count
  const completedMatch = content.match(/##\s*Completed Streams\s*\((\d+)\)/);
  if (completedMatch) {
    data.completedCount = parseInt(completedMatch[1], 10);
  }

  // Parse active streams
  let currentStream: Partial<DashboardStream> | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    // Detect stream header: ### Stream 042: Add user authentication
    const streamMatch = line.match(/^###\s+Stream\s+(\d+):\s+(.+)$/);
    if (streamMatch) {
      // Save previous stream if exists
      if (currentStream && currentStream.streamId) {
        data.activeStreams.push(currentStream as DashboardStream);
      }

      // Start new stream
      const streamNumber = parseInt(streamMatch[1], 10);
      const title = streamMatch[2].trim();
      currentStream = {
        streamNumber,
        title,
        streamId: '', // Will be parsed from branch
        status: 'active',
        category: 'backend',
        priority: 'medium',
        branch: '',
        createdAt: new Date(),
        progress: 0,
        worktreePath: '',
      };
      continue;
    }

    if (!currentStream) continue;

    // Parse stream properties
    if (line.startsWith('- **Status**:')) {
      const statusMatch = line.match(/- \*\*Status\*\*:\s+[^\s]+\s+(.+)/);
      if (statusMatch) {
        const statusText = statusMatch[1].trim();
        if (statusText === 'In Progress') currentStream.status = 'active';
        else if (statusText === 'Blocked') currentStream.status = 'blocked';
        else if (statusText === 'Ready for Merge') {
          currentStream.status = 'active';
          currentStream.progress = 100;
        } else if (statusText === 'Paused') currentStream.status = 'paused';
      }
    } else if (line.startsWith('- **Category**:')) {
      const categoryMatch = line.match(/- \*\*Category\*\*:\s+(.+)/);
      if (categoryMatch) {
        currentStream.category = categoryMatch[1].trim().toLowerCase() as StreamCategory;
      }
    } else if (line.startsWith('- **Priority**:')) {
      const priorityMatch = line.match(/- \*\*Priority\*\*:\s+(.+)/);
      if (priorityMatch) {
        currentStream.priority = priorityMatch[1].trim().toLowerCase() as StreamPriority;
      }
    } else if (line.startsWith('- **Branch**:')) {
      const branchMatch = line.match(/- \*\*Branch\*\*:\s+`(.+)`/);
      if (branchMatch) {
        currentStream.branch = branchMatch[1].trim();
        currentStream.streamId = currentStream.branch; // Branch name is stream ID
      }
    } else if (line.startsWith('- **Created**:')) {
      const createdMatch = line.match(/- \*\*Created\*\*:\s+(.+)/);
      if (createdMatch) {
        try {
          currentStream.createdAt = new Date(createdMatch[1].trim());
        } catch {
          // Use current date if parse fails
        }
      }
    } else if (line.startsWith('- **Progress**:')) {
      const progressMatch = line.match(/- \*\*Progress\*\*:\s+(\d+)%/);
      if (progressMatch) {
        currentStream.progress = parseInt(progressMatch[1], 10);
      }
    } else if (line.startsWith('- **Current Phase**:')) {
      const phaseMatch = line.match(/- \*\*Current Phase\*\*:\s+(.+)/);
      if (phaseMatch) {
        currentStream.currentPhase = phaseMatch[1].trim();
      }
    } else if (line.startsWith('- **Worktree**:')) {
      const worktreeMatch = line.match(/- \*\*Worktree\*\*:\s+`(.+)`/);
      if (worktreeMatch) {
        currentStream.worktreePath = worktreeMatch[1].trim();
      }
    }
  }

  // Save last stream
  if (currentStream && currentStream.streamId) {
    data.activeStreams.push(currentStream as DashboardStream);
  }

  return data;
}

// ============================================================================
// Dashboard Formatting
// ============================================================================

export function formatDashboard(data: DashboardData): string {
  const timestamp = data.lastUpdated.toISOString().replace('T', ' ').substring(0, 19);

  let content = `# Stream Status Dashboard

**Last Updated**: ${timestamp}

---

## Active Streams (${data.activeStreams.length})

`;

  if (data.activeStreams.length === 0) {
    content += `No active streams. Call \`start_stream\` to create one.

`;
  } else {
    // Sort streams by stream number (descending, newest first)
    const sorted = [...data.activeStreams].sort((a, b) => b.streamNumber - a.streamNumber);

    for (const stream of sorted) {
      const icon = getStatusIcon(stream);
      const statusText = getStatusText(stream);

      content += `### Stream ${stream.streamNumber.toString().padStart(3, '0')}: ${stream.title}
- **Status**: ${icon} ${statusText}
- **Category**: ${capitalize(stream.category)}
- **Priority**: ${capitalize(stream.priority)}
- **Branch**: \`${stream.branch}\`
- **Created**: ${formatDate(stream.createdAt)}
- **Progress**: ${stream.progress}%`;

      if (stream.currentPhase) {
        content += `\n- **Current Phase**: ${stream.currentPhase}`;
      }

      content += `\n- **Worktree**: \`${stream.worktreePath}\`

`;
    }
  }

  content += `---

## Completed Streams (${data.completedCount})

See [.project/history/](./history/) for archived streams.

---

🤖 Managed by Stream Workflow Manager
`;

  return content;
}

// ============================================================================
// High-Level Operations
// ============================================================================

export async function addStream(stream: Partial<Stream>): Promise<void> {
  await withDashboardLock('add_stream', async () => {
    const content = await loadDashboard();
    const data = parseDashboard(content);

    // Convert Stream to DashboardStream
    const dashboardStream: DashboardStream = {
      streamId: stream.id || '',
      streamNumber: stream.number || 0,
      title: stream.title || 'Untitled Stream',
      status: stream.status || 'active',
      category: stream.category || 'backend',
      priority: stream.priority || 'medium',
      branch: stream.branch || '',
      createdAt: stream.createdAt || new Date(),
      progress: stream.progress || 0,
      currentPhase: stream.currentPhase !== null && stream.currentPhase !== undefined
        ? stream.phases?.[stream.currentPhase]?.name
        : undefined,
      worktreePath: stream.worktreePath || '',
    };

    // Add to active streams
    data.activeStreams.push(dashboardStream);
    data.lastUpdated = new Date();

    // Save updated dashboard
    const updated = formatDashboard(data);
    await saveDashboard(updated);
  });
}

export async function updateStream(
  streamId: string,
  updates: Partial<DashboardStream>
): Promise<void> {
  await withDashboardLock('update_stream', async () => {
    const content = await loadDashboard();
    const data = parseDashboard(content);

    // Find stream
    const streamIndex = data.activeStreams.findIndex((s) => s.streamId === streamId);
    if (streamIndex === -1) {
      throw new Error(`Stream not found in dashboard: ${streamId}`);
    }

    // Update stream
    data.activeStreams[streamIndex] = {
      ...data.activeStreams[streamIndex],
      ...updates,
    };
    data.lastUpdated = new Date();

    // Save updated dashboard
    const updated = formatDashboard(data);
    await saveDashboard(updated);
  });
}

export async function removeStream(streamId: string): Promise<void> {
  await withDashboardLock('remove_stream', async () => {
    const content = await loadDashboard();
    const data = parseDashboard(content);

    // Remove from active streams
    const streamIndex = data.activeStreams.findIndex((s) => s.streamId === streamId);
    if (streamIndex !== -1) {
      data.activeStreams.splice(streamIndex, 1);
      data.completedCount += 1; // Increment completed count
    }

    data.lastUpdated = new Date();

    // Save updated dashboard
    const updated = formatDashboard(data);
    await saveDashboard(updated);
  });
}

// ============================================================================
// Utility Functions
// ============================================================================

function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function formatDate(date: Date): string {
  return date.toISOString().split('T')[0];
}
