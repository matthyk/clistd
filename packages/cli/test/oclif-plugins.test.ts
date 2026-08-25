import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const execFileAsync = promisify(execFile);

test('loads the autocomplete and not-found plugins', async () => {
  const { stdout } = await execFileAsync(process.execPath, [
    join(packageRoot, 'bin', 'run.js'),
    'autocomplete',
    '--help',
  ]);

  assert.match(stdout, /Display autocomplete installation instructions\./u);

  await assert.rejects(
    () => execFileAsync(process.execPath, [join(packageRoot, 'bin', 'run.js'), 'lintt']),
    (error: unknown) => {
      const output = error as Error & { readonly stderr?: unknown };
      assert.equal((output as { readonly code?: unknown }).code, 127);
      assert.match(String(output.stderr), /lintt is not a clistd command\./u);
      return true;
    },
  );
});
