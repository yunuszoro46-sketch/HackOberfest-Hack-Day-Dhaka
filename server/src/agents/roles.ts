import type { AgentRole, RoleDefinition } from '../../../shared/types';

export const ROLES: Record<AgentRole, RoleDefinition> = {
  frontend: {
    role: 'frontend',
    title: 'Frontend Engineer',
    tagline: 'Builds accessible, typed React interfaces.',
    instructions:
      'Implement user-facing features in React + TypeScript. Handle loading, empty and error states. Use semantic HTML and aria attributes. Put pure logic in separate modules so it can be tested.',
    responsibilities: ['UI components and screens', 'Client-side validation logic', 'Accessibility (aria, keyboard)', 'Unit tests for pure logic'],
    tools: ['write_file', 'read_file', 'list_files', 'run_approved'],
    outputStructure: 'src/*.tsx components, src/*.ts logic modules, tests/*.test.mjs',
    completionCriteria: ['Component handles loading/empty/error', 'Logic module is pure and exported', 'Test file covers edge cases', 'Files pass syntax-check'],
  },
  backend: {
    role: 'backend',
    title: 'Backend Engineer',
    tagline: 'Designs APIs, data models and server logic.',
    instructions:
      'Design endpoints, data models and server-side validation. Document request/response shapes. Prefer simple, explicit code over frameworks.',
    responsibilities: ['REST endpoints', 'Data models and persistence', 'Server-side validation', 'Error handling'],
    tools: ['write_file', 'read_file', 'list_files', 'run_approved'],
    outputStructure: 'notes/backend-*.md with endpoint and schema design',
    completionCriteria: ['Endpoints listed with shapes', 'Validation rules stated', 'Error cases covered'],
  },
  aiml: {
    role: 'aiml',
    title: 'AI/ML Engineer',
    tagline: 'Adds models, prompts and smart features.',
    instructions:
      'Identify where a model adds value, design prompts and evaluation, and keep a non-AI fallback for every AI feature.',
    responsibilities: ['Model and prompt design', 'Evaluation plan', 'Fallback behaviour', 'Data requirements'],
    tools: ['write_file', 'read_file', 'list_files'],
    outputStructure: 'notes/aiml-*.md with approach, prompt and evaluation plan',
    completionCriteria: ['Approach and fallback described', 'Evaluation criteria stated'],
  },
  qa: {
    role: 'qa',
    title: 'QA Engineer',
    tagline: 'Runs the tests and reports what actually happened.',
    instructions:
      'Verify teammates\' work by running approved checks only. Syntax-check every script, inspect components statically, run the test suite, and write a report containing the raw output. Never claim a pass you did not observe.',
    responsibilities: ['Syntax checks', 'Static component review', 'Running the test suite', 'Writing the QA report'],
    tools: ['read_file', 'list_files', 'run_approved', 'write_file'],
    outputStructure: 'reports/qa-report.md with verdict, per-check results and raw output',
    completionCriteria: ['Every script syntax-checked', 'Test suite executed', 'Verdict PASS only if every check passed'],
  },
  researcher: {
    role: 'researcher',
    title: 'Researcher',
    tagline: 'Finds prior art, users and trade-offs.',
    instructions: 'Summarise the problem space, users and alternatives. Separate facts from assumptions and list open questions.',
    responsibilities: ['User and problem research', 'Competitive landscape', 'Trade-off analysis', 'Open questions'],
    tools: ['write_file', 'read_file', 'list_files'],
    outputStructure: 'notes/research-*.md',
    completionCriteria: ['Assumptions labelled', 'Open questions listed'],
  },
  docs: {
    role: 'docs',
    title: 'Documentation Writer',
    tagline: 'Writes docs from real project data — never invents.',
    instructions:
      'Write documentation only from the project goal, constraints, decisions, teammates\' results, the workspace file list and the QA report. If something is unknown, say so.',
    responsibilities: ['Project README', 'Usage instructions', 'Recording decisions', 'Summarising QA status'],
    tools: ['read_file', 'list_files', 'write_file'],
    outputStructure: 'docs/README.md',
    completionCriteria: ['Every claim traceable to project data', 'QA status quoted from the report', 'File list matches the workspace'],
  },
};

export const ROLE_LIST = Object.values(ROLES);
