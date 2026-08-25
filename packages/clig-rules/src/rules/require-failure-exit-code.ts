import type { Rule } from '@clistd/linter';

export const requireFailureExitCode: Rule = {
  meta: {
    id: 'clig/require-failure-exit-code',
    description: 'Require commands to document a non-zero exit code for failure.',
    defaultSeverity: 'off',
    prompt: 'Add a non-zero exit-code contract describing an important failure mode.',
  },
  create(context) {
    return {
      onCommand(command) {
        if (!command.exitCodes.some((exitCode) => exitCode.code !== 0)) {
          context.report({
            message: 'Commands need an exit-code contract for at least one failure mode.',
            node: command,
          });
        }
      },
    };
  },
};
