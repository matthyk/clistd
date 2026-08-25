# `@clistd/recommend-rules`

The maintained baseline of portable clistd lint rules. They check quality and
consistency of information represented in a canonical CLI document.

```sh
npm install @clistd/recommend-rules
```

```ts
import { createRuleRegistry, runRules } from '@clistd/linter';
import { recommendedRules } from '@clistd/recommend-rules';

const diagnostics = runRules(ast, createRuleRegistry(recommendedRules));
```

Individual rules are exported alongside the ordered `recommendedRules`
collection, so a consumer can build a smaller policy.

## Included rules

| Rule                                                              | Default | Purpose                                                              |
| ----------------------------------------------------------------- | ------- | -------------------------------------------------------------------- |
| `clistd/no-similar-flag-names`                                    | warn    | Flag names in different commands should not be confusingly similar.  |
| `clistd/no-duplicate-documentation`                               | error   | Summaries and descriptions should not be duplicated across elements. |
| `clistd/max-commands-per-topic`                                   | warn    | Topics should stay focused; default maximum is 7.                    |
| `clistd/require-{command,argument,flag,topic,output}-description` | warn    | Visible documented elements need descriptions.                       |
| `clistd/require-json-flag`                                        | warn    | Commands should provide `--json`.                                    |
| `clistd/require-cli-description`                                  | off     | The CLI should have a description.                                   |
| `clistd/require-success-exit-code`                                | off     | Commands should document exit code 0.                                |
| `clistd/require-value-flag-value-name`                            | off     | Value flags should expose a readable placeholder.                    |

Configure a rule through `@clistd/linter` or the CLI:

```yaml
rules:
  clistd/max-commands-per-topic: [warn, { maxCommands: 5 }]
  clistd/require-success-exit-code: error
```

These rules remain framework-neutral. For guidance derived from the Command
Line Interface Guidelines, add [`@clistd/clig-rules`](../clig-rules/README.md).
