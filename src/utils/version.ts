/**
 * Version Utilities - Project Version Detection
 *
 * Reads and parses version from PROJECT_ROOT/package.json
 * Used for version-aware stream numbering
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { config } from '../config.js';

/**
 * Read major version from PROJECT_ROOT/package.json
 *
 * @returns 2-digit version number (e.g., "15" from "15.3.2", "03" from "3.1.0")
 * @throws Error if package.json not found or invalid
 *
 * Examples:
 *   "1.0.0" -> "01"
 *   "15.3.2" -> "15"
 *   "127.0.1" -> "127" (no padding if > 99)
 */
export function getProjectMajorVersion(): string {
  const packageJsonPath = join(config.PROJECT_ROOT, 'package.json');

  if (!existsSync(packageJsonPath)) {
    throw new Error(
      `package.json not found at PROJECT_ROOT: ${config.PROJECT_ROOT}\n` +
      `Ensure PROJECT_ROOT is set correctly in MCP server configuration.`
    );
  }

  let packageJson: any;
  try {
    const content = readFileSync(packageJsonPath, 'utf-8');
    packageJson = JSON.parse(content);
  } catch (error) {
    throw new Error(
      `Failed to parse package.json at ${packageJsonPath}: ${error instanceof Error ? error.message : error}`
    );
  }

  const version = packageJson.version as string;

  if (!version) {
    throw new Error(
      `package.json missing version field at ${packageJsonPath}`
    );
  }

  // Extract major version (e.g., "15.3.2" -> 15)
  const parts = version.split('.');
  if (parts.length < 1) {
    throw new Error(
      `Invalid version format in package.json: ${version}. ` +
      `Expected semantic version (e.g., "1.0.0")`
    );
  }

  const major = parseInt(parts[0], 10);

  if (isNaN(major) || major < 0) {
    throw new Error(
      `Invalid major version in package.json: ${version}. ` +
      `Major version must be a non-negative integer.`
    );
  }

  // Format as 2-digit string (e.g., 15 -> "15", 3 -> "03")
  // Don't pad if > 99 (e.g., 127 -> "127")
  return major < 100 ? major.toString().padStart(2, '0') : major.toString();
}

/**
 * Read full semver from PROJECT_ROOT/package.json
 *
 * @returns Full version string (e.g., "15.3.2")
 * @throws Error if package.json not found or invalid
 */
export function getProjectVersion(): string {
  const packageJsonPath = join(config.PROJECT_ROOT, 'package.json');

  if (!existsSync(packageJsonPath)) {
    throw new Error(
      `package.json not found at PROJECT_ROOT: ${config.PROJECT_ROOT}`
    );
  }

  const content = readFileSync(packageJsonPath, 'utf-8');
  const packageJson = JSON.parse(content);

  const version = packageJson.version as string;

  if (!version) {
    throw new Error(`package.json missing version field at ${packageJsonPath}`);
  }

  return version;
}

/**
 * Parse stream number to extract version and counter
 *
 * @param streamNumber - Stream number (e.g., "1500", "1500a", "15")
 * @returns Object with version and counter components
 *
 * Examples:
 *   "1500" -> { version: "15", counter: 0, suffix: null }
 *   "1500a" -> { version: "15", counter: 0, suffix: "a" }
 *   "1523" -> { version: "15", counter: 23, suffix: null }
 *   "1523b" -> { version: "15", counter: 23, suffix: "b" }
 */
export function parseStreamNumber(streamNumber: string): {
  version: string;
  counter: number;
  suffix: string | null;
} {
  // Match: {VERSION}{COUNTER}{SUFFIX}
  // Examples: "1500", "1500a", "1523", "1523b"
  const match = streamNumber.match(/^(\d{2,})(\d{2})([a-z]?)$/);

  if (!match) {
    throw new Error(
      `Invalid stream number format: ${streamNumber}. ` +
      `Expected format: {VERSION}{COUNTER}{SUFFIX} (e.g., "1500", "1500a")`
    );
  }

  const version = match[1];  // "15"
  const counter = parseInt(match[2], 10);  // 0
  const suffix = match[3] || null;  // "a" or null

  return { version, counter, suffix };
}

/**
 * Format stream number from components
 *
 * @param version - Major version (e.g., "15", "1", "03")
 * @param counter - Stream counter within version (0-99)
 * @param suffix - Optional letter suffix for sub-streams
 * @returns Formatted 4-digit stream number (e.g., "1500", "0188", "1500a")
 *
 * Examples:
 *   formatStreamNumber("15", 0) -> "1500"
 *   formatStreamNumber("1", 88) -> "0188"
 *   formatStreamNumber("15", 0, "a") -> "1500a"
 *   formatStreamNumber("15", 23) -> "1523"
 *   formatStreamNumber("15", 23, "b") -> "1523b"
 */
export function formatStreamNumber(
  version: string,
  counter: number,
  suffix?: string
): string {
  if (counter < 0 || counter > 99) {
    throw new Error(
      `Counter out of range: ${counter}. Must be 0-99.`
    );
  }

  if (suffix && !/^[a-z]$/.test(suffix)) {
    throw new Error(
      `Invalid suffix: ${suffix}. Must be a single lowercase letter (a-z).`
    );
  }

  // Parse version to ensure it's a valid number
  const versionNum = parseInt(version, 10);
  if (isNaN(versionNum) || versionNum < 0) {
    throw new Error(
      `Invalid version: ${version}. Must be a non-negative integer.`
    );
  }

  // Always pad version to 2 digits (unless > 99)
  const versionStr = versionNum < 100 ? versionNum.toString().padStart(2, '0') : versionNum.toString();
  const counterStr = counter.toString().padStart(2, '0');

  return `${versionStr}${counterStr}${suffix || ''}`;
}
