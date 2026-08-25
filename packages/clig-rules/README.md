# `@clistd/clig-rules`

Portable rules derived from the [Command Line Interface Guidelines](https://clig.dev/).
They apply only guidance that can be evaluated from a canonical clistd document.

```sh
npm install @clistd/clig-rules
```

```ts
import { cligRules } from '@clistd/clig-rules';
import { createRuleRegistry, runRules } from '@clistd/linter';

const diagnostics = runRules(ast, createRuleRegistry(cligRules));
```

Individual rules are exported alongside the ordered `cligRules` collection.

## Included rules

| Rule                             | Default | Purpose                                                           |
| -------------------------------- | ------- | ----------------------------------------------------------------- |
| `clig/command-name-style`        | warn    | CLI names use lowercase letters and dashes.                       |
| `clig/standard-flag-names`       | warn    | Conventional flags use conventional short forms.                  |
| `clig/prefer-flags-to-arguments` | warn    | Multiple distinct required positionals should generally be flags. |
| `clig/no-secret-value-flag`      | warn    | Secrets should not be accepted as flag values.                    |
| `clig/require-json-output-flag`  | off     | Declared JSON output should be selectable with `--json`.          |
| `clig/require-success-exit-code` | off     | Commands should document exit code 0.                             |
| `clig/require-failure-exit-code` | off     | Commands should document a non-zero failure exit code.            |

Enable optional runtime-contract documentation checks explicitly:

```yaml
rules:
  clig/require-success-exit-code: warn
  clig/require-failure-exit-code: warn
```

For the baseline documentation-quality rules, use
[`@clistd/recommend-rules`](../recommend-rules/README.md).
