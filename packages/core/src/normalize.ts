import type {
  ArgumentDefinition,
  BooleanFlagDefinition,
  CliDocument,
  CommandDefinition,
  Condition,
  Constraint,
  ExitCode,
  FlagDefinition,
  JsonSchema,
  OutputContract,
  ReferenceOr,
  Topic,
} from '@clistd/spec';

import type {
  AllOfConditionAst,
  AllOrNoneConstraintAst,
  AnyOfConditionAst,
  ArgumentAst,
  CliDocumentAst,
  CliMetadataAst,
  CommandAst,
  CommandIndexes,
  ConditionAst,
  ConstraintAst,
  CountConstraintAst,
  DocumentIndexes,
  EqualityConditionAst,
  ExitCodeAst,
  FlagAst,
  JsonPath,
  NotConditionAst,
  OutputAst,
  RequiresConstraintAst,
  TopicAst,
} from './ast.js';
import type { DocumentDiagnostic } from './diagnostics.js';

export interface NormalizationResult {
  readonly ast: CliDocumentAst;
  readonly diagnostics: readonly DocumentDiagnostic[];
}

export function normalizeDocument(document: CliDocument): NormalizationResult {
  const diagnostics: DocumentDiagnostic[] = [];
  const topics =
    document.topics?.map((topic, index) => normalizeTopic(topic, ['topics', index])) ?? [];
  const commands = document.commands.map((command, index) =>
    normalizeCommand(command, ['commands', index], diagnostics),
  );

  validateUniqueIds(topics, 'topic', diagnostics);
  validateUniqueIds(commands, 'command', diagnostics);
  validateKnownTopics(commands, topics, diagnostics);
  validateUniqueCommandPaths(commands, diagnostics);

  const indexes = createIndexes(commands, topics, diagnostics);
  const ast: CliDocumentAst = {
    kind: 'document',
    path: [],
    id: document.$id,
    specVersion: document.specVersion,
    cli: normalizeCliMetadata(document.cli),
    topics,
    commands,
    indexes,
  };

  return { ast, diagnostics };
}

function normalizeCliMetadata(metadata: CliDocument['cli']): CliMetadataAst {
  return {
    name: metadata.name,
    summary: metadata.summary,
    description: metadata.description,
    commandSeparator: metadata.commandSeparator,
    endOfOptions: metadata.endOfOptions,
  };
}

function normalizeTopic(value: ReferenceOr<Topic>, path: JsonPath): TopicAst {
  const topic = value as Topic;
  return {
    kind: 'topic',
    path,
    id: topic.id,
    title: topic.title,
    description: topic.description,
  };
}

function normalizeCommand(
  value: ReferenceOr<CommandDefinition>,
  path: JsonPath,
  diagnostics: DocumentDiagnostic[],
): CommandAst {
  const command = value as CommandDefinition;
  const argumentsValue = command.arguments ?? [];
  const flagsValue = command.flags ?? [];

  const argumentsAst = argumentsValue.map((argument, index) =>
    normalizeArgument(argument, [...path, 'arguments', index], diagnostics),
  );
  const flagsAst = flagsValue.map((flag, index) =>
    normalizeFlag(flag, [...path, 'flags', index], diagnostics),
  );
  const aliases = command.aliases ?? [];
  const outputs = command.outputs ?? [];
  const exitCodes = command.exitCodes ?? [];

  validateUniqueIds(argumentsAst, 'argument', diagnostics);
  validateUniqueIds(flagsAst, 'flag', diagnostics);
  const outputsAst = outputs.map((output, index) =>
    normalizeOutput(output, [...path, 'outputs', index], diagnostics),
  );
  validateUniqueIds(outputsAst, 'output', diagnostics);
  const exitCodesAst = exitCodes.map((exitCode, index) =>
    normalizeExitCode(exitCode, [...path, 'exitCodes', index]),
  );
  validateUniqueIds(exitCodesAst, 'exit code', diagnostics);
  validateUniqueExitCodeNumbers(exitCodesAst, diagnostics);
  validateOutputContracts(outputsAst, diagnostics);
  validateFlagNames(flagsAst, diagnostics);
  validateConstraints(command.constraints ?? [], path, argumentsAst, flagsAst, diagnostics);

  return {
    kind: 'command',
    path,
    id: command.id,
    invocation: command.invocation,
    aliases: aliases.map((alias, index) => ({
      kind: 'command-alias',
      path: [...path, 'aliases', index, 'path'],
      segments: alias.path,
    })),
    topics: command.topics ?? [],
    summary: command.summary,
    description: command.description,
    arguments: argumentsAst,
    flags: flagsAst,
    constraints: (command.constraints ?? []).map((constraint, index) =>
      normalizeConstraint(constraint, [...path, 'constraints', index]),
    ),
    outputs: outputsAst,
    exitCodes: exitCodesAst,
  };
}

