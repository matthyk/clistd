import type { Rule } from '@clistd/linter';

export { requireArgumentDescription } from './rules/require-argument-description.js';
export { requireCliDescription } from './rules/require-cli-description.js';
export { requireCommandDescription } from './rules/require-command-description.js';
export { requireFlagDescription } from './rules/require-flag-description.js';
export { requireJsonFlag } from './rules/require-json-flag.js';
export { requireOutputDescription } from './rules/require-output-description.js';
export { requireSuccessExitCode } from './rules/require-success-exit-code.js';
export { requireTopicDescription } from './rules/require-topic-description.js';
export { requireValueFlagValueName } from './rules/require-value-flag-value-name.js';
export { noDuplicateDocumentation } from './rules/no-duplicate-documentation.js';
export { noSimilarFlagNames } from './rules/no-similar-flag-names.js';
export {
  maxCommandsPerTopic,
  type MaxCommandsPerTopicOptions,
} from './rules/max-commands-per-topic.js';

import { requireArgumentDescription } from './rules/require-argument-description.js';
import { requireCliDescription } from './rules/require-cli-description.js';
import { requireCommandDescription } from './rules/require-command-description.js';
import { requireFlagDescription } from './rules/require-flag-description.js';
import { requireJsonFlag } from './rules/require-json-flag.js';
import { requireOutputDescription } from './rules/require-output-description.js';
import { requireSuccessExitCode } from './rules/require-success-exit-code.js';
import { requireTopicDescription } from './rules/require-topic-description.js';
import { requireValueFlagValueName } from './rules/require-value-flag-value-name.js';
import { noDuplicateDocumentation } from './rules/no-duplicate-documentation.js';
import { noSimilarFlagNames } from './rules/no-similar-flag-names.js';
import { maxCommandsPerTopic } from './rules/max-commands-per-topic.js';

/** The maintained, ordered baseline rule set for clistd documents. */
export const recommendedRules: readonly Rule[] = [
  noSimilarFlagNames,
  noDuplicateDocumentation,
  maxCommandsPerTopic,
  requireCliDescription,
  requireTopicDescription,
  requireCommandDescription,
  requireArgumentDescription,
  requireFlagDescription,
  requireJsonFlag,
  requireOutputDescription,
  requireSuccessExitCode,
  requireValueFlagValueName,
];
