import type { JsonSchema } from './types.js';

export const SPEC_VERSION = '0.1' as const;

const schemaReference: JsonSchema = {
  $ref: 'https://json-schema.org/draft/2020-12/schema',
};

export const CLI_DOCUMENT_SCHEMA: JsonSchema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: 'https://clistd.dev/schema/0.1/schema.json',
  title: 'clistd CLI document',
  type: 'object',
  additionalProperties: false,
  required: ['$id', 'specVersion', 'cli', 'commands'],
  properties: {
    $id: { type: 'string', format: 'uri' },
    specVersion: { const: SPEC_VERSION },
    cli: { $ref: '#/$defs/cliMetadata' },
    topics: {
      type: 'array',
      items: { $ref: '#/$defs/topicOrReference' },
    },
    components: { $ref: '#/$defs/components' },
    commands: {
      type: 'array',
      minItems: 1,
      items: { $ref: '#/$defs/commandOrReference' },
    },
  },
  $defs: {
    nonEmptyString: {
      type: 'string',
      minLength: 1,
    },
    identifier: {
      type: 'string',
      minLength: 1,
      pattern: '^[A-Za-z][A-Za-z0-9._-]*$',
    },
    reference: {
      type: 'object',
      additionalProperties: false,
      required: ['$ref'],
      properties: {
        $ref: {
          type: 'string',
          minLength: 1,
          format: 'uri-reference',
        },
      },
    },
    cliMetadata: {
      type: 'object',
      additionalProperties: false,
      required: ['name', 'commandSeparator', 'endOfOptions'],
      properties: {
        name: { $ref: '#/$defs/nonEmptyString' },
        summary: { $ref: '#/$defs/nonEmptyString' },
        description: { $ref: '#/$defs/nonEmptyString' },
        commandSeparator: { enum: [':', ' '] },
        endOfOptions: { type: 'boolean' },
      },
    },
    topic: {
      type: 'object',
      additionalProperties: false,
      required: ['id', 'title'],
      properties: {
        id: { $ref: '#/$defs/identifier' },
        title: { $ref: '#/$defs/nonEmptyString' },
        description: { $ref: '#/$defs/nonEmptyString' },
      },
    },
    topicOrReference: {
      oneOf: [{ $ref: '#/$defs/topic' }, { $ref: '#/$defs/reference' }],
    },
    argument: {
      type: 'object',
      additionalProperties: false,
      required: ['id', 'name', 'required', 'valueSchema'],
      properties: {
        id: { $ref: '#/$defs/identifier' },
        name: { $ref: '#/$defs/nonEmptyString' },
        summary: { $ref: '#/$defs/nonEmptyString' },
        description: { $ref: '#/$defs/nonEmptyString' },
        hidden: { type: 'boolean' },
        required: { type: 'boolean' },
        variadic: { type: 'boolean' },
        default: true,
        valueSchema: schemaReference,
      },
    },
    valueFlag: {
      type: 'object',
      additionalProperties: false,
      required: ['id', 'long', 'valueSchema'],
      properties: {
        id: { $ref: '#/$defs/identifier' },
        long: { $ref: '#/$defs/flagLongName' },
        short: { $ref: '#/$defs/flagShortName' },
        longAliases: { $ref: '#/$defs/longAliasList' },
        shortAliases: { $ref: '#/$defs/shortAliasList' },
        summary: { $ref: '#/$defs/nonEmptyString' },
        description: { $ref: '#/$defs/nonEmptyString' },
        hidden: { type: 'boolean' },
        valueName: { $ref: '#/$defs/nonEmptyString' },
        required: { type: 'boolean' },
        multiple: { type: 'boolean' },
        default: true,
        valueSchema: schemaReference,
      },
    },
    booleanFlag: {
      type: 'object',
      additionalProperties: false,
      required: ['id', 'long', 'kind', 'valueSchema'],
      properties: {
        id: { $ref: '#/$defs/identifier' },
        long: { $ref: '#/$defs/flagLongName' },
        short: { $ref: '#/$defs/flagShortName' },
        longAliases: { $ref: '#/$defs/longAliasList' },
        shortAliases: { $ref: '#/$defs/shortAliasList' },
        summary: { $ref: '#/$defs/nonEmptyString' },
        description: { $ref: '#/$defs/nonEmptyString' },
        hidden: { type: 'boolean' },
        kind: { const: 'boolean' },
        default: { type: 'boolean' },
        valueSchema: schemaReference,
      },
    },
    flagLongName: {
      type: 'string',
      minLength: 1,
      pattern: '^[a-z0-9][a-z0-9-]*$',
    },
    flagShortName: {
      type: 'string',
      pattern: '^.$',
    },
    longAliasList: {
      type: 'array',
      items: { $ref: '#/$defs/flagLongName' },
      uniqueItems: true,
    },
    shortAliasList: {
      type: 'array',
      items: { $ref: '#/$defs/flagShortName' },
      uniqueItems: true,
    },
    flag: {
      oneOf: [{ $ref: '#/$defs/booleanFlag' }, { $ref: '#/$defs/valueFlag' }],
    },
    condition: {
      oneOf: [
        {
          type: 'object',
          additionalProperties: false,
          required: ['input', 'equals'],
          properties: {
            input: { $ref: '#/$defs/identifier' },
            equals: true,
          },
        },
        {
          type: 'object',
          additionalProperties: false,
          required: ['allOf'],
          properties: {
            allOf: {
              type: 'array',
              minItems: 1,
              items: { $ref: '#/$defs/condition' },
            },
          },
        },
        {
          type: 'object',
          additionalProperties: false,
          required: ['anyOf'],
          properties: {
            anyOf: {
              type: 'array',
              minItems: 1,
              items: { $ref: '#/$defs/condition' },
            },
          },
        },
        {
          type: 'object',
          additionalProperties: false,
          required: ['not'],
          properties: {
            not: { $ref: '#/$defs/condition' },
          },
        },
      ],
    },
    requiresConstraint: {
      type: 'object',
      additionalProperties: false,
      required: ['type', 'input'],
      anyOf: [{ required: ['allOf'] }, { required: ['anyOf'] }],
      properties: {
        type: { const: 'requires' },
        input: { $ref: '#/$defs/identifier' },
        allOf: {
          type: 'array',
          minItems: 1,
          items: { $ref: '#/$defs/identifier' },
          uniqueItems: true,
        },
        anyOf: {
          type: 'array',
          minItems: 1,
          items: { $ref: '#/$defs/identifier' },
          uniqueItems: true,
        },
      },
    },
    countConstraint: {
      type: 'object',
      additionalProperties: false,
      required: ['type', 'inputs', 'count'],
      properties: {
        type: { enum: ['atLeast', 'atMost', 'exactly'] },
        inputs: {
          type: 'array',
          minItems: 1,
          items: { $ref: '#/$defs/identifier' },
          uniqueItems: true,
        },
        count: { type: 'integer', minimum: 0 },
      },
    },
    allOrNoneConstraint: {
      type: 'object',
      additionalProperties: false,
      required: ['type', 'inputs'],
      properties: {
        type: { const: 'allOrNone' },
        inputs: {
          type: 'array',
          minItems: 2,
          items: { $ref: '#/$defs/identifier' },
          uniqueItems: true,
        },
      },
    },
    constraint: {
      oneOf: [
        { $ref: '#/$defs/requiresConstraint' },
        { $ref: '#/$defs/countConstraint' },
        { $ref: '#/$defs/allOrNoneConstraint' },
      ],
    },
    output: {
      type: 'object',
      additionalProperties: false,
      required: ['id', 'format'],
      properties: {
        id: { $ref: '#/$defs/identifier' },
        summary: { $ref: '#/$defs/nonEmptyString' },
        description: { $ref: '#/$defs/nonEmptyString' },
        format: { enum: ['json', 'ndjson', 'text', 'yaml'] },
        when: { $ref: '#/$defs/condition' },
        schema: schemaReference,
      },
    },
    exitCode: {
      type: 'object',
      additionalProperties: false,
      required: ['id', 'code', 'description'],
      properties: {
        id: { $ref: '#/$defs/identifier' },
        code: { type: 'integer', minimum: 0 },
        description: { $ref: '#/$defs/nonEmptyString' },
      },
    },
    exitCodeOrReference: {
      oneOf: [{ $ref: '#/$defs/exitCode' }, { $ref: '#/$defs/reference' }],
    },
    commandAlias: {
      type: 'object',
      additionalProperties: false,
      required: ['path'],
      properties: {
        path: {
          type: 'array',
          minItems: 1,
          items: { $ref: '#/$defs/nonEmptyString' },
        },
      },
    },
    command: {
      type: 'object',
      additionalProperties: false,
      required: ['id', 'invocation'],
      properties: {
        id: { $ref: '#/$defs/identifier' },
        invocation: {
          type: 'array',
          minItems: 1,
          items: { $ref: '#/$defs/nonEmptyString' },
        },
        aliases: {
          type: 'array',
          items: { $ref: '#/$defs/commandAlias' },
        },
        topics: {
          type: 'array',
          items: { $ref: '#/$defs/identifier' },
          uniqueItems: true,
        },
        summary: { $ref: '#/$defs/nonEmptyString' },
        description: { $ref: '#/$defs/nonEmptyString' },
        arguments: {
          type: 'array',
          items: { $ref: '#/$defs/argument' },
        },
        flags: {
          type: 'array',
          items: { $ref: '#/$defs/flag' },
        },
        constraints: {
          type: 'array',
          items: { $ref: '#/$defs/constraint' },
        },
        outputs: {
          type: 'array',
          items: { $ref: '#/$defs/output' },
        },
        exitCodes: {
          type: 'array',
          items: { $ref: '#/$defs/exitCodeOrReference' },
        },
      },
    },
    commandOrReference: {
      oneOf: [{ $ref: '#/$defs/command' }, { $ref: '#/$defs/reference' }],
    },
    components: {
      type: 'object',
      additionalProperties: false,
      properties: {
        commands: {
          type: 'object',
          additionalProperties: { $ref: '#/$defs/commandOrReference' },
        },
        exitCodes: {
          type: 'object',
          additionalProperties: { $ref: '#/$defs/exitCodeOrReference' },
        },
        topics: {
          type: 'object',
          additionalProperties: { $ref: '#/$defs/topicOrReference' },
        },
      },
    },
  },
};
