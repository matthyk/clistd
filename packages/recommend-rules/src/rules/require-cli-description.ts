import type { Rule } from '@clistd/linter';

export const requireCliDescription: Rule = {
  meta: {
    id: 'clistd/require-cli-description',
    description: 'Require a description for the CLI.',
    defaultSeverity: 'off',
    prompt: 'Add a concise description explaining the CLI’s purpose and primary use cases.',
  },
  create(context) {
    return {
      onDocument(document) {
        if (!document.cli.description?.trim()) {
          context.report({
            message: 'CLIs need a description.',
            node: document,
          });
        }
      },
    };
  },
};
