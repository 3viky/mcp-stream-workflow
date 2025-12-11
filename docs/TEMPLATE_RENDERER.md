# Template Renderer Documentation

**Module**: `src/utils/template-renderer.ts`
**Purpose**: Simple mustache-style template rendering for stream metadata generation
**Version**: 1.0.0

---

## Overview

The template renderer provides a lightweight, type-safe solution for generating stream metadata files from templates. It supports variable substitution, array iteration, and conditional rendering using a mustache-like syntax.

### Key Features

- **Simple variable substitution**: `{{VARIABLE}}`
- **Array iteration**: `{{#ARRAY}} ... {{/ARRAY}}`
- **Conditional rendering**: `{{#CONDITION}} ... {{/CONDITION}}`
- **Nested property access**: `{{OBJECT.PROPERTY}}`
- **Type-safe API** with full TypeScript support
- **Template validation** and variable extraction
- **Zero external dependencies** (uses only Node.js built-ins)

---

## Installation

The template renderer is part of the Stream Workflow Manager. No separate installation is needed.

```typescript
import { renderTemplate } from './src/utils/template-renderer.js';
```

---

## Basic Usage

### Simple Variable Substitution

Replace `{{VARIABLE}}` with values:

```typescript
import { renderTemplate } from './src/utils/template-renderer.js';

const content = renderTemplate('HANDOFF.template.md', {
  STREAM_TITLE: 'Add Authentication',
  STREAM_ID: 'stream-042-auth',
  CATEGORY: 'backend',
  PRIORITY: 'high',
  CREATED_AT: new Date().toISOString(),
  HANDOFF_CONTENT: 'Implement JWT authentication...',
  WORKTREE_PATH: '/path/to/worktree',
  BRANCH_NAME: 'stream-042-auth',
  PROJECT_ROOT: '/path/to/project',
});

console.log(content);
// Output:
// # Stream Handoff: Add Authentication
// **Stream ID**: stream-042-auth
// ...
```

### Array Iteration

Render blocks for each array item:

```typescript
const content = renderTemplate('README.template.md', {
  STREAM_TITLE: 'My Stream',
  PHASES: [
    { PHASE_NAME: 'Planning' },
    { PHASE_NAME: 'Implementation' },
    { PHASE_NAME: 'Testing' },
  ],
  // ... other variables
});

// Template:
// ## Phases
// {{#PHASES}}
// - [ ] {{PHASE_NAME}}
// {{/PHASES}}

// Output:
// ## Phases
// - [ ] Planning
// - [ ] Implementation
// - [ ] Testing
```

### Conditional Rendering

Render blocks only if value is truthy:

```typescript
const template = '{{#SHOW_WARNING}}⚠️ Warning: {{MESSAGE}}{{/SHOW_WARNING}}';

// With truthy value:
const result1 = render(template, {
  SHOW_WARNING: true,
  MESSAGE: 'This is important',
});
// Output: "⚠️ Warning: This is important"

// With falsy value:
const result2 = render(template, {
  SHOW_WARNING: false,
  MESSAGE: 'This is important',
});
// Output: ""
```

---

## API Reference

### Core Functions

#### `renderTemplate(templateName, variables)`

Render a template file with provided variables.

**Parameters:**
- `templateName: string` - Template filename (e.g., 'HANDOFF.template.md')
- `variables: TemplateVariables` - Object with variable values

**Returns:** `string` - Rendered content

**Example:**
```typescript
const content = renderTemplate('STATUS.template.md', {
  STREAM_ID: 'stream-001',
  PROGRESS: 75,
  CURRENT_PHASE: 'Testing',
});
```

---

#### `render(content, variables)`

Render template content (string) with variables.

**Parameters:**
- `content: string` - Template content
- `variables: TemplateVariables` - Variable values

**Returns:** `string` - Rendered content

**Example:**
```typescript
const template = 'Hello {{NAME}}, you are {{AGE}} years old.';
const result = render(template, { NAME: 'Alice', AGE: 30 });
// Output: "Hello Alice, you are 30 years old."
```

---

#### `renderTemplateWithMetadata(templateName, variables)`

Render template and return detailed metadata.

**Parameters:**
- `templateName: string` - Template filename
- `variables: TemplateVariables` - Variable values

**Returns:** `RenderResult`
```typescript
interface RenderResult {
  content: string;           // Rendered content
  variables: string[];       // Variables used in template
  unusedVariables: string[]; // Variables provided but not used
}
```

