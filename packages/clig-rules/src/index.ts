import type { Rule } from '@clistd/linter';

export { commandNameStyle } from './rules/command-name-style.js';
export { noSecretValueFlag } from './rules/no-secret-value-flag.js';
export { preferFlagsToArguments } from './rules/prefer-flags-to-arguments.js';
export { requireFailureExitCode } from './rules/require-failure-exit-code.js';
export { requireJsonOutputFlag } from './rules/require-json-output-flag.js';
export { requireSuccessExitCode } from './rules/require-success-exit-code.js';
export { standardFlagNames } from './rules/standard-flag-names.js';

import { commandNameStyle } from './rules/command-name-style.js';
import { noSecretValueFlag } from './rules/no-secret-value-flag.js';
import { preferFlagsToArguments } from './rules/prefer-flags-to-arguments.js';
import { requireFailureExitCode } from './rules/require-failure-exit-code.js';
import { requireJsonOutputFlag } from './rules/require-json-output-flag.js';
import { requireSuccessExitCode } from './rules/require-success-exit-code.js';
import { standardFlagNames } from './rules/standard-flag-names.js';

/** Ordered rules derived from the Command Line Interface Guidelines (clig.dev). */
export const cligRules: readonly Rule[] = [
  commandNameStyle,
  standardFlagNames,
  preferFlagsToArguments,
  noSecretValueFlag,
  requireJsonOutputFlag,
  requireSuccessExitCode,
  requireFailureExitCode,
];
