import assert from 'node:assert/strict';
import { test } from 'node:test';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  AdapterError,
  createAdapterRegistry,
  createProcessAdapter,
  runProcessAdapter,
  validateAdapterResult,
} from '@clistd/adapter';
import type { ClistdAdapter } from '@clistd/adapter';

const adapter: ClistdAdapter = {
  metadata: { id: 'example', description: 'Example adapter.', protocolVersion: '0.1' },
  async adapt() {
    return { document: {} };
  },
};
const fixtures = join(dirname(fileURLToPath(import.meta.url)), 'fixtures');
const processFixture = join(fixtures, 'process.mjs');
const request = { protocolVersion: '0.1' as const, source: 'fixture-source' };

test('registers adapters in order and rejects duplicate IDs', () => {
  const registry = createAdapterRegistry([adapter]);

  assert.equal(registry.get('example'), adapter);
  assert.deepEqual(registry.adapters, [adapter]);
  assert.throws(() => createAdapterRegistry([adapter, adapter]), /already registered/);
});

test('validates process adapter results without validating the document', async () => {
  assert.deepEqual(validateAdapterResult({ document: { arbitrary: true }, uri: 'urn:example' }), {
    document: { arbitrary: true },
    uri: 'urn:example',
  });
  assert.throws(() => validateAdapterResult({ uri: 'urn:example' }), /document/);
  await assert.rejects(
    createProcessAdapter(adapter.metadata, { command: '' }).adapt({
      protocolVersion: '0.1',
      source: 'example',
    }),
    (error: unknown) => isAdapterError(error, 'adapter/configuration'),
  );
  await assert.rejects(
    runProcessAdapter({ command: process.execPath, timeoutMs: 0 }, request),
    (error: unknown) => isAdapterError(error, 'adapter/configuration'),
  );
});

test('runs a process adapter and preserves successful warnings', async () => {
  const result = await runProcessAdapter(
    { command: process.execPath, args: [processFixture, 'success'] },
    request,
  );

  assert.deepEqual(result.document, { source: 'fixture-source' });
  assert.equal(result.diagnostics?.[0]?.code, 'fixture/warning');
});

test('terminates process adapters that time out or exceed stdout limits', async (t) => {
  await t.test('times out', async () => {
    await assert.rejects(
      runProcessAdapter(
        { command: process.execPath, args: [processFixture, 'timeout'], timeoutMs: 100 },
        request,
      ),
      (error: unknown) => isAdapterError(error, 'adapter/timeout'),
    );
  });
  await t.test('limits stdout', async () => {
    await assert.rejects(
      runProcessAdapter(
        { command: process.execPath, args: [processFixture, 'stdout-limit'], maxStdoutBytes: 32 },
        request,
      ),
      (error: unknown) => isAdapterError(error, 'adapter/output-limit'),
    );
  });
});

test('includes stderr and supplies the configured working directory', async () => {
  await assert.rejects(
    runProcessAdapter({ command: process.execPath, args: [processFixture, 'stderr'] }, request),
    (error: unknown) =>
      isAdapterError(error, 'adapter/exit') && error.message.includes('fixture process failure'),
  );
  const result = await runProcessAdapter(
    { command: process.execPath, args: [processFixture, 'cwd'], cwd: fixtures },
    request,
  );
  assert.deepEqual(result.document, { cwd: fixtures });
});

function isAdapterError(error: unknown, code: string): error is AdapterError {
  return error instanceof AdapterError && error.diagnostics[0]?.code === code;
}
