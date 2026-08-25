import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { test } from 'node:test';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import { AdapterError, runProcessAdapter } from '@clistd/adapter';
import type { ClistdAdapter } from '@clistd/adapter';
import {
  LINT_REPORT_SCHEMA,
  LINT_REPORT_VERSION,
  formatLintDiagnostics,
  loadAdapterDocument,
  loadConfiguration,
  loadDocument,
  parseLintReport,
} from '@clistd/cli';
import { buildDocument } from '@clistd/core';
import { createRuleRegistry, runRules } from '@clistd/linter';

const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const fixtures = join(packageRoot, 'test', 'fixtures');
const execFileAsync = promisify(execFile);

test('loads documents, configuration, adapters, and the oclif command', async (t) => {
  await t.test('exports a versioned public lint report contract', () => {
    assert.equal(LINT_REPORT_VERSION, '0.1');
    assert.equal(LINT_REPORT_SCHEMA.properties.reportVersion.const, LINT_REPORT_VERSION);
    assert.throws(
      () =>
        parseLintReport({
          reportVersion: '0.1',
          diagnostics: [],
          errorCount: -1,
          warningCount: 0,
        }),
      /non-negative integer/u,
    );
  });

  await t.test('defines a file-backed configuration schema with built-in rules', async () => {
    const schema = JSON.parse(
      await readFile(join(packageRoot, 'configuration.schema.json'), 'utf8'),
    ) as {
      readonly $defs: Record<string, { readonly properties?: Record<string, unknown> }>;
      readonly properties: {
        readonly rules: { readonly properties: Record<string, { readonly default: string }> };
      };
    };

    assert.equal(
      schema.properties.rules.properties['clistd/require-command-description']?.default,
      'warn',
    );
    assert.equal(
      schema.properties.rules.properties['clig/require-failure-exit-code']?.default,
      'off',
    );
    assert.ok(schema.$defs.maxCommandsPerTopicRuleSetting);
    assert.deepEqual(schema.$defs.adapter?.properties?.command, { type: 'string', minLength: 1 });
  });

  await t.test('loads YAML documents with a stable file URI', async () => {
    const loaded = await loadDocument(join(fixtures, 'valid.yaml'));

    assert.deepEqual(loaded.diagnostics, []);
    assert.match(loaded.input.uri ?? '', /^file:/u);
    assert.deepEqual(loaded.input.sourceMap?.locate(['cli', 'name']), {
      uri: loaded.input.uri,
      start: { line: 4, column: 9, offset: 73 },
      end: { line: 4, column: 16, offset: 80 },
    });
    const result = await buildDocument(loaded.input);
    assert.equal(result.ok, true);
  });

  await t.test('maps JSON document paths to one-based source positions', async () => {
    const loaded = await loadDocument(join(fixtures, 'invalid.json'));

    assert.deepEqual(loaded.diagnostics, []);
    assert.deepEqual(loaded.input.sourceMap?.locate(['commands', 0, 'id']), {
      uri: loaded.input.uri,
      start: { line: 5, column: 24, offset: 176 },
      end: { line: 5, column: 26, offset: 178 },
    });
  });

  await t.test('discovers configuration beside a document and rejects unknown rules', async () => {
    const directory = await mkdtemp('/tmp/clistd-cli-test-');
    const document = join(directory, 'document.json');
    await writeFile(document, '{}');
    await writeFile(join(directory, 'clistd.yaml'), 'rules:\n  example/missing: error\n');

    const configuration = await loadConfiguration(createRuleRegistry([]), directory);

    assert.equal(configuration.diagnostics[0]?.code, 'configuration/invalid');
    assert.deepEqual(configuration.diagnostics[0]?.paths, [['rules', 'example/missing']]);
  });

  await t.test('accepts a local schema reference in JSON configuration', async () => {
    const directory = await mkdtemp('/tmp/clistd-cli-schema-config-test-');
    await writeFile(
      join(directory, 'clistd.json'),
      JSON.stringify({
        $schema: './node_modules/@clistd/cli/configuration.schema.json',
      }),
    );

    const configuration = await loadConfiguration(createRuleRegistry([]), directory);

    assert.deepEqual(configuration.diagnostics, []);
  });

  await t.test(
    'loads configuration-relative custom rule modules before validating rules',
    async () => {
      const directory = await mkdtemp('/tmp/clistd-cli-custom-rules-test-');
      await writeFile(
        join(directory, 'custom-rules.mjs'),
        [
          'export const rules = [{',
          "  meta: { id: 'example/custom', description: 'Example rule.', defaultSeverity: 'warn' },",
          '  create(context) {',
          '    return { onCommand(command) { context.report({ message: "Custom finding.", node: command }); } };',
          '  },',
          '}];',
          '',
        ].join('\n'),
      );
      await writeFile(
        join(directory, 'clistd.yaml'),
        ['ruleModules:', '  - ./custom-rules.mjs', 'rules:', '  example/custom: error', ''].join(
          '\n',
        ),
      );

      const configuration = await loadConfiguration(createRuleRegistry([]), directory);
      const document = await loadDocument(join(fixtures, 'valid.yaml'));
      const result = await buildDocument(document.input);

      assert.deepEqual(configuration.diagnostics, []);
      assert.equal(configuration.registry?.get('example/custom')?.meta.id, 'example/custom');
      assert.equal(result.ok, true);
      if (result.ok && configuration.registry !== undefined) {
        assert.deepEqual(
          runRules(result.ast, configuration.registry, configuration.configuration),
          [
            {
              code: 'example/custom',
              message: 'Custom finding.',
              severity: 'error',
              paths: [['commands', 0]],
            },
          ],
        );
      }

      const { stdout } = await execFileAsync(process.execPath, [
        join(packageRoot, 'bin', 'run.js'),
        'lint',
        '--file',
        join(fixtures, 'valid.yaml'),
        '--rule-module',
        join(directory, 'custom-rules.mjs'),
        '--json',
      ]);
      const report = JSON.parse(stdout) as { diagnostics: Array<{ code: string }> };
      assert.ok(report.diagnostics.some((diagnostic) => diagnostic.code === 'example/custom'));
    },
  );

  await t.test(
    'runs recommended rules and allows their configuration to disable them',
    async () => {
      const directory = await mkdtemp('/tmp/clistd-cli-recommended-rules-test-');
      const document = join(directory, 'document.json');
      await writeFile(
        document,
        JSON.stringify({
          $id: 'https://example.com/recommended-rules/0.1',
          specVersion: '0.1',
          cli: {
            name: 'fixture',
            description: 'A fixture CLI.',
            commandSeparator: ':',
            endOfOptions: true,
          },
          commands: [
            {
              id: 'hello',
              invocation: ['hello'],
              flags: [
                {
                  id: 'json',
                  long: 'json',
                  description: 'Produce JSON output.',
                  kind: 'boolean',
                  valueSchema: { type: 'boolean' },
                },
              ],
              exitCodes: [{ id: 'success', code: 0, description: 'The command succeeded.' }],
            },
          ],
        }),
      );

      const { stdout: warningOutput } = await execFileAsync(process.execPath, [
        join(packageRoot, 'bin', 'run.js'),
        'lint',
        '--file',
        document,
        '--json',
      ]);
      const warningReport = JSON.parse(warningOutput) as {
        diagnostics: Array<{ code: string; location?: string }>;
        warningCount: number;
      };
      assert.equal(warningReport.warningCount, 1);
      assert.equal(warningReport.diagnostics[0]?.code, 'clistd/require-command-description');
      assert.equal(warningReport.diagnostics[0]?.location, 'fixture:hello');

      await writeFile(
        join(directory, 'clistd.yaml'),
        'rules:\n  clistd/require-command-description: off\n',
      );
      const { stdout: disabledOutput } = await execFileAsync(process.execPath, [
        join(packageRoot, 'bin', 'run.js'),
        'lint',
        '--file',
        document,
        '--json',
      ]);
      const disabledReport = JSON.parse(disabledOutput) as { warningCount: number };
      assert.equal(disabledReport.warningCount, 0);
    },
  );

  await t.test('reports breaking differences between two canonical documents', async () => {
    const directory = await mkdtemp('/tmp/clistd-cli-diff-test-');
    const base = join(directory, 'base.json');
    const head = join(directory, 'head.json');
    await writeFile(
      base,
      JSON.stringify({
        $id: 'https://example.com/diff/base',
        specVersion: '0.1',
        cli: { name: 'fixture', commandSeparator: ':', endOfOptions: true },
        commands: [
          {
            id: 'hello',
            invocation: ['hello'],
            flags: [{ id: 'format', long: 'format', valueSchema: { type: 'string' } }],
          },
        ],
      }),
    );
    await writeFile(
      head,
      JSON.stringify({
        $id: 'https://example.com/diff/head',
        specVersion: '0.1',
        cli: { name: 'fixture', commandSeparator: ':', endOfOptions: true },
        commands: [{ id: 'hello', invocation: ['hello'] }],
      }),
    );
    let stdout = '';
    try {
      ({ stdout } = await execFileAsync(process.execPath, [
        join(packageRoot, 'bin', 'run.js'),
        'diff',
        'breaking',
        '--base',
        base,
        '--head',
        head,
        '--json',
      ]));
    } catch (error: unknown) {
      const output = (error as Error & { readonly stdout?: unknown }).stdout;
      if (typeof output !== 'string') throw error;
      stdout = output;
    }
    const report = JSON.parse(stdout) as {
      breakingChangeCount: number;
      breakingChanges: Array<{ code: string }>;
    };
    assert.equal(report.breakingChangeCount, 1);
    assert.equal(report.breakingChanges[0]?.code, 'diff/flag-removed');

    let humanOutput = '';
    try {
      ({ stdout: humanOutput } = await execFileAsync(process.execPath, [
        join(packageRoot, 'bin', 'run.js'),
        'diff',
        'breaking',
        '--base',
        base,
        '--head',
        head,
      ]));
    } catch (error: unknown) {
      const output = (error as Error & { readonly stdout?: unknown }).stdout;
      if (typeof output !== 'string') throw error;
      humanOutput = output;
    }
    assert.match(humanOutput, /^  ✖ error   flag --format in fixture:hello$/mu);
    assert.match(humanOutput, /diff\/flag-removed: Flag "--format" was removed\./u);
    assert.match(humanOutput, /^1 changes \(1 errors, 0 warnings, 0 info\)$/mu);

    await writeFile(
      head,
      JSON.stringify({
        $id: 'https://example.com/diff/head',
        specVersion: '0.1',
        cli: { name: 'fixture', commandSeparator: ':', endOfOptions: true },
        commands: [
          {
            id: 'hello',
            invocation: ['hello'],
            flags: [{ id: 'format', long: 'format', valueSchema: { type: 'number' } }],
          },
        ],
      }),
    );
    const { stdout: warningOutput } = await execFileAsync(process.execPath, [
      join(packageRoot, 'bin', 'run.js'),
      'diff',
      'breaking',
      '--base',
      base,
      '--head',
      head,
      '--json',
    ]);
    const warningReport = JSON.parse(warningOutput) as {
      breakingChangeCount: number;
      changes: Array<{ severity: string }>;
    };
    assert.equal(warningReport.breakingChangeCount, 0);
    assert.equal(warningReport.changes[0]?.severity, 'warn');
    await assert.rejects(
      execFileAsync(process.execPath, [
        join(packageRoot, 'bin', 'run.js'),
        'diff',
        'breaking',
        '--base',
        base,
        '--head',
        head,
        '--fail-on',
        'warn',
        '--json',
      ]),
      (error: unknown) => (error as { readonly code?: unknown }).code === 1,
    );
  });

  await t.test('generates a Markdown changelog between two canonical documents', async () => {
    const directory = await mkdtemp('/tmp/clistd-cli-changelog-test-');
    const base = join(directory, 'base.json');
    const head = join(directory, 'head.json');
    await writeFile(
      base,
      JSON.stringify({
        $id: 'https://example.com/changelog/base',
        specVersion: '0.1',
        cli: { name: 'fixture', commandSeparator: ':', endOfOptions: true },
        commands: [
          {
            id: 'hello',
            invocation: ['hello'],
            flags: [{ id: 'format', long: 'format', valueSchema: { type: 'string' } }],
          },
        ],
      }),
    );
    await writeFile(
      head,
      JSON.stringify({
        $id: 'https://example.com/changelog/head',
        specVersion: '0.1',
        cli: { name: 'fixture', commandSeparator: ':', endOfOptions: true },
        commands: [
          { id: 'hello', invocation: ['hello'] },
          { id: 'goodbye', invocation: ['goodbye'] },
        ],
      }),
    );

    const { stdout } = await execFileAsync(process.execPath, [
      join(packageRoot, 'bin', 'run.js'),
      'diff',
      'changelog',
      '--base',
      base,
      '--head',
      head,
    ]);

    assert.equal(
      stdout,
      [
        '# Changelog',
        '',
        '## Breaking changes',
        '',
        '- Flag "--format" was removed.',
        '',
        '## Added',
        '',
        '- Command "goodbye" was added.',
        '',
      ].join('\n'),
    );
  });

  await t.test('renders human diagnostics by CLI command without JSONPaths', async () => {
    const { stdout } = await execFileAsync(process.execPath, [
      join(packageRoot, 'bin', 'run.js'),
      'lint',
      '--file',
      join(fixtures, 'valid.yaml'),
    ]);

    assert.equal(
      stdout,
      [
        '$ fixture:hello',
        '',
        '  ⚠ warning  Commands need a description.',
        '             clistd/require-command-description',
        '',
        '',
        '1 problem (0 errors, 1 warning)',
        '',
      ].join('\n'),
    );
    assert.doesNotMatch(stdout, /\$\.commands/u);
  });

  await t.test('identifies affected command elements in human diagnostics', async () => {
    const build = await buildDocument({
      value: {
        $id: 'https://example.com/element-labels/0.1',
        specVersion: '0.1',
        cli: { name: 'fixture', commandSeparator: ':', endOfOptions: true },
        commands: [
          {
            id: 'deploy',
            invocation: ['deploy'],
            aliases: [{ path: ['ship'] }],
            arguments: [
              { id: 'file', name: 'FILE', required: true, valueSchema: { type: 'string' } },
            ],
            flags: [{ id: 'format', long: 'format', valueSchema: { type: 'string' } }],
            constraints: [{ type: 'atLeast', inputs: ['file'], count: 1 }],
            outputs: [{ id: 'json', format: 'json' }],
            exitCodes: [{ id: 'failure', code: 1, description: 'Failure.' }],
          },
        ],
      },
    });
    assert.equal(build.ok, true);
    if (!build.ok) return;
    const command = build.ast.commands[0];
    assert.ok(command);
    const formatted = formatLintDiagnostics(
      [
        {
          kind: 'document',
          diagnostics: [
            {
              code: 'example/argument',
              message: 'Example finding.',
              severity: 'warn',
              paths: [command.arguments[0]?.path ?? []],
            },
            {
              code: 'example/flag',
              message: 'Example finding.',
              severity: 'warn',
              paths: [command.flags[0]?.path ?? []],
            },
            {
              code: 'example/alias',
              message: 'Example finding.',
              severity: 'warn',
              paths: [command.aliases[0]?.path ?? []],
            },
            {
              code: 'example/constraint',
              message: 'Example finding.',
              severity: 'warn',
              paths: [command.constraints[0]?.path ?? []],
            },
            {
              code: 'example/output',
              message: 'Example finding.',
              severity: 'warn',
              paths: [command.outputs[0]?.path ?? []],
            },
            {
              code: 'example/exit-code',
              message: 'Example finding.',
              severity: 'warn',
              paths: [command.exitCodes[0]?.path ?? []],
            },
          ],
        },
      ],
      build.ast,
    );

    assert.match(formatted, /argument <FILE>: Example finding\./u);
    assert.match(formatted, /flag --format: Example finding\./u);
    assert.match(formatted, /alias ship: Example finding\./u);
    assert.match(formatted, /constraint atLeast: Example finding\./u);
    assert.match(formatted, /output json: Example finding\./u);
    assert.match(formatted, /exit code failure: Example finding\./u);
  });

  await t.test('preserves structured adapter failures for the calling command', async () => {
    const failingAdapter: ClistdAdapter = {
      metadata: { id: 'failing', description: 'Fails for testing.', protocolVersion: '0.1' },
      async adapt() {
        throw new AdapterError([
          {
            code: 'fixture/failed',
            message: 'Fixture adaptation failed.',
            severity: 'error',
            prompt: 'Fix the fixture.',
          },
        ]);
      },
    };
    await assert.rejects(
      () => loadAdapterDocument(failingAdapter, 'fixture'),
      (error: unknown) =>
        error instanceof AdapterError && error.diagnostics[0]?.code === 'fixture/failed',
    );
  });

  await t.test(
    'runs a JSON-over-stdio adapter and still validates its canonical output through core',
    async () => {
      const output = await runProcessAdapter(
        { command: process.execPath, args: [join(fixtures, 'adapter.mjs')] },
        { protocolVersion: '0.1', source: 'adapter-fixture' },
      );
      const result = await buildDocument({ value: output.document, uri: output.uri });

      assert.equal(result.ok, true);
      if (!result.ok) return;
      assert.equal(result.ast.cli.name, 'adapter-fixture');
    },
  );

  await t.test('runs a configured adapter through lint flags', async () => {
    const directory = await mkdtemp('/tmp/clistd-cli-adapter-test-');
    const configurationPath = join(directory, 'clistd.yaml');
    await writeFile(
      configurationPath,
      [
        'adapters:',
        '  fixture:',
        `    command: ${JSON.stringify(process.execPath)}`,
        `    args: [${JSON.stringify(join(fixtures, 'adapter.mjs'))}]`,
        '',
      ].join('\n'),
    );

    const { stdout } = await execFileAsync(process.execPath, [
      join(packageRoot, 'bin', 'run.js'),
      'lint',
      '--adapter',
      'fixture',
      '--source',
      'adapter-fixture',
      '--config',
      configurationPath,
      '--json',
    ]);
    const report = JSON.parse(stdout) as { errorCount: number; warningCount: number };

    assert.equal(report.errorCount, 0);
    assert.equal(report.warningCount, 0);
  });

  await t.test('rejects configuration attempting to override a built-in adapter', async () => {
    const directory = await mkdtemp('/tmp/clistd-cli-adapter-override-test-');
    const configurationPath = join(directory, 'clistd.yaml');
    await writeFile(
      configurationPath,
      ['adapters:', '  oclif:', '    command: ignored', ''].join('\n'),
    );
    const configuration = await loadConfiguration(
      createRuleRegistry([]),
      directory,
      configurationPath,
      {
        reservedAdapterIds: ['oclif'],
      },
    );

    assert.equal(configuration.diagnostics[0]?.code, 'configuration/invalid');
    assert.match(configuration.diagnostics[0]?.message ?? '', /reserved by a built-in/u);
  });

  await t.test('rejects duplicate adapter IDs in descriptor configuration', async () => {
    const directory = await mkdtemp('/tmp/clistd-cli-adapter-duplicate-test-');
    const configurationPath = join(directory, 'clistd.yaml');
    await writeFile(
      configurationPath,
      [
        'adapters:',
        '  - id: fixture',
        '    command: node',
        '  - id: fixture',
        '    command: node',
        '',
      ].join('\n'),
    );
    const configuration = await loadConfiguration(
      createRuleRegistry([]),
      directory,
      configurationPath,
    );

    assert.match(configuration.diagnostics[0]?.message ?? '', /declared more than once/u);
  });

  await t.test('resolves configured adapter paths and forwards JSON options', async () => {
    const directory = await mkdtemp('/tmp/clistd-cli-adapter-paths-test-');
    const configurationPath = join(directory, 'clistd.yaml');
    await writeFile(
      configurationPath,
      [
        'adapters:',
        '  fixture:',
        '    command: ./bin/adapter',
        '    args: [./adapter.mjs, --verbose]',
        '    cwd: ./working',
        '    options:',
        '      includeHidden: true',
        '',
      ].join('\n'),
    );
    const configuration = await loadConfiguration(
      createRuleRegistry([]),
      directory,
      configurationPath,
    );
    const adapter = configuration.adapters[0];

    assert.equal(adapter?.command, join(directory, 'bin', 'adapter'));
    assert.deepEqual(adapter?.args, [join(directory, 'adapter.mjs'), '--verbose']);
    assert.equal(adapter?.cwd, join(directory, 'working'));
    assert.deepEqual(adapter?.options, { includeHidden: true });

    let receivedOptions: unknown;
    const configuredAdapter: ClistdAdapter = {
      metadata: { id: 'fixture', description: 'Fixture adapter.', protocolVersion: '0.1' },
      async adapt(request) {
        receivedOptions = request.options;
        return {
          document: {
            $id: 'https://example.com/fixture/0.1',
            specVersion: '0.1',
            cli: { name: 'fixture', commandSeparator: ':', endOfOptions: true },
            commands: [{ id: 'hello', invocation: ['hello'] }],
          },
        };
      },
    };
    await loadAdapterDocument(configuredAdapter, 'fixture', adapter?.options);
    assert.deepEqual(receivedOptions, { includeHidden: true });
  });

  await t.test(
    'defaults configured adapter working directories to the configuration directory',
    async () => {
      const directory = await mkdtemp('/tmp/clistd-cli-adapter-cwd-test-');
      const configurationPath = join(directory, 'clistd.yaml');
      await writeFile(
        configurationPath,
        ['adapters:', '  fixture:', '    command: node', ''].join('\n'),
      );

      const configuration = await loadConfiguration(
        createRuleRegistry([]),
        directory,
        configurationPath,
      );

      assert.equal(configuration.adapters[0]?.cwd, directory);
    },
  );

  await t.test('rejects unsupported configured adapter properties', async () => {
    const directory = await mkdtemp('/tmp/clistd-cli-adapter-property-test-');
    const configurationPath = join(directory, 'clistd.yaml');
    await writeFile(
      configurationPath,
      ['adapters:', '  fixture:', '    command: node', '    workingDir: ./project', ''].join('\n'),
    );

    const configuration = await loadConfiguration(
      createRuleRegistry([]),
      directory,
      configurationPath,
    );

    assert.deepEqual(configuration.diagnostics[0]?.paths, [['adapters', 'fixture', 'workingDir']]);
  });

  await t.test('renders rule guidance with the prompt formatter', async () => {
    const directory = await mkdtemp('/tmp/clistd-cli-prompt-output-test-');
    const promptPath = join(directory, 'lint-prompts.txt');
    await execFileAsync(process.execPath, [
      join(packageRoot, 'bin', 'run.js'),
      'lint',
      '--file',
      join(fixtures, 'valid.yaml'),
      '--format',
      `prompt=${promptPath}`,
    ]);

    assert.match(
      await readFile(promptPath, 'utf8'),
      /^fixture:hello\n\n  Add a concise description/u,
    );
  });

  await t.test('writes repeated report formats and permits JSON stdout', async () => {
    const directory = await mkdtemp('/tmp/clistd-cli-report-output-test-');
    const reportPath = join(directory, 'lint-report.json');
    const promptPath = join(directory, 'lint-prompts.txt');
    const { stdout } = await execFileAsync(process.execPath, [
      join(packageRoot, 'bin', 'run.js'),
      'lint',
      '--file',
      join(fixtures, 'valid.yaml'),
      '--format',
      `json=${reportPath}`,
      '--format',
      `prompt=${promptPath}`,
      '--json',
    ]);

    assert.equal(
      (JSON.parse(stdout) as { reportVersion: string }).reportVersion,
      LINT_REPORT_VERSION,
    );
    const report = JSON.parse(await readFile(reportPath, 'utf8')) as {
      reportVersion: string;
      warningCount: number;
    };
    assert.equal(report.reportVersion, LINT_REPORT_VERSION);
    assert.equal(report.warningCount, 1);
    assert.match(
      await readFile(promptPath, 'utf8'),
      /^fixture:hello\n\n  Add a concise description/u,
    );
  });

  await t.test('rejects invalid or duplicate report output descriptors', async () => {
    await assert.rejects(
      execFileAsync(process.execPath, [
        join(packageRoot, 'bin', 'run.js'),
        'lint',
        '--file',
        join(fixtures, 'valid.yaml'),
        '--format',
        'json',
      ]),
      (error: unknown) => (error as { readonly code?: unknown }).code === 2,
    );

    await assert.rejects(
      execFileAsync(process.execPath, [
        join(packageRoot, 'bin', 'run.js'),
        'lint',
        '--file',
        join(fixtures, 'valid.yaml'),
        '--format',
        'json=first.json',
        '--format',
        'json=second.json',
      ]),
      (error: unknown) => (error as { readonly code?: unknown }).code === 2,
    );
  });

  await t.test(
    'enforces mutually exclusive lint input modes through oclif constraints',
    async () => {
      await assert.rejects(
        execFileAsync(process.execPath, [
          join(packageRoot, 'bin', 'run.js'),
          'lint',
          '--file',
          join(fixtures, 'valid.yaml'),
          '--adapter',
          'fixture',
          '--source',
          'adapter-fixture',
        ]),
        (error: unknown) => (error as { readonly code?: unknown }).code === 2,
      );
    },
  );

  await t.test(
    'returns an error exit and machine-readable schema diagnostic for invalid documents',
    async () => {
      let stdout: string;
      try {
        ({ stdout } = await execFileAsync(process.execPath, [
          join(fixtures, 'oclif-runner.mjs'),
          packageRoot,
          join(fixtures, 'invalid.json'),
        ]));
      } catch (error: unknown) {
        const output = (error as Error & { readonly stdout?: unknown }).stdout;
        if (typeof output !== 'string') throw error;
        stdout = output;
      }
      const result = JSON.parse(stdout) as { exitCode: number; stdout: string };

      const output = JSON.parse(result.stdout) as {
        diagnostics: Array<{ code: string; paths: string[] }>;
      };
      assert.equal(output.diagnostics[0]?.code, 'schema/type');
      assert.deepEqual(output.diagnostics[0]?.paths, ['$.commands[0].id']);

      await assert.rejects(
        execFileAsync(process.execPath, [
          join(packageRoot, 'bin', 'run.js'),
          'lint',
          '--file',
          join(fixtures, 'invalid.json'),
          '--json',
        ]),
        (error: unknown) => (error as { readonly code?: unknown }).code === 1,
      );
    },
  );
});
