# Version-Aware Stream Numbering Design

**Date**: 2025-12-11
**Status**: Design Phase
**Purpose**: Implement meaningful, version-scoped stream numbering

---

## Problem Statement

### Current System Issues

**Current approach**:
```
stream-001-feature-name
stream-002-fix-bug
stream-003-refactor
...
stream-999-something
```

**Problems**:
1. ❌ **No version association** - Can't tell which version a stream targets
2. ❌ **Limited capacity** - Only 999 streams total before numbering breaks
3. ❌ **Namespace pollution** - Completed streams are deleted, numbers are reused
4. ❌ **No sub-stream support** - Can't create related streams (e.g., 100a, 100b)

### Requirements

1. ✅ **Version-scoped** - Stream numbers tied to project version
2. ✅ **High capacity** - 100 streams per version (expandable with sub-streams)
3. ✅ **Unique identifiers** - No reuse of stream numbers within version
4. ✅ **Sub-stream support** - Ability to create related work (a-z suffixes)
5. ✅ **Semantic meaning** - Stream number indicates project version

---

## Proposed Solution

### Stream Numbering Format

```
stream-{VERSION}{STREAM_NUMBER}{SUB_STREAM}-{title}
```

**Components**:
- `VERSION`: 2-digit major version from package.json (e.g., `15` for v15.0.0)
- `STREAM_NUMBER`: 2-digit stream number within version (00-99)
- `SUB_STREAM`: Optional letter suffix for related work (a-z)
- `title`: Slugified description

**Examples**:

```
Project version: 15.3.2

stream-1500-user-authentication      # First stream for v15
stream-1501-payment-integration      # Second stream for v15
stream-1502-api-refactor             # Third stream for v15
...
stream-1599-final-polish             # Last main stream for v15

stream-1502a-api-tests               # Sub-stream of 1502
stream-1502b-api-docs                # Another sub-stream of 1502
stream-1502c-api-migration           # Yet another sub-stream
```

### Capacity Analysis

**Per version**:
- Main streams: 100 (00-99)
- Sub-streams per main: 26 (a-z)
- **Total capacity**: 100 + (100 × 26) = **2,700 streams per version**

**Realistic usage**:
- Typical project: 10-30 main streams per version
- Sub-streams: 1-3 per main stream when needed
- **Expected usage**: 20-50 streams per version

This provides **massive headroom** for any conceivable workflow.

---

## Implementation Design

### 1. Version Resolution

**Source**: `package.json` at `PROJECT_ROOT`

```typescript
/**
 * Read major version from PROJECT_ROOT/package.json
 * Returns 2-digit version number (e.g., "15" from "15.3.2")
 */
function getProjectMajorVersion(): string {
  const packageJsonPath = join(config.PROJECT_ROOT, 'package.json');

  if (!existsSync(packageJsonPath)) {
    throw new Error('package.json not found at PROJECT_ROOT');
  }

  const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));
  const version = packageJson.version as string;

  if (!version) {
    throw new Error('package.json missing version field');
  }

  // Extract major version (e.g., "15.3.2" -> 15)
  const major = parseInt(version.split('.')[0], 10);

  if (isNaN(major)) {
    throw new Error(`Invalid version format: ${version}`);
  }

  // Format as 2-digit string (e.g., 15 -> "15", 3 -> "03")
  return major.toString().padStart(2, '0');
}
```

### 2. Stream State Structure

**Before**:
```typescript
interface StreamState {
  nextStreamId: number;  // Simple counter: 1, 2, 3...
  streams: Record<string, StreamMetadata>;
  lastSync: string;
}
```

**After**:
```typescript
interface StreamState {
  version: string;  // Current project version (e.g., "15")
  versionCounters: Record<string, number>;  // Per-version counters
  streams: Record<string, StreamMetadata>;
  lastSync: string;
}

// Example state:
{
  "version": "15",
  "versionCounters": {
    "15": 23,  // Next stream for v15 will be 1523
    "14": 47,  // v14 had 47 streams (archived)
    "13": 31   // v13 had 31 streams (archived)
  },
  "streams": {
    "stream-1500-auth": { ... },
    "stream-1501-payments": { ... },
    "stream-1522-refactor": { ... }
  },
  "lastSync": "2025-12-11T10:30:00Z"
}
```

### 3. Stream ID Generation

