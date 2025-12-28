# Utils Module

Shared utility functions for the Stream Workflow Manager.

---

## Template Renderer

**File**: `template-renderer.ts`
**Purpose**: Mustache-style template rendering for stream metadata generation

### Quick Start

```typescript
import { renderTemplate } from './utils/template-renderer.js';

const content = renderTemplate('HANDOFF.template.md', {
  STREAM_TITLE: 'Add Authentication',
  STREAM_ID: 'stream-042',
  CATEGORY: 'backend',
  PRIORITY: 'high',
  CREATED_AT: new Date().toISOString(),
  HANDOFF_CONTENT: 'Implement JWT authentication...',
  WORKTREE_PATH: '/path/to/worktree',
  BRANCH_NAME: 'stream-042',
  PROJECT_ROOT: '/path/to/project',
});
```

### Template Syntax

#### Variables
```
{{VARIABLE_NAME}}
```

#### Arrays
```
{{#ARRAY}}
  Content for each item: {{ITEM_PROPERTY}}
{{/ARRAY}}
```

#### Conditionals
```
{{#CONDITION}}
  Shown if truthy
{{/CONDITION}}
```

#### Nested Properties
```
{{OBJECT.PROPERTY}}
```

### Available Functions

| Function | Purpose |
|----------|---------|
| `renderTemplate(name, vars)` | Render template file |
| `render(content, vars)` | Render template string |
| `extractVariableNames(content)` | Get variable names from template |
| `validateVariables(name, vars)` | Validate required variables |
| `previewTemplate(name, sample?)` | Generate preview |

### Full Documentation

See [docs/TEMPLATE_RENDERER.md](../../docs/TEMPLATE_RENDERER.md) for complete API reference, examples, and best practices.

### Examples

See [examples/template-renderer-demo.ts](../../examples/template-renderer-demo.ts) for comprehensive usage examples.

### Tests

See [tests/template-renderer.test.ts](../../tests/template-renderer.test.ts) for test suite with 37 test cases.

---

## Adding New Utilities

When adding new utilities to this module:

1. **Create the utility file**: `src/utils/your-utility.ts`
2. **Export from index**: Add exports to `src/utils/index.ts`
3. **Add tests**: Create `tests/your-utility.test.ts`
4. **Document**: Add section to this README
5. **Examples**: Add usage examples if complex

### Template for New Utility

```typescript
/**
 * Your Utility
 *
 * Brief description of what this utility does
 *
 * @module your-utility
 */

// Type definitions
export interface YourType {
  // ...
}

// Main functions
export function yourFunction(args: YourType): ReturnType {
  // Implementation
}

// Helper functions (not exported)
function helperFunction() {
  // Internal logic
}
```

---

**Last Updated**: 2025-12-11
**Maintainer**: The Collective
