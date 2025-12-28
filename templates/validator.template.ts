import { Validator, ValidationResult } from '../types';

/**
 * TODO: Rename this class to match your validator
 * Example: DatabaseValidator, ApiContractValidator, etc.
 */
export class MyValidator implements Validator {
  name = 'my-validator';  // TODO: Give this a descriptive name

  /**
   * TODO: Run your validation checks
   *
   * CRITICAL: You are IN A WORKTREE when this runs.
   * The workingDir parameter points to the worktree root.
   *
   * Your job:
   * 1. Run validation commands/checks
   * 2. Collect errors and warnings
   * 3. Return result with clear error messages
   *
   * @param workingDir - Absolute path to worktree root
   * @returns Validation result
   */
  async validate(workingDir: string): Promise<ValidationResult> {
    // TODO: Implement your validation logic
    //
    // Examples:
    // - Run external command: exec('pnpm custom-check', { cwd: workingDir })
    // - Check file contents: readFile(path.join(workingDir, 'schema.json'))
    // - Validate structure: parseAndValidate(files)
    // - Run tests: exec('pnpm test:specific', { cwd: workingDir })

    const errors: string[] = [];
    const warnings: string[] = [];

    // TODO: Run your checks here
    // if (somethingWrong) {
    //   errors.push('Clear error message explaining what is wrong');
    // }
    //
    // if (somethingSuboptimal) {
    //   warnings.push('Warning message suggesting improvement');
    // }

    return {
      passed: errors.length === 0,
      errors,
      warnings,
      details: ''  // Optional: detailed output for debugging
    };
  }

  // TODO: Add any helper methods you need
  // private async runCommand(...) { }
  // private parseOutput(...) { }
  // etc.
}
