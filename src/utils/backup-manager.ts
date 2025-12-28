/**
 * Backup Manager - Safe backup creation with durable storage
 *
 * CRITICAL: Never use /tmp/ for backups - it's cleared on reboot!
 * Use cache directories for temporary-but-important backups.
 */

import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { getMCPServicesCacheDir } from '@3viky/mcp-common';

const execAsync = promisify(exec);

export interface BackupOptions {
  /** Name/description for this backup */
  name: string;
  /** Path to back up */
  sourcePath: string;
  /** Optional custom backup directory (defaults to MCP cache) */
  backupDir?: string;
}

export interface BackupResult {
  success: boolean;
  backupPath: string;
  size: number;
  fileCount: number;
  timestamp: string;
}

/**
 * Create a durable backup in cache directory
 *
 * @throws Error if backup fails or if attempting to use /tmp/
 */
export async function createBackup(options: BackupOptions): Promise<BackupResult> {
  const { name, sourcePath, backupDir } = options;

  // Determine backup location
  const baseBackupDir = backupDir || join(getMCPServicesCacheDir(), 'backups');

  // SAFETY: Prevent /tmp/ usage
  if (baseBackupDir.startsWith('/tmp/')) {
    throw new Error(
      'FATAL: Backups cannot be stored in /tmp/ (cleared on reboot)\n' +
      `Use cache directory instead: ${getMCPServicesCacheDir()}/backups/`
    );
  }

  // Ensure backup directory exists
  if (!existsSync(baseBackupDir)) {
    mkdirSync(baseBackupDir, { recursive: true });
  }

  // Generate backup filename with timestamp
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T').join('_');
  const sanitizedName = name.replace(/[^a-zA-Z0-9-_]/g, '-');
  const backupFilename = `${sanitizedName}_${timestamp}.tar.gz`;
  const backupPath = join(baseBackupDir, backupFilename);

  console.error(`[backup] Creating backup: ${backupPath}`);
  console.error(`[backup] Source: ${sourcePath}`);

  // Create compressed backup
  try {
    await execAsync(`tar -czf "${backupPath}" -C "$(dirname "${sourcePath}")" "$(basename "${sourcePath}")"`);
  } catch (error) {
    throw new Error(`Backup creation failed: ${error instanceof Error ? error.message : String(error)}`);
  }

  // Verify backup integrity
  const verifyResult = await verifyBackup(backupPath);
  if (!verifyResult.valid) {
    throw new Error(`Backup verification failed: ${verifyResult.error}`);
  }

  console.error(`[backup] ✓ Backup created: ${backupPath}`);
  console.error(`[backup] ✓ Size: ${(verifyResult.size / 1024 / 1024).toFixed(2)} MB`);
  console.error(`[backup] ✓ Files: ${verifyResult.fileCount}`);

  return {
    success: true,
    backupPath,
    size: verifyResult.size,
    fileCount: verifyResult.fileCount,
    timestamp,
  };
}

/**
 * Verify backup archive integrity
 */
export async function verifyBackup(backupPath: string): Promise<{
  valid: boolean;
  size: number;
  fileCount: number;
  error?: string;
}> {
  // Check file exists
  if (!existsSync(backupPath)) {
    return { valid: false, size: 0, fileCount: 0, error: 'Backup file does not exist' };
  }

  // Get file size
  const { stdout: sizeOutput } = await execAsync(`stat -c %s "${backupPath}"`);
  const size = parseInt(sizeOutput.trim());

  if (size === 0) {
    return { valid: false, size: 0, fileCount: 0, error: 'Backup file is empty' };
  }

  // Verify archive can be read and count files
  try {
    const { stdout } = await execAsync(`tar -tzf "${backupPath}" | wc -l`);
    const fileCount = parseInt(stdout.trim());

    if (fileCount === 0) {
      return { valid: false, size, fileCount: 0, error: 'Archive contains no files' };
    }

    return { valid: true, size, fileCount };
  } catch (error) {
    return {
      valid: false,
      size,
      fileCount: 0,
      error: `Archive verification failed: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

/**
 * List all available backups in cache directory
 */
export async function listBackups(): Promise<Array<{
  name: string;
  path: string;
  size: number;
  created: Date;
}>> {
  const backupDir = join(getMCPServicesCacheDir(), 'backups');

  if (!existsSync(backupDir)) {
    return [];
  }

  const { stdout } = await execAsync(`find "${backupDir}" -name "*.tar.gz" -type f`);
  const backupPaths = stdout.trim().split('\n').filter(Boolean);

  const backups = await Promise.all(
    backupPaths.map(async (path) => {
      const { stdout: statOutput } = await execAsync(`stat -c "%s %Y" "${path}"`);
      const [size, timestamp] = statOutput.trim().split(' ').map(Number);

      return {
        name: path.split('/').pop() || '',
        path,
        size,
        created: new Date(timestamp * 1000),
      };
    })
  );

  return backups.sort((a, b) => b.created.getTime() - a.created.getTime());
}

/**
 * Clean old backups (keep last N backups)
 */
export async function cleanOldBackups(keepCount: number = 5): Promise<number> {
  const backups = await listBackups();

  if (backups.length <= keepCount) {
    return 0;
  }

  const toDelete = backups.slice(keepCount);

  for (const backup of toDelete) {
    await execAsync(`rm -f "${backup.path}"`);
    console.error(`[backup] Deleted old backup: ${backup.name}`);
  }

  return toDelete.length;
}
