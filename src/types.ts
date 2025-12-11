/**
 * Type definitions for Stream Workflow Manager MCP Server
 *
 * This file defines all TypeScript interfaces and types used throughout the server.
 * When adding new features, update these types accordingly.
 */

// Note: Anthropic and SimpleGit types are used in JSDoc/type annotations elsewhere
// Keeping import structure for future use when full typing is needed

// ============================================================================
// MCP Protocol Types
// ============================================================================

export interface MCPResponse {
  content: Array<{
    type: 'text' | 'image' | 'resource';
    text?: string;
    data?: string;
    mimeType?: string;
  }>;
  _meta?: ResponseMetadata;
  _note_to_agent?: NoteToAgent;
}

export interface ResponseMetadata {
  tool: string;
  version: string;
  sourceLocation?: {
    repository: string;
    mcp_server: string;
    files: {
      server: string;
      this_tool: string;
      [key: string]: string;
    };
  };
  updateInstructions?: {
    summary: string;
    workflow: string[];
    hotReload?: string;
    documentation?: string;
  };
  limitations?: {
    known: string[];
    reportIssues?: string;
  };
  extensionPoints?: {
    [key: string]: string;
  };
}

export interface NoteToAgent {
  capability: string;
  limitation?: string;
  if_you_need?: {
    [feature: string]: string;
  };
  quick_update_guide?: string;
}

// ============================================================================
// Stream Types
// ============================================================================

export interface Stream {
  id: string;
  number: number | string;  // number (legacy) or string (version-aware: "1500", "1500a")
  title: string;
  category: StreamCategory;
  priority: StreamPriority;
  status: StreamStatus;
  worktreePath: string;
  branch: string;
  createdAt: Date;
  updatedAt: Date;
  phases: StreamPhase[];
  currentPhase: number | null;
  progress: number; // 0-100
  blockedReason?: string;
  completedAt?: Date;
}

export type StreamCategory =
  | 'backend'
  | 'frontend'
  | 'infrastructure'
  | 'testing'
  | 'documentation'
  | 'refactoring';

export type StreamPriority = 'critical' | 'high' | 'medium' | 'low';

export type StreamStatus = 'active' | 'blocked' | 'completed' | 'paused' | 'archived';

export interface StreamPhase {
  name: string;
  description?: string;
  status: 'pending' | 'in_progress' | 'completed';
  completedAt?: Date;
}

export interface StreamState {
  nextStreamId: number;
  streams: Record<string, Stream>;
  lock: LockInfo | null;
  lastSync: Date;
}

export interface LockInfo {
  pid: number;
  timestamp: Date;
  streamId?: string;
  operation?: string;
}

// ============================================================================
// Conflict Resolution Types
// ============================================================================

export interface ConflictContext {
  file: string;
  streamId: string;
  oursContent: string;
  theirsContent: string;
  conflictContent: string;
  mainCommits: GitCommit[];
  streamCommits: GitCommit[];
  fileType: string;
  conflictType: ConflictType;
}

export type ConflictType =
  | 'code'
  | 'config'
  | 'docs'
  | 'binary'
  | 'migration'
  | 'schema'
  | 'unknown';

export interface ConflictStrategy {
  name: string;
  canHandle(file: string, context: ConflictContext): boolean;
  resolve(context: ConflictContext): Promise<ResolutionResult>;
}

export interface ResolutionResult {
  resolved: boolean;
  content: string | null;
  strategy: string;
  confidence: 'high' | 'medium' | 'low';
  reason?: string;
  warnings?: string[];
}

export interface GitCommit {
  hash: string;
  message: string;
  author: string;
  date: Date;
  files: string[];
}

// ============================================================================
// Validation Types
// ============================================================================

export interface Validator {
  name: string;
  validate(workingDir: string): Promise<ValidationResult>;
}

export interface ValidationResult {
  passed: boolean;
  errors: string[];
  warnings: string[];
  details?: string;
}

// ============================================================================
// Tool Argument Types
// ============================================================================

export interface VerifyLocationArgs {
  // No arguments - checks current directory
}

export interface CreateStreamArgs {
  title: string;
  category: StreamCategory;
  priority: StreamPriority;
  estimatedPhases?: number;
  template?: string;
}

