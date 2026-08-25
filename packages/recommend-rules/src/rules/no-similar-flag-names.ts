import { distance } from 'fastest-levenshtein';

import type { Rule, RuleContext } from '@clistd/linter';

type FlagNode = Parameters<RuleContext['report']>[0]['node'] & {
  readonly hidden: boolean;
  readonly long: string;
};

const MAXIMUM_EDIT_DISTANCE = 2;
const MAXIMUM_DISTANCE_RATIO = 0.25;

export const noSimilarFlagNames: Rule = {
  meta: {
    id: 'clistd/no-similar-flag-names',
    description: 'Warn when flags in different commands have confusingly similar long names.',
    defaultSeverity: 'warn',
    prompt: 'Rename one of the flags so its long name is clearly distinct from the related flag.',
  },
  create(context) {
    const flags: FlagNode[] = [];

    function check(flag: FlagNode): void {
      if (flag.hidden) return;

      if (flags.some((existingFlag) => existingFlag.long === flag.long)) {
        flags.push(flag);
        return;
      }

      const similarFlag = flags.find((existingFlag) => areSimilar(flag.long, existingFlag.long));
      if (similarFlag !== undefined) {
        context.report({
          message: `Flag --${flag.long} is confusingly similar to --${similarFlag.long}.`,
          node: flag,
          related: [similarFlag],
        });
      }
      flags.push(flag);
    }

    return {
      onBooleanFlag: check,
      onValueFlag: check,
    };
  },
};

function areSimilar(first: string, second: string): boolean {
  if (first === second) return false;

  const editDistance = distance(first, second);
  const longestNameLength = Math.max(first.length, second.length);
  return (
    editDistance <= MAXIMUM_EDIT_DISTANCE &&
    editDistance / longestNameLength <= MAXIMUM_DISTANCE_RATIO
  );
}
