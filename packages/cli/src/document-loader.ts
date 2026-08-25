import { readFile } from 'node:fs/promises';
import { extname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { load as loadYaml } from 'js-yaml';

import type { DocumentDiagnostic, DocumentInput } from '@clistd/core';

import type { AdapterDiagnostic, ClistdAdapter } from '@clistd/adapter';

import { createJsonSourceMap, createYamlSourceMap } from './source-map.js';

export interface LoadedDocument {
  readonly input: DocumentInput;
  readonly diagnostics: readonly DocumentDiagnostic[];
}

export async function loadDocument(filePath: string): Promise<LoadedDocument> {
  const absolutePath = resolve(filePath);
  const uri = pathToFileURL(absolutePath).href;
  const extension = extname(absolutePath).toLowerCase();

  if (!['.json', '.yaml', '.yml'].includes(extension)) {
    return {
      input: { uri, value: undefined },
      diagnostics: [
        diagnostic(
          'document/unsupported-format',
          `Unsupported document extension "${extension || '(none)'}".`,
        ),
      ],
    };
  }

  let source: string;
  try {
    source = await readFile(absolutePath, 'utf8');
  } catch (error: unknown) {
    return {
      input: { uri, value: undefined },
      diagnostics: [
        diagnostic('document/read', errorMessage(error, `Could not read ${absolutePath}.`)),
      ],
    };
  }

  try {
    const value = extension === '.json' ? JSON.parse(source) : loadYaml(source);
    const sourceMap =
      extension === '.json' ? createJsonSourceMap(source, uri) : createYamlSourceMap(source, uri);
    return { input: { uri, value, sourceMap }, diagnostics: [] };
  } catch (error: unknown) {
    return {
      input: { uri, value: undefined },
      diagnostics: [
        diagnostic('document/parse', errorMessage(error, 'Could not parse the document.')),
      ],
    };
  }
}

export async function loadAdapterDocument(
  adapter: ClistdAdapter,
  source: string,
  options?: unknown,
): Promise<LoadedDocument> {
  const output = await adapter.adapt({
    protocolVersion: '0.1',
    source,
    ...(options === undefined ? {} : { options }),
  });
  return {
    input: { value: output.document, ...(output.uri === undefined ? {} : { uri: output.uri }) },
    diagnostics: output.diagnostics?.map(toDocumentDiagnostic) ?? [],
  };
}

function toDocumentDiagnostic(adapterDiagnostic: AdapterDiagnostic): DocumentDiagnostic {
  return {
    code: adapterDiagnostic.code,
    message: adapterDiagnostic.message,
    severity: adapterDiagnostic.severity,
    paths: [[]],
    ...(adapterDiagnostic.prompt === undefined ? {} : { prompt: adapterDiagnostic.prompt }),
  };
}

function diagnostic(code: string, message: string): DocumentDiagnostic {
  return { code, message, severity: 'error', paths: [[]] };
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}
