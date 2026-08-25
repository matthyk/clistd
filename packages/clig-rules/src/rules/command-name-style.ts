import type { Rule } from '@clistd/linter';

export const commandNameStyle: Rule = {
  meta: {
    id: 'clig/command-name-style',
    description: 'Require the CLI name to use lowercase letters and dashes only.',
    defaultSeverity: 'warn',
    prompt: 'Rename the CLI using lowercase letters, with dashes only where needed.',
  },
  create(context) {
    return {
      onDocument(document) {
        if (!/^[a-z]+(?:-[a-z]+)*$/.test(document.cli.name)) {
          context.report({
            message: 'CLI names should contain only lowercase letters and optional dashes.',
            node: document,
          });
        }
      },
    };
  },
};
