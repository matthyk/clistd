import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { test } from 'node:test';
import { pathToFileURL } from 'node:url';

import { buildDocument, findBreakingChanges, validateDocument } from '@clistd/core';

const baseDocument = {
  $id: 'https://example.com/acme-cli/0.1',
  specVersion: '0.1' as const,
  cli: {
    name: 'acme',
    commandSeparator: ':' as const,
    endOfOptions: true,
  },
  commands: [
    {
      id: 'hello',
      invocation: ['hello'],
    },
  ],
};

test('rejects an invalid document against the specification schema', () => {
  const result = validateDocument({});

  assert.equal(result.valid, false);
  assert.ok(result.diagnostics.some((diagnostic) => diagnostic.code === 'schema/required'));
  assert.deepEqual(result.diagnostics[0]?.paths, [[]]);
});

test('normalizes optional collections and creates typed indexes', async () => {
  const result = await buildDocument({ value: baseDocument });

  assert.equal(result.ok, true);
  if (!result.ok) return;

  assert.deepEqual(result.ast.topics, []);
  assert.deepEqual(result.ast.commands[0]?.arguments, []);
  assert.deepEqual(result.ast.commands[0]?.flags, []);
  assert.equal(result.ast.indexes.commands.byId.get('hello'), result.ast.commands[0]);
  assert.equal(
    result.ast.indexes.commands.byInvocation.get(JSON.stringify(['hello'])),
    result.ast.commands[0],
  );
});

test('finds breaking changes between normalized documents', async () => {
  const base = await buildDocument({
    value: {
      ...baseDocument,
      commands: [
        {
          id: 'hello',
          invocation: ['hello'],
          flags: [{ id: 'format', long: 'format', valueSchema: { type: 'string' } }],
        },
      ],
    },
  });
  const head = await buildDocument({ value: baseDocument });

  assert.equal(base.ok, true);
  assert.equal(head.ok, true);
  if (!base.ok || !head.ok) return;

  const diff = findBreakingChanges(base.ast, head.ast);
  assert.ok(diff.breakingChanges.some((change) => change.code === 'diff/flag-removed'));
});

test('reports schema changes as warnings in the full diff', async () => {
  const base = await buildDocument({ value: baseDocument });
  const head = await buildDocument({
    value: {
      ...baseDocument,
      commands: [
        {
          id: 'hello',
          invocation: ['hello'],
          flags: [{ id: 'format', long: 'format', valueSchema: { type: 'string' } }],
        },
      ],
    },
  });
  const baseWithFlag = await buildDocument({
    value: {
      ...baseDocument,
      commands: [
        {
          id: 'hello',
          invocation: ['hello'],
          flags: [{ id: 'format', long: 'format', valueSchema: { type: 'number' } }],
        },
      ],
    },
  });

  assert.equal(base.ok, true);
  assert.equal(head.ok, true);
  assert.equal(baseWithFlag.ok, true);
  if (!head.ok || !baseWithFlag.ok) return;

  const diff = findBreakingChanges(baseWithFlag.ast, head.ast);
  assert.ok(diff.changes.some((change) => change.code === 'warn/flag-schema-changed'));
  assert.equal(diff.breakingChanges.length, 0);
});

test('reports semantic diagnostics with JSONPaths', async () => {
  const result = await buildDocument({
    value: {
      ...baseDocument,
      commands: [
        {
          id: 'first',
          invocation: ['same'],
          flags: [
            {
              id: 'names',
              long: 'name',
              multiple: true,
              valueSchema: { type: 'string' },
            },
          ],
        },
        {
          id: 'second',
          invocation: ['same'],
        },
      ],
    },
  });

  assert.equal(result.ok, false);
  if (result.ok) return;

  assert.ok(
    result.diagnostics.some(
      (diagnostic) =>
        diagnostic.code === 'command/duplicate-path' &&
        diagnostic.paths[0]?.join('/') === 'commands/0/invocation',
    ),
  );
  assert.ok(result.diagnostics.some((diagnostic) => diagnostic.code === 'flag/multiple-schema'));
});

