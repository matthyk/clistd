# `@clistd/adapter-oclif` Design Guide

## Package purpose

`@clistd/adapter-oclif` generates an unvalidated canonical clistd document from
an Oclif CLI project root. It exports the built-in `oclifAdapter` and the
`adaptOclifProject` implementation through its public package API.

It depends only on `@clistd/adapter` and Oclif's public API. It must not depend
on `@clistd/core`, `@clistd/linter`, or `@clistd/cli` at runtime. Core remains
the required validation and AST-normalization boundary after adaptation.

## Source and version support

The adapter request `source` is the base directory of an Oclif CLI project or
installed Oclif package, not an individual command, command directory, or
manifest path.

Only Oclif v4 is supported. Load the target using `Config.load({ root })` and
read the target package metadata through `config.pjson`. When the target
explicitly declares `@oclif/core` in `dependencies` or `devDependencies`, it
must clearly identify v4; reject v3 and ambiguous ranges. A target without a
direct declaration may receive Oclif transitively and is supported when
`Config.load` succeeds.

Prefer normal runtime discovery. When a target has a `tsconfig.json`, also try
Oclif's development-mode source discovery in an isolated process. Use the
source result only when it discovers more commands, which lets unbuilt local
TypeScript CLIs be linted without overriding a complete runtime build.

Use Oclif's normal command discovery. If an `oclif.manifest.json` is already
present, Oclif may use it as its normal metadata cache. Never run `oclif
manifest`, write a manifest, or otherwise mutate the target project.

## Output mapping

Map only portable static metadata: CLI bin name and separator, command IDs and
paths, aliases, descriptions, arguments, and static boolean/value flag details.
Simple static options map to value-schema enums.

Do not invent mappings for custom parsers, runtime callbacks, dynamic commands
or defaults, output contracts, exit-code contracts, or source locations. Omit
information that cannot be represented accurately in clistd v0.1.

Return an `AdapterResult` with the generated canonical document and a stable
generated-document `urn:` URI. The URI identifies the in-memory document; it is
not the project root passed as `source`.

## Testing

Use fixture Oclif project roots containing package metadata and, where helpful,
a manifest. Test the generated output by passing it to `@clistd/core` from the
test package, ensuring that the adapter's output is core-valid. Cover v4
acceptance and unsupported-version rejection.
