import assert from 'node:assert/strict';
import { test } from 'node:test';

import { buildDocument } from '@clistd/core';
import { createRuleRegistry, runRule, runRules, visitAst } from '@clistd/linter';
import type { Rule } from '@clistd/linter';

const document = {
  $id: 'https://example.com/acme-cli/0.1',
  specVersion: '0.1' as const,
  cli: { name: 'acme', commandSeparator: ':' as const, endOfOptions: true },
  topics: [{ id: 'projects', title: 'Projects' }],
  commands: [
    {
      id: 'deploy',
      invocation: ['deploy'],
      aliases: [{ path: ['ship'] }],
      arguments: [
        {
          id: 'file',
          name: 'FILE',
          required: true,
          valueSchema: { type: 'string' },
        },
      ],
      flags: [
        { id: 'force', long: 'force', kind: 'boolean', valueSchema: { type: 'boolean' } },
        { id: 'environment', long: 'environment', valueSchema: { type: 'string' } },
      ],
      constraints: [{ type: 'atLeast', inputs: ['force', 'environment'], count: 1 }],
      outputs: [
        {
          id: 'json',
          format: 'json',
          when: { not: { input: 'force', equals: false } },
          schema: { type: 'object' },
        },
      ],
      exitCodes: [{ id: 'success', code: 0, description: 'Success.' }],
    },
  ],
};

async function buildAst() {
  const result = await buildDocument({ value: document });
  assert.equal(result.ok, true);
  if (!result.ok) throw new Error('Expected the fixture document to build.');
  return result.ast;
}

test('traverses normalized AST nodes in deterministic pre-order with typed callbacks', async () => {
  const ast = await buildAst();
  const visited: string[] = [];

  visitAst(ast, [
    {
      onDocument: (node) => visited.push(node.kind),
      onTopic: (node) => visited.push(node.kind),
      onCommand: (node) => visited.push(node.kind),
      onCommandEnter: () => visited.push('command-enter'),
      onCommandLeave: () => visited.push('command-leave'),
      onCommandAlias: (node) => visited.push(node.kind),
      onArgument: (node) => visited.push(node.kind),
      onBooleanFlag: (node) => visited.push(node.kind),
      onValueFlag: (node) => visited.push(node.kind),
      onCountConstraint: (node) => visited.push(node.kind),
      onOutput: (node) => visited.push(node.kind),
      onNotCondition: (node) => visited.push(node.kind),
      onEqualityCondition: (node) => visited.push(node.kind),
      onExitCode: (node) => visited.push(node.kind),
    },
  ]);

  assert.deepEqual(visited, [
    'document',
    'topic',
    'command',
    'command-enter',
    'command-alias',
    'argument',
    'boolean',
    'value',
    'count',
    'output',
    'not-condition',
    'equality-condition',
    'exit-code',
    'command-leave',
  ]);
});

test('runs a rule with node-based diagnostics, typed indexes, and configured severity', async () => {
  const ast = await buildAst();
  const descriptionRule: Rule = {
    meta: {
      id: 'example/require-description',
      description: 'Requires command descriptions.',
      defaultSeverity: 'warn',
      prompt: 'Add a concise description that explains what the command does.',
    },
    create(context) {
      assert.equal(context.indexes.commands.byId.get('deploy')?.id, 'deploy');
      return {
        onCommand(command) {
          if (command.description === undefined) {
            context.report({ message: 'Commands need a description.', node: command });
          }
        },
      };
    },
  };

  const diagnostics = runRule(ast, descriptionRule, 'error');

  assert.equal(diagnostics.length, 1);
  assert.equal(diagnostics[0]?.code, 'example/require-description');
  assert.equal(diagnostics[0]?.severity, 'error');
  assert.deepEqual(diagnostics[0]?.paths, [ast.commands[0]?.path]);
  assert.equal(
    diagnostics[0]?.prompt,
    'Add a concise description that explains what the command does.',
  );
});

test('runs registered rules in registration order and honors off configuration', async () => {
  const ast = await buildAst();
  const calls: string[] = [];
  const firstRule: Rule = {
    meta: { id: 'example/first', description: 'First test rule.', defaultSeverity: 'warn' },
    create() {
      calls.push('first');
      return {};
    },
  };
  const secondRule: Rule = {
    meta: { id: 'example/second', description: 'Second test rule.', defaultSeverity: 'error' },
    create() {
      calls.push('second');
      return {};
    },
  };
  const registry = createRuleRegistry([firstRule, secondRule]);

  assert.deepEqual(runRules(ast, registry, { 'example/first': 'off' }), []);
  assert.deepEqual(calls, ['second']);
  assert.throws(() => runRules(ast, registry, { 'example/missing': 'warn' }), /unregistered rule/);
  assert.throws(() => createRuleRegistry([firstRule, firstRule]), /already registered/);
});

test('dispatches callbacks for all enabled rules during one traversal', async () => {
  const ast = await buildAst();
  const calls: string[] = [];
  const firstRule: Rule = {
    meta: { id: 'example/first', description: 'First test rule.', defaultSeverity: 'warn' },
    create() {
      return { onCommand: (command) => calls.push(`first:${command.id}`) };
    },
  };
  const secondRule: Rule = {
    meta: { id: 'example/second', description: 'Second test rule.', defaultSeverity: 'warn' },
    create() {
      return { onCommand: (command) => calls.push(`second:${command.id}`) };
    },
  };

  runRules(ast, createRuleRegistry([firstRule, secondRule]));

  assert.deepEqual(calls, ['first:deploy', 'second:deploy']);
});