function normalizeArgument(
  argument: ArgumentDefinition,
  path: JsonPath,
  diagnostics: DocumentDiagnostic[],
): ArgumentAst {
  if (argument.variadic && !isArraySchema(argument.valueSchema)) {
    diagnostics.push({
      code: 'argument/variadic-schema',
      message: 'A variadic argument must have an array valueSchema.',
      severity: 'error',
      paths: [[...path, 'valueSchema']],
    });
  }

  return {
    kind: 'argument',
    path,
    id: argument.id,
    name: argument.name,
    summary: argument.summary,
    description: argument.description,
    hidden: argument.hidden ?? false,
    required: argument.required,
    variadic: argument.variadic ?? false,
    defaultValue: argument.default,
    valueSchema: argument.valueSchema,
  };
}

function normalizeFlag(
  flag: FlagDefinition,
  path: JsonPath,
  diagnostics: DocumentDiagnostic[],
): FlagAst {
  if (isBooleanFlag(flag)) {
    return {
      kind: 'boolean',
      path,
      id: flag.id,
      long: flag.long,
      short: flag.short,
      longAliases: flag.longAliases ?? [],
      shortAliases: flag.shortAliases ?? [],
      summary: flag.summary,
      description: flag.description,
      hidden: flag.hidden ?? false,
      defaultValue: flag.default,
      valueSchema: flag.valueSchema,
    };
  }

  if (flag.multiple && !isArraySchema(flag.valueSchema)) {
    diagnostics.push({
      code: 'flag/multiple-schema',
      message: 'A multiple flag must have an array valueSchema.',
      severity: 'error',
      paths: [[...path, 'valueSchema']],
    });
  }

  return {
    kind: 'value',
    path,
    id: flag.id,
    long: flag.long,
    short: flag.short,
    longAliases: flag.longAliases ?? [],
    shortAliases: flag.shortAliases ?? [],
    summary: flag.summary,
    description: flag.description,
    hidden: flag.hidden ?? false,
    valueName: flag.valueName,
    required: flag.required ?? false,
    multiple: flag.multiple ?? false,
    defaultValue: flag.default,
    valueSchema: flag.valueSchema,
  };
}

function isBooleanFlag(flag: FlagDefinition): flag is BooleanFlagDefinition {
  return 'kind' in flag && flag.kind === 'boolean';
}

function normalizeCondition(condition: Condition, path: JsonPath): ConditionAst {
  if ('input' in condition) {
    const result: EqualityConditionAst = {
      kind: 'equality-condition',
      path,
      input: condition.input,
      equals: condition.equals,
    };
    return result;
  }

  if ('allOf' in condition) {
    const result: AllOfConditionAst = {
      kind: 'all-of-condition',
      path,
      conditions: condition.allOf.map((item, index) =>
        normalizeCondition(item, [...path, 'allOf', index]),
      ),
    };
    return result;
  }

  if ('anyOf' in condition) {
    const result: AnyOfConditionAst = {
      kind: 'any-of-condition',
      path,
      conditions: condition.anyOf.map((item, index) =>
        normalizeCondition(item, [...path, 'anyOf', index]),
      ),
    };
    return result;
  }

  const result: NotConditionAst = {
    kind: 'not-condition',
    path,
    condition: normalizeCondition(condition.not, [...path, 'not']),
  };
  return result;
}

