# `@clistd/core`

Validate unknown clistd documents, resolve references, normalize them into a
typed AST, and compare two validated CLI contracts for breaking changes.

```sh
npm install @clistd/core
```

```ts
import { buildDocument, findBreakingChanges } from '@clistd/core';

const base = await buildDocument({ value: baseDocument, uri: 'file:///base.yaml' });
const head = await buildDocument({ value: headDocument, uri: 'file:///head.yaml' });

if (base.ok && head.ok) {
  const diff = findBreakingChanges(base.ast, head.ast);
  console.log(diff.breakingChanges);
}
```

## Build a document

`buildDocument(input)` is the boundary between untrusted canonical data and a
safe `CliDocumentAst`. It validates the v0.1 schema, resolves references,
normalizes optional collections, creates indexes, and checks semantic
invariants. It returns `{ ok: true, ast, diagnostics }` or
`{ ok: false, diagnostics }`; warnings may accompany a usable AST.

Pass `uri` whenever relative references are possible. It is the document’s
physical identity and determines the base for relative composition references.
Adapters normally use a generated `urn:` URI; file loaders should use a
`file:` URI.

Use `validateDocument(value)` when schema validation alone is needed. It does
not resolve references or normalize an AST.

## Compare releases

`findBreakingChanges(base, head)` compares two `CliDocumentAst` values and
returns all `changes` plus the compatibility-breaking subset,
`breakingChanges`. Changes carry `error`, `warn`, or `info` severity and stable
paths into the base and/or head document.

The comparison tracks the public surface represented by v0.1, including
commands and accepted paths, arguments, flags and spellings, constraints,
outputs, exit codes, and value schemas. Use the CLI’s
[`diff breaking`](../cli/README.md#compare-compatibility) command for file
loading, adapter execution, reports, and CI exit policy.

## Boundaries

Core does not parse JSON or YAML files, invoke adapters, run lint rules, load
CLI configuration, or render diagnostics. Pair it with `@clistd/linter` for
rules or `@clistd/cli` for end-user workflows.
