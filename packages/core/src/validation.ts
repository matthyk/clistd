import { Ajv2020 } from 'ajv/dist/2020.js';
import * as addFormatsModule from 'ajv-formats';
import type { ErrorObject, AnySchema } from 'ajv';
import { CLI_DOCUMENT_SCHEMA, type CliDocument } from '@clistd/spec';

import type { JsonPath } from './ast.js';
import type { DocumentDiagnostic } from './diagnostics.js';

type AddFormats = (ajv: InstanceType<typeof Ajv2020>) => InstanceType<typeof Ajv2020>;
const addFormats = (addFormatsModule as unknown as { readonly default: AddFormats }).default;
const validator = createValidator();

export interface ValidationResult {
  readonly valid: boolean;
  readonly document?: CliDocument;
  readonly diagnostics: readonly DocumentDiagnostic[];
}

export function validateDocument(input: unknown): ValidationResult {
  const valid = validator(input) === true;
  const diagnostics = valid ? [] : (validator.errors ?? []).map(createSchemaDiagnostic);

  return {
    valid,
    document: valid ? (input as CliDocument) : undefined,
    diagnostics,
  };
}

function createValidator() {
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  addFormats(ajv);
  return ajv.compile(CLI_DOCUMENT_SCHEMA as AnySchema);
}

function createSchemaDiagnostic(error: ErrorObject): DocumentDiagnostic {
  return {
    code: `schema/${error.keyword}`,
    message: error.message ?? 'Document does not conform to the schema.',
    severity: 'error',
    paths: [pointerToPath(error.instancePath)],
  };
}

function pointerToPath(pointer: string): JsonPath {
  if (pointer.length === 0) return [];

  return pointer
    .slice(1)
    .split('/')
    .map((segment) => {
      const decoded = segment.replaceAll('~1', '/').replaceAll('~0', '~');
      const index = Number(decoded);
      return Number.isInteger(index) && String(index) === decoded ? index : decoded;
    });
}
