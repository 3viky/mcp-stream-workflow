/**
 * File Categorization Utilities
 *
 * Categorizes uncommitted files as pollution vs. legitimate work
 * Used by start_stream to provide intelligent guidance on cleanup
 */

/**
 * File classification result
 */
export interface FileCategory {
  pollution: string[];
  legitimate: string[];
}

/**
 * Pollution patterns - files that violate Agent Cleanup Protocol
 *
 * These are routine summaries and backup files that should never
 * be committed to the repository.
 */
const POLLUTION_PATTERNS = [
  // Agent summaries and reports
  /.*_SUMMARY\.md$/i,
  /.*_REPORT\.md$/i,
  /.*_COMPLETE\.md$/i,
  /.*_PLAN\.md$/i, // Plans should be in .project/history/
  /.*_MERGE_SUMMARY\.md$/i,

  // Backup files (git is the backup)
  /.*\.bak$/i,
  /.*\.old$/i,
  /.*_ORIGINAL$/i,
  /.*~$/i, // Editor temp files

  // Build artifacts that shouldn't be committed
  /.*\.log$/i,
  /.*\.tmp$/i,
];

/**
 * Categorize files as pollution or legitimate work
 *
 * @param filePaths - Array of file paths (relative to repo root)
 * @returns Categorized files
 *
 * @example
 * const result = categorizeFiles([
 *   'src/index.ts',
 *   'BUILD_SUMMARY.md',
 *   'config.json.bak'
 * ]);
 * // result.legitimate = ['src/index.ts']
 * // result.pollution = ['BUILD_SUMMARY.md', 'config.json.bak']
 */
export function categorizeFiles(filePaths: string[]): FileCategory {
  const pollution: string[] = [];
  const legitimate: string[] = [];

  for (const path of filePaths) {
    const isPollution = POLLUTION_PATTERNS.some((pattern) => pattern.test(path));

    if (isPollution) {
      pollution.push(path);
    } else {
      legitimate.push(path);
    }
  }

  return { pollution, legitimate };
}

/**
 * Format file list with status indicators
 *
 * @param files - File paths to format
 * @param prefix - Prefix for each line (default: "  - ")
 * @returns Formatted string
 *
 * @example
 * formatFileList(['src/index.ts', 'README.md'])
 * // Returns:
 * //   - src/index.ts
 * //   - README.md
 */
export function formatFileList(files: string[], prefix = '  - '): string {
  return files.map((f) => `${prefix}${f}`).join('\n');
}

/**
 * Generate smart error message based on file categorization
 *
 * Provides context-aware guidance:
 * - Pollution only: Suggest auto-cleanup
 * - Legitimate only: Suggest commit
 * - Mixed: Provide both options with clear separation
 *
 * @param category - Categorized files
 * @returns Error message with actionable guidance
 */
export function generateUncommittedChangesError(category: FileCategory): string {
  const { pollution, legitimate } = category;

  // Case 1: Only pollution detected
  if (pollution.length > 0 && legitimate.length === 0) {
    return (
      `Cannot start stream with uncommitted changes in main.\n\n` +
      `🗑️  Detected agent pollution files:\n${formatFileList(pollution)}\n\n` +
      `These files violate the Agent Cleanup Protocol:\n` +
      `  - *_SUMMARY.md, *_REPORT.md, *_COMPLETE.md: Routine summaries\n` +
      `  - *.bak, *.old: Backup files (git is the backup)\n` +
      `  - *.log, *.tmp: Build artifacts\n\n` +
      `Fix options:\n` +
      `  1. Delete pollution: git clean -f ${pollution.join(' ')}\n` +
      `  2. Delete specific: rm ${pollution[0]}${pollution.length > 1 ? ' ...' : ''}\n` +
      `  3. Review first: git status`
    );
  }

  // Case 2: Mixed pollution and legitimate work
  if (pollution.length > 0 && legitimate.length > 0) {
    return (
      `Cannot start stream with uncommitted changes in main.\n\n` +
      `🗑️  Agent pollution (should be deleted):\n${formatFileList(pollution)}\n\n` +
      `✅ Legitimate work (should be committed):\n${formatFileList(legitimate)}\n\n` +
      `Fix (do both):\n` +
      `  1. Clean pollution:\n` +
      `     git clean -f ${pollution.join(' ')}\n\n` +
      `  2. Commit legitimate work:\n` +
      `     git add ${legitimate.join(' ')}\n` +
      `     git commit -m "description"`
    );
  }

  // Case 3: Only legitimate work
  return (
    `Cannot start stream with uncommitted changes in main.\n\n` +
    `Uncommitted changes:\n${formatFileList(legitimate)}\n\n` +
    `Fix: Commit changes before starting stream\n` +
    `  git add ${legitimate.join(' ')}\n` +
    `  git commit -m "description"`
  );
}

/**
 * Check if path matches any pollution pattern
 *
 * @param path - File path to check
 * @returns True if file is pollution
 *
 * @example
 * isPollution('BUILD_SUMMARY.md') // true
 * isPollution('src/index.ts')      // false
 * isPollution('config.bak')        // true
 */
export function isPollution(path: string): boolean {
  return POLLUTION_PATTERNS.some((pattern) => pattern.test(path));
}