export interface UpdateStreamStatusArgs {
  streamId: string;
  status: StreamStatus;
  currentPhase?: string;
  blockedReason?: string;
  progress?: number;
}

export interface GetStreamInfoArgs {
  streamId?: string; // If omitted, uses current worktree
}

export interface ListStreamsArgs {
  status?: StreamStatus;
  category?: StreamCategory;
  sortBy?: 'createdAt' | 'updatedAt' | 'priority';
  order?: 'asc' | 'desc';
}

export interface CompletePhaseArgs {
  streamId: string;
  phaseName: string;
  summary?: string;
}

export interface PrepareMergeArgs {
  streamId: string;
  validateBeforePush?: boolean;
}

export interface CompleteMergeArgs {
  streamId: string;
  deleteRemoteBranch?: boolean;
}

export interface CompleteStreamArgs {
  streamId: string;
  summary: string;
  archiveNotes?: string;
  deleteWorktree?: boolean;
}

export interface ValidateStreamArgs {
  streamId?: string; // If omitted, uses current worktree
}

export interface SyncDashboardArgs {
  force?: boolean;
}

export interface RollbackMergeArgs {
  streamId: string;
  targetCommit?: string;
  reason: string;
}

/**
 * Arguments for starting a new stream
 * Creates a new worktree, branch, and initializes stream state
 */
export interface StartStreamArgs {
  title: string;
  category: StreamCategory;
  priority: StreamPriority;
  handoff: string;
  description?: string;
  estimatedPhases?: string[];
  tags?: string[];
  subStreamOf?: string;  // Optional parent stream ID for creating sub-streams
}

// ============================================================================
// Tool Response Types
// ============================================================================

export interface VerifyLocationResponse {
  isValid: boolean;
  currentPath: string;
  streamId?: string;
  branch?: string;
  error?: string;
}

export interface CreateStreamResponse {
  success: boolean;
  streamId: string;
  worktreePath: string;
  branchName: string;
  streamFilePath: string;
}

export interface UpdateStreamStatusResponse {
  success: boolean;
  streamId: string;
  previousStatus: StreamStatus;
  newStatus: StreamStatus;
}

export interface GetStreamInfoResponse {
  stream: Stream;
  location: {
    worktreePath: string;
    branch: string;
    isClean: boolean;
  };
  progress: {
    phasesCompleted: number;
    totalPhases: number;
    percentage: number;
  };
}

export interface ListStreamsResponse {
  streams: Stream[];
  total: number;
  filtered: number;
}

export interface CompletePhaseResponse {
  success: boolean;
  streamId: string;
  phaseName: string;
  newProgress: number;
  allPhasesComplete: boolean;
}

export interface PrepareMergeResponse {
  success: boolean;
  mergeType: 'clean' | 'with-conflicts';
  conflicts: string[];
  resolved: Array<{
    file: string;
    strategy: string;
    confidence: string;
  }>;
  validation: {
    typecheck: 'passed' | 'failed';
    build: 'passed' | 'failed';
    lint: 'passed' | 'failed';
    [key: string]: 'passed' | 'failed';
  };
  commitHash: string;
  readyForMerge: boolean;
}

export interface CompleteMergeResponse {
  success: boolean;
  mergeType: 'fast-forward' | 'no-ff';
  mainCommitHash: string;
  pushedToOrigin: boolean;
  remoteBranchDeleted: boolean;
}

export interface CompleteStreamResponse {
  success: boolean;
  streamId: string;
  archivedTo: string;
  worktreeDeleted: boolean;
}

export interface ValidateStreamResponse {
  valid: boolean;
  issues: string[];
  warnings: string[];
  checks: {
    worktreeExists: boolean;
    branchExists: boolean;
    streamFileValid: boolean;
    noConflicts: boolean;
    upToDate: boolean;
  };
}

export interface SyncDashboardResponse {
  success: boolean;
  streamsFound: number;
  streamsUpdated: number;
  orphanedWorktrees: string[];
  missingStreamFiles: string[];
}

/**
 * Response from starting a new stream
 * Includes stream metadata, worktree information, and next steps
 */
