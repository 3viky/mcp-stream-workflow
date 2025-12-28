# Test Suite Documentation

This directory contains the comprehensive test suite for the Stream Workflow Manager MCP Server.

## Structure

```
tests/
├── README.md                      # This file
├── fixtures/                      # Mock data and test fixtures
│   ├── mock-stream-state.json              # Empty initial state
│   ├── mock-stream-state-with-streams.json # State with existing streams
│   └── mock-dashboard.md                    # Mock dashboard content
├── test-helpers.ts                # Shared test utilities
├── template-renderer.test.ts      # Template rendering tests
└── start-stream.test.ts          # start_stream tool tests
```

## Running Tests

### Run all tests
```bash
pnpm test
```

### Run tests in watch mode
```bash
pnpm test:watch
```

### Run tests with coverage
```bash
pnpm test:coverage
```

### Run specific test file
```bash
pnpm test start-stream
```

### Run tests with verbose output
```bash
pnpm test:tool
```

## Test Categories

### Unit Tests
- **template-renderer.test.ts**: Tests for template rendering utility
- **start-stream.test.ts**: Unit tests for start_stream tool

### Integration Tests
Within start-stream.test.ts:
- Full workflow tests
- Multi-stream scenarios
- Git history verification

### Test Coverage

Target coverage thresholds (defined in vitest.config.ts):
- Lines: 80%
- Functions: 80%
- Branches: 80%
- Statements: 80%

## Test Fixtures

### mock-stream-state.json
Empty initial state for testing fresh repositories.

### mock-stream-state-with-streams.json
Pre-populated state with 2 existing streams for testing sequential ID generation.

### mock-dashboard.md
Mock dashboard content with active streams.

## Test Helpers

The `test-helpers.ts` module provides utilities for:

### Environment Setup
- `createTestGitRepo()`: Create temporary git repository for testing
- `cleanupTestEnv()`: Clean up test directories after tests

### Mock Data Creation
- `createMockState()`: Create mock stream state file
- `createMockDashboard()`: Create mock dashboard file
- `createMockStreamMetadata()`: Generate stream metadata objects

### Git Helpers
- `createUncommittedChange()`: Add uncommitted files for testing
- `createBranch()`: Create test branches
- `getLatestCommitMessage()`: Retrieve commit messages
- `branchExists()`: Check if branch exists

### Assertion Helpers
- `assertSuccessResponse()`: Verify successful tool responses
- `assertErrorResponse()`: Verify error responses
- `streamDirectoryIsComplete()`: Check if all metadata files exist
- `worktreeIsComplete()`: Verify worktree creation

### Test Data Generators
- `buildStartStreamArgs()`: Build test arguments with defaults
- `generateStreamId()`: Generate stream IDs following naming convention
- `getTestTitles()`: Get various test title patterns

## Writing New Tests

### Basic Test Structure

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTestGitRepo, cleanupTestEnv } from './test-helpers.js';

describe('Feature Name', () => {
  let env: TestEnvironment;

  beforeEach(async () => {
    env = await createTestGitRepo();
    // Additional setup
  });

  afterEach(() => {
    cleanupTestEnv(env);
  });

  it('should do something', async () => {
    // Arrange
    const args = { /* test data */ };

    // Act
    const result = await functionUnderTest(args);

    // Assert
    expect(result).toBe(expected);
  });
});
```

### Mocking Guidelines

1. **Mock External Dependencies**: Use vi.mock() for modules that interact with file system or external services
2. **Mock at Module Level**: Mock entire modules, not individual functions
3. **Reset Mocks**: Use vi.clearAllMocks() in afterEach hooks
4. **Provide Realistic Mocks**: Mocks should behave like real implementations

Example:
```typescript
vi.mock('../src/state-manager.js');
import { getNextStreamId } from '../src/state-manager.js';

beforeEach(() => {
  vi.mocked(getNextStreamId).mockResolvedValue(1);
});
```

### Test Naming Conventions

- **Describe blocks**: Use feature or function name
- **Test cases**: Start with "should" and describe expected behavior
- **Error cases**: Be specific about the error condition

Good:
```typescript
describe('start_stream - Validation', () => {
  it('should error if not in main directory', async () => {
    // ...
  });
});
```

Bad:
```typescript
describe('tests', () => {
  it('test validation', async () => {
    // ...
  });
});
```

## Test Coverage Reports

After running `pnpm test:coverage`, reports are generated in:
- `coverage/index.html` - HTML coverage report (open in browser)
- `coverage/lcov.info` - LCOV format for CI integration
- `coverage/coverage-final.json` - JSON coverage data

## CI Integration

Tests run automatically on:
- Pull requests
- Commits to main branch
- Pre-push git hooks (if configured)

## Debugging Tests

### Run single test
```bash
pnpm test -t "should create stream with all metadata files"
```

### Enable verbose logging
```bash
DEBUG=* pnpm test
```

### Debug in VS Code
Add to `.vscode/launch.json`:
```json
{
  "type": "node",
  "request": "launch",
  "name": "Debug Tests",
  "runtimeExecutable": "pnpm",
  "runtimeArgs": ["test"],
  "console": "integratedTerminal"
}
```

## Common Issues

### Test Timeouts
If tests timeout, increase timeout in vitest.config.ts:
```typescript
testTimeout: 30000 // 30 seconds
```

### File System Errors
Tests use temporary directories. If cleanup fails:
```bash
rm -rf /tmp/mcp-test-*
```

### Git Errors
Ensure git is configured:
```bash
git config --global user.name "Test User"
git config --global user.email "test@example.com"
```

## Best Practices

1. **Isolation**: Each test should be independent and not rely on other tests
2. **Cleanup**: Always clean up test resources in afterEach hooks
3. **Assertions**: Use specific assertions, avoid generic expect(result).toBeTruthy()
4. **Edge Cases**: Test boundary conditions, empty inputs, large inputs
5. **Error Cases**: Test both success and failure paths
6. **Documentation**: Add comments for complex test scenarios

## Contributing

When adding new tools or features:

1. Create test file: `tests/[tool-name].test.ts`
2. Add fixtures if needed: `tests/fixtures/[fixture-name]`
3. Update this README with new test categories
4. Ensure coverage thresholds are met
5. Run full test suite before committing

## References

- [Vitest Documentation](https://vitest.dev/)
- [Testing Best Practices](https://testingjavascript.com/)
- [IMPLEMENTATION_PLAN.md](../IMPLEMENTATION_PLAN.md) - Phase 5: Testing
