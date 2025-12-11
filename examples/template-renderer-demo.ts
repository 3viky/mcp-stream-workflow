/**
 * Template Renderer Demo
 *
 * This file demonstrates how to use the template rendering utility
 * for generating stream metadata files.
 */

import { renderTemplate, extractVariableNames, validateVariables } from '../src/utils/template-renderer.js';

// ============================================================================
// Example 1: Rendering HANDOFF.md
// ============================================================================

console.log('='.repeat(80));
console.log('Example 1: Rendering HANDOFF.md template');
console.log('='.repeat(80));

const handoffContent = renderTemplate('HANDOFF.template.md', {
  STREAM_TITLE: 'Add User Authentication',
  STREAM_ID: 'stream-042-add-user-authentication',
  CATEGORY: 'backend',
  PRIORITY: 'high',
  CREATED_AT: new Date().toISOString(),
  HANDOFF_CONTENT: `Implement JWT-based authentication system with the following requirements:

- User registration with email/password
- Login endpoint with JWT token generation
- Token refresh mechanism
- Password reset flow
- Email verification

This will serve as the foundation for all user-related features.`,
  WORKTREE_PATH: '/var/home/viky/Code/packages/worktrees/stream-042-add-user-authentication',
  BRANCH_NAME: 'stream-042-add-user-authentication',
  PROJECT_ROOT: '/var/home/viky/Code/packages/src/@mcp/mcp-stream-workflow',
});

console.log(handoffContent);
console.log('\n');

// ============================================================================
// Example 2: Rendering README.md with phases
// ============================================================================

console.log('='.repeat(80));
console.log('Example 2: Rendering README.md template with phases');
console.log('='.repeat(80));

const readmeContent = renderTemplate('README.template.md', {
  STREAM_TITLE: 'Add User Authentication',
  STREAM_ID: 'stream-042-add-user-authentication',
  STATUS: 'active',
  CATEGORY: 'backend',
  PRIORITY: 'high',
  DESCRIPTION: 'Implement JWT-based authentication system for user management',
  CREATED_AT: '2025-12-11T10:00:00Z',
  UPDATED_AT: '2025-12-11T10:00:00Z',
  COMPLETED_AT: '',
  WORKTREE_PATH: '/var/home/viky/Code/packages/worktrees/stream-042-add-user-authentication',
  BRANCH_NAME: 'stream-042-add-user-authentication',
  PHASES: [
    { PHASE_NAME: 'Design authentication schema' },
    { PHASE_NAME: 'Implement registration endpoint' },
    { PHASE_NAME: 'Implement login endpoint' },
    { PHASE_NAME: 'Add JWT token generation' },
    { PHASE_NAME: 'Implement refresh token mechanism' },
    { PHASE_NAME: 'Add password reset flow' },
    { PHASE_NAME: 'Implement email verification' },
    { PHASE_NAME: 'Write tests' },
    { PHASE_NAME: 'Update documentation' },
  ],
});

console.log(readmeContent);
console.log('\n');

// ============================================================================
// Example 3: Rendering STATUS.md with phase progress
// ============================================================================

console.log('='.repeat(80));
console.log('Example 3: Rendering STATUS.md template with phase progress');
console.log('='.repeat(80));

const statusContent = renderTemplate('STATUS.template.md', {
  STREAM_ID: 'stream-042-add-user-authentication',
  UPDATED_AT: new Date().toISOString(),
  CURRENT_PHASE: 'Implement login endpoint',
  PROGRESS: 35,
  PHASES: [
    {
      PHASE_NAME: 'Design authentication schema',
      PHASE_STATUS: 'completed',
      PHASE_COMPLETED_AT: '2025-12-11T11:00:00Z',
    },
    {
      PHASE_NAME: 'Implement registration endpoint',
      PHASE_STATUS: 'completed',
      PHASE_COMPLETED_AT: '2025-12-11T12:30:00Z',
    },
    {
      PHASE_NAME: 'Implement login endpoint',
      PHASE_STATUS: 'in_progress',
      PHASE_COMPLETED_AT: '',
    },
    {
      PHASE_NAME: 'Add JWT token generation',
      PHASE_STATUS: 'pending',
      PHASE_COMPLETED_AT: '',
    },
  ],
  NOTES: `Current work focuses on the login endpoint implementation.
The registration flow is complete and tested.
Next step: JWT token generation and validation.`,
});

console.log(statusContent);
console.log('\n');

// ============================================================================
// Example 4: Extracting variables from a template
// ============================================================================

console.log('='.repeat(80));
console.log('Example 4: Extracting variables from template');
console.log('='.repeat(80));

const variables = extractVariableNames('HANDOFF.template.md');
console.log('Variables required in HANDOFF.template.md:');
console.log(variables.map(v => `  - ${v}`).join('\n'));
console.log('\n');

// ============================================================================
// Example 5: Validating variables before rendering
// ============================================================================

console.log('='.repeat(80));
console.log('Example 5: Validating variables before rendering');
console.log('='.repeat(80));