export interface StartStreamResponse {
  success: boolean;
  streamId: string;
  streamNumber: number;
  worktreePath: string;
  branchName: string;
  metadata: {
    planDir: string;
    filesCreated: string[];
    commitHash: string;
  };
  nextSteps: string[];
  handoffPath: string;
}

// ============================================================================
// Error Types
// ============================================================================

export interface FixInstructions {
  summary: string;
  files: string[];
  steps: string[];
  references: string[];
}

export class SelfDocumentingError extends Error {
  constructor(
    message: string,
    public fixInstructions: FixInstructions
  ) {
    const formattedMessage =
      `${message}\n\n` +
      `💡 TO FIX THIS LIMITATION:\n` +
      `${fixInstructions.summary}\n\n` +
      `Files to edit:\n${fixInstructions.files.map(f => `  - ${f}`).join('\n')}\n\n` +
      `Steps:\n${fixInstructions.steps.map((s, i) => `  ${i + 1}. ${s}`).join('\n')}\n\n` +
      `References:\n${fixInstructions.references.map(r => `  - ${r}`).join('\n')}`;

    super(formattedMessage);
    this.name = 'SelfDocumentingError';
  }
}

export class WorktreeViolationError extends SelfDocumentingError {
  constructor(message: string, customInstructions?: Partial<FixInstructions>) {
    super(message, {
      summary: 'All work must be done in worktrees, not main directory',
      files: ['.git-hooks/verify-worktree-location'],
      steps: [
        'Create worktree: git worktree add ../egirl-platform-worktrees/stream-XX-name -b stream-XX-name',
        'Navigate to worktree',
        'Verify location: .git-hooks/verify-worktree-location',
      ],
      references: ['README.md#quick-update-workflow', 'CLAUDE.md#worktree-only-enforcement'],
      ...customInstructions,
    });
    this.name = 'WorktreeViolationError';
  }
}

export class ValidationError extends SelfDocumentingError {
  constructor(
    message: string,
    public validationErrors: string[],
    customInstructions?: Partial<FixInstructions>
  ) {
    super(message, {
      summary: 'Fix validation errors before proceeding',
      files: [],
      steps: [
        'Review validation errors',
        'Fix issues in source code',
        'Re-run validation',
      ],
      references: ['docs/ARCHITECTURE.md#validation'],
      ...customInstructions,
    });
    this.name = 'ValidationError';
  }
}

// ============================================================================
// Configuration Types
// ============================================================================

export interface Config {
  // File Processing
  MAX_FILE_SIZE: number;
  MAX_CONFLICTS_PER_MERGE: number;

  // Timeouts
  CONFLICT_RESOLUTION_TIMEOUT: number;
  MERGE_LOCK_TIMEOUT: number;
  VALIDATION_TIMEOUT: number;
  SCREENSHOT_TIMEOUT: number;

  // AI Configuration
  ANTHROPIC_MODEL: string;
  MAX_TOKENS: number;
  TEMPERATURE: number;

  // Paths
  PROJECT_ROOT: string;
  WORKTREE_ROOT: string;
  DASHBOARD_PATH: string;
  STREAM_STATE_PATH: string;

  // Locking
  MERGE_LOCK_DIR: string;
  DASHBOARD_LOCK_DIR: string;
  LOCK_RETRY_INTERVAL: number;
  LOCK_MAX_RETRIES: number;

  // Validation
  VALIDATORS: {
    typescript: boolean;
    build: boolean;
    lint: boolean;
    [key: string]: boolean;
  };

  // Feature Flags
  FEATURES: {
    parallelConflictResolution: boolean;
    binaryFileSupport: boolean;
    conflictAnalytics: boolean;
    [key: string]: boolean;
  };

  // Development Mode
  DEVELOPER_MODE: boolean;
}

// ============================================================================
// Utility Types
// ============================================================================

export type MCPToolHandler<TArgs = any, TResponse = MCPResponse> = (
  args: TArgs
) => Promise<TResponse>;

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, any>;
    required?: string[];
  };
}

export interface MergeContext {
  streamId: string;
  worktreePath: string;
  branch: string;
  mainCommitBefore: string;
  mainCommitAfter: string;
  resolvedConflicts: ResolutionResult[];
  validationResults: ValidationResult[];
}

export interface PostMergeHook {
  name: string;
  run(context: MergeContext): Promise<void>;
}
