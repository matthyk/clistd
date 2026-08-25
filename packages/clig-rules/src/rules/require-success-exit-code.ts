import type { Rule } from '@clistd/linter';

export const requireSuccessExitCode: Rule = {
  meta: {
    id: 'clig/require-success-exit-code',
    description: 'Require commands to document exit code 0 for successful completion.',
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