test('resolves an internal command reference before building the AST', async () => {
  const result = await buildDocument({
    value: {
      ...baseDocument,
      components: {
        commands: {
          deploy: {
            id: 'deploy',
            invocation: ['deploy'],
            description: 'Deploy the project.',
          },
        },
      },
      commands: [{ $ref: '#/components/commands/deploy' }],
    },
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;

  assert.equal(result.ast.commands[0]?.id, 'deploy');
  assert.deepEqual(result.ast.commands[0]?.path, ['commands', 0]);
});

test('uses the input URI as the base identity for relative references', async () => {
  const directory = await mkdtemp('/tmp/clistd-core-reference-test-');
  const referencedCommand = join(directory, 'deploy.json');
  await writeFile(
    referencedCommand,
    JSON.stringify({ id: 'deploy', invocation: ['deploy'], description: 'Deploy the project.' }),
  );

  const result = await buildDocument({
    value: { ...baseDocument, commands: [{ $ref: './deploy.json' }] },
    uri: pathToFileURL(join(directory, 'clistd.json')).href,
  });

  assert.equal(result.ok, true, JSON.stringify(result));
  if (!result.ok) return;
  assert.equal(result.ast.commands[0]?.id, 'deploy');
});

test('reports unresolved references as document diagnostics', async () => {
  const result = await buildDocument({
    value: {
      ...baseDocument,
      commands: [{ $ref: '#/components/commands/missing' }],
    },
  });

  assert.equal(result.ok, false);
  if (result.ok) return;

  assert.equal(result.diagnostics[0]?.code, 'reference/unresolved');
  assert.deepEqual(result.diagnostics[0]?.paths, [[]]);
});

test('normalizes rich command definitions and recursive conditions', async () => {
  const result = await buildDocument({
    value: {
      ...baseDocument,
      topics: [
        {
          id: 'projects',
          title: 'Projects',
          description: 'Project commands.',
        },
      ],
      commands: [
        {
          id: 'project.deploy',
          invocation: ['project', 'deploy'],
          aliases: [{ path: ['deploy'] }],
          topics: ['projects'],
          summary: 'Deploy a project.',
          description: 'Deploy a project to an environment.',
          arguments: [
            {
              id: 'files',
              name: 'FILE',
              required: false,
              variadic: true,
              description: 'Files to deploy.',
              valueSchema: { type: 'array', items: { type: 'string' } },
            },
          ],
          flags: [
            {
              id: 'environment',
              long: 'environment',
              short: 'e',
              longAliases: ['env'],
              shortAliases: ['E'],
              valueName: 'NAME',
              required: true,
              description: 'Target environment.',
              valueSchema: { type: 'string' },
            },
            {
              id: 'force',
              long: 'force',
              short: 'f',
              kind: 'boolean',
              default: false,
              valueSchema: { type: 'boolean' },
            },
          ],
          constraints: [
            {
              type: 'requires',
              input: 'force',
              allOf: ['environment'],
            },
            {
              type: 'atLeast',
              inputs: ['environment', 'force'],
              count: 1,
            },
            {
              type: 'allOrNone',
              inputs: ['environment', 'force'],
            },
          ],
          outputs: [
            {
              id: 'text',
              format: 'text',
              description: 'Human-readable output.',
            },
            {
              id: 'json',
              format: 'json',
              when: {
                allOf: [
                  { input: 'force', equals: true },
                  {
                    anyOf: [
                      { input: 'environment', equals: 'production' },
                      { not: { input: 'environment', equals: 'development' } },
                    ],
                  },
                ],
              },
              schema: { type: 'object' },
            },
          ],
          exitCodes: [{ id: 'success', code: 0, description: 'Success.' }],
        },
      ],
    },
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;

  const command = result.ast.commands[0];
  assert.ok(command);
  assert.equal(command.aliases[0]?.segments[0], 'deploy');
  assert.equal(command.arguments[0]?.variadic, true);
  assert.equal(command.flags[0]?.kind, 'value');
  assert.equal(command.flags[1]?.kind, 'boolean');
  assert.equal(command.constraints[0]?.kind, 'requires');
  assert.equal(command.constraints[1]?.kind, 'count');
  assert.equal(command.constraints[2]?.kind, 'all-or-none');
  assert.equal(command.outputs[1]?.when?.kind, 'all-of-condition');
  assert.equal(result.ast.indexes.topics.get('projects')?.title, 'Projects');
  assert.equal(
    result.ast.indexes.commands.flagsByCommandId.get('project.deploy')?.get('force')?.kind,
    'boolean',
  );
});

test('reports duplicate identifiers and invalid cross-references', async () => {
  const result = await buildDocument({
    value: {
      ...baseDocument,
      topics: [
        { id: 'shared', title: 'One' },
        { id: 'shared', title: 'Two' },
      ],
      commands: [
        {
          id: 'duplicate',
          invocation: ['one'],
          topics: ['missing'],
          arguments: [
            {
              id: 'input',
              name: 'INPUT',
              required: false,
              valueSchema: { type: 'string' },
            },
            {
              id: 'input',
              name: 'OTHER',
              required: false,
              valueSchema: { type: 'string' },
            },
          ],
          flags: [
            {
              id: 'flag',
              long: 'same',
              valueSchema: { type: 'string' },
            },
            {
              id: 'other-flag',
              long: 'same',
              valueSchema: { type: 'string' },
            },
          ],
          constraints: [{ type: 'requires', input: 'unknown', allOf: ['input'] }],
          outputs: [
            { id: 'default-one', format: 'text' },
            { id: 'default-two', format: 'text' },
            { id: 'invalid-text', format: 'text', schema: { type: 'string' } },
          ],
          exitCodes: [
            { id: 'first', code: 1, description: 'First.' },
            { id: 'second', code: 1, description: 'Second.' },
          ],
        },
        { id: 'duplicate', invocation: ['two'] },
      ],
    },
  });

  assert.equal(result.ok, false);
  if (result.ok) return;

  const codes = new Set(result.diagnostics.map((diagnostic) => diagnostic.code));
  assert.ok(codes.has('topic/duplicate-id'));
  assert.ok(codes.has('command/duplicate-id'));
  assert.ok(codes.has('command/unknown-topic'));
  assert.ok(codes.has('argument/duplicate-id'));
  assert.ok(codes.has('flag/duplicate-name'));
  assert.ok(codes.has('constraint/unknown-input'));
  assert.ok(codes.has('output/multiple-defaults'));
  assert.ok(codes.has('output/text-schema'));
  assert.ok(codes.has('exit-code/duplicate-code'));
});

test('reports schema paths for nested invalid values', () => {
  const result = validateDocument({
    ...baseDocument,
    commands: [{ id: 42, invocation: ['hello'] }],
  });

  assert.equal(result.valid, false);
  assert.ok(
    result.diagnostics.some(
      (diagnostic) =>
        diagnostic.code === 'schema/type' && diagnostic.paths[0]?.join('/') === 'commands/0/id',
    ),
  );
});
