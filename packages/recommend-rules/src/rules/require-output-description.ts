import type { Rule } from '@clistd/linter';

export const requireOutputDescription: Rule = {
  meta: {
    id: 'clistd/require-output-description',
    description: 'Require a description for every output contract.',
    defaultSeverity: 'warn',
    prompt:
      'Add a concise description explaining when this output is produced and what it contains.',
  },
  create(context) {
    return {
      onOutput(output) {
        if (!output.description?.trim()) {
          context.report({
            message: 'Output contracts need a description.',
            node: output,
          });
        }
      },
    };
  },
};