```typescript
/**
 * Generate next stream ID with version-scoped numbering
 *
 * @param subStreamOf - Optional parent stream ID for sub-streams
 * @returns Stream ID in format: stream-{VERSION}{NUMBER}{SUB}-{title}
 *
 * Examples:
 *   getNextStreamId("authentication")
 *     -> "stream-1500-authentication"
 *
 *   getNextStreamId("tests", "stream-1500-authentication")
 *     -> "stream-1500a-tests"
 */
async function getNextStreamId(
  title: string,
  subStreamOf?: string
): Promise<{ streamId: string; streamNumber: string }> {

  return withStateLock(async () => {
    const state = await loadState();
    const projectVersion = getProjectMajorVersion();

    // Detect version change
    if (state.version !== projectVersion) {
      console.error(
        `[state-manager] Project version changed: ${state.version} -> ${projectVersion}`
      );
      console.error(
        `[state-manager] Starting new version counter at ${projectVersion}00`
      );

      state.version = projectVersion;
      // Don't reset old version counters (preserve history)
      if (!state.versionCounters[projectVersion]) {
        state.versionCounters[projectVersion] = 0;
      }
    }

    // Handle sub-streams
    if (subStreamOf) {
      return generateSubStreamId(state, subStreamOf, title);
    }

    // Generate main stream ID
    const counter = state.versionCounters[projectVersion] || 0;

    if (counter >= 100) {
      throw new Error(
        `Stream capacity exhausted for version ${projectVersion}. ` +
        `Consider creating a sub-stream or incrementing project version.`
      );
    }

    const streamNumber = `${projectVersion}${counter.toString().padStart(2, '0')}`;
    const slug = slugify(title);
    const streamId = `stream-${streamNumber}-${slug}`;

    // Increment counter
    state.versionCounters[projectVersion] = counter + 1;
    await saveState(state);

    return { streamId, streamNumber };
  });
}

/**
 * Generate sub-stream ID (e.g., stream-1500a-tests)
 */
function generateSubStreamId(
  state: StreamState,
  parentStreamId: string,
  title: string
): { streamId: string; streamNumber: string } {

  // Extract parent stream number (e.g., "stream-1500-auth" -> "1500")
  const match = parentStreamId.match(/^stream-(\d+)([a-z]?)-/);
  if (!match) {
    throw new Error(`Invalid parent stream ID: ${parentStreamId}`);
  }

  const parentNumber = match[1];  // "1500"
  const parentSuffix = match[2];   // "" or "a"

  if (parentSuffix) {
    throw new Error(
      `Cannot create sub-stream of sub-stream: ${parentStreamId}. ` +
      `Create sub-stream of parent stream instead.`
    );
  }

  // Find next available letter suffix
  const existingSubStreams = Object.keys(state.streams).filter(id =>
    id.startsWith(`stream-${parentNumber}`) && /[a-z]/.test(id)
  );

  const usedSuffixes = existingSubStreams.map(id => {
    const m = id.match(/stream-\d+([a-z])-/);
    return m ? m[1] : null;
  }).filter(Boolean) as string[];

  // Find first available letter
  let suffix = 'a';
  for (let i = 0; i < 26; i++) {
    const letter = String.fromCharCode(97 + i);  // a-z
    if (!usedSuffixes.includes(letter)) {
      suffix = letter;
      break;
    }
  }

  if (usedSuffixes.length >= 26) {
    throw new Error(
      `Sub-stream capacity exhausted for ${parentStreamId}. ` +
      `Maximum 26 sub-streams (a-z) allowed.`
    );
  }

  const slug = slugify(title);
  const streamNumber = `${parentNumber}${suffix}`;
  const streamId = `stream-${streamNumber}-${slug}`;

  return { streamId, streamNumber };
}
```

### 4. Migration Strategy

**Existing streams**:
- Keep old numbering for active streams (e.g., `stream-001-feature`)
- New streams use version-based numbering (e.g., `stream-1500-feature`)
- Old streams complete normally, new system takes over

**State migration**:
```typescript
/**
 * Migrate old state format to version-aware format
 */
function migrateState(oldState: OldStreamState): StreamState {
  const projectVersion = getProjectMajorVersion();

  return {
    version: projectVersion,
    versionCounters: {
      [projectVersion]: 0  // Start fresh for current version
    },
    streams: oldState.streams,
    lastSync: oldState.lastSync
  };
}
```

**Backward compatibility**:
- Old stream IDs (`stream-001-*`) continue working
- Complete/archive old streams normally
- New streams use new format automatically
- No breaking changes to existing workflows

---

## Benefits

### 1. Version Association
```
stream-1500-auth  # Clearly for v15
stream-1600-auth  # Clearly for v16
```

Easy to see which version a stream targets.

### 2. Capacity Management
```
Version 15:
  Main: 1500-1599 (100 streams)
  Subs: 1500a-z, 1501a-z, ... (2,600 additional)

Version 16:
  Main: 1600-1699 (100 streams)
  Subs: 1600a-z, 1601a-z, ... (2,600 additional)
```

Never run out of stream numbers.

### 3. Related Work Organization
```
stream-1500-payment-integration      # Main work
stream-1500a-payment-tests          # Related tests
stream-1500b-payment-docs           # Related docs
stream-1500c-payment-migration      # Related migration
```

Sub-streams clearly grouped with parent.

### 4. Historical Clarity
```
.project/history/
  20251211_stream-1500-auth-COMPLETE.md
  20251212_stream-1501-payments-COMPLETE.md
  20251213_stream-1500a-tests-COMPLETE.md
```

