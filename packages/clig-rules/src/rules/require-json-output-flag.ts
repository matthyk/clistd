import type { Rule } from '@clistd/linter';

export const requireJsonOutputFlag: Rule = {
  meta: {
    id: 'clig/require-json-output-flag',
    description: 'Require a --json flag when a command declares JSON output.',
    defaultSeverity: 'off',
    prompt: 'Add a --json value or boolean flag that selects the declared JSON output.',
  },
  create(context) {
    return {
      onCommand(command) {
        if (
          command.outputs.some((output) => output.format === 'json') &&
          !command.flags.some((flag) => flag.long === 'json' || flag.longAliases.includes('json'))
        ) {
          context.report({
            message: 'Commands declaring JSON output should provide a --json flag.',
            node: command,
          });
        }
      },
    };
  },
};
