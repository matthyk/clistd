import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { test } from 'node:test';
import { join } from 'node:path';

import { adaptCommanderProgram } from '@clistd/adapter-commander';
import { buildDocument } from '@clistd/core';

test('creates a core-valid clistd document from a Commander-compatible program factory', async () => {
  const source = await fixtureModule();
  const output = await adaptCommanderProgram({ protocolVersion: '0.1', source });
  const result = await buildDocument({ value: output.document, uri: output.uri });

  assert.match(output.uri ?? '', /^urn:clistd:adapter:commander:/u);
  assert.equal(result.ok, true, JSON.stringify(result.diagnostics));
  if (!result.ok) return;
  assert.equal(result.ast.cli.name, 'fixture');
  assert.deepEqual(
    result.ast.commands.map((command) => command.invocation),
    [['project'], ['project', 'create']],
  );
  assert.deepEqual(result.ast.commands[0]?.aliases[0]?.segments, ['p']);
  const command = result.ast.commands[1];
  assert.equal(command?.arguments[0]?.required, true);
  const format = command?.flags.find((flag) => flag.id === 'format');
  assert.ok(format !== undefined && format.kind === 'value');
  assert.deepEqual(format.valueSchema, { enum: ['json', 'text'] });
  assert.deepEqual(format.defaultValue, 'json');
});

test('supports a configured factory export name', async () => {
  const source = await fixtureModule('makeProgram');
  await assert.doesNotReject(
    adaptCommanderProgram({ protocolVersion: '0.1', source, options: { export: 'makeProgram' } }),
  );
});

test('loads a TypeScript program factory using Jiti', async () => {
  const source = await fixtureModule('createClistdProgram', '.ts');
  await assert.doesNotReject(adaptCommanderProgram({ protocolVersion: '0.1', source }));
});

test('warns when root command details cannot be represented', async () => {
  const source = await fixtureModule();
  const output = await adaptCommanderProgram({ protocolVersion: '0.1', source });

  assert.ok(
    output.diagnostics?.some((diagnostic) => diagnostic.code === 'commander/root-command-omitted'),
  );
});

test('rejects a module without the requested factory', async () => {
  const directory = await mkdtemp('/tmp/clistd-commander-adapter-invalid-test-');
  const source = join(directory, 'program.mjs');
  await writeFile(source, 'export const value = 1;\n');

  await assert.rejects(
    adaptCommanderProgram({ protocolVersion: '0.1', source }),
    /createClistdProgram/u,
  );
});

async function fixtureModule(
  exportName = 'createClistdProgram',
  extension = '.mjs',
): Promise<string> {
  const directory = await mkdtemp('/tmp/clistd-commander-adapter-test-');
  const source = join(directory, `program${extension}`);
  await writeFile(
    source,
    [
      ...(extension.endsWith('ts') ? ['interface CommandLike { name: () => string }'] : []),
      'const argument = {',
      "  name: () => 'name', description: 'Project name.', required: true, variadic: false, argChoices: undefined,",
      '};',
      'const format = {',
      "  attributeName: () => 'format', argChoices: ['json', 'text'], defaultValue: 'json', description: 'Output format.', flags: '-f, --format <format>', hidden: false, mandatory: false, optional: false, required: true, short: '-f', variadic: false,",
      '};',
      'const create = {',
      "  name: () => 'create', description: () => 'Create a project.', summary: () => 'Create.', aliases: () => [], commands: [], options: [format], registeredArguments: [argument],",
      '};',
      'const project = {',
      "  name: () => 'project', description: () => 'Manage projects.', summary: () => 'Projects.', aliases: () => ['p'], commands: [create], options: [], registeredArguments: [],",
      '};',
      'const rootFlag = {',
      "  attributeName: () => 'verbose', description: 'Verbose.', flags: '--verbose', hidden: false, mandatory: false, optional: false, required: false, short: undefined, variadic: false,",
      '};',
      `export function ${exportName}() {`,
      "  return { name: () => 'fixture', description: () => 'Fixture CLI.', summary: () => '', aliases: () => [], commands: [project], options: [rootFlag], registeredArguments: [] };",
      '}',
      '',
    ].join('\n'),
  );
  return source;
}
