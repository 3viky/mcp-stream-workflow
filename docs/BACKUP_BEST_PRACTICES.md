# Backup Best Practices

**Critical lessons learned from the Dec 11, 2025 data loss incident.**

---

## The Problem

On December 11, 2025, a cleanup operation in egirl-platform created a backup in `/tmp/`:

```bash
tar -czf /tmp/egirl-platform-old-dirs-backup-20251211.tar.gz packages/
rm -rf packages/  # Deleted 3,500 files
```

**What went wrong:**
- Backup created in `/tmp/` (cleared on reboot)
- System rebooted on Dec 13 → backup destroyed
- Recovery only possible because git retained the deleted files

---

## The Rule

### ❌ NEVER Use `/tmp/` for Backups

`/tmp/` is **ephemeral storage** - automatically cleared on reboot.

**Bad:**
```typescript
const backupPath = '/tmp/backup.tar.gz';  // ❌ WRONG
await execAsync(`tar -czf ${backupPath} data/`);
```

**Good:**
```typescript
import { createBackup } from '../utils/backup-manager.js';

const result = await createBackup({
  name: 'pre-cleanup-backup',
  sourcePath: 'packages/',
});
// ✅ Stored in ~/.local/share/claude/mcp/cache/backups/
// ✅ Survives reboots
// ✅ Verified automatically
```

---

## Storage Hierarchy

| Location | Cleared on Reboot? | Persists? | Use Case |
|----------|-------------------|-----------|----------|
| `/tmp/` | ✅ **YES** | ❌ No | Runtime temp files only |
| `~/.cache/` | ❌ **NO** | ✅ Yes | Regenerable data (screenshots, build artifacts) |
| `~/.local/share/` | ❌ **NO** | ✅ Yes | Important user data |
| `~/.local/share/claude/mcp/cache/` | ❌ **NO** | ✅ Yes | MCP service cache (backups, temp data) |
| `~/.local/share/claude/mcp/data/` | ❌ **NO** | ✅ Yes | MCP service permanent data |

---

## Using the Backup Manager

### Basic Usage

```typescript
import { createBackup } from '../utils/backup-manager.js';

// Create backup before dangerous operation
const backup = await createBackup({
  name: 'pre-merge-packages',
  sourcePath: '/path/to/packages',
});

console.log(`Backup created: ${backup.backupPath}`);
console.log(`Size: ${(backup.size / 1024 / 1024).toFixed(2)} MB`);
console.log(`Files: ${backup.fileCount}`);

// Now safe to proceed with dangerous operation
await dangerousOperation();

// After verification, can clean up old backups
import { cleanOldBackups } from '../utils/backup-manager.js';
await cleanOldBackups(5);  // Keep last 5 backups
```

### List Existing Backups

```typescript
import { listBackups } from '../utils/backup-manager.js';

const backups = await listBackups();
for (const backup of backups) {
  console.log(`${backup.name} - ${backup.size} bytes - ${backup.created}`);
}
```

### Verify Backup Integrity

```typescript
import { verifyBackup } from '../utils/backup-manager.js';

const result = await verifyBackup('/path/to/backup.tar.gz');
if (!result.valid) {
  throw new Error(`Backup verification failed: ${result.error}`);
}
```

---

## Safety Guarantees

The `backup-manager` provides:

### 1. Location Validation

```typescript
// Throws error if attempting to use /tmp/
await createBackup({
  name: 'test',
  sourcePath: 'data/',
  backupDir: '/tmp/backups',  // ❌ Error thrown
});
```

### 2. Automatic Verification

```typescript
// Verifies after creation:
// - File exists
// - Size > 0
// - Archive is readable
// - Contains files
const backup = await createBackup({ ... });
// Throws if verification fails
```

### 3. Timestamp-Based Naming

```typescript
// Generates unique filenames:
// pre-merge-packages_2025-12-13_08-30-45.tar.gz
//                     └─ ISO timestamp
```

---

## Integration with Tools

### In `prepare_merge`

```typescript
import { createBackup } from '../utils/backup-manager.js';

export async function prepareMerge(args: PrepareMergeArgs) {
  const worktreePath = join(config.WORKTREE_ROOT, args.streamId);

  // Create backup before merging main
  const backup = await createBackup({
    name: `pre-merge-${args.streamId}`,
    sourcePath: worktreePath,
  });

  console.error(`[prepare_merge] Backup created: ${backup.backupPath}`);

  // Now safe to merge
  await git.merge(['origin/main', '--no-edit']);

  // ... rest of merge logic
}
```

### In Cleanup Operations

```typescript
import { createBackup } from '../utils/backup-manager.js';

async function cleanupDuplicateDirectories() {
  const toDelete = ['packages/', 'apps/', 'services/'];

  // Backup before deletion
  for (const dir of toDelete) {
    await createBackup({
      name: `cleanup-${dir.replace('/', '')}`,
      sourcePath: dir,
    });
  }

  // Now safe to delete
  for (const dir of toDelete) {
    await execAsync(`rm -rf ${dir}`);
  }
}
```

---

## Recovery Procedures

### Restore from Backup

```bash
# List available backups
ls -lh ~/.local/share/claude/mcp/cache/backups/

# Restore a backup
cd /path/to/restore/location
tar -xzf ~/.local/share/claude/mcp/cache/backups/pre-merge-packages_2025-12-13_08-30-45.tar.gz
```

### Clean Old Backups

```typescript
import { cleanOldBackups } from '../utils/backup-manager.js';

// Keep last 5 backups, delete older ones
const deletedCount = await cleanOldBackups(5);
console.log(`Deleted ${deletedCount} old backups`);
```

---

## Why Git Alone Isn't Enough

While git saved us in the Dec 11 incident, relying on git has limitations:

### Git Doesn't Track Untracked Files

```bash
# Files in .gitignore or never staged
node_modules/
.env
*.log

# These are LOST if directory is deleted
rm -rf project/  # node_modules/, .env, *.log gone forever
```

### Git Can Be Garbage Collected

```bash
git gc --aggressive --prune=now
# Deleted commits may be removed from object database
```

### Git Can Be Force-Pushed

```bash
git push --force
# History rewritten, old commits may be lost
```

**Lesson:** Git complements backups, it doesn't replace them.

---

## Testing Your Backup Strategy

### Verify Backup Process

```bash
# 1. Create test directory
mkdir test-backup
echo "important data" > test-backup/data.txt

# 2. Create backup
node -e "import('./src/utils/backup-manager.js').then(m => m.createBackup({
  name: 'test',
  sourcePath: 'test-backup'
}))"

# 3. Delete original
rm -rf test-backup

# 4. Restore from backup
tar -xzf ~/.local/share/claude/mcp/cache/backups/test_*.tar.gz

# 5. Verify data intact
cat test-backup/data.txt  # Should show "important data"
```

---

## Summary

**DO:**
- ✅ Use `createBackup()` from `backup-manager`
- ✅ Verify backups before destructive operations
- ✅ Store backups in cache directories (`~/.cache/` or `~/.local/share/`)
- ✅ Test backup restoration procedures

**DON'T:**
- ❌ Store backups in `/tmp/` (cleared on reboot)
- ❌ Skip backup verification
- ❌ Assume git is a backup system
- ❌ Delete backups immediately after creation

---

**Last Updated:** 2025-12-13
**Incident Reference:** Dec 11, 2025 egirl-platform packages/ deletion
