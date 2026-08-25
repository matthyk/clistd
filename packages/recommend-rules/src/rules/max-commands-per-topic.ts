import type { Rule, RuleContext } from '@clistd/linter';

export interface MaxCommandsPerTopicOptions {
  readonly maxCommands: number;
}

const DEFAULT_MAX_COMMANDS = 7;

export const maxCommandsPerTopic: Rule = {
  meta: {
    id: 'clistd/max-commands-per-topic',
    description: 'Warn when a topic contains more commands than the configured maximum.',
    defaultSeverity: 'warn',
    prompt: 'Split this topic into smaller, more focused topics.',
    optionsSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['maxCommands'],
      properties: {
        maxCommands: {
          type: 'integer',
          minimum: 0,
          default: DEFAULT_MAX_COMMANDS,
          description: 'Maximum number of commands allowed in a topic.',
        },
      },
    },
  },
  create(context) {
    const maxCommands = getMaxCommands(context.options);
    const topicCommands = new Map<string, Parameters<RuleContext['report']>[0]['node'][]>();
    const topics = new Map<string, Parameters<RuleContext['report']>[0]['node']>();

    return {
      onTopic(topic) {
        topics.set(topic.id, topic);
      },
      onCommand(command) {
        for (const topicId of command.topics) {
          const commands = topicCommands.get(topicId) ?? [];
          commands.push(command);
          topicCommands.set(topicId, commands);

          if (commands.length === maxCommands + 1) {
            const topic = topics.get(topicId);
            if (topic !== undefined) {
              context.report({
                message: `Topic ${JSON.stringify(topicId)} has more than ${maxCommands} commands.`,
                node: topic,
                related: [command],
              });
            }
          }
        }
      },
    };
  },
};

function getMaxCommands(options: unknown): number {
  if (
    typeof options === 'object' &&
    options !== null &&
    'maxCommands' in options &&
    typeof options.maxCommands === 'number' &&
    Number.isSafeInteger(options.maxCommands) &&
    options.maxCommands >= 0
  ) {
    return options.maxCommands;
  }

  return DEFAULT_MAX_COMMANDS;
}