Archives show version association.

---

## Edge Cases

### Version Bump Mid-Development

**Scenario**: Project bumps from v15.x to v16.x

**Handling**:
```typescript
// State before version bump:
{
  "version": "15",
  "versionCounters": { "15": 23 },
  "streams": { "stream-1522-feature": {...} }
}

// After version bump (package.json: 16.0.0):
// Next stream automatically uses v16:
{
  "version": "16",  // Auto-detected
  "versionCounters": {
    "15": 23,  // Preserved
    "16": 0    // New counter
  },
  "streams": {
    "stream-1522-feature": {...},  // Old stream continues
    "stream-1600-new-feature": {...}  // New stream
  }
}
```

Old streams complete normally, new streams use new version.

### Sub-Stream Depth

**Rule**: Only one level of sub-streams allowed

```
✅ stream-1500-auth          # Main stream
✅ stream-1500a-tests        # Sub-stream (depth 1)

❌ stream-1500a1-unit-tests  # No sub-sub-streams
```

**Rationale**: Keeps naming simple, prevents over-nesting

### Stream Capacity Exhausted

**Scenario**: 100 main streams created for a version

**Error**:
```
Error: Stream capacity exhausted for version 15.
Suggestions:
  1. Create sub-stream of existing stream (stream-1500a, 1500b, ...)
  2. Increment project version (15 -> 16) for new major work
  3. Archive/cleanup old streams if no longer needed
```

**Mitigation**:
- Sub-streams provide 2,600 additional capacity
- Version bumps reset counter
- Unlikely to hit limit in practice

---

## Implementation Checklist

### Phase 1: Core Implementation
- [ ] Add `getProjectMajorVersion()` utility
- [ ] Update `StreamState` interface with version fields
- [ ] Implement version-aware `getNextStreamId()`
- [ ] Implement `generateSubStreamId()`
- [ ] Add state migration logic

### Phase 2: Integration
- [ ] Update `start-stream.ts` to use new ID generation
- [ ] Add `subStreamOf` parameter to start_stream tool
- [ ] Update dashboard formatting for new IDs
- [ ] Update archive naming for new IDs

### Phase 3: Testing
- [ ] Unit tests for version detection
- [ ] Unit tests for stream ID generation
- [ ] Unit tests for sub-stream generation
- [ ] Integration tests for state migration
- [ ] Test version bump scenario

### Phase 4: Documentation
- [ ] Update README with new numbering format
- [ ] Update STREAM_COMPLETION_PROTOCOL.md
- [ ] Add examples to start_stream documentation
- [ ] Document migration path for existing setups

---

## Examples

### Basic Stream Creation

```typescript
// Project version: 15.3.2

await startStream({
  title: "User Authentication",
  category: "backend",
  priority: "high"
});

// Result: stream-1500-user-authentication
```

### Sub-Stream Creation

```typescript
// Create tests for stream-1500

await startStream({
  title: "Authentication Tests",
  category: "testing",
  priority: "high",
  subStreamOf: "stream-1500-user-authentication"
});

// Result: stream-1500a-authentication-tests

await startStream({
  title: "Auth Documentation",
  category: "documentation",
  priority: "medium",
  subStreamOf: "stream-1500-user-authentication"
});

// Result: stream-1500b-auth-documentation
```

### Version Bump

```typescript
// Bump package.json: 15.3.2 -> 16.0.0

await startStream({
  title: "New Feature",
  category: "backend",
  priority: "high"
});

// Result: stream-1600-new-feature
// (Automatic version detection)
```

---

## Backward Compatibility

### Existing Streams

Old streams (`stream-001-*`, `stream-002-*`) continue working:
- Complete them normally with `complete_stream`
- Archive to `.project/history/`
- No changes to workflow

### New Streams

All new streams use version-based numbering:
- Automatic version detection
- No user action required
- Seamless transition

### Mixed Mode

Both formats coexist peacefully:
```
Active streams:
  stream-042-old-feature        # Old format
  stream-1500-new-feature       # New format
  stream-1501-another-feature   # New format
```

---

## Future Enhancements

### 1. Version Ranges

Support version ranges in stream metadata:
```json
{
  "streamId": "stream-1500-auth",
  "targetVersions": ["15.0.0", "15.1.0", "15.2.0"],
  "releasedIn": "15.2.0"
}
```

### 2. Cross-Version Merges

Support merging streams across version boundaries:
```
stream-1500-feature (v15) → main (v16)
```

With automatic conflict resolution and version bump handling.

### 3. Sub-Stream Chains

Support dependency chains:
```
stream-1500-auth         # Parent
  → stream-1500a-tests   # Child (depends on parent)
    → stream-1500b-docs  # Grandchild (depends on tests)
```

With automatic ordering and merge orchestration.

---

**Status**: Design Complete - Ready for Implementation
**Next**: Implement Phase 1 (Core Implementation)