**Example:**
```typescript
const result = renderTemplateWithMetadata('HANDOFF.template.md', {
  STREAM_TITLE: 'Test',
  STREAM_ID: 'stream-001',
  UNUSED_VAR: 'not in template',
  // ... other variables
});

console.log(result.content);          // Rendered content
console.log(result.variables);        // ['STREAM_TITLE', 'STREAM_ID', ...]
console.log(result.unusedVariables);  // ['UNUSED_VAR']
```

---

### Utility Functions

#### `extractVariableNames(content)`

Extract all variable names from template content.

**Parameters:**
- `content: string` - Template content

**Returns:** `string[]` - Sorted array of unique variable names

**Example:**
```typescript
const template = '{{NAME}} is {{AGE}} years old. {{NAME}} lives in {{CITY}}.';
const variables = extractVariableNames(template);
console.log(variables); // ['AGE', 'CITY', 'NAME']
```

---

#### `validateVariables(templateName, variables)`

Validate that all required variables are provided.

**Parameters:**
- `templateName: string` - Template filename
- `variables: TemplateVariables` - Variables to validate

**Returns:**
```typescript
{
  valid: boolean;      // true if all required variables provided
  missing: string[];   // Variables required but missing
  extra: string[];     // Variables provided but not used
}
```

**Example:**
```typescript
const validation = validateVariables('HANDOFF.template.md', {
  STREAM_TITLE: 'Test',
  STREAM_ID: 'stream-001',
  // Missing: CATEGORY, PRIORITY, etc.
});

if (!validation.valid) {
  console.error('Missing variables:', validation.missing);
}
```

---

#### `previewTemplate(templateName, sampleData?)`

Generate a preview of a template with sample data.

**Parameters:**
- `templateName: string` - Template filename
- `sampleData?: TemplateVariables` - Optional sample data (auto-generated if not provided)

**Returns:**
```typescript
{
  requiredVariables: string[];  // Variables needed by template
  preview: string;               // Rendered preview
}
```

**Example:**
```typescript
const preview = previewTemplate('STATUS.template.md');
console.log('Required variables:', preview.requiredVariables);
console.log('Preview:\n', preview.preview);
```

---

### Type Guards

#### `isTemplateObject(value)`

Check if value is a valid template object.

**Example:**
```typescript
if (isTemplateObject(myValue)) {
  // TypeScript knows myValue is TemplateObject
  const rendered = render(template, myValue);
}
```

---

#### `isTemplateArray(value)`

Check if value is a valid template array.

**Example:**
```typescript
if (isTemplateArray(myValue)) {
  // TypeScript knows myValue is TemplateArray
  renderArrayBlock(blockContent, myValue);
}
```

---

## Template Syntax

### Variable Substitution

**Syntax:** `{{VARIABLE_NAME}}`

**Rules:**
- Variable names must be UPPERCASE with underscores
- Must start with a letter
- Can contain letters, numbers, and underscores

**Examples:**
```
{{NAME}}
{{STREAM_ID}}
{{CREATED_AT}}
{{WORKTREE_PATH}}
```

**Behavior:**
- Missing variables → replaced with empty string
- `null` or `undefined` → replaced with empty string
- Numbers and booleans → converted to strings
- Objects → converted to JSON (usually not desired)

---

### Array Blocks

**Syntax:**
```
{{#ARRAY_NAME}}
  Content for each item
  {{ITEM_PROPERTY}}
{{/ARRAY_NAME}}
```

**Rules:**
- Block name must match closing tag
- Content is rendered once per array item
- Variables inside block are resolved from item properties
- Empty arrays render nothing

**Example:**
```markdown
## Phases
{{#PHASES}}
- [ ] {{PHASE_NAME}}
{{/PHASES}}
```

**Data:**
```typescript
{
  PHASES: [
    { PHASE_NAME: 'Planning' },
    { PHASE_NAME: 'Implementation' },
  ]
}
```

**Output:**
```markdown
## Phases
- [ ] Planning
- [ ] Implementation
```

---

### Conditional Blocks

**Syntax:**
```
{{#CONDITION}}
  Content shown if condition is truthy
{{/CONDITION}}
```

**Truthy Values:**
- Non-empty strings
- `true`
- Non-zero numbers
- Non-empty arrays
- Non-null objects

**Falsy Values:**
- Empty strings `""`
- `false`
- `0`
- `null`
- `undefined`
- Empty arrays `[]`

**Example:**
```markdown
{{#SHOW_WARNING}}
⚠️ Warning: {{WARNING_MESSAGE}}
{{/SHOW_WARNING}}
```

