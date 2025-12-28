/**
 * Utility Functions
 *
 * Shared utilities for the Stream Workflow Manager
 *
 * @module utils
 */

export {
  renderTemplate,
  renderTemplateWithMetadata,
  render,
  extractVariableNames,
  validateVariables,
  previewTemplate,
  isTemplateObject,
  isTemplateArray,
  type TemplateValue,
  type TemplateObject,
  type TemplateArray,
  type TemplateVariables,
  type RenderResult,
} from './template-renderer.js';

export {
  createBackup,
  verifyBackup,
  listBackups,
  cleanOldBackups,
  type BackupOptions,
  type BackupResult,
} from './backup-manager.js';

export {
  generateContextHeader,
  getCurrentContext,
  generateLocationWarning,
} from './context-header.js';
