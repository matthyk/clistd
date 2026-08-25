export const DIFF_REPORT_VERSION = '0.1' as const;

export interface DiffReport {
  readonly base: { readonly source: string };
  readonly breakingChangeCount: number;
  readonly breakingChanges: readonly DiffBreakingChange[];
  readonly changeCount: number;
  readonly changes: readonly DiffBreakingChange[];
  readonly diagnostics: readonly DiffInputDiagnostic[];
  readonly head: { readonly source: string };
  readonly reportVersion: typeof DIFF_REPORT_VERSION;
}

export interface DiffBreakingChange {
  readonly basePath?: string;
  readonly code: string;
  readonly headPath?: string;
  readonly message: string;
  readonly severity: 'error' | 'info' | 'warn';
}

export interface DiffInputDiagnostic {
  readonly code: string;
  readonly message: string;
  readonly paths: readonly string[];
  readonly severity: 'warn' | 'error';
  readonly side: 'base' | 'configuration' | 'head';
}
