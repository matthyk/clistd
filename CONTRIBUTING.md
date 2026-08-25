# Contributing to clistd

Thanks for helping improve clistd. Please open an issue before starting a
substantial change so the intended design can be discussed.

## Prerequisites

Use Node.js 22.11 or later and npm. Install dependencies from the repository
root:

```sh
npm install
```

## Development workflow

Keep changes focused, add or update tests for behaviour changes, and run the
repository checks before opening a pull request:

```sh
npm run format
npm run lint
npm run typecheck
npm test
```

Use `npm run format:write` to apply formatting and `npm run lint:fix` for safe
lint fixes. Each package can also be built, type-checked, and tested through
its own npm scripts.

## Pull requests

Use a concise, imperative commit subject. In the pull request, explain the
problem and solution, list the checks you ran, and link related issues. Include
tests for new features and bug fixes. Do not commit generated output, local
caches, credentials, or editor-specific files.

### Changesets

Add a changeset when a pull request changes the behavior, public API, or
published contents of any `@clistd/*` package:

```sh
npm run changeset
```

Select every affected package, choose the appropriate SemVer bump, and write a
short user-facing summary. Do not add a changeset for documentation, tests, or
repository-only tooling changes that do not affect a published package.

On `main`, the release workflow combines pending changesets into a **Version
Packages** pull request. Merging that pull request publishes the changed
packages; do not run `npm run release` from a developer machine during normal
releases.

## Package boundaries

clistd is an npm-workspaces TypeScript ESM monorepo. Keep source and tests in
the package that owns them, and use public workspace package exports rather
than importing another package's source by path. The primary dependency flow is
`spec -> core -> linter -> cli`; adapters and rule packages use their respective
public contracts. See the package-level `AGENTS.md` guides for detailed design
constraints.
