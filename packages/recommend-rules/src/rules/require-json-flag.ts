import type { Rule } from '@clistd/linter';

export const requireJsonFlag: Rule = {
  meta: {
    id: 'clistd/require-json-flag',
    description: 'Require every command to support machine-readable JSON output with --json.',
    defaultSeverity: 'warn',
    prompt: 'Add a --json value or boolean flag that selects machine-readable JSON output.',
  },
  create(context) {
    return {
      onCommand(command) {
        if (
          !command.flags.some((flag) => flag.long === 'json' || flag.longAliases.includes('json'))
        ) {
          context.report({
            message: 'Commands should provide a --json flag for machine-readable output.',
            node: command,
          });
        }
      },
    };
  },
};
