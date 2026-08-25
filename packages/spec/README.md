# `@clistd/spec`

The framework-neutral, versioned contract for describing a command-line
interface. It exports TypeScript types and the clistd v0.1 JSON Schema. Use
[`@clistd/core`](../core/README.md) to validate documents and create a
normalized AST.

```sh
npm install @clistd/spec
```

```ts
import { CLI_DOCUMENT_SCHEMA, SPEC_VERSION } from '@clistd/spec';
import type { CliDocument } from '@clistd/spec';

const document: CliDocument = {
  $id: 'https://example.com/acme-cli/0.1',
  specVersion: SPEC_VERSION,
  cli: { name: 'acme', commandSeparator: ' ', endOfOptions: true },
  commands: [{ id: 'greet', invocation: ['greet'] }],
};

console.log(CLI_DOCUMENT_SCHEMA.$id, document);
```

## Document model

Every document has an absolute `$id`, `specVersion: '0.1'`, `cli` metadata,
and at least one command. Command IDs are stable internal identifiers;
`invocation` is the user-facing path. A command alias is a complete alternative
path, not an alias for one path segment.

`cli.commandSeparator` controls whether command paths render with a space or
colon. Set `endOfOptions: true` when the CLI accepts `--` to stop option
parsing.

```yaml
$id: https://example.com/specs/acme-cli/0.1
specVersion: '0.1'
cli:
  name: acme
  commandSeparator: ':'
  endOfOptions: true
topics:
  - id: projects
    title: Projects
    description: Manage projects.
commands:
  - id: project.deploy
    invocation: [project, deploy]
    topics: [projects]
```

## Inputs and constraints

Commands contain ordered positional `arguments` and `flags`. Each has a stable,
command-local `id`; constraints refer to that ID rather than public spellings.
`valueSchema` uses JSON Schema Draft 2020-12. Static `default` values must
conform to the complete value schema.

Value flags have a canonical `long` spelling and may have `short`, `longAliases`,
or `shortAliases`. Boolean flags use `kind: boolean`; value flags use
`kind: value`. `multiple: true` means the normalized value is an array. A
variadic argument consumes the remaining positional tokens and must be last.

Command-level constraints evaluate explicitly supplied inputs:

| Constraint                     | Meaning                                                                |
| ------------------------------ | ---------------------------------------------------------------------- |
| `requires`                     | A supplied input requires all inputs in `allOf` and/or one in `anyOf`. |
| `atLeast`, `atMost`, `exactly` | Cardinality over the listed supplied inputs.                           |
| `allOrNone`                    | Either every listed input is supplied or none is supplied.             |

## Outputs and exit codes

An output contract documents stdout with `text`, `json`, `ndjson`, or `yaml`.
Structured output may include a JSON Schema. Conditions use final normalized
input values and can be equality checks composed with `allOf`, `anyOf`, and
`not`. A command has at most one unconditional output.

Exit codes are inline or reusable through `components.exitCodes`. Each command
lists every code it may return; numeric codes must be unique in that command.

## References and composition

Commands, topics, and exit codes may be inline or a reference object containing
only `$ref`. References resolve relative to the containing document’s `$id`;
they may use a JSON Pointer fragment. `components` holds reusable definitions.

There is no implicit merge, patch, or override behavior in v0.1. Resolution
failures, cycles, duplicate final IDs, and duplicate canonical or alias command
paths are errors.

## Scope of v0.1

The contract captures portable static behavior. It intentionally does not model
global flags, custom parsers, dynamic defaults, environment or configuration
fallback, short-flag clusters, executable examples, runtime output behavior,
or stderr contracts. Adapters should omit data that cannot be represented
accurately.

`@clistd/spec` defines types and schema only; it does not parse files, resolve
references, validate raw documents, or run lint rules.
