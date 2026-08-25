# `@clistd/adapter`

The framework-neutral contract for adapters that generate canonical clistd
documents. It provides in-process adapter types, a registry, and a versioned
JSON-over-stdio protocol for external adapters.

```sh
npm install @clistd/adapter
```

## In-process adapters

An adapter accepts a versioned request with a framework-specific `source` and
returns an unvalidated document. Register it by stable ID:

```ts
import { createAdapterRegistry } from '@clistd/adapter';
import type { ClistdAdapter } from '@clistd/adapter';

const adapter: ClistdAdapter = {
  metadata: {
    id: 'example',
    description: 'Generate a document from an example project.',
    protocolVersion: '0.1',
  },
  async adapt({ source }) {
    return {
      document: {/* canonical document */},
      uri: `urn:example:${encodeURIComponent(source)}`,
    };
  },
};

const adapters = createAdapterRegistry([adapter]);
```

An `AdapterResult` may include non-fatal `AdapterDiagnostic` warnings. Failures
throw `AdapterError` with error diagnostics. The adapter package deliberately
does not validate documents: always pass `result.document` to
[`@clistd/core`](../core/README.md) before consuming it.

`uri` identifies the generated document, not the inspected source. Use a
physical `file:` URI for file-backed output or a stable generated `urn:` URI.

## Process adapters

External adapters receive exactly one JSON `AdapterRequest` on standard input
and write exactly one JSON `AdapterResult` to standard output. Reserve standard
error for logs and non-protocol output. Both sides use protocol version `0.1`.

```json
{ "protocolVersion": "0.1", "source": "./project", "options": { "includeHidden": false } }
```

```json
{
  "document": {
    "$id": "urn:example:project",
    "specVersion": "0.1",
    "cli": { "name": "example", "commandSeparator": " ", "endOfOptions": true },
    "commands": [{ "id": "hello", "invocation": ["hello"] }]
  },
  "uri": "urn:example:project"
}
```

Use `createProcessAdapter()` with a `ProcessAdapterConfiguration`, or configure
the adapter in `@clistd/cli`. Process adapters default to a 30-second timeout,
1 MiB stdout limit, and 64 KiB captured stderr limit. `timeoutMs`,
`maxStdoutBytes`, `maxStderrBytes`, and `cwd` are configurable.

An adapter may also implement `prompt(request)` to add framework-specific,
agent-facing guidance to completed lint findings. Prompt enrichment is optional
and callers must be able to ignore failures.

## Boundaries

This package owns only adapter metadata, registration, and the process protocol.
It does not validate documents, build ASTs, run rules, load CLI configuration,
or extract any framework’s metadata. See the built-in
[Oclif](../adapter-oclif/README.md) and
[Commander](../adapter-commander/README.md) adapters for implementations.