---

### Nested Properties

**Syntax:** `{{OBJECT.PROPERTY}}`

**Example:**
```markdown
Server: {{CONFIG.DATABASE.HOST}}:{{CONFIG.DATABASE.PORT}}
```

**Data:**
```typescript
{
  CONFIG: {
    DATABASE: {
      HOST: 'localhost',
      PORT: 5432
    }
  }
}
```

**Output:**
```
Server: localhost:5432
```

---

## Templates

The system includes four standard templates in `templates/`:

### 1. HANDOFF.template.md

Used when creating a new stream to provide context to the developer.

**Variables:**
- `STREAM_TITLE` - Human-readable stream title
- `STREAM_ID` - Unique stream identifier
- `CATEGORY` - Stream category (backend, frontend, etc.)
- `PRIORITY` - Priority level (critical, high, medium, low)
- `CREATED_AT` - ISO timestamp of creation
- `HANDOFF_CONTENT` - Detailed description of work to be done
- `WORKTREE_PATH` - Absolute path to worktree
- `BRANCH_NAME` - Git branch name
- `PROJECT_ROOT` - Main project directory path

---

### 2. README.template.md

Stream overview and metadata.

**Variables:**
- `STREAM_TITLE` - Stream title
- `STREAM_ID` - Stream identifier
- `STATUS` - Current status
- `CATEGORY` - Stream category
- `PRIORITY` - Priority level
- `DESCRIPTION` - Detailed description
- `CREATED_AT` - Creation timestamp
- `UPDATED_AT` - Last update timestamp
- `COMPLETED_AT` - Completion timestamp (empty if not completed)
- `WORKTREE_PATH` - Worktree path
- `BRANCH_NAME` - Branch name
- `PHASES` - Array of phase objects with `PHASE_NAME`

---

### 3. STATUS.template.md

Current progress tracking.

**Variables:**
- `STREAM_ID` - Stream identifier
- `UPDATED_AT` - Last update timestamp
- `CURRENT_PHASE` - Name of current phase
- `PROGRESS` - Progress percentage (0-100)
- `PHASES` - Array of phase objects:
  - `PHASE_NAME` - Phase name
  - `PHASE_STATUS` - Phase status (pending, in_progress, completed)
  - `PHASE_COMPLETED_AT` - Completion timestamp
- `NOTES` - Additional notes or context

---

### 4. METADATA.template.json

Machine-readable metadata.

**Variables:**
- `STREAM_ID` - Stream identifier
- `STREAM_NUMBER` - Numeric stream ID
- `STREAM_TITLE` - Stream title
- `CATEGORY` - Stream category
- `PRIORITY` - Priority level
- `CREATED_AT` - Creation timestamp
- `UPDATED_AT` - Last update timestamp
- `WORKTREE_PATH` - Worktree path
- `BRANCH_NAME` - Branch name
- `PHASES_JSON` - JSON string of phases array
- `TAGS_JSON` - JSON string of tags array

---

## Best Practices

### 1. Variable Naming

✅ **Good:**
```typescript
{
  STREAM_ID: 'stream-042',
  CREATED_AT: '2025-12-11T10:00:00Z',
  WORKTREE_PATH: '/path/to/worktree'
}
```

❌ **Bad:**
```typescript
{
  streamId: 'stream-042',        // Lowercase
  created: '2025-12-11',         // Inconsistent naming
  path: '/path/to/worktree'      // Too generic
}
```

---

### 2. Array Data Structure

✅ **Good:**
```typescript
{
  PHASES: [
    { PHASE_NAME: 'Planning', PHASE_STATUS: 'completed' },
    { PHASE_NAME: 'Implementation', PHASE_STATUS: 'in_progress' }
  ]
}
```

❌ **Bad:**
```typescript
{
  PHASES: ['Planning', 'Implementation']  // Can't access properties
}
```

---

### 3. Template Design

✅ **Good:**
```markdown
{{#PHASES}}
- [ ] {{PHASE_NAME}}
{{/PHASES}}
```

❌ **Bad:**
```markdown
{{#PHASES}}- [ ] {{PHASE_NAME}}{{/PHASES}}
```
(No newlines makes output hard to read)

---

### 4. Error Handling

Always validate variables before rendering:

```typescript
const validation = validateVariables(templateName, variables);
if (!validation.valid) {
  throw new Error(
    `Missing required variables: ${validation.missing.join(', ')}`
  );
}

const content = renderTemplate(templateName, variables);
```

---

### 5. Type Safety

Use TypeScript interfaces for variable objects:

