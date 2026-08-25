export interface AdapterMetadata {
  readonly id: string;
  readonly description: string;
  readonly protocolVersion: '0.1';
}

export interface AdapterRequest {
  readonly protocolVersion: '0.1';
  /** Framework-specific source, such as an Oclif project root. */
  readonly source: string;
  readonly options?: unknown;
}

/** A completed lint finding supplied to an optional adapter prompt capability. */
export interface AdapterPromptDiagnostic {
  readonly code: string;
  readonly location?: string;
  readonly message: string;
  readonly prompt?: string;
  readonly severity: 'warn' | 'error';
}

export interface AdapterPromptRequest {
  readonly protocolVersion: '0.1';
  readonly source: string;
  readonly options?: unknown;
  readonly diagnostics: readonly AdapterPromptDiagnostic[];
}

/** Framework-specific additions keyed by the diagnostic's index in the request. */
export interface AdapterPromptResult {
  readonly prompts: readonly {
    readonly diagnosticIndex: number;
    readonly prompt: string;
  }[];
}

export interface AdapterResult {
  /** An unvalidated canonical clistd document that must be passed to core. */
  readonly document: unknown;
  /** Identity of the generated document, normally a file: URI or generated urn:. */
  readonly uri?: string;
  /** Non-fatal findings produced while adapting. */
  readonly diagnostics?: readonly AdapterDiagnostic[];
}

/** A framework-neutral adapter finding. Locations belong to core, not adapters. */
export interface AdapterDiagnostic {
  readonly code: string;
  readonly message: string;
  readonly severity: 'warn' | 'error';
  /** Optional agent-facing guidance for resolving this finding. */
  readonly prompt?: string;
}

export interface ClistdAdapter {
  readonly metadata: AdapterMetadata;
  adapt(request: AdapterRequest): Promise<AdapterResult>;
  /** Optional framework-specific prompt enrichment. Failures must be safely ignorable by callers. */
  prompt?(request: AdapterPromptRequest): Promise<AdapterPromptResult>;
}