const validation = validateVariables('HANDOFF.template.md', {
  STREAM_TITLE: 'Test Stream',
  STREAM_ID: 'stream-001',
  CATEGORY: 'backend',
  PRIORITY: 'high',
  // Missing: CREATED_AT, HANDOFF_CONTENT, WORKTREE_PATH, BRANCH_NAME, PROJECT_ROOT
});

console.log('Validation result:', validation);
console.log('Valid:', validation.valid);
console.log('Missing variables:', validation.missing);
console.log('Extra variables:', validation.extra);
console.log('\n');

// ============================================================================
// Example 6: Complete workflow for start_stream
// ============================================================================

console.log('='.repeat(80));
console.log('Example 6: Complete workflow for start_stream tool');
console.log('='.repeat(80));

interface StartStreamArgs {
  title: string;
  category: string;
  priority: string;
  handoff: string;
  description?: string;
  estimatedPhases?: string[];
  tags?: string[];
}

function simulateStartStream(args: StartStreamArgs): void {
  const streamNumber = 42;
  const streamId = `stream-${streamNumber.toString().padStart(3, '0')}-${args.title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')}`;

  const worktreePath = `/var/home/viky/Code/packages/worktrees/${streamId}`;
  const createdAt = new Date().toISOString();

  console.log('Creating stream metadata files...\n');

  // 1. Generate HANDOFF.md
  console.log('1. HANDOFF.md:');
  console.log('-'.repeat(80));
  const handoff = renderTemplate('HANDOFF.template.md', {
    STREAM_TITLE: args.title,
    STREAM_ID: streamId,
    CATEGORY: args.category,
    PRIORITY: args.priority,
    CREATED_AT: createdAt,
    HANDOFF_CONTENT: args.handoff,
    WORKTREE_PATH: worktreePath,
    BRANCH_NAME: streamId,
    PROJECT_ROOT: '/var/home/viky/Code/packages/src/@mcp/mcp-stream-workflow',
  });
  console.log(handoff);
  console.log('\n');

  // 2. Generate README.md
  console.log('2. README.md:');
  console.log('-'.repeat(80));
  const readme = renderTemplate('README.template.md', {
    STREAM_TITLE: args.title,
    STREAM_ID: streamId,
    STATUS: 'initializing',
    CATEGORY: args.category,
    PRIORITY: args.priority,
    DESCRIPTION: args.description || 'No description provided',
    CREATED_AT: createdAt,
    UPDATED_AT: createdAt,
    COMPLETED_AT: '',
    WORKTREE_PATH: worktreePath,
    BRANCH_NAME: streamId,
    PHASES: (args.estimatedPhases || []).map(name => ({ PHASE_NAME: name })),
  });
  console.log(readme);
  console.log('\n');

  // 3. Generate STATUS.md
  console.log('3. STATUS.md:');
  console.log('-'.repeat(80));
  const status = renderTemplate('STATUS.template.md', {
    STREAM_ID: streamId,
    UPDATED_AT: createdAt,
    CURRENT_PHASE: 'Not started',
    PROGRESS: 0,
    PHASES: (args.estimatedPhases || []).map(name => ({
      PHASE_NAME: name,
      PHASE_STATUS: 'pending',
      PHASE_COMPLETED_AT: '',
    })),
    NOTES: '',
  });
  console.log(status);
  console.log('\n');

  // 4. Generate METADATA.json
  console.log('4. METADATA.json:');
  console.log('-'.repeat(80));
  const metadata = renderTemplate('METADATA.template.json', {
    STREAM_ID: streamId,
    STREAM_NUMBER: streamNumber,
    STREAM_TITLE: args.title,
    CATEGORY: args.category,
    PRIORITY: args.priority,
    CREATED_AT: createdAt,
    UPDATED_AT: createdAt,
    WORKTREE_PATH: worktreePath,
    BRANCH_NAME: streamId,
    PHASES_JSON: JSON.stringify(args.estimatedPhases || []),
    TAGS_JSON: JSON.stringify(args.tags || []),
  });
  console.log(metadata);
  console.log('\n');
}

// Run the simulation
simulateStartStream({
  title: 'Add GraphQL API',
  category: 'backend',
  priority: 'high',
  handoff: `Create a GraphQL API layer for the application with the following features:

- Schema definition for all entities
- Query resolvers for read operations
- Mutation resolvers for write operations
- Subscription support for real-time updates
- Authentication middleware integration
- Rate limiting and caching

This will provide a flexible and efficient API for frontend consumption.`,
  description: 'GraphQL API implementation with full CRUD operations and real-time support',
  estimatedPhases: [
    'Design GraphQL schema',
    'Set up Apollo Server',
    'Implement query resolvers',
    'Implement mutation resolvers',
    'Add subscription support',
    'Integrate authentication',
    'Add caching layer',
    'Write integration tests',
    'Update API documentation',
  ],
  tags: ['graphql', 'api', 'backend', 'apollo'],
});

console.log('='.repeat(80));
console.log('Demo complete!');
console.log('='.repeat(80));
