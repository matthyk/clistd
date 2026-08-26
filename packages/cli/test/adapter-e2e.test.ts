import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const fixtures = join(packageRoot, 'test', 'fixtures', 'adapters');
const execFileAsync = promisify(execFile);

interface LintReport {
  readonly diagnostics: readonly { readonly code: string }[];
  readonly errorCount: number;
  readonly warningCount: number;
}

test('lints minimal CLIs through each built-in adapter', async (t) => {
  await t.test('lints a Commander CLI', async () => {
    const report = await lintWithAdapter('commander', join(fixtures, 'commander', 'cli.mjs'));

    assert.equal(report.errorCount, 0);
    assert.equal(report.warningCount, 0);
  });

  await t.test('lints an Oclif CLI discovered from command source', async () => {
    const report = await lintWithAdapter('oclif', join(fixtures, 'oclif'));

    assert.equal(report.errorCount, 0);
    assert.equal(report.warningCount, 0);
    assert.deepEqual(report.diagnostics, []);
  });
});

test('reports invalid Oclif adapter documents as command errors', async () => {
  const source = await mkdtemp(join(tmpdir(), 'clistd-oclif-adapter-failure-'));
  try {
    await writeFile(join(source, 'package.json'), JSON.stringify({ name: 'fixture' }));

    await assert.rejects(
      () =>
        execFileAsync(process.execPath, [
          join(packageRoot, 'bin', 'run.js'),
          'lint',
          '--adapter',
          'oclif',
          '--source',
          source,
        ]),
      (error: unknown) => {
        const output = error as Error & { readonly stderr?: unknown; readonly stdout?: unknown };
        const stderr = typeof output.stderr === 'string' ? output.stderr : '';
        const stdout = typeof output.stdout === 'string' ? output.stdout : '';
        assert.equal(output.message.includes('Command failed'), true);
        assert.match(stdout, /must NOT have fewer than 1 items/u);
        assert.match(stdout, /schema\/minItems/u);
        assert.match(stdout, /1 problem \(1 error, 0 warnings\)/u);
        assert.doesNotMatch(`${stdout}${stderr}`, /adapter\/failed/u);
        return true;
      },
    );
  } finally {
    await rm(source, { force: true, recursive: true });
  }
});

async function lintWithAdapter(
  adapter: 'commander' | 'oclif',
  source: string,
): Promise<LintReport> {
  let stdout = '';
  try {
    ({ stdout } = await execFileAsync(process.execPath, [
      join(packageRoot, 'bin', 'run.js'),
      'lint',
      '--adapter',
      adapter,
      '--source',
      source,
      '--json',
    ]));
  } catch (error: unknown) {
    const output = (error as Error & { readonly stdout?: unknown }).stdout;
    if (typeof output !== 'string') throw error;
    stdout = output;
  }
  return JSON.parse(stdout) as LintReport;
}
