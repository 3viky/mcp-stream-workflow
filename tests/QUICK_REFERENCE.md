# Test Suite Quick Reference

Quick commands and patterns for working with the test suite.

## Common Commands

```bash
# Run all tests
pnpm test

# Run tests with coverage
pnpm test:coverage

# Run tests in watch mode (auto-rerun on changes)
pnpm test:watch

# Run specific test file
pnpm test start-stream
pnpm test template-renderer

# Run single test by name
pnpm test -t "should create stream with all metadata files"

# Run tests with verbose output
pnpm test:tool

# Run tests and update snapshots
pnpm test -u
```

## Test File Locations

```
tests/
├── start-stream.test.ts           # start_stream tool tests
├── template-renderer.test.ts      # Template utility tests
├── test-helpers.ts                # Shared utilities
├── fixtures/                      # Mock data
│   ├── mock-stream-state.json
│   ├── mock-stream-state-with-streams.json
│   └── mock-dashboard.md
└── README.md                      # Full documentation
```

## Writing New Tests

### Basic Test Template

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTestGitRepo, cleanupTestEnv } from './test-helpers.js';

describe('Feature Name', () => {
  let env: TestEnvironment;

  beforeEach(async () => {
    env = await createTestGitRepo();
    // Setup
  });

  afterEach(() => {
    cleanupTestEnv(env);
    vi.clearAllMocks();
  });

  it('should do something', async () => {
    // Arrange
    const input = { /* data */ };

    // Act
    const result = await functionUnderTest(input);

    // Assert
    expect(result).toMatchObject({ /* expected */ });
  });
});
```

### Mocking Pattern

```typescript
// Mock at top of file
vi.mock('../src/module.js');
import { someFunction } from '../src/module.js';

// In test
vi.mocked(someFunction).mockResolvedValue('mock value');
```

## Common Assertions

```typescript
// Equality
expect(value).toBe(expected);
expect(value).toEqual(expected);

// Truthiness
expect(value).toBeTruthy();
expect(value).toBeFalsy();

// Strings
expect(text).toContain('substring');
expect(text).toMatch(/regex/);

// Objects
expect(obj).toMatchObject({ key: 'value' });
expect(obj).toHaveProperty('key');

// Arrays
expect(arr).toHaveLength(3);
expect(arr).toContain(item);

// Files
expect(existsSync(path)).toBe(true);

// Functions
expect(fn).toHaveBeenCalled();
expect(fn).toHaveBeenCalledWith(arg1, arg2);
expect(fn).toHaveBeenCalledTimes(3);
```

## Test Helpers

```typescript
// Create test environment
const env = await createTestGitRepo();
// Returns: { projectRoot, worktreeRoot, git }

// Create mock files
createMockState(env.projectRoot, nextId);
createMockDashboard(env.projectRoot);

// Build test arguments
const args = buildStartStreamArgs({
  title: 'Test',
  category: 'backend',
});

// Check completeness
const complete = streamDirectoryIsComplete(projectRoot, streamId);
const worktreeOk = worktreeIsComplete(worktreeRoot, streamId);

// Assertions
assertSuccessResponse(result);
assertErrorResponse(result, 'expected error');
```

## Debugging Tests

### Debug Single Test
```bash
# Run one test with full output
pnpm test -t "exact test name" --reporter=verbose
```

### Enable Debug Logging
```bash
# Set debug environment variable
DEBUG=* pnpm test
```

### VS Code Debugging
Add to `.vscode/launch.json`:
```json
{
  "type": "node",
  "request": "launch",
  "name": "Debug Tests",
  "runtimeExecutable": "pnpm",
  "runtimeArgs": ["test", "--run"],
  "console": "integratedTerminal"
}
```

## Coverage Reports

### Generate and View
```bash
# Generate coverage
pnpm test:coverage

# Open HTML report
open coverage/index.html
# or
xdg-open coverage/index.html
```

### Coverage Thresholds
Current thresholds (defined in vitest.config.ts):
- Lines: 80%
- Functions: 80%
- Branches: 80%
- Statements: 80%

## Troubleshooting

### Tests Timeout
Increase timeout in test:
```typescript
it('slow test', async () => {
  // ...
}, 60000); // 60 seconds
```

### File System Issues
Clean up temp directories:
```bash
rm -rf /tmp/mcp-test-*
```

### Git Issues
Ensure git is configured:
```bash
git config --global user.name "Test User"
git config --global user.email "test@example.com"
```

### Mock Not Working
Verify mock is declared before imports:
```typescript
vi.mock('../src/module.js'); // Must be BEFORE import
import { func } from '../src/module.js';
```

### Cleanup Errors
Add null checks in cleanup:
```typescript
afterEach(() => {
  if (env && env.projectRoot) {
    cleanupTestEnv(env);
  }
});
```

## Test Patterns by Category

### Unit Tests
- Test single functions in isolation
- Mock all dependencies
- Fast execution (<100ms per test)

### Integration Tests
- Test multiple components together
- Real git operations
- Slower execution (100ms-5s per test)

### Edge Cases
- Boundary conditions
- Unusual inputs
- Error scenarios

## Quick Checklist

Before committing tests:
- [ ] All tests pass
- [ ] Coverage thresholds met
- [ ] No console errors
- [ ] Cleanup happens
- [ ] Mocks are reset
- [ ] Tests are isolated
- [ ] Clear test names
- [ ] Documentation updated

## Performance Guidelines

- Unit tests: <100ms each
- Integration tests: <5s each
- Total suite: <30s
- With coverage: <60s

## Common Test Smells

❌ **Bad**:
```typescript
it('test', async () => {
  const result = await func();
  expect(result).toBeTruthy(); // Too vague
});
```

✅ **Good**:
```typescript
it('should return stream ID in response', async () => {
  const result = await startStream(args);
  expect(result.content[0].text).toContain('stream-001-test');
});
```

❌ **Bad**:
```typescript
// Tests depend on each other
it('test 1', () => { globalState = 'x'; });
it('test 2', () => { expect(globalState).toBe('x'); });
```

✅ **Good**:
```typescript
// Each test is independent
beforeEach(() => { globalState = 'initial'; });
it('test 1', () => { /* ... */ });
it('test 2', () => { /* ... */ });
```

## Resources

- [Vitest Docs](https://vitest.dev/)
- [Test README](./README.md) - Full documentation
- [Test Summary](../TEST_SUMMARY.md) - Overview
- [IMPLEMENTATION_PLAN.md](../IMPLEMENTATION_PLAN.md) - Phase 5

---

**Last Updated**: 2025-12-11
