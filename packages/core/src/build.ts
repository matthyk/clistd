import $RefParser from '@apidevtools/json-schema-ref-parser';

import type { CliDocumentAst } from './ast.js';
import type { BuildResult, DocumentDiagnostic } from './diagnostics.js';
import type { DocumentInput } from './input.js';
import { normalizeDocument } from './normalize.js';
import { validateDocument } from './validation.js';

export async function buildDocument(input: DocumentInput): Promise<BuildResult<CliDocumentAst>> {
  const validation = validateDocument(input.value);
  if (!validation.valid || validation.document === undefined) {
    return { ok: false, diagnostics: validation.diagnostics };
  }

  let resolved: unknown;
  try {
    resolved = await dereferenceDocument(validation.document, input.uri);
  } catch (error: unknown) {
    return {
      ok: false,
      diagnostics: [createReferenceDiagnostic(error)],
    };
  }

  const normalized = normalizeDocument(resolved as typeof validation.document);
  if (normalized.diagnostics.some((diagnostic) => diagnostic.severity === 'error')) {
    return { ok: false, diagnostics: normalized.diagnostics };
  }

  return {
    ok: true,
    ast: normalized.ast,
    diagnostics: normalized.diagnostics,
  };
}

async function dereferenceDocument(document: object, uri: string | undefined): Promise<unknown> {
  const parser = new $RefParser();
  const options = {
    mutateInputSchema: false,
    dereference: {
      circular: false,
      excludedPathMatcher: (path: string) =>
        path.includes('/valueSchema') || path.includes('/schema'),
    },
  };

  // DocumentInput.uri is the document's identity, not display-only metadata.
  // It takes precedence over the canonical document's logical $id so a file
  // can be moved without changing the base for its relative composition refs.
  // The copy also preserves the caller's input without mutation.
  const referenceRoot = uri === undefined ? document : { ...document, $id: uri };
  return uri === undefined
    ? parser.dereference(document, options)
    : parser.dereference(uri, referenceRoot, options);
}

function createReferenceDiagnostic(error: unknown): DocumentDiagnostic {
  const message = error instanceof Error ? error.message : 'A reference could not be resolved.';
  return {
    code: 'reference/unresolved',
    message,
    severity: 'error',
    paths: [[]],
  };
}
