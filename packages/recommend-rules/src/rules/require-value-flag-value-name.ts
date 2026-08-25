import type { Rule } from '@clistd/linter';

export const requireValueFlagValueName: Rule = {
  meta: {
    id: 'clistd/require-value-flag-value-name',
    description: 'Require value flags to declare a readable value placeholder.',
    defaultSeverity: 'off',
    prompt: 'Add a valueName such as FILE, FORMAT, or URL to show what the flag accepts.',
  },
  create(context) {
    return {
      onValueFlag(flag) {
        if (!flag.valueName?.trim()) {
          context.report({
            message: 'Value flags need a readable value placeholder.',
            node: flag,
          });
        }
      },
    };
  },
};
