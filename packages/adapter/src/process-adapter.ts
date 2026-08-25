import { spawn } from 'node:child_process';

import type {
  AdapterDiagnostic,
  AdapterMetadata,
  AdapterPromptRequest,
  AdapterPromptResult,
  AdapterRequest,
  AdapterResult,
  ClistdAdapter,
} from './types.js';

export const DEFAULT_PROCESS_ADAPTER_TIMEOUT_MS = 30_000;
export const DEFAULT_PROCESS_ADAPTER_MAX_STDOUT_BYTES = 1_048_576;
export const DEFAULT_PROCESS_ADAPTER_MAX_STDERR_BYTES = 65_536;

export interface ProcessAdapterConfiguration {
  readonly command: string;
  readonly args?: readonly string[];
  readonly cwd?: string;
  readonly timeoutMs?: number;
  readonly maxStdoutBytes?: number;
  readonly maxStderrBytes?: number;
  /** Whether this external adapter implements the optional prompt operation. */
  readonly prompt?: boolean;
}

export class AdapterError extends Error {
  public readonly diagnostics: readonly AdapterDiagnostic[];

  public constructor(diagnostics: readonly AdapterDiagnostic[]) {
    super(diagnostics[0]?.message ?? 'The adapter failed.');
    this.name = 'AdapterError';
    this.diagnostics = diagnostics;
  }
}

/** @deprecated Use AdapterError. */
export class ProcessAdapterError extends AdapterError {
  public constructor(message: string) {
    super([{ code: 'adapter/process', message, severity: 'error' }]);
    this.name = 'ProcessAdapterError';
  }
}

export function createProcessAdapter(
  metadata: AdapterMetadata,
  configuration: ProcessAdapterConfiguration,
): ClistdAdapter {
  return {
    metadata,
    adapt: (request: AdapterRequest) => runProcessAdapter(configuration, request),
    ...(configuration.prompt === true
      ? {
          prompt: (request: AdapterPromptRequest) =>
            runProcessAdapterPrompt(configuration, request),
        }
      : {}),
  };
}

export async function runProcessAdapterPrompt(
  adapter: ProcessAdapterConfiguration,
  request: AdapterPromptRequest,
): Promise<AdapterPromptResult> {
  const configuration = validateProcessAdapterConfiguration(adapter);
  const { stdout, stderr } = await runProcess(
    configuration,
    JSON.stringify({ ...request, operation: 'prompt' }),
  );
  let response: unknown;
  try {
    response = JSON.parse(stdout);
  } catch (error: unknown) {
    throw failure(
      'adapter/response-json',
      `Adapter returned invalid JSON: ${error instanceof Error ? error.message : 'unknown error'}.${formatStderr(stderr)}`,
    );
  }
  if (!isRecord(response) || !Array.isArray(response.prompts)) {
    throw failure(
      'adapter/response-invalid',
      'Adapter prompt response must contain a "prompts" array.',
    );
  }
  if (
    !response.prompts.every(
      (prompt) =>
        isRecord(prompt) &&
        Number.isSafeInteger(prompt.diagnosticIndex) &&
        (prompt.diagnosticIndex as number) >= 0 &&
        typeof prompt.prompt === 'string' &&
        prompt.prompt.length > 0,
    )
  ) {
    throw failure(
      'adapter/response-invalid',
      'Adapter prompt response contains an invalid prompt.',
    );
  }
  return { prompts: response.prompts as AdapterPromptResult['prompts'] };
}

export async function runProcessAdapter(
  adapter: ProcessAdapterConfiguration,
  request: AdapterRequest,
): Promise<AdapterResult> {
  const configuration = validateProcessAdapterConfiguration(adapter);
  const { stdout, stderr } = await runProcess(configuration, JSON.stringify(request));
  let response: unknown;
  try {
    response = JSON.parse(stdout);
  } catch (error: unknown) {
    throw failure(
      'adapter/response-json',
      `Adapter returned invalid JSON: ${error instanceof Error ? error.message : 'unknown error'}.${formatStderr(stderr)}`,
    );
  }
  return validateAdapterResult(response);
}

export function validateAdapterResult(value: unknown): AdapterResult {
  if (!isRecord(value) || !Object.hasOwn(value, 'document')) {
    throw failure(
      'adapter/response-invalid',
      'Adapter response must be an object with a "document" property.',
    );
  }
  if (value.uri !== undefined && typeof value.uri !== 'string') {
    throw failure(
      'adapter/response-invalid',
      'Adapter response "uri" must be a string when provided.',
    );
  }
  const diagnostics = validateAdapterDiagnostics(value.diagnostics);
  if (diagnostics.some((diagnostic) => diagnostic.severity === 'error')) {
    throw failure(
      'adapter/response-invalid',
      'A successful adapter response may contain warnings but not error diagnostics.',
    );
  }
  return {
    document: value.document,
    ...(typeof value.uri === 'string' ? { uri: value.uri } : {}),
    ...(diagnostics.length === 0 ? {} : { diagnostics }),
  };
}

function validateProcessAdapterConfiguration(
  configuration: ProcessAdapterConfiguration,
): Required<
  Pick<ProcessAdapterConfiguration, 'args' | 'maxStderrBytes' | 'maxStdoutBytes' | 'timeoutMs'>
