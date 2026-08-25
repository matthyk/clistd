#!/usr/bin/env -S node --loader ts-node/esm --no-warnings=ExperimentalWarning
import { execute, settings } from '@oclif/core';

// Commands are compiled to dist before this launcher runs. Disable Oclif's
// automatic dist-to-source remapping, which cannot use this package's test
// tsconfig rootDir and otherwise emits a misleading fallback warning.
settings.enableAutoTranspile = false;
await execute({ development: true, dir: import.meta.url });