function normalizeConstraint(constraint: Constraint, path: JsonPath): ConstraintAst {
  if (constraint.type === 'requires') {
    const result: RequiresConstraintAst = {
      kind: 'requires',
      path,
      input: constraint.input,
      allOf: constraint.allOf ?? [],
      anyOf: constraint.anyOf ?? [],
    };
    return result;
  }

  if (constraint.type === 'allOrNone') {
    const result: AllOrNoneConstraintAst = {
      kind: 'all-or-none',
      path,
      type: constraint.type,
      inputs: constraint.inputs,
    };
    return result;
  }

  const result: CountConstraintAst = {
    kind: 'count',
    path,
    type: constraint.type,
    inputs: constraint.inputs,
    count: constraint.count,
  };
  return result;
}

function normalizeOutput(
  output: ReferenceOr<OutputContract>,
  path: JsonPath,
  _diagnostics: DocumentDiagnostic[],
): OutputAst {
  const value = output as OutputContract;
  return {
    kind: 'output',
    path,
    id: value.id,
    summary: value.summary,
    description: value.description,
    format: value.format,
    when: value.when ? normalizeCondition(value.when, [...path, 'when']) : undefined,
    schema: value.schema,
  };
}

function normalizeExitCode(exitCode: ReferenceOr<ExitCode>, path: JsonPath): ExitCodeAst {
  const value = exitCode as ExitCode;
  return {
    kind: 'exit-code',
    path,
    id: value.id,
    code: value.code,
    description: value.description,
  };
}

function validateUniqueIds(
  nodes: readonly { readonly id: string; readonly path: JsonPath }[],
  kind: string,
  diagnostics: DocumentDiagnostic[],
): void {
  const seen = new Map<string, JsonPath>();
  for (const node of nodes) {
    const previousPath = seen.get(node.id);
    if (previousPath) {
      diagnostics.push({
        code: `${kind.replace(' ', '-')}/duplicate-id`,
        message: `Duplicate ${kind} id "${node.id}".`,
        severity: 'error',
        paths: [previousPath, node.path],
      });
    } else {
      seen.set(node.id, node.path);
    }
  }
}

function validateKnownTopics(
  commands: readonly CommandAst[],
  topics: readonly TopicAst[],
  diagnostics: DocumentDiagnostic[],
): void {
  const topicIds = new Set(topics.map((topic) => topic.id));
  for (const command of commands) {
    for (const [index, topicId] of command.topics.entries()) {
      if (!topicIds.has(topicId)) {
        diagnostics.push({
          code: 'command/unknown-topic',
          message: `Command refers to unknown topic "${topicId}".`,
          severity: 'error',
          paths: [[...command.path, 'topics', index]],
        });
      }
    }
  }
}

function validateUniqueCommandPaths(
  commands: readonly CommandAst[],
  diagnostics: DocumentDiagnostic[],
): void {
  const seen = new Map<string, JsonPath>();
  for (const command of commands) {
    const paths = [
      { segments: command.invocation, path: [...command.path, 'invocation'] },
      ...command.aliases.map((alias) => ({
        segments: alias.segments,
        path: alias.path,
      })),
    ];
    for (const commandPath of paths) {
      const key = JSON.stringify(commandPath.segments);
      const previousPath = seen.get(key);
      if (previousPath) {
        diagnostics.push({
          code: 'command/duplicate-path',
          message: `Duplicate command path "${commandPath.segments.join(' ')}".`,
          severity: 'error',
          paths: [previousPath, commandPath.path],
        });
      } else {
        seen.set(key, commandPath.path);
      }
    }
  }
}

function validateUniqueExitCodeNumbers(
  exitCodes: readonly ExitCodeAst[],
  diagnostics: DocumentDiagnostic[],
): void {
  const seen = new Map<number, JsonPath>();
  for (const exitCode of exitCodes) {
    const previousPath = seen.get(exitCode.code);
    if (previousPath) {
      diagnostics.push({
        code: 'exit-code/duplicate-code',
        message: `Duplicate exit code ${exitCode.code}.`,
        severity: 'error',
        paths: [previousPath, [...exitCode.path, 'code']],
      });
    } else {
      seen.set(exitCode.code, [...exitCode.path, 'code']);
    }
  }
}

