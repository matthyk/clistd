import type { Rule } from '@clistd/linter';

export const requireFlagDescription: Rule = {
  meta: {
    id: 'clistd/require-flag-description',
    description: 'Require a description for every visible flag.',
    defaultSeverity: 'warn',
    prompt: 'Add a concise description explaining the flag and the effect of using it.',
  },
  create(context) {
    return {
      onBooleanFlag(flag) {
        if (!flag.hidden && !flag.description?.trim()) {
          context.report({
            message: 'Visible flags need a description.',
            node: flag,
          });
        }
      },
      onValueFlag(flag) {
        if (!flag.hidden && !flag.description?.trim()) {
          context.report({
            message: 'Visible flags need a description.',
            node: flag,
          });
        }
      },
    };
  },
};
