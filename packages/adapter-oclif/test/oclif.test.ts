import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { test } from 'node:test';
import { join } from 'node:path';

import { adaptOclifProject } from '@clistd/adapter-oclif';
import { buildDocument } from '@clistd/core';

test('creates a core-valid clistd document from an Oclif project root', async () => {
  const root = await mkdtemp('/tmp/clistd-oclif-adapter-test-');
  await writeFile(
    join(root, 'package.json'),
    JSON.stringify({
      dependencies: { '@oclif/core': '^4.5.3' },
      name: 'fixture-cli',
      version: '1.0.0',
      type: 'module',
      oclif: { bin: 'fixture', commands: './dist/commands' },
    }),
  );
  await writeFile(
    join(root, 'oclif.manifest.json'),
    JSON.stringify({
      version: '1.0.0',
      commands: {
        hello: {
          id: 'hello',
          aliases: ['hi'],
          args: {
            target: {
              name: 'target',
              description: 'Target to greet.',
              options: ['world', 'team'],
            },
          },
          flags: {
            force: { name: 'force', type: 'boolean', allowNo: false },
            format: {
              name: 'format',
              type: 'option',
              helpValue: 'FORMAT',
              options: ['json', 'text'],
            },
          },
          hidden: false,
          hiddenAliases: [],
          relativePath: ['dist', 'commands', 'hello.js'],
        },
      },
    }),
  );

  const output = await adaptOclifProject({ protocolVersion: '0.1', source: root });
  const result = await buildDocument({ value: output.document, uri: output.uri });

  assert.match(output.uri ?? '', /^urn:clistd:adapter:oclif:/u);
  assert.ok(result.ok, JSON.stringify(result.diagnostics));
  if (!result.ok) return;
  assert.equal(result.ast.cli.name, 'fixture');
  assert.equal(result.ast.commands.length, 1);
  assert.deepEqual(result.ast.commands[0]?.aliases[0]?.segments, ['hi']);
  assert.equal(result.ast.commands[0]?.flags[0]?.id, 'force');
  const formatFlag = result.ast.commands[0]?.flags[1];
  assert.ok(formatFlag !== undefined && formatFlag.kind === 'value');
  assert.deepEqual(formatFlag.valueSchema, { enum: ['json', 'text'] });
  assert.deepEqual(result.ast.commands[0]?.arguments[0]?.valueSchema, {
    enum: ['world', 'team'],
  });
});

test('rejects a project that explicitly declares Oclif v3', async () => {
  const root = await mkdtemp('/tmp/clistd-oclif-adapter-version-test-');
  await writeFile(
    join(root, 'package.json'),
    JSON.stringify({
      dependencies: { '@oclif/core': '^3.26.0' },
      name: 'fixture-cli',
      version: '1.0.0',
      oclif: { bin: 'fixture', commands: './dist/commands' },
    }),
  );
  await writeFile(
    join(root, 'oclif.manifest.json'),
    JSON.stringify({ version: '1.0.0', commands: {} }),
  );

  await assert.rejects(
    adaptOclifProject({ protocolVersion: '0.1', source: root }),
    /supports @oclif\/core v4/u,
  );
});

test('accepts an Oclif v4 declaration from devDependencies', async () => {
  const root = await mkdtemp('/tmp/clistd-oclif-adapter-dev-version-test-');
  await writeFile(
    join(root, 'package.json'),
    JSON.stringify({
      devDependencies: { '@oclif/core': '~4.5.3' },
      name: 'fixture-cli',
      version: '1.0.0',
      oclif: { bin: 'fixture', commands: './dist/commands' },
    }),
  );
  await writeFile(
    join(root, 'oclif.manifest.json'),
    JSON.stringify({ version: '1.0.0', commands: {} }),
  );

  await assert.doesNotReject(adaptOclifProject({ protocolVersion: '0.1', source: root }));
});

test('accepts a project without a direct Oclif declaration', async () => {
  const root = await mkdtemp('/tmp/clistd-oclif-adapter-transitive-version-test-');
  await writeFile(
    join(root, 'package.json'),
    JSON.stringify({
      name: 'fixture-cli',
      version: '1.0.0',
      oclif: { bin: 'fixture', commands: './dist/commands' },
    }),
  );
  await writeFile(
    join(root, 'oclif.manifest.json'),
    JSON.stringify({ version: '1.0.0', commands: {} }),
  );

  await assert.doesNotReject(adaptOclifProject({ protocolVersion: '0.1', source: root }));
});

test('discovers TypeScript source commands when the output directory is absent', async () => {
  const root = await mkdtemp('/tmp/clistd-oclif-adapter-source-discovery-test-');
  const coreModule = import.meta.resolve('@oclif/core');
  await mkdir(join(root, 'src/commands'), { recursive: true });
  await writeFile(
    join(root, 'package.json'),
    JSON.stringify({
      name: 'fixture-cli',
      version: '1.0.0',
      oclif: { bin: 'fixture', commands: './dist/commands' },
    }),
  );
  await writeFile(
    join(root, 'tsconfig.json'),
    JSON.stringify({ compilerOptions: { outDir: 'dist', rootDir: 'src' } }),
  );
  await writeFile(
    join(root, 'src/commands/hello.ts'),
    [
      `import { Command } from '${coreModule}';`,
      'export default class Hello extends Command {',
      "  static id = 'hello';",
      '  async run() {}',
      '}',
    ].join('\n'),
  );

  const output = await adaptOclifProject({ protocolVersion: '0.1', source: root });
  const result = await buildDocument({ value: output.document, uri: output.uri });

  assert.ok(result.ok, JSON.stringify(result.diagnostics));
  if (!result.ok) return;
  assert.equal(result.ast.commands[0]?.id, 'hello');
});

test('extracts static value flag help placeholders during normal command discovery', async () => {
  const root = await mkdtemp('/tmp/clistd-oclif-adapter-discovery-test-');
  await writeFile(
    join(root, 'package.json'),
    JSON.stringify({
      dependencies: { '@oclif/core': '^4.5.3' },
      name: 'fixture-cli',
      version: '1.0.0',
      type: 'module',
      oclif: { bin: 'fixture', commands: './dist/commands' },
    }),
  );
  const coreModule = import.meta.resolve('@oclif/core');
  await mkdir(join(root, 'dist/commands'), { recursive: true });
  await writeFile(
    join(root, 'dist/commands/hello.js'),
    [
      `import { Command, Flags } from '${coreModule}';`,
      'export default class Hello extends Command {',
      "  static id = 'hello';",
      "  static flags = { format: Flags.string({ helpValue: 'FORMAT', options: ['json', 'text'] }) };",
      '  async run() {}',
      '}',
    ].join('\n'),
  );

  const output = await adaptOclifProject({ protocolVersion: '0.1', source: root });
  const result = await buildDocument({ value: output.document, uri: output.uri });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  const formatFlag = result.ast.commands[0]?.flags[0];
  assert.ok(formatFlag !== undefined && formatFlag.kind === 'value');
  assert.equal(formatFlag.valueName, 'FORMAT');
  assert.deepEqual(formatFlag.valueSchema, { enum: ['json', 'text'] });
});
