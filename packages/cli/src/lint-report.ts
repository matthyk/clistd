import type { DiagnosticJson } from './diagnostics.js';

/** The versioned wire contract emitted by `clistd lint --json` or `--format json=FILE`. */
export const LINT_REPORT_VERSION = '0.1' as const;

/** JSON Schema for consumers that persist or validate lint reports. */
export const LINT_REPORT_SCHEMA = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: 'https://clistd.dev/schema/lint-report/0.1/schema.json',
  type: 'object',
  additionalProperties: false,
  required: ['reportVersion', 'diagnostics', 'errorCount', 'warningCount'],
  properties: {
    reportVersion: { const: LINT_REPORT_VERSION },
    diagnostics: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['code', 'message', 'severity', 'paths'],
        properties: {
          code: { type: 'string', minLength: 1 },
          message: { type: 'string', minLength: 1 },
          severity: { enum: ['warn', 'error'] },
          paths: { type: 'array', items: { type: 'string' } },
          location: { type: 'string', minLength: 1 },
          adapterPrompt: { type: 'string', minLength: 1 },
          prompt: { type: 'string' },
          source: { type: 'string' },
        },
      },
    },
    errorCount: { type: 'integer', minimum: 0 },
    warningCount: { type: 'integer', minimum: 0 },
  },
} as const;

export interface LintReport {
  readonly reportVersion: typeof LINT_REPORT_VERSION;
  readonly diagnostics: readonly DiagnosticJson[];
  readonly errorCount: number;
  readonly warningCount: number;
}

export interface PromptFinding {
  readonly code: string;
  readonly message: string;
  readonly paths: readonly string[];
  readonly location?: string;
  readonly prompt: string;
  readonly source?: string;
}

export interface PromptReport {
  readonly reportVersion: typeof LINT_REPORT_VERSION;
  readonly prompts: readonly PromptFinding[];
}

export function parseLintReport(value: unknown): LintReport {
  if (
    !isRecord(value) ||
    value.reportVersion !== LINT_REPORT_VERSION ||
    !Array.isArray(value.diagnostics)
  ) {
    throw new Error('The report must be a clistd lint report with reportVersion "0.1".');
  }
  if (
    !isNonNegativeSafeInteger(value.errorCount) ||
    !isNonNegativeSafeInteger(value.warningCount)
  ) {
    throw new Error(
      'The report must contain non-negative integer errorCount and warningCount fields.',
    );
  }
  if (!value.diagnostics.every(isDiagnostic)) {
    throw new Error('The report contains an invalid diagnostic.');
  }
  return {
    reportVersion: LINT_REPORT_VERSION,
    diagnostics: value.diagnostics,
    errorCount: value.errorCount,
    warningCount: value.warningCount,
  };
}

export function createPromptReport(report: LintReport): PromptReport {
  return {
    reportVersion: LINT_REPORT_VERSION,
    prompts: report.diagnostics.flatMap((diagnostic) => {
      if (diagnostic.prompt === undefined) return [];
      return [
        {
          code: diagnostic.code,
          message: diagnostic.message,
          paths: diagnostic.paths,
          ...(diagnostic.location === undefined ? {} : { location: diagnostic.location }),
          prompt: diagnostic.prompt,
          ...(diagnostic.source === undefined ? {} : { source: diagnostic.source }),
        },
      ];
    }),
  };
}

export function formatPromptReport(report: LintReport): string {
  const findings = report.diagnostics.filter(
    (diagnostic) => diagnostic.prompt !== undefined || diagnostic.adapterPrompt !== undefined,
  );
  if (findings.length === 0) return '';
  return findings
    .map((diagnostic) => {
      const guidance = [diagnostic.prompt, diagnostic.adapterPrompt]
        .filter((prompt): prompt is string => prompt !== undefined)
        .join('\n\n');
      return `${diagnostic.location ?? 'document'}\n\n  ${guidance}`;
    })
    .join('\n\n');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isDiagnostic(value: unknown): value is DiagnosticJson {
  return (
    isRecord(value) &&
    typeof value.code === 'string' &&
    value.code.length > 0 &&
    typeof value.message === 'string' &&
    value.message.length > 0 &&
    (value.severity === 'warn' || value.severity === 'error') &&
    Array.isArray(value.paths) &&
    value.paths.every((path) => typeof path === 'string') &&
    (value.location === undefined || typeof value.location === 'string') &&
    (value.adapterPrompt === undefined || typeof value.adapterPrompt === 'string') &&
    (value.prompt === undefined || typeof value.prompt === 'string') &&
    (value.source === undefined || typeof value.source === 'string')
  );
}

function isNonNegativeSafeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}