function validateOutputContracts(
  outputs: readonly OutputAst[],
  diagnostics: DocumentDiagnostic[],
): void {
  const defaults = outputs.filter((output) => output.when === undefined);
  if (defaults.length > 1) {
    diagnostics.push({
      code: 'output/multiple-defaults',
      message: 'A command may have at most one output without a condition.',
      severity: 'error',
      paths: defaults.map((output) => [...output.path, 'id']),
    });
  }

  for (const output of outputs) {
    if (output.format === 'text' && output.schema !== undefined) {
      diagnostics.push({
        code: 'output/text-schema',
        message: 'Text output contracts cannot define a schema.',
        severity: 'error',
        paths: [[...output.path, 'schema']],
      });
    }
  }
}

function validateFlagNames(flags: readonly FlagAst[], diagnostics: DocumentDiagnostic[]): void {
  const seen = new Map<string, JsonPath>();
  for (const flag of flags) {
    const names = [
      { value: `--${flag.long}`, path: [...flag.path, 'long'] },
      ...(flag.short ? [{ value: `-${flag.short}`, path: [...flag.path, 'short'] }] : []),
      ...flag.longAliases.map((alias, index) => ({
        value: `--${alias}`,
        path: [...flag.path, 'longAliases', index],
      })),
      ...flag.shortAliases.map((alias, index) => ({
        value: `-${alias}`,
        path: [...flag.path, 'shortAliases', index],
      })),
    ];
    for (const name of names) {
      const previousPath = seen.get(name.value);
      if (previousPath) {
        diagnostics.push({
          code: 'flag/duplicate-name',
          message: `Duplicate flag name "${name.value}".`,
          severity: 'error',
          paths: [previousPath, name.path],
        });
      } else {
        seen.set(name.value, name.path);
      }
    }
  }
}

function validateConstraints(
  constraints: readonly Constraint[],
  commandPath: JsonPath,
  argumentsAst: readonly ArgumentAst[],
  flagsAst: readonly FlagAst[],
  diagnostics: DocumentDiagnostic[],
): void {
  const inputIds = new Set([
    ...argumentsAst.map((argument) => argument.id),
    ...flagsAst.map((flag) => flag.id),
  ]);
  for (const [index, constraint] of constraints.entries()) {
    const referencedInputs =
      constraint.type === 'requires'
        ? [constraint.input, ...(constraint.allOf ?? []), ...(constraint.anyOf ?? [])]
        : constraint.inputs;
    for (const input of referencedInputs) {
      if (!inputIds.has(input)) {
        diagnostics.push({
          code: 'constraint/unknown-input',
          message: `Constraint refers to unknown input "${input}".`,
          severity: 'error',
          paths: [[...commandPath, 'constraints', index]],
        });
      }
    }
  }
}

function createIndexes(
  commands: readonly CommandAst[],
  topics: readonly TopicAst[],
  _diagnostics: DocumentDiagnostic[],
): DocumentIndexes {
  const byId = new Map<string, CommandAst>();
  const byInvocation = new Map<string, CommandAst>();
  const inputsByCommandId = new Map<string, ReadonlyMap<string, ArgumentAst | FlagAst>>();
  const flagsByCommandId = new Map<string, ReadonlyMap<string, FlagAst>>();
  const argumentsByCommandId = new Map<string, ReadonlyMap<string, ArgumentAst>>();

  for (const command of commands) {
    byId.set(command.id, command);
    byInvocation.set(JSON.stringify(command.invocation), command);
    const inputs = new Map<string, ArgumentAst | FlagAst>();
    for (const argument of command.arguments) inputs.set(argument.id, argument);
    for (const flag of command.flags) inputs.set(flag.id, flag);
    inputsByCommandId.set(command.id, inputs);
    flagsByCommandId.set(
      command.id,
      new Map(command.flags.map((flag) => [flag.id, flag] as const)),
    );
    argumentsByCommandId.set(
      command.id,
      new Map(command.arguments.map((argument) => [argument.id, argument] as const)),
    );
  }

  const commandIndexes: CommandIndexes = {
    byId,
    byInvocation,
    inputsByCommandId,
    flagsByCommandId,
    argumentsByCommandId,
  };

  return {
    commands: commandIndexes,
    topics: new Map(topics.map((topic) => [topic.id, topic] as const)),
  };
}

function isArraySchema(schema: JsonSchema): boolean {
  if (typeof schema === 'boolean') return false;
  const type = schema.type;
  return type === 'array' || (Array.isArray(type) && type.includes('array'));
}
