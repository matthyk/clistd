# `@clistd/clig-rules` Design Guide

## Package purpose

`@clistd/clig-rules` provides portable lint rules derived from the
[Command Line Interface Guidelines](https://clig.dev/). It depends only on the
public `@clistd/linter` API; do not import `@clistd/core`, CLI configuration,
or framework adapter APIs.

## Rules

Export each rule and the ordered `cligRules` collection from `src/index.ts`.
Rule IDs are stable and package-qualified with the `clig/` prefix. Keep rules
limited to information represented by the canonical clistd document.

The guide also covers runtime behavior and project policy, including TTY
handling, streams, color, prompts, progress, network behavior, signals,
configuration, distribution, and analytics. Do not create speculative rules
for behavior that a canonical document cannot observe.

Use `warn` as the default severity for document-observable recommendations.
When a rule requires runtime contracts that implementation-derived documents
cannot reliably provide, use `off` as its default severity so users may opt in
through configuration. Exit-code contract rules follow this policy.

Give every rule actionable agent-facing prompt text. Use typed visitors from
`@clistd/linter`; do not traverse or mutate the AST directly.

## Testing

Test through the public package export and public linter types. Cover the
ordered collection, default severities, and both reporting and compliant cases
for each rule. Do not add a direct `@clistd/core` dependency merely to build
fixtures.
