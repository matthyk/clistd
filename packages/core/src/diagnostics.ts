import type { JsonPath } from './ast.js';

export type DiagnosticSeverity = 'warn' | 'error';

export interface DocumentDiagnostic {
  readonly code: string;
  readonly message: string;
  readonly severity: DiagnosticSeverity;
  readonly paths: readonly JsonPath[];
  /** Optional agent-facing guidance for resolving this diagnostic. */
  readonly prompt?: string;
}

export type BuildResult<T> =
  | {
      readonly ok: true;
      readonly ast: T;
      readonly diagnostics: readonly DocumentDiagnostic[];
    }
  | {
      readonly ok: false;
      readonly diagnostics: readonly DocumentDiagnostic[];
    };
