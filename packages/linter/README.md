# `@clistd/linter`

The public API for defining, registering, and running clistd lint rules over a
normalized `CliDocumentAst`.

```sh
npm install @clistd/linter
```

```ts
import { createRuleRegistry, runRules } from '@clistd/linter';
import { recommendedRules } from '@clistd/recommend-rules';

const registry = createRuleRegistry(recommendedRules);
const diagnostics = runRules(ast, registry, {
  'clistd/require-command-description': 'error',
});
```

Build `ast` first with [`@clistd/core`](../core/README.md). The runner returns
core `DocumentDiagnostic` values with stable rule IDs and source paths.

## Write a rule

A rule has metadata and a `create()` function that returns typed visitor
callbacks. Report the AST node that caused the finding; the runner derives its
location and path.

```ts
import type { Rule } from '@clistd/linter';

export const requireCommandOwner: Rule = {
  meta: {
    id: 'acme/require-command-owner',
    description: 'Require an owner for each command.',
    defaultSeverity: 'warn',
  },
  create(context) {
    return {
      onCommand(command) {
        if (!command.description?.includes('Owner:')) {
          context.report({ message: 'Add command ownership.', node: command });
        }
      },
    };
  },
};
```

`meta` may include actionable `prompt` text and a JSON Schema
`optionsSchema`. Rules receive configured options through `context.options`.

## Configure and run rules

Each rule uses its metadata default unless configured as `off`, `warn`,
`error`, or `[severity, options]`. `off` prevents the rule visitor from being
created. `createRuleRegistry()` preserves supplied order and rejects duplicate
rule IDs, avoiding silent configuration mistakes.

`runRules(ast, registry, configuration)` creates enabled rules and performs a
single shared traversal. `runRule(ast, rule, configuration)` is a convenience
for testing one rule. `visitAst()` is available for traversal-oriented
integrations; rule implementations should use their `create()` visitor and the
typed indexes on `RuleContext` instead.

See [`@clistd/recommend-rules`](../recommend-rules/README.md) and
[`@clistd/clig-rules`](../clig-rules/README.md) for maintained rule sets.
