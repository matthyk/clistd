# `@clistd/spec` Design Guide

## Package purpose

`@clistd/spec` defines the public, framework-neutral contract for clistd CLI
documents. It exports TypeScript types and the clistd v0.1 JSON Schema Draft
2020-12 schema. It does **not** validate raw documents, resolve references, or
produce a normalized AST; those responsibilities belong to `@clistd/core`.

The specification is both:

- **Normative:** an implementation can be checked against its declared CLI
  contract.
- **Descriptive:** adapters can generate document fragments from an existing
  CLI implementation or related sources, such as an exit-code file.

## v0.1 document model

A document has a stable absolute `$id`, `specVersion: "0.1"`, CLI metadata,
optional topics and components, and one or more commands. Command paths are
arrays of segments; `cli.commandSeparator` controls whether they render with
`:` or a space.

```yaml
$id: https://example.com/specs/acme-cli/0.1
specVersion: '0.1'
cli:
  name: acme
  commandSeparator: ':'
  endOfOptions: true
commands:
  - id: project.deploy
    invocation: [project, deploy]
```

Command IDs are stable internal identifiers. They are distinct from a
user-facing invocation path, so a command can be renamed without changing its
identity. A command alias is also an array representing a complete alternative
path; it is not an alias for an arbitrary path segment.

## Topics

Use `topics` for documented navigation groups such as “Projects” or
“Authentication”. A topic has an ID, title, and optional description. Commands
refer to topic IDs through `topics`. Do not use `tags` in v0.1: tags imply a
looser, unstructured classification system and are deferred.

## Inputs

Flags and positional arguments share a normalized value contract:

- Every input has a stable command-local `id`.
- Constraints and output conditions refer to input IDs, never a public flag
  spelling.
- `valueSchema` is JSON Schema Draft 2020-12 and validates the normalized
  value.
- `default`, when present, is a static JSON value conforming to the complete
  `valueSchema`.

Arguments are ordered by their position in `arguments`. `name` is their
user-facing help placeholder. Arguments may also provide a summary,
description, and hidden-help marker. A normal argument consumes one token; a
`variadic: true` argument consumes zero or more remaining positional tokens
and must be last in v0.1. A variadic argument's normalized value is an array,
so its `valueSchema` must describe an array.

A value-taking flag has a canonical long spelling, optional canonical short
spelling, and optional long/short aliases. Flags may provide a summary,
description, hidden-help marker, and, for value-taking flags, a `valueName`
help placeholder. `multiple: true` means repeated occurrences append items
and the final `valueSchema` describes the resulting array. A `kind: boolean`
flag consumes no value and normalizes to a boolean.

`valueSchema` expresses value types and discrete options. For example, use an
`enum` in `valueSchema` instead of a separate options property. Parser
callbacks, dynamic defaults, environment-variable sources, stdin behavior,
and framework-specific value types are outside the v0.1 specification.

v0.1 does not define portable semantic parsers for paths, URLs, durations, or
IDs. It also defers environment-variable and configuration-file value sources.

## Constraints

Constraints are command-level and declarative. Their relationship semantics
evaluate whether an input was **explicitly supplied**, not whether it has an
effective default value.

v0.1 supports:

- `requires`: a supplied input requires every input in `allOf` and/or at least
  one input in `anyOf`.
- `atLeast`, `atMost`, and `exactly`: cardinality constraints over supplied
  inputs.
- `allOrNone`: either every listed input is supplied or none is supplied.

Conditional value-based constraints are deferred. Do not embed executable code
or framework-specific callbacks in a document.

## Outputs

An output contract documents stdout. It has an ID, an output `format`, optional
condition, and optional JSON Schema for structured data. The v0.1 formats are
`text`, `json`, `ndjson`, and `yaml`.

`schema` applies to `json`, `yaml`, and each `ndjson` record. `text` has no
structural schema in v0.1.

An output condition evaluates final normalized input values, including static
defaults. Conditions are recursive and support an equality leaf plus `allOf`,
`anyOf`, and `not`. A command may have at most one output without `when`; it
is the default output contract.

Stderr contracts, error payload schemas, and a full runtime outcome/state model
are deferred.

## Exit codes

Reusable CLI-wide exit codes live in `components.exitCodes`. A command lists
every exit code it may return, using a `$ref` to a reusable definition or an
inline command-specific definition. An exit code has a stable ID, a
non-negative integer code, and a description. Numerical codes must be unique
within a command’s effective exit-code list.

v0.1 documents exit codes but does not map specific runtime conditions or
output contracts to individual exit codes.

## References and composition

Composition follows the OpenAPI/JSON Schema reference style:

- `$id` is a required absolute URI. It can be an `https:`, `file:`, or `urn:`
  URI.
- `$ref` is a URI reference, optionally with a JSON Pointer fragment, resolved
  relative to the containing document’s `$id`.
- A reference object contains exactly `$ref`; it cannot have sibling fields
  that silently merge into the referenced value.
- Commands, topics, and exit codes can be inline or referenced. `components`
  contains reusable named definitions.
- Resolution failures, reference cycles, duplicate final IDs, and duplicate
  canonical or alias command paths are errors.

v0.1 intentionally has no deep merge, patch, or override semantics. Future
versions may add an explicit overlay mechanism rather than introducing implicit
merge behavior.

## Deliberately deferred from v0.1

- Short-flag clusters, negated boolean flags, and additional parser variations.
- Global/inherited flags and reusable input definitions.
- Executable examples and generated-source provenance.
- Alias deprecation metadata.
- Configuration/environment precedence.
- Tag-based classification.
- Conditional constraints based on values.

When extending this package, preserve these boundaries unless the specification
version is advanced deliberately.
