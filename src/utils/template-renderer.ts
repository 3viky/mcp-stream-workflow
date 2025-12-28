/**
 * Template Rendering Utility
 *
 * Provides simple mustache-style template rendering for stream metadata files.
 * Supports:
 * - Variable substitution: {{VARIABLE}}
 * - Array iteration: {{#ARRAY}} ... {{/ARRAY}}
 * - Conditional rendering: {{#CONDITION}} ... {{/CONDITION}}
 * - Nested object access: {{OBJECT.PROPERTY}}
 *
 * @module template-renderer
 */

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

// ============================================================================
// Type Definitions
// ============================================================================

/**
 * Template variables can be primitives, arrays, or nested objects
 */
export type TemplateValue = string | number | boolean | null | undefined | TemplateObject | TemplateArray;

export interface TemplateObject {
  [key: string]: TemplateValue;
}

export type TemplateArray = TemplateObject[];

export interface TemplateVariables {
  [key: string]: TemplateValue;
}

/**
 * Result of rendering a template
 */
export interface RenderResult {
  content: string;
  variables: string[];
  unusedVariables: string[];
}

// ============================================================================
// Constants
// ============================================================================

/**
 * Regex patterns for template syntax
 */
const PATTERNS = {
  /** Matches {{VARIABLE}} - simple variable substitution */
  VARIABLE: /\{\{([A-Z_][A-Z0-9_]*)\}\}/g,

  /** Matches {{#ARRAY}} ... {{/ARRAY}} - array/conditional blocks */
  BLOCK: /\{\{#([A-Z_][A-Z0-9_]*)\}\}([\s\S]*?)\{\{\/\1\}\}/g,

  /** Matches {{OBJECT.PROPERTY}} - nested property access */
  NESTED: /\{\{([A-Z_][A-Z0-9_]*(?:\.[A-Z_][A-Z0-9_]*)+)\}\}/g,
} as const;

// ============================================================================
// Core Functions
// ============================================================================

/**
 * Render a template file with provided variables
 *
 * @param templateName - Name of template file (e.g., 'HANDOFF.template.md')
 * @param variables - Object containing template variables
 * @returns Rendered template content
 *
 * @example
 * ```typescript
 * const content = renderTemplate('HANDOFF.template.md', {
 *   STREAM_TITLE: 'Add authentication',
 *   STREAM_ID: 'stream-042-auth',
 *   PHASES: [
 *     { PHASE_NAME: 'Planning', PHASE_STATUS: 'pending' },
 *     { PHASE_NAME: 'Implementation', PHASE_STATUS: 'in_progress' }
 *   ]
 * });
 * ```
 */
export function renderTemplate(templateName: string, variables: TemplateVariables): string {
  // Load template content
  const content = loadTemplate(templateName);

  // Render with variables
  return render(content, variables);
}

/**
 * Render template content with variables and return detailed results
 *
 * @param content - Template content string
 * @param variables - Template variables
 * @returns Detailed render result with metadata
 */
export function renderTemplateWithMetadata(
  templateName: string,
  variables: TemplateVariables
): RenderResult {
  const content = loadTemplate(templateName);
  const renderedContent = render(content, variables);

  // Extract all variable names used in template
  const usedVariables = extractVariableNames(content);
  const providedVariables = Object.keys(variables);
  const unusedVariables = providedVariables.filter(v => !usedVariables.includes(v));

  return {
    content: renderedContent,
    variables: usedVariables,
    unusedVariables,
  };
}

/**
 * Core rendering logic - processes template content with variables
 *
 * @param content - Template content
 * @param variables - Variables to substitute
 * @returns Rendered content
 */
export function render(content: string, variables: TemplateVariables): string {
  let result = content;

  // Phase 1: Process block structures (arrays and conditionals)
  // Must happen first because blocks can contain variables
  result = renderBlocks(result, variables);

  // Phase 2: Process nested property access (OBJECT.PROPERTY)
  result = renderNestedProperties(result, variables);

  // Phase 3: Process simple variables
  result = renderVariables(result, variables);

  return result;
}

// ============================================================================
// Template Loading
// ============================================================================

/**
 * Load template file from templates directory
 *
 * Templates are stored in ../../templates/ relative to this file
 *
 * @param templateName - Template filename
 * @returns Template content
 * @throws Error if template file not found
 */
function loadTemplate(templateName: string): string {
  try {
    // Get the directory of the current module
    // In ESM: import.meta.url
    // In CJS: __dirname
    // We'll support both by using a fallback approach

    let templatePath: string;

    if (typeof __dirname !== 'undefined') {
      // CommonJS environment
      templatePath = join(__dirname, '../../templates', templateName);
    } else {
      // ESM environment
      const currentFile = fileURLToPath(import.meta.url);
      const currentDir = dirname(currentFile);
      templatePath = join(currentDir, '../../templates', templateName);
    }

    return readFileSync(templatePath, 'utf-8');
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      throw new Error(
        `Template not found: ${templateName}\n` +
          `Expected location: templates/${templateName}\n` +
          `Make sure the template file exists.`
      );
    }
    throw error;
  }
}

// ============================================================================
// Variable Rendering
// ============================================================================

/**
 * Replace simple {{VARIABLE}} patterns with values
 *
 * @param content - Content to process
 * @param variables - Variable values
 * @returns Content with variables replaced
 */
function renderVariables(content: string, variables: TemplateVariables): string {
  return content.replace(PATTERNS.VARIABLE, (_match, variableName: string) => {
    const value = variables[variableName];

    // Handle missing variables
    if (value === undefined || value === null) {
      return ''; // Empty string for missing values
    }

    // Handle arrays/objects (shouldn't happen with simple variables, but be safe)
    if (typeof value === 'object') {
      return JSON.stringify(value);
    }

    return String(value);
  });
}

/**
 * Replace {{OBJECT.PROPERTY}} patterns with nested values
 *
 * @param content - Content to process
 * @param variables - Variable values
 * @returns Content with nested properties replaced
 */
function renderNestedProperties(content: string, variables: TemplateVariables): string {
  return content.replace(PATTERNS.NESTED, (_match, path: string) => {
    const value = getNestedValue(variables, path);

    if (value === undefined || value === null) {
      return '';
    }

    if (typeof value === 'object') {
      return JSON.stringify(value);
    }

    return String(value);
  });
}

/**
 * Get nested property value from object using dot notation
 *
 * @param obj - Object to traverse
 * @param path - Dot-separated property path (e.g., 'USER.NAME')
 * @returns Property value or undefined
 */
function getNestedValue(obj: TemplateVariables, path: string): TemplateValue {
  const parts = path.split('.');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let current: any = obj;

  for (const part of parts) {
    if (current === null || current === undefined) {
      return undefined;
    }
    current = current[part];
  }

  return current;
}

// ============================================================================
// Block Rendering
// ============================================================================

/**
 * Process {{#BLOCK}} ... {{/BLOCK}} structures
 *
 * Supports two use cases:
 * 1. Array iteration - renders block for each array item
 * 2. Conditional rendering - renders block if value is truthy
 *
 * @param content - Content to process
 * @param variables - Variables including arrays and conditionals
 * @returns Content with blocks rendered
 */
function renderBlocks(content: string, variables: TemplateVariables): string {
  return content.replace(PATTERNS.BLOCK, (_match, blockName: string, blockContent: string) => {
    const value = variables[blockName];

    // Case 1: Array iteration
    if (Array.isArray(value)) {
      return renderArrayBlock(blockContent, value);
    }

    // Case 2: Conditional rendering
    // Render block if value is truthy (non-empty string, true, non-zero number)
    if (isTruthy(value)) {
      // If it's an object, use it as the context for rendering
      if (typeof value === 'object' && value !== null) {
        return render(blockContent, value as TemplateVariables);
      }
      // Otherwise just render with original variables
      return render(blockContent, variables);
    }

    // Value is falsy, don't render block
    return '';
  });
}

/**
 * Render a block for each item in an array
 *
 * @param blockContent - Template content for one array item
 * @param array - Array of objects with properties to substitute
 * @returns Concatenated rendered blocks
 */
function renderArrayBlock(blockContent: string, array: TemplateArray): string {
  if (array.length === 0) {
    return '';
  }

  return array
    .map(item => {
      return render(blockContent, item);
    })
    .join('');
}

/**
 * Check if a value is truthy for conditional rendering
 *
 * @param value - Value to check
 * @returns true if value should render block
 */
function isTruthy(value: TemplateValue): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (typeof value === 'string') return value.length > 0;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'object') return true; // Non-null objects are truthy
  return false;
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Extract all variable names used in a template
 *
 * Useful for validation and debugging
 *
 * @param content - Template content
 * @returns Array of unique variable names
 */
