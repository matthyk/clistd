import type { Rule } from '@clistd/linter';

const SECRET_FLAG_NAME = /(?:api[-_]?key|credential|pass(?:word|phrase)?|secret|token)/i;

export const noSecretValueFlag: Rule = {
  meta: {
    id: 'clig/no-secret-value-flag',
    description: 'Disallow value flags whose names indicate that they accept secrets.',
    defaultSeverity: 'warn',
    prompt: 'Accept the secret through a file, stdin, or a dedicated credential mechanism instead.',
  },
  create(context) {
    return {
      onValueFlag(flag) {
        if (SECRET_FLAG_NAME.test(flag.long)) {
          context.report({
            message: `The --${flag.long} flag appears to accept a secret; secrets should not be passed as flags.`,
            node: flag,
          });
        }
      },
    };
  },
};
