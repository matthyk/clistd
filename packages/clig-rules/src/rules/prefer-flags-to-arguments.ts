import type { Rule } from '@clistd/linter';

export const preferFlagsToArguments: Rule = {
  meta: {
    id: 'clig/prefer-flags-to-arguments',
    description: 'Discourage commands with multiple distinct positional arguments.',
    defaultSeverity: 'warn',
    prompt:
      'Prefer named flags for distinct inputs; keep multiple arguments for a simple repeated action.',
  },
  create(context) {
    return {
      onCommand(command) {
        const requiredArguments = command.arguments.filter((argument) => argument.required);
        if (
          requiredArguments.length > 1 &&
          !requiredArguments.every((argument) => argument.variadic)
        ) {
          context.report({
            message:
              'Commands with multiple distinct required arguments should prefer named flags.',
            node: command,
            related: requiredArguments,
          });
        }
      },
    };
  },
};
