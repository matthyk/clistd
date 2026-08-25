import type { Rule } from '@clistd/linter';

export const requireCommandDescription: Rule = {
  meta: {
    id: 'clistd/require-command-description',
    description: 'Require a description for every command.',
    defaultSeverity: 'warn',
    prompt: 'Add a concise description explaining what this command does.',
  },
  create(context) {
    return {
      onCommand(command) {
        if (!command.description?.trim()) {
          context.report({
            message: 'Commands need a description.',
            node: command,
          });
        }
      },
    };
  },
};
