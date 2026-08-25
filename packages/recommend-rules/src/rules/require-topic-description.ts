import type { Rule } from '@clistd/linter';

export const requireTopicDescription: Rule = {
  meta: {
    id: 'clistd/require-topic-description',
    description: 'Require a description for every topic.',
    defaultSeverity: 'warn',
    prompt: 'Add a concise description explaining the commands grouped by this topic.',
  },
  create(context) {
    return {
      onTopic(topic) {
        if (!topic.description?.trim()) {
          context.report({
            message: 'Topics need a description.',
            node: topic,
          });
        }
      },
    };
  },
};
