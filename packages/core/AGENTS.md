# `@clistd/core` Design Guide

## Package purpose

`@clistd/core` turns an unknown clistd document into a validated, resolved,
normalized AST. It is the boundary between the JSON-serializable contract in
`@clistd/spec` and the typed rule-facing model consumed by `@clistd/linter`.

Core owns:

- JSON Schema validation using the schema exported by `@clistd/spec`;
- `$ref` resolution and invalid-reference detection;
- normalized AST definitions and construction;
- document and command indexes;
- document diagnostics and JSONPath locations;
- semantic validation needed to make the AST safe for consumers.
- compatibility comparison of two validated, normalized CLI documents.

Core does not own CLI framework behavior, lint rules, CLI configuration, or
diagnostic presentation.

## Breaking-change comparison

`findBreakingChanges(base, head)` compares two `CliDocumentAst` values and
returns a `BreakingDiff`. It is deliberately downstream of `buildDocument()`:
callers must validate, dereference, and normalize each raw document before
comparison. Core never loads files, invokes adapters, resolves Git revisions,
or selects process exit codes.

Diff findings have stable category codes, a severity (`error`, `warn`, or
`info`), a human-readable message, and optional `basePath` and `headPath`
JSONPaths. Use `error` for confirmed compatibility breaks, `warn` when
compatibility cannot be proven (including JSON Schema changes), and `info` for
non-breaking additions or removals. Keep this policy focused on consumer
compatibility: removed command paths, required inputs, flag spellings, input
contracts, constraints, output contracts, exit-code mappings, and relevant CLI
metadata are breaking. Description and other help-only changes are not.

## Processing pipeline

The public processing model is:

```text
unknown input
  -> JSON Schema validation
  -> $ref resolution
  -> AST normalization
  -> semantic validation
  -> typed indexes
```

The input value is `unknown`. `DocumentInput` may additionally provide a URI
and a source map. The URI is a document identity used for resolving relative
references; it is not required to be a filesystem path. Generated documents
may use a synthetic URI or omit it.

Core does not parse JSON or YAML source files. Loaders are responsible for
parsing those files and may attach a `SourceMap` to `DocumentInput`. Core
locations remain logical JSONPaths so the same diagnostics work for files and
generated documents; consumers may resolve those paths through the source map
when a concrete file location is needed.

## Diagnostics

Core diagnostics use `DocumentDiagnostic`:

```ts
export interface DocumentDiagnostic {
  readonly code: string;
  readonly message: string;
  readonly severity: 'warn' | 'error';
  readonly paths: readonly JsonPath[];
  readonly prompt?: string;
}
```

`JsonPath` is a concrete path represented as an array of property names and
array indexes:

```ts
type JsonPath = readonly (string | number)[];
```

Do not use query expressions with wildcards or filters as diagnostic paths.
They may match multiple nodes and cannot be mapped reliably to source ranges.

Schema and reference diagnostics may not have AST nodes because they can be
reported before AST construction. Linter diagnostics are a separate concern:
rules operate on AST nodes and report those nodes rather than constructing
paths manually.

Diagnostics may include an optional `prompt` with agent-facing guidance
for resolving the finding. It complements the human-readable `message`; it is
not executable fix behavior.

`off` is a rule-configuration state, not an emitted core diagnostic severity.
Core diagnostics are emitted as `warn` or `error`.

## Build result and error policy

AST construction returns a discriminated `BuildResult`:

```ts
type BuildResult<T> =
  | {
      readonly ok: true;
      readonly ast: T;
      readonly diagnostics: readonly DocumentDiagnostic[];
    }
  | {
      readonly ok: false;
      readonly diagnostics: readonly DocumentDiagnostic[];
    };
```

Warnings may accompany a usable AST. Errors that prevent safe normalization
or resolution result in `ok: false`; callers must not receive a partially
usable public AST in that case.

## Reference resolution

Use `@apidevtools/json-schema-ref-parser` for JSON Reference and JSON Pointer
resolution. Core must:

- avoid mutating the caller's input;
- reject circular references;
- report unresolved references as document diagnostics;
- resolve references before exposing the AST;
- preserve `$ref` values inside `valueSchema` and output `schema`, because
  those are JSON Schema references rather than clistd composition references.

The public AST must not expose unresolved `ReferenceOr<T>` unions. Commands,
topics, and exit codes in the AST are resolved values.

## AST principles

The AST is rule-oriented rather than a copy of the specification types.
References disappear, optional collections normalize to empty arrays, and
each AST node carries its originating `path: JsonPath`.

Use discriminated unions for variant nodes, especially flags and conditions:

- boolean flags use `kind: 'boolean'`;
- value-taking flags use `kind: 'value'`;
- conditions use their structural `kind` values;
- constraints use `requires`, `count`, and `all-or-none` kinds.

Keep JSON Schema values as `JsonSchema` and static defaults as `JsonValue`.
Do not introduce executable parsers, framework-specific value classes, or
runtime environment/configuration behavior into the AST.

The AST currently normalizes these fields:

- command aliases, topics, arguments, flags, constraints, outputs, and exit
  codes to arrays;
- argument `variadic` and `hidden` to booleans;
- flag aliases, `required`, `multiple`, and `hidden` to normalized values;
- requires constraint `allOf` and `anyOf` to arrays.

## Semantic invariants

Core validates invariants that JSON Schema alone cannot express reliably:

- IDs are unique within their relevant scope;
- command invocations and aliases are unique;
- flag names and aliases do not collide within a command;
- topic references resolve;
- constraints refer to known command inputs;
- variadic argument schemas describe arrays;
- multiple value-flag schemas describe arrays;
- output contracts obey the text/schema rules;
- default output contracts are unique;
- exit-code IDs and numeric codes are unique within a command.

Add new semantic checks as stable diagnostic codes with precise JSONPaths.

## Indexes

Indexes are part of `CliDocumentAst`, not an optional optimization. They give
rules a type-safe way to inspect the document without repeatedly traversing
arrays or reconstructing relationships.

The command indexes provide typed maps for:

- commands by stable ID;
- commands by invocation path;
- all inputs by command ID;
- flags by command ID;
- arguments by command ID.

Topic IDs are indexed at document scope. Preserve concrete AST types in every
index; do not expose untyped `unknown` values or require rule authors to cast.

## Testing and verification

Tests belong in `packages/core/test/`. Test public behavior through the
package exports where possible. Cover:

- schema acceptance and rejection;
- JSONPath conversion in diagnostics;
- internal, unresolved, and circular references;
- AST normalization and node paths;
- semantic diagnostics;
- typed index contents;
- generated documents without a filesystem URI.

Run the package and repository checks with:

```sh
npx oxfmt . --check
npx oxlint . --deny-warnings --no-error-on-unmatched-pattern
npx tsc --build --pretty false
npx borp --pattern 'packages/*/test/**/*.{test,spec}.{ts,mts,js,mjs}'
```