```typescript
interface HandoffVariables {
  STREAM_TITLE: string;
  STREAM_ID: string;
  CATEGORY: string;
  PRIORITY: string;
  CREATED_AT: string;
  HANDOFF_CONTENT: string;
  WORKTREE_PATH: string;
  BRANCH_NAME: string;
  PROJECT_ROOT: string;
}

function createHandoff(vars: HandoffVariables): string {
  return renderTemplate('HANDOFF.template.md', vars);
}
```

---

## Performance Considerations

### Template Caching

Templates are loaded from disk on each render. For high-frequency rendering, consider caching:

```typescript
const templateCache = new Map<string, string>();

function cachedRenderTemplate(name: string, vars: TemplateVariables): string {
  if (!templateCache.has(name)) {
    const content = readFileSync(join(templatesDir, name), 'utf-8');
    templateCache.set(name, content);
  }
  return render(templateCache.get(name)!, vars);
}
```

### Variable Extraction

`extractVariableNames` performs regex operations. Cache results for repeated validations:

```typescript
const variableCache = new Map<string, string[]>();

function getCachedVariables(templateName: string): string[] {
  if (!variableCache.has(templateName)) {
    variableCache.set(templateName, extractVariableNames(templateName));
  }
  return variableCache.get(templateName)!;
}
```

---

## Testing

### Unit Tests

```typescript
import { render, extractVariableNames } from './template-renderer.js';

describe('template renderer', () => {
  it('should replace variables', () => {
    const result = render('Hello {{NAME}}', { NAME: 'World' });
    expect(result).toBe('Hello World');
  });

  it('should render arrays', () => {
    const template = '{{#ITEMS}}{{NAME}}\n{{/ITEMS}}';
    const result = render(template, {
      ITEMS: [{ NAME: 'A' }, { NAME: 'B' }]
    });
    expect(result).toBe('A\nB\n');
  });
});
```

### Integration Tests

Test with actual template files:

```typescript
describe('HANDOFF template', () => {
  it('should render complete handoff', () => {
    const content = renderTemplate('HANDOFF.template.md', {
      STREAM_TITLE: 'Test',
      // ... all required variables
    });

    expect(content).toContain('# Stream Handoff: Test');
    expect(content).toContain('**Stream ID**:');
  });
});
```

---

## Troubleshooting

### Variables Not Replaced

**Problem:** `{{VARIABLE}}` appears in output

**Causes:**
1. Variable name doesn't match (case-sensitive)
2. Variable not provided in data object
3. Variable name contains invalid characters

**Solution:**
```typescript
// Check variable names
const required = extractVariableNames(template);
console.log('Required:', required);

// Validate before rendering
const validation = validateVariables(templateName, variables);
if (!validation.valid) {
  console.error('Missing:', validation.missing);
}
```

---

### Array Blocks Not Rendering

**Problem:** Array block content doesn't appear

**Causes:**
1. Array is empty
2. Array variable not provided
3. Array contains primitives instead of objects

**Solution:**
```typescript
// Ensure array is provided and has objects
const data = {
  ITEMS: [
    { NAME: 'Item 1' },  // ✅ Objects with properties
    { NAME: 'Item 2' }
  ]
};

// NOT:
const badData = {
  ITEMS: ['Item 1', 'Item 2']  // ❌ Primitives
};
```

---

### Template File Not Found

**Problem:** `Template not found: X.template.md`

**Cause:** Template file doesn't exist or path is wrong

**Solution:**
```bash
# Verify template exists
ls templates/HANDOFF.template.md

# Ensure templates are in correct location
# relative to compiled code: dist/utils/../../templates/
```

---

## Examples

See `examples/template-renderer-demo.ts` for comprehensive usage examples.

---

## Future Enhancements

Potential improvements for future versions:

1. **Partial templates** - Include other templates
2. **Custom helpers** - User-defined transformation functions
3. **Template inheritance** - Base templates with overrides
4. **Async rendering** - Support for async variable resolution
5. **Template compilation** - Pre-compile templates for performance
6. **Custom delimiters** - Alternative to `{{ }}`

---

## Related Documentation

- [IMPLEMENTATION_PLAN.md](../IMPLEMENTATION_PLAN.md) - Full implementation plan
- [START_STREAM_DESIGN.md](../START_STREAM_DESIGN.md) - start_stream tool design
- [DEVELOPMENT.md](../DEVELOPMENT.md) - Development guide

---

**Version:** 1.0.0
**Last Updated:** 2025-12-11
**Author:** The Collective
