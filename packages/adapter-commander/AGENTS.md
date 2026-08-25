# `@clistd/adapter-commander` Design Guide

## Package purpose

`@clistd/adapter-commander` generates an unvalidated canonical clistd document
by inspecting a Commander.js program returned from a user-supplied module. It
exports `commanderAdapter` and `adaptCommanderProgram` through its public API.

It depends at runtime only on `@clistd/adapter` and Jiti. Do not import
Commander from this package: the inspected module must use its own installed
Commander version. The adapter must not depend on `@clistd/core`,
`@clistd/linter`, or `@clistd/cli` at runtime.

## Source and version support

The adapter request `source` is an ESM, CommonJS, or TypeScript module that
exports a factory. `request.options` may specify its non-empty `export` name;
the default is `createClistdProgram`. The factory may be synchronous or async
and must return a configured Commander `Command` without calling `parse()`.

Load JavaScript source modules with dynamic `import()`. Load `.ts`, `.mts`, and
`.cts` source modules with Jiti, configured without a filesystem or module
cache so adaptation never writes to or returns stale data from the inspected
project. Use structural checks rather than `instanceof`, so the adapter works
with Commander v12 through v15 and never relies on a duplicate Commander
installation.

## Output mapping

Flatten nested subcommands into space-separated command invocations. Extract
names, aliases, summaries, descriptions, registered arguments, options,
choices, defaults, and required/variadic state where they have a lossless
clistd representation.

Do not inspect action handlers or execute parsing. The v0.1 schema cannot
represent root-command options or arguments, custom parsers, environment
fallbacks, presets, standalone executable commands, output contracts, or exit
codes. Omit unsupported data and emit an adapter warning when it affects a
declared root command or supported option.

## Testing

Build fixtures with Commander in-memory, export factories from temporary ESM
modules, and validate generated documents with `@clistd/core`. Cover nested
commands, aliases, values, choices, defaults, conflicts, implied options,
CommonJS loading, and malformed factory results.
