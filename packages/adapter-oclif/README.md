# `@clistd/adapter-oclif`

Generate an unvalidated canonical clistd document from an Oclif v4 project.
The `oclif` adapter is bundled with `@clistd/cli`; install this package when
embedding adaptation in another tool.

```sh
npm install @clistd/adapter-oclif
```

```ts
import { adaptOclifProject } from '@clistd/adapter-oclif';
import { buildDocument } from '@clistd/core';

const result = await adaptOclifProject({
  protocolVersion: '0.1',
  source: './my-oclif-cli',
});
const document = await buildDocument({ value: result.document, uri: result.uri });
```

## Input and compatibility

`source` is an Oclif project root or installed Oclif package—not an individual
command, command directory, or manifest file. Oclif v4 is supported. When the
target explicitly declares `@oclif/core`, its dependency range must clearly
identify v4; a project that obtains Oclif transitively is accepted when normal
Oclif configuration loading succeeds.

The adapter uses normal Oclif command discovery. An existing
`oclif.manifest.json` can be read when Oclif uses it, but this adapter never
generates, writes, or changes a manifest or the inspected project.

## Extracted data

The generated document contains portable static metadata: CLI bin name and
separator, command paths and aliases, descriptions, arguments, and static
boolean/value flag details. Static option choices become value-schema enums.

It deliberately omits custom parsers, runtime callbacks, dynamic commands or
defaults, output contracts, exit-code contracts, and source locations. Validate
the result with `@clistd/core` before running rules or other tooling.

For end-user use, run:

```sh
clistd lint --adapter oclif --source ./my-oclif-cli
```