> &
  Pick<ProcessAdapterConfiguration, 'command' | 'cwd'> {
  if (typeof configuration.command !== 'string' || configuration.command.trim().length === 0) {
    throw failure('adapter/configuration', 'Adapter "command" must be a non-empty string.');
  }
  if (
    configuration.args !== undefined &&
    (!Array.isArray(configuration.args) ||
      configuration.args.some((argument) => typeof argument !== 'string'))
  ) {
    throw failure('adapter/configuration', 'Adapter "args" must contain only strings.');
  }
  if (
    configuration.cwd !== undefined &&
    (typeof configuration.cwd !== 'string' || configuration.cwd.length === 0)
  ) {
    throw failure(
      'adapter/configuration',
      'Adapter "cwd" must be a non-empty string when provided.',
    );
  }
  for (const [name, value] of [
    ['timeoutMs', configuration.timeoutMs ?? DEFAULT_PROCESS_ADAPTER_TIMEOUT_MS],
    ['maxStdoutBytes', configuration.maxStdoutBytes ?? DEFAULT_PROCESS_ADAPTER_MAX_STDOUT_BYTES],
    ['maxStderrBytes', configuration.maxStderrBytes ?? DEFAULT_PROCESS_ADAPTER_MAX_STDERR_BYTES],
  ] as const) {
    if (!Number.isSafeInteger(value) || value <= 0) {
      throw failure('adapter/configuration', `Adapter "${name}" must be a positive safe integer.`);
    }
  }
  return {
    command: configuration.command,
    args: configuration.args ?? [],
    ...(configuration.cwd === undefined ? {} : { cwd: configuration.cwd }),
    timeoutMs: configuration.timeoutMs ?? DEFAULT_PROCESS_ADAPTER_TIMEOUT_MS,
    maxStdoutBytes: configuration.maxStdoutBytes ?? DEFAULT_PROCESS_ADAPTER_MAX_STDOUT_BYTES,
    maxStderrBytes: configuration.maxStderrBytes ?? DEFAULT_PROCESS_ADAPTER_MAX_STDERR_BYTES,
  };
}

function runProcess(
  adapter: Required<
    Pick<ProcessAdapterConfiguration, 'args' | 'maxStderrBytes' | 'maxStdoutBytes' | 'timeoutMs'>
  > &
    Pick<ProcessAdapterConfiguration, 'command' | 'cwd'>,
  input: string,
): Promise<{ readonly stderr: string; readonly stdout: string }> {
  return new Promise((resolve, reject) => {
    let child;
    try {
      child = spawn(adapter.command, adapter.args, {
        ...(adapter.cwd === undefined ? {} : { cwd: adapter.cwd }),
        stdio: ['pipe', 'pipe', 'pipe'],
      });
    } catch (error: unknown) {
      reject(failure('adapter/spawn', errorMessage(error, 'Could not start adapter process.')));
      return;
    }
    let stdout = '';
    let stderr = '';
    let settled = false;
    let termination: 'output-limit' | 'timeout' | undefined;
    let stderrTruncated = false;
    const terminate = (reason: 'output-limit' | 'timeout'): void => {
      if (termination !== undefined) return;
      termination = reason;
      child.kill('SIGTERM');
      setTimeout(() => child.kill('SIGKILL'), 1_000).unref();
    };
    const timeout = setTimeout(() => terminate('timeout'), adapter.timeoutMs);
    const finish = (callback: () => void): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      callback();
    };
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => {
      stdout += chunk;
      if (Buffer.byteLength(stdout) > adapter.maxStdoutBytes) terminate('output-limit');
    });
    child.stderr.on('data', (chunk: string) => {
      if (Buffer.byteLength(stderr) >= adapter.maxStderrBytes) {
        stderrTruncated = true;
        return;
      }
      const remaining = adapter.maxStderrBytes - Buffer.byteLength(stderr);
      const bytes = Buffer.from(chunk);
      stderr += bytes.subarray(0, remaining).toString('utf8');
      stderrTruncated ||= bytes.length > remaining;
    });
    child.on('error', (error: Error) =>
      finish(() =>
        reject(
          failure('adapter/spawn', `${error.message}.${formatStderr(stderr, stderrTruncated)}`),
        ),
      ),
    );
    child.on('close', (code: number | null) =>
      finish(() => {
        if (termination === 'timeout') {
          reject(
            failure(
              'adapter/timeout',
              `Adapter exceeded its ${adapter.timeoutMs} ms timeout.${formatStderr(stderr, stderrTruncated)}`,
            ),
          );
        } else if (termination === 'output-limit') {
          reject(
            failure(
              'adapter/output-limit',
              `Adapter exceeded its ${adapter.maxStdoutBytes} byte stdout limit.${formatStderr(stderr, stderrTruncated)}`,
            ),
          );
        } else if (code === 0) {
          resolve({ stdout, stderr });
        } else {
          reject(
            failure(
              'adapter/exit',
              `Adapter exited with code ${code ?? 'unknown'}.${formatStderr(stderr, stderrTruncated)}`,
            ),
          );
        }
      }),
    );
    child.stdin.end(input);
  });
}

function validateAdapterDiagnostics(value: unknown): readonly AdapterDiagnostic[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || !value.every(isAdapterDiagnostic)) {
    throw failure(
      'adapter/response-invalid',
      'Adapter response "diagnostics" must be an array of adapter diagnostics.',
    );
  }
  return value;
}

function isAdapterDiagnostic(value: unknown): value is AdapterDiagnostic {
  return (
    isRecord(value) &&
    typeof value.code === 'string' &&
    value.code.length > 0 &&
    typeof value.message === 'string' &&
    value.message.length > 0 &&
    (value.severity === 'warn' || value.severity === 'error') &&
    (value.prompt === undefined || typeof value.prompt === 'string')
  );
}

function failure(code: string, message: string): AdapterError {
  return new AdapterError([{ code, message, severity: 'error' }]);
}

function formatStderr(stderr: string, truncated = false): string {
  const output = stderr.trim();
  if (output.length === 0) return truncated ? ' Stderr was truncated.' : '';
  return ` Stderr: ${output}${truncated ? ' (truncated)' : ''}`;
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
