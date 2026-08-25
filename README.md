# clistd

Lint, document, and detect breaking changes in command-line interfaces.

clistd is implemented in TypeScript, but its contract and adapter protocol are
framework- and language-neutral. It turns an existing CLI—or a portable
JSON/YAML contract—into a validated, machine-readable description, then lints
it with built-in rules or compares releases for breaking changes. Oclif v4 and
Commander.js v12–v15 are supported today; other ecosystems can use canonical
documents or external adapters.

## Quick start

Requires Node.js 22.11 or later. Start without installing anything:

```sh
npx @clistd/cli lint --help
```

Then lint a supported project with its adapter:

```sh
npx @clistd/cli lint --adapter oclif --source ./my-oclif-cli
npx @clistd/cli lint --adapter commander --source ./src/clistd-program.ts
```

The Commander source is a JavaScript or TypeScript module that exports a
side-effect-free `createClistdProgram` factory. For a CLI in any other language
or framework, lint its portable JSON/YAML contract now, or add an external
adapter through the documented JSON-over-stdio protocol.

Use `npm install --global @clistd/cli` when you prefer a persistent `clistd`
command. See the [CLI documentation](packages/cli/README.md) for configuration,
reports, CI, custom rules, external adapters, and compatibility comparisons.

## Package documentation

| Package                     | Documentation                                                                        |
| --------------------------- | ------------------------------------------------------------------------------------ |
| `@clistd/cli`               | [Use the `clistd` command](packages/cli/README.md)                                   |
| `@clistd/spec`              | [Write and type canonical CLI documents](packages/spec/README.md)                    |
| `@clistd/core`              | [Validate documents and find breaking changes](packages/core/README.md)              |
| `@clistd/linter`            | [Create and run lint rules](packages/linter/README.md)                               |
| `@clistd/recommend-rules`   | [Use the maintained baseline rule set](packages/recommend-rules/README.md)           |
| `@clistd/clig-rules`        | [Use portable CLIG-derived rules](packages/clig-rules/README.md)                     |
| `@clistd/adapter`           | [Build in-process or process adapters](packages/adapter/README.md)                   |
| `@clistd/adapter-oclif`     | [Adapt Oclif v4 projects programmatically](packages/adapter-oclif/README.md)         |
| `@clistd/adapter-commander` | [Adapt Commander.js programs programmatically](packages/adapter-commander/README.md) |

## Development

This is an npm-workspaces TypeScript ESM monorepo. See
[CONTRIBUTING.md](CONTRIBUTING.md) for setup and repository checks.

## Releases

clistd uses [Changesets](https://github.com/changesets/changesets) for package
versioning and changelogs. Add a changeset for every change that affects a
published package:

```sh
npm run changeset
```

After feature pull requests are merged, GitHub Actions maintains a **Version
Packages** pull request containing version, internal-dependency, and changelog
updates. Merge that pull request when ready to release; the workflow publishes
the changed packages and creates GitHub releases.

Publishing uses npm trusted publishing with GitHub Actions OIDC; no npm token
is stored in GitHub. Before the first automated release, publish the `0.0.0`
bootstrap versions manually, then configure the same trusted publisher for
every public `@clistd/*` package: GitHub user `matthyk`, repository `clistd`,
and workflow filename `release.yml`. The pending Version Packages pull request
then publishes the first `0.1.0` release automatically.

## License

MIT.