export function extractVariableNames(content: string): string[] {
  const variables = new Set<string>();

  // Extract simple variables
  const simpleMatches = content.matchAll(PATTERNS.VARIABLE);
  for (const match of simpleMatches) {
    variables.add(match[1]);
  }

  // Extract nested variables
  const nestedMatches = content.matchAll(PATTERNS.NESTED);
  for (const match of nestedMatches) {
    // Add the root variable name
    const rootVar = match[1].split('.')[0];
    variables.add(rootVar);
  }

  // Extract block variables
  const blockMatches = content.matchAll(PATTERNS.BLOCK);
  for (const match of blockMatches) {
    variables.add(match[1]);
    // Also extract variables inside blocks
    const blockContent = match[2];
    const innerVars = extractVariableNames(blockContent);
    innerVars.forEach(v => variables.add(v));
  }

  return Array.from(variables).sort();
}

/**
 * Validate that all required variables are provided
 *
 * @param templateName - Template file name
 * @param variables - Variables to validate
 * @returns Validation result
 */
export function validateVariables(
  templateName: string,
  variables: TemplateVariables
): { valid: boolean; missing: string[]; extra: string[] } {
  const content = loadTemplate(templateName);
  const required = extractVariableNames(content);
  const provided = Object.keys(variables);

  const missing = required.filter(v => !(v in variables));
  const extra = provided.filter(v => !required.includes(v));

  return {
    valid: missing.length === 0,
    missing,
    extra,
  };
}

