# Repository Guidelines

This root `AGENTS.md` is the project-wide overview. Each workspace package may
contain its own `AGENTS.md` with package-specific architecture, API, testing,
and implementation decisions. When working inside a package, follow both this
file and the nearest package-specific guide; the package guide provides the
more detailed rules for that workspace.

When a change materially affects a package's architecture, public API,
dependencies, testing approach, or implementation conventions, update that
package's `AGENTS.md` when doing so would keep its guidance accurate and useful.
Do not change it for routine implementation details that do not alter guidance.

## Project Purpose

clistd gives CLI developers a standardized, machine-readable way to describe
command-line interfaces. It supports spec-driven CLI development and static
linting to enforce CLI requirements.

## Project Structure & Package Boundaries

This is a TypeScript ESM monorepo managed with npm workspaces. Keep the root
focused on shared configuration and project documentation. Source and tests
belong within their owning workspace. Document every new top-level directory in
the README.

Create and maintain these workspace packages:

- `packages/spec`: public CLI specification types and JSON Schema. It defines
  the specification but does not validate raw documents.
- `packages/core`: normalized AST, source locations, document index, and shared
  diagnostic types. It validates raw documents against the schema supplied by
  `spec` using Ajv, then produces the AST.
- `packages/linter`: public rule API, rule registry, and central AST traversal.
- `packages/adapter`: framework-neutral adapter contract, adapter registry, and
  JSON-over-stdio protocol. It returns unvalidated canonical documents and
  never depends on `core`, `linter`, or `cli`.
- `packages/adapter-oclif`: built-in adapter that generates a canonical
  document from an Oclif project root. It depends on the public adapter API.
- `packages/adapter-commander`: built-in adapter that generates a canonical
  document from a Commander.js program factory module. It depends only on the
  public adapter API at runtime.
- `packages/cli`: user-facing oclif commands, configuration loading, and
  diagnostic formatting. It composes built-in and configured adapters but keeps
  framework extraction out of the command implementation.
- `packages/recommend-rules`: the first recommended-rules package. It depends
  only on the public rule API from `linter` and is loaded by `cli`.

The dependency direction is strictly upward:

```text
spec -> core -> linter -> cli
```

Rule packages depend on the public `linter` API. `cli` composes the runtime
packages. Adapter packages depend on the public `adapter` API. Never import
another workspace's source files by path; use its package name and declared
public exports.

## TypeScript, Build, and Runtime

Support Node.js LTS releases starting with Node.js 22. Use ESM throughout.

Each workspace must have its own `tsconfig.json` and be independently
type-checkable, buildable, and testable. Model workspace dependencies with
TypeScript project references and provide a root solution-style `tsconfig.json`
for complete builds with `tsc --build`.

Use plain `tsc` for publishable ESM packages; do not bundle libraries by
default. A bundler such as `tsup` is appropriate only for a demonstrated need,
such as a single-file CLI distribution. Required compiler settings are:

- `strict: true`
- `composite: true`
- `declaration: true`
- `declarationMap: true`
- `sourceMap: true`
- `module: "NodeNext"`
- `moduleResolution: "NodeNext"`

Each package must declare explicit `exports` and `types` entries in its
`package.json`.

## Testing and Quality Checks

Use borp for tests. Use `@oclif/test` / oclif testing utilities for CLI tests.
Add tests with every feature and bug fix, covering package-level behavior and
end-to-end CLI fixture projects where applicable. Use descriptive test names,
such as `rejects_expired_token`.

Oxfmt formats the code and Oxlint lints it. Both must pass in CI. Generated
code must not be manually formatted. Before merging, run formatting, linting,
type-checking, and the complete test suite. Once scripts are added, document the
repeatable npm commands and required Node version in the README.

## Coding Style and Naming

Use spaces, ESM syntax, and strict TypeScript. Avoid `any`: prefer `unknown`
and explicitly narrow it. Explicit `any` is permitted only at external or
inherently untyped boundaries and requires a short local justification. Never
use `@ts-ignore`; where unavoidable, use `@ts-expect-error` with an explanation.

- Use `camelCase` for variables, functions, and properties.
- Use `PascalCase` for types, interfaces, classes, and enums.
- Use `UPPER_SNAKE_CASE` only for true constants.
- Use kebab-case for files and directories.
- Prefer descriptive domain names; abbreviate only widely understood terms.

Order imports into these blank-line-separated groups: Node.js built-ins using
the `node:` prefix, external packages, internal workspace packages, then
relative imports. Prefer named exports and type-only imports. Avoid default
exports unless a framework or tool requires them.

Prefer immutable data and `const`, small focused functions, and explicit public
API parameter and return types. Avoid hidden side effects. Do not disable a lint
rule without a local explanation.

## Commit and Pull Request Guidelines

Use concise, imperative commit subjects, such as `Add token validation`. Keep
each commit focused. Pull requests should explain the change, note testing
performed, link relevant issues, and include screenshots for visible UI changes.
Never commit generated output, local caches, credentials, editor-specific files,
or secrets; provide redacted configuration examples instead.
