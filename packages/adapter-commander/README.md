# `@clistd/adapter-commander`

Generate an unvalidated canonical clistd document from a configured
Commander.js program. The `commander` adapter is bundled with `@clistd/cli`;
install this package to use it programmatically.

```sh
npm install @clistd/adapter-commander
```

## Export a program factory

The source module may be JavaScript or TypeScript and may return synchronously
or asynchronously. It must export a side-effect-free factory named
`createClistdProgram` by default, return a configured Commander program, and
not call `parse()`.

```ts
import { Command } from 'commander';

export function createClistdProgram() {
  return new Command('acme')
    .description('Acme command-line tools.')
    .command('greet <name>')
    .description('Print a greeting.');
}
```

Use `options: { export: 'makeProgram' }` to select another non-empty named
export.

## Adapt and validate

```ts
import { adaptCommanderProgram } from '@clistd/adapter-commander';
import { buildDocument } from '@clistd/core';

const result = await adaptCommanderProgram({
  protocolVersion: '0.1',
  source: './src/clistd-program.ts',
});
const document = await buildDocument({ value: result.document, uri: result.uri });
```

The adapter supports Commander.js v12–v15. It intentionally does not import
Commander: the inspected source module uses its own installed version. It loads
`.js`, `.mjs`, `.cjs`, `.ts`, `.mts`, and `.cts` sources.

## Extracted data and limits

The adapter extracts named and nested commands, aliases, arguments, options,
defaults, and JSON-compatible choices. Nested commands become space-separated
canonical invocation paths.

Root options and arguments, custom parsers, environment fallbacks, presets,
standalone executable commands, dynamic behavior, output contracts, and
exit-code contracts do not have a lossless v0.1 representation. They are
omitted; validate the returned document with `@clistd/core` before using it.

For end-user use, run:

```sh
clistd lint --adapter commander --source ./src/clistd-program.ts
```