/**
 * Create a template preview with sample data for testing
 *
 * @param templateName - Template to preview
 * @param sampleData - Sample variables (optional)
 * @returns Preview information
 */
export function previewTemplate(
  templateName: string,
  sampleData?: TemplateVariables
): {
  requiredVariables: string[];
  preview: string;
} {
  const content = loadTemplate(templateName);
  const requiredVariables = extractVariableNames(content);

  // Create sample data if not provided
  const data = sampleData || createSampleData(requiredVariables);

  const preview = render(content, data);

  return {
    requiredVariables,
    preview,
  };
}

/**
 * Create sample data for preview purposes
 *
 * @param variables - Variable names
 * @returns Sample data object
 */
function createSampleData(variables: string[]): TemplateVariables {
  const data: TemplateVariables = {};

  for (const variable of variables) {
    // Create reasonable sample values based on variable name patterns
    if (variable.includes('DATE') || variable.includes('TIME')) {
      data[variable] = new Date().toISOString();
    } else if (variable.includes('NUMBER') || variable.includes('ID')) {
      data[variable] = '001';
    } else if (variable.includes('PATH')) {
      data[variable] = '/sample/path';
    } else if (variable.endsWith('S') || variable === 'PHASES' || variable === 'TAGS') {
      // Likely an array
      data[variable] = [
        { PHASE_NAME: 'Sample Phase 1', PHASE_STATUS: 'pending' },
        { PHASE_NAME: 'Sample Phase 2', PHASE_STATUS: 'pending' },
      ];
    } else {
      data[variable] = `Sample ${variable}`;
    }
  }

  return data;
}

// ============================================================================
// Type Guards
// ============================================================================

/**
 * Check if a value is a valid template object
 */
export function isTemplateObject(value: unknown): value is TemplateObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Check if a value is a valid template array
 */
export function isTemplateArray(value: unknown): value is TemplateArray {
  return Array.isArray(value) && value.every(item => isTemplateObject(item));
}

// ============================================================================
// Exports
// ============================================================================

export default renderTemplate;
