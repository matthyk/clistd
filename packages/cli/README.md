# `@clistd/cli`

The `clistd` command validates and lints CLI contracts, adapts supported CLI
projects, and detects compatibility-breaking changes.

```sh
npm install --global @clistd/cli
clistd lint --help
```

Node.js 22 or later is required. You can also use it without a global install:

```sh
npx @clistd/cli lint --help
```

## Lint a CLI

Lint either one canonical JSON/YAML document or one adapter source:

```sh
clistd lint --file ./cli-contract.yaml
clistd lint --adapter oclif --source ./my-oclif-cli
clistd lint --adapter commander --source ./src/clistd-program.ts
```

The built-in `oclif` adapter supports Oclif v4. The `commander` adapter
supports Commander.js v12–v15 and expects a JavaScript or TypeScript module
that exports a configured, side-effect-free `createClistdProgram` factory. See
the adapter-specific documentation for [Oclif](../adapter-oclif/README.md) and
[Commander](../adapter-commander/README.md).

Every input is validated by `@clistd/core` before rules run. Warnings leave a
zero exit status; any error exits with status 1.

## Canonical document example

Use a canonical document when your contract includes behavior an adapter cannot
discover, such as outputs or exit codes:

```yaml
# cli-contract.yaml
$id: https://example.com/acme-cli/0.1
specVersion: '0.1'
cli:
  name: acme
  description: Acme command-line tools.
  commandSeparator: ' '
  endOfOptions: true
commands:
  - id: greet
    invocation: [greet]
    description: Print a greeting.
    flags:
      - id: json
        long: json
        description: Produce JSON output.
        kind: boolean
        valueSchema:
          type: boolean
    exitCodes:
      - id: success
        code: 0
        description: The command completed successfully.
```

The [specification package](../spec/README.md) documents the complete v0.1
document model and its intentional limits.

## Configure rules and adapters

Configuration is loaded from `clistd.json`, `clistd.yaml`, or `clistd.yml`,
searching upward from the inspected input. Pass `--config FILE` to select a
specific file. Rule settings are `off`, `warn`, `error`, or
`[severity, options]`.

```yaml
# clistd.yaml
rules:
  clistd/max-commands-per-topic: [warn, { maxCommands: 5 }]
  clig/require-success-exit-code: warn

ruleModules:
  - ./tools/clistd-rules.mjs

adapters:
  my-framework:
    command: node
    args: [./tools/clistd-adapter.mjs]
    options:
      includeHidden: false
```

Configured rule modules are trusted ESM modules that export `rules` (or a
default array) of `Rule` objects. Relative paths resolve from the configuration
file. `--rule-module MODULE` may be repeated for ad-hoc trusted rule modules.

Configured adapters use the JSON-over-stdio protocol from
[`@clistd/adapter`](../adapter/README.md). Invoke one with:

```sh
clistd lint --adapter my-framework --source .
```

Built-in adapter IDs cannot be overridden by configuration.

## Reports and CI

Default output is for people. `--json` writes the versioned lint report to
standard output; `--format` atomically writes durable reports for CI and
agent workflows:

```sh
clistd lint --file ./cli-contract.yaml --json \
  --format json=reports/lint.json \
  --format prompt=reports/lint-prompts.txt
```

`--format` accepts `json=FILE` and `prompt=FILE`, each at most once. Run the
same command in CI that you run locally; the JSON report is the stable
integration surface.

## Compare compatibility

Compare two canonical documents before a release:

```sh
clistd diff breaking --base ./released.yaml --head ./current.yaml
```

Supply an adapter to compare two implementation sources instead:

```sh
clistd diff breaking --adapter oclif \
  --base ./previous-cli --head ./current-cli --json
```

The command exits 0 for compatible inputs, 1 for changes at the configured
failure severity, and 2 when configuration or either input cannot be loaded or
validated. `--fail-on error` is the default; use `warn`, `info`, or `none` to
set a different CI policy.

For local Git revisions, sources must be repository-relative:

```sh
clistd diff breaking --base cli-contract.yaml --base-ref origin/main \
  --head cli-contract.yaml --head-ref HEAD --json
```

Use `--repo PATH` when the repository is not the current one. clistd only uses
existing local commits; it does not fetch refs or install dependencies.

## Editor schema

The package ships its configuration schema and exports it as
`@clistd/cli/configuration.schema.json`:

```json
{
  "$schema": "./node_modules/@clistd/cli/dist/configuration.schema.json"
}
```

```yaml
# yaml-language-server: $schema=./node_modules/@clistd/cli/dist/configuration.schema.json
```

## Programmatic API

The package also exports document/configuration loaders and report-formatting
helpers for integrations. Prefer `@clistd/core` for validation and
`@clistd/linter` for rules.
