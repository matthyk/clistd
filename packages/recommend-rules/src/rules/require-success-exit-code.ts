import type { Rule } from '@clistd/linter';

export const requireSuccessExitCode: Rule = {
  meta: {
    id: 'clistd/require-success-exit-code',
    description: 'Require every command to document its successful exit code.',
    defaultSeverity: 'off',
    prompt: 'Add an exit-code contract for code 0 that describes successful completion.',
  },
  create(context) {
    return {
      onCommand(command) {
        if (!command.exitCodes.some((exitCode) => exitCode.code === 0)) {
          context.report({
            message: 'Commands need an exit-code contract for successful completion (code 0).',
            node: command,
          });
        }
      },
    };
  },
};
