import { ConflictStrategy, ConflictContext, ResolutionResult } from '../types';

/**
 * TODO: Rename this class to match your strategy
 * Example: BinaryConflictStrategy, XmlMergeStrategy, etc.
 */
export class MyStrategy implements ConflictStrategy {
  name = 'my-strategy';  // TODO: Give this a descriptive name

  /**
   * TODO: Determine when this strategy should handle a conflict
   *
   * @param file - Path to the conflicted file
   * @param context - Full conflict context (commits, content, etc.)
   * @returns true if this strategy can handle this file
   */
  canHandle(file: string, context: ConflictContext): boolean {
    // TODO: Implement your logic
    // Examples:
    // - return file.endsWith('.xml');
    // - return file.includes('migrations/');
    // - return this.isBinaryFile(file);

    return false;  // Replace with your logic
  }

  /**
   * TODO: Resolve the conflict
   *
   * CRITICAL: You are IN A WORKTREE when this runs.
   * The conflicted file is in the current directory.
   *
   * Available in context:
   * - file: string (path to conflicted file)
   * - oursContent: string (main's version)
   * - theirsContent: string (stream's version)
   * - conflictContent: string (with <<<<<<< markers)
   * - mainCommits: GitCommit[] (what main was doing)
   * - streamCommits: GitCommit[] (what stream was doing)
   *
   * Your job:
   * 1. Understand both sides
   * 2. Merge them intelligently (preserve both intents)
   * 3. Write resolved content to the file
   * 4. Return success
   *
   * @param context - Full conflict context
   * @returns Resolution result
   */
  async resolve(context: ConflictContext): Promise<ResolutionResult> {
    // TODO: Implement your resolution logic
    //
    // Example strategies:
    // - Use Claude AI with custom prompt
    // - Structural merge (for JSON/YAML)
    // - Choose newer version (for binary files)
    // - Prompt user for decision
    // - Custom domain logic

    throw new Error('Not implemented - fill in your resolution logic');
  }

  // TODO: Add any helper methods you need
  // private async callClaude(...) { }
  // private isBinaryFile(...) { }
  // etc.
}
