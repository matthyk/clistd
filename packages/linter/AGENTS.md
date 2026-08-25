# `@clistd/linter` Design Guide

## Package purpose

`@clistd/linter` provides the public rule API, a central typed AST traverser,
rule registration, and rule execution. It consumes only the normalized
`CliDocumentAst` exported by `@clistd/core`.

This package does not parse or validate raw specification documents, load
configuration files, format diagnostics for terminals, implement oclif
commands, or ship recommended rules. Those concerns belong respectively to
`core`, `cli`, and dedicated rule packages such as
`@clistd/recommend-rules`.

## Rules and metadata

A rule is a `Rule` with stable metadata and a `create` method:

```ts
interface Rule {
  readonly meta: RuleMetadata;
  create(context: RuleContext): AstVisitor;
}
```

Rule IDs are stable, package-qualified strings, for example
`clistd/require-description`. They are emitted as diagnostic codes and must be
unique in a `RuleRegistry`. The registry preserves registration order.

Metadata contains a human-readable description, a default `warn` or `error`
severity, and an optional `prompt`. `prompt` is agent-facing guidance for
resolving a finding; it is not executable fix behavior.

Rules should be pure with respect to the document. They may close over their
`RuleContext`, but must not mutate the AST, its indexes, or the rule registry.

## Context and diagnostics

`RuleContext` provides the complete normalized AST, its typed
`DocumentIndexes`, the configured rule `options` value, and `report`.

Rules report a transient node-based `RuleReport`:

```ts
context.report({
  message: 'Commands need a description.',
  node: command,
  related: [relatedCommand],
});
```

The runner converts reports to `DocumentDiagnostic` from `@clistd/core`:

- `code` is the rule ID;
- `severity` is the enabled rule severity;
- `paths` contains the primary node path followed by related node paths;
- `prompt` is copied from rule metadata when defined.

Do not define another linter diagnostic type or construct JSONPaths in rules.
Core diagnostics without AST nodes may omit `prompt`.

## Central traversal

Rules create an `AstVisitor` with typed callbacks such as `onCommand`,
`onBooleanFlag`, and `onOutput`. `onCommandEnter` and `onCommandLeave` bracket
the traversal of a command's descendants.

`visitAst` accepts all enabled visitors. Before walking the AST, it indexes
callbacks by event. The AST is then walked once, in deterministic pre-order,
and each node dispatches only the callbacks registered for its event. Callback
order within an event follows registry order.

Traversal ownership remains in this package. Rules must not recursively walk
the AST themselves; use typed callbacks for local checks and typed indexes for
cross-document or cross-command checks.

## Configuration and execution

Rule configuration is either a severity or a `[severity, options]` tuple.
Allowed configuration severities are `off`, `warn`, and `error`.

- Omitted configuration uses the rule's default severity.
- `off` prevents creation of that rule's visitor and never becomes an emitted
  diagnostic severity.
- Unknown rule IDs and duplicate registry IDs are errors to prevent silent
  configuration mistakes.

`runRules` creates all enabled rule contexts and visitors, performs one shared
traversal, and returns core `DocumentDiagnostic` values. `runRule` is the
single-rule testing convenience API.

## Testing and build configuration

Test public behavior from `test/` using package-name imports. Tests should
build a fixture through `@clistd/core`, then test rules with `runRule` or a
small `RuleRegistry`. Cover typed callback dispatch, traversal event order,
configuration states, node-derived diagnostic paths, prompts, and index access.

`tsconfig.build.json` builds publishable source to `dist`. `tsconfig.json` is
the no-emit source-and-test type-check configuration and maps the package-name
self-import to `src/index.ts` so editor and standalone type-checking work
without generated output.

Run the repository checks from the root:

```sh
npx oxfmt . --check
npx oxlint . --deny-warnings --no-error-on-unmatched-pattern
npx tsc --build --pretty false
npx borp --pattern 'packages/*/test/**/*.{test,spec}.{ts,mts,js,mjs}'
```
