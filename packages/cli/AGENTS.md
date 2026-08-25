# `@clistd/cli` Design Guide

## Package purpose

`@clistd/cli` is the user-facing Oclif package. It owns command parsing,
configuration discovery, document/adaptor input orchestration, diagnostics
presentation, and process exit policy.

It does not validate raw clistd documents, normalize ASTs, implement lint
rules, or extract metadata from a framework. Those responsibilities belong to
`@clistd/core`, `@clistd/linter`, and framework adapter packages.

## Commands

`lint` accepts exactly one input mode through Oclif command constraints:

```sh
clistd lint --file ./clistd.yaml
clistd lint --adapter oclif --source ./my-oclif-cli
```

- `--file` loads a canonical JSON or YAML document.
- `--adapter` with `--source` invokes a built-in or configured adapter.
- `--format` may be repeated as `json=FILE` or `prompt=FILE`; every formatter
  writes atomically to its required file destination. The built-in `--json`
  flag writes the versioned JSON report to stdout and may be combined with any
  number of file format requests.
- The command returns a versioned `LintReport`. Errors set exit status 1;
  warnings alone exit successfully.

`lint` defaults to the stylish human renderer. `--format prompt=FILE` writes
agent-facing guidance from the completed lint result. Optional adapter prompt
capabilities may add framework-specific guidance, but the formatter must work
with portable rule prompts alone. `--format json=FILE` writes the
machine-readable report.

`diff breaking` compares a required `--base` and `--head`. Without `--adapter`,
they are canonical JSON/YAML document paths; with `--adapter NAME`, they are
two sources passed independently to the selected built-in or configured
adapter. Both results must pass through `buildDocument()` before the CLI calls
`findBreakingChanges()` from core. The command renders the result and owns its
versioned JSON report and CI exit policy: 0 for compatible documents, 1 for
breaking findings, and 2 when either input cannot be loaded or compared.
It renders all core diff severities; `--fail-on error` is the default, while
`warn`, `info`, and `none` select stricter or non-failing CI policies.

`--base-ref` and `--head-ref` select existing local Git commits for either
source; `--repo` optionally chooses the repository. The CLI materializes a
requested revision in a temporary detached worktree before file loading or
adapter execution, then removes it. Do not place Git operations, worktree
management, adapter invocation, or report rendering in core. The command must
not fetch refs or install dependencies; CI prepares those external inputs.

## Input and adapter boundaries

Every input path converges at core:

```text
file or adapter result -> DocumentInput -> @clistd/core buildDocument() -> lint rules
```

An adapter result is always an unvalidated document. Never accept a framework
AST or allow an adapter to bypass core validation. Built-in adapters are
registered by the CLI. Configured adapters are external-process adapters
declared in `clistd.json`, `clistd.yaml`, or `clistd.yml`.

Built-in adapter IDs take precedence: configuration may not override them and
receives a `configuration/invalid` diagnostic if it tries. Configured adapter
IDs must be unique. The historical `adapters` object form remains supported;
an array of descriptors with `id` supports explicit duplicate-ID validation.
Unknown names remain `adapter/unknown` diagnostics. Process descriptors support
`command`, optional `args`, `cwd`, `timeoutMs`, `maxStdoutBytes`,
`maxStderrBytes`, and JSON-serializable adapter-specific `options`. Path-like
`command` and `args` values (`./` or `../`) resolve relative to the
configuration file. `cwd` also resolves relative to that file and defaults to
its directory, never the caller's incidental working directory. Set
`prompt: true` only when an external adapter implements the optional prompt
operation; its failures fall back to portable rule guidance.

## Configuration and diagnostics

Discover configuration from the input's directory upward, unless `--config` is
provided. Configuration owns rule settings and optional external adapter process
descriptors; it must not contain framework extraction logic.

Use `DocumentDiagnostic` from core for rendered findings. Preserve diagnostic
source identity in both human and JSON output. The adapter source identifies an
implementation being inspected; the document URI identifies the resulting
canonical document.

## Oclif integration

Keep standard Oclif scripts in `bin/`: `run.js`, `dev.js`, `run.cmd`, and
`dev.cmd`. Do not commit generated `oclif.manifest.json`; it is ignored.
Release packages intentionally do not generate or include an Oclif manifest at
this stage: command discovery is correct without one, and a manifest is a
version-coupled cache that needs dedicated release tooling. Revisit this only
when measured startup needs justify generating it in a controlled publish step.

## Testing

Use `@oclif/test` or supported Oclif testing utilities for command behavior.
Cover input constraints, JSON reports and exit codes, configuration discovery,
built-in adapter operation without configuration, configured process adapters,
and prompt report extraction.
