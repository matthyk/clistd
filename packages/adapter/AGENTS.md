# `@clistd/adapter` Design Guide

## Package purpose

`@clistd/adapter` defines the framework- and language-neutral adapter contract
used to generate canonical clistd documents. It owns adapter metadata,
registration, and the JSON-over-stdio process protocol.

It does not parse framework implementations, validate clistd documents, create
ASTs, run lint rules, load CLI configuration, or format diagnostics. Adapters
return unvalidated `unknown` documents; `@clistd/core` remains the mandatory
validation and normalization boundary.

## Public contract

An adapter has stable metadata and accepts a versioned request with a source.
Its result contains a canonical document and an optional document URI. The
source is the implementation being inspected; the URI identifies the generated
clistd document. A `file:` URI identifies a physical document and a `urn:` URI
is appropriate for generated documents.

`AdapterDiagnostic` is the public, framework-neutral finding shape. It uses
`warn` or `error` severity and can carry an optional agent-facing `prompt`.
Successful `AdapterResult` values may carry warnings only. Any failure throws
`AdapterError`, whose diagnostics are errors; this makes failure distinct from
a document produced with warnings. The CLI maps adapter diagnostics to root
`DocumentDiagnostic` locations. Adapter diagnostics must never claim JSONPath
locations or replace core's validation diagnostics.

Both in-process adapters and external processes use the same request/result
shapes. The external protocol writes exactly one JSON request to stdin and
reads exactly one JSON result from stdout. Stderr is for non-protocol output.
Process adapters default to a 30-second timeout, 1 MiB stdout limit, and 64 KiB
captured stderr limit. `timeoutMs`, `maxStdoutBytes`, `maxStderrBytes`, and
`cwd` are configurable. Timeout and output-limit failures terminate the child
process; stderr is included (or marked truncated) in process failure messages.

## Dependency boundary

This package must not depend on `@clistd/core`, `@clistd/linter`, or
`@clistd/cli`. Framework adapters depend on this package. The CLI composes a
registry of built-in and configured external adapters, then passes every result
to core.

## Testing

Test registry uniqueness and ordering, process protocol success/failure, and
response validation through public exports. Do not test framework extraction in
this package; that belongs in the owning framework adapter package.
