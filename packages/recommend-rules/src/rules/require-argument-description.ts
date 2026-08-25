import type { Rule } from '@clistd/linter';

export const requireArgumentDescription: Rule = {
  meta: {
    id: 'clistd/require-argument-description',
    description: 'Require a description for every visible argument.',
    defaultSeverity: 'warn',
    prompt: 'Add a concise description explaining the argument and its accepted value.',
  },
  create(context) {
    return {
      onArgument(argument) {
        if (!argument.hidden && !argument.description?.trim()) {
          context.report({
            message: 'Visible arguments need a description.',
            node: argument,
          });
        }
      },
    };
  },
};
