import { extname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { createJiti } from 'jiti';

import type {
  AdapterDiagnostic,
  AdapterRequest,
  AdapterResult,
  ClistdAdapter,
} from '@clistd/adapter';

type JsonValue = boolean | null | number | string | readonly JsonValue[] | JsonObject;

interface JsonObject {
  readonly [key: string]: JsonValue;
}

interface CommanderAdapterOptions {
  readonly export?: string;
}

interface CommanderCommand {
  aliases(): readonly string[];
  description(): string;
  name(): string;
  summary(): string;
  readonly commands: readonly CommanderCommand[];
  readonly options: readonly CommanderOption[];
  readonly registeredArguments: readonly CommanderArgument[];
}

interface CommanderOption {
  attributeName(): string;
  readonly argChoices?: readonly unknown[];
  readonly defaultValue?: unknown;
  readonly description: string;
  readonly flags: string;
  readonly hidden: boolean;
  readonly mandatory: boolean;
  readonly optional: boolean;
  readonly required: boolean;
  readonly short?: string;
  readonly variadic: boolean;
}

interface CommanderArgument {
  name(): string;
  readonly argChoices?: readonly unknown[];
  readonly defaultValue?: unknown;
  readonly description: string;
  readonly required: boolean;
  readonly variadic: boolean;
}

export const commanderAdapter: ClistdAdapter = {
  metadata: {
    id: 'commander',
    description: 'Generate a clistd document from a Commander.js program module.',
    protocolVersion: '0.1',
  },
  adapt: adaptCommanderProgram,
};

export async function adaptCommanderProgram(request: AdapterRequest): Promise<AdapterResult> {
  const source = resolve(request.source);
  const exportName = parseOptions(request.options).export ?? 'createClistdProgram';
  const loaded = await loadModule(source);
  const factory = loaded[exportName] ?? exportedProperty(loaded.default, exportName);
  if (typeof factory !== 'function') {
    throw new Error(`Expected Commander source to export a "${exportName}" program factory.`);
  }

  const program = await factory();
  if (!isCommanderCommand(program)) {
    throw new Error(`The "${exportName}" factory must return a configured Commander Command.`);
  }

  const diagnostics: AdapterDiagnostic[] = [];
  if (program.options.length > 0 || program.registeredArguments.length > 0) {
    diagnostics.push({
      code: 'commander/root-command-omitted',
      message:
        'Commander options and arguments declared on the root command are omitted because clistd v0.1 models them only on named commands.',
      severity: 'warn',
    });
  }
  const commands = flattenCommands(program, [], diagnostics);
  if (commands.length === 0) {
    throw new Error('The Commander program does not declare a named subcommand.');
  }
  const document = {
    $id: createDocumentUri(source),
    specVersion: '0.1' as const,
    cli: {
      name: program.name(),
      ...(nonEmpty(program.summary()) ? { summary: program.summary() } : {}),
      ...(nonEmpty(program.description()) ? { description: program.description() } : {}),
      commandSeparator: ' ' as const,
      endOfOptions: true,
    },
    commands,
  };
  return { document, uri: document.$id, ...(diagnostics.length === 0 ? {} : { diagnostics }) };
}

async function loadModule(source: string): Promise<Record<string, unknown>> {
  if (!isTypeScriptSource(source)) {
    return (await import(pathToFileURL(source).href)) as Record<string, unknown>;
  }
  const jiti = createJiti(pathToFileURL(source).href, {
    fsCache: false,
    interopDefault: false,
    moduleCache: false,
    tryNative: true,
  });
  return (await jiti.import(source)) as Record<string, unknown>;
}

function isTypeScriptSource(source: string): boolean {
  return ['.cts', '.mts', '.ts'].includes(extname(source));
}

function parseOptions(value: unknown): CommanderAdapterOptions {
  if (value === undefined) return {};
  if (!isRecord(value) || Object.keys(value).some((key) => key !== 'export')) {
    throw new Error('Commander adapter options support only an optional "export" string.');
  }
  if (value.export !== undefined && (!nonEmpty(value.export) || typeof value.export !== 'string')) {
    throw new Error('Commander adapter option "export" must be a non-empty string.');
  }
  return value;
}

function flattenCommands(
  command: CommanderCommand,
  parentPath: readonly string[],
  diagnostics: AdapterDiagnostic[],
): readonly Record<string, unknown>[] {
  return command.commands.flatMap((child) => {
    const path = [...parentPath, child.name()];
    const converted = toCommand(child, path, diagnostics);
    return [converted, ...flattenCommands(child, path, diagnostics)];
  });
}

function toCommand(
  command: CommanderCommand,
  path: readonly string[],
  diagnostics: AdapterDiagnostic[],
): Record<string, unknown> {
  const aliases = command
    .aliases()
    .filter(nonEmpty)
    .map((alias) => ({ path: [...path.slice(0, -1), alias] }));
  const commandArguments = command.registeredArguments.map((argument) =>
    toArgument(argument, diagnostics),
  );
  const flags = command.options.flatMap((option) => toFlag(option, diagnostics));
  return {
    id: path.join('.'),
    invocation: path,
    ...(aliases.length === 0 ? {} : { aliases }),
    ...(nonEmpty(command.summary()) ? { summary: command.summary() } : {}),
    ...(nonEmpty(command.description()) ? { description: command.description() } : {}),
    ...(commandArguments.length === 0 ? {} : { arguments: commandArguments }),
    ...(flags.length === 0 ? {} : { flags }),
  };
}

function toArgument(
  argument: CommanderArgument,
  diagnostics: AdapterDiagnostic[],
): Record<string, unknown> {
  const name = argument.name();
  return {
    id: normalizeIdentifier(name),
    name,
    required: argument.required,
    variadic: argument.variadic,
    ...(nonEmpty(argument.description) ? { description: argument.description } : {}),
    ...jsonDefault(argument.defaultValue, `argument "${name}"`, diagnostics),
    valueSchema: valueSchema(argument.argChoices, `argument "${name}"`, diagnostics),
  };
}

function toFlag(
  option: CommanderOption,
  diagnostics: AdapterDiagnostic[],
): readonly Record<string, unknown>[] {
  const longNames = option.flags.match(/--[^,|\s]+/gu) ?? [];
  const primary = option.flags.includes(option.short ?? '') ? longNames.at(-1) : longNames[0];
  if (primary === undefined) {
    diagnostics.push({
      code: 'commander/short-only-option-omitted',
      message: `Commander option "${option.flags}" is omitted because clistd requires a long flag name.`,
      severity: 'warn',
    });
    return [];
  }
  const aliases = longNames.filter((name) => name !== primary).map((name) => name.slice(2));
  const takesValue = option.required || option.optional;
  const valueName = option.flags.match(/(?:<|\[)([A-Za-z0-9_-]+)(?:\.\.\.)?(?:>|\])/u)?.[1];
  const common = {
    id: normalizeIdentifier(option.attributeName()),
    long: primary.slice(2),
    ...(option.short === undefined ? {} : { short: option.short.slice(1) }),
    ...(aliases.length === 0 ? {} : { longAliases: aliases }),
    ...(nonEmpty(option.description) ? { description: option.description } : {}),
    ...(option.hidden ? { hidden: true } : {}),
  };
  if (!takesValue) {
    return [
      {
        ...common,
        kind: 'boolean',
        ...jsonDefault(option.defaultValue, `option "${option.flags}"`, diagnostics),
        valueSchema: { type: 'boolean' },
      },
    ];
  }
  return [
    {
      ...common,
      ...(option.mandatory ? { required: true } : {}),
      ...(option.variadic ? { multiple: true } : {}),
      ...(valueName === undefined ? {} : { valueName }),
      ...jsonDefault(option.defaultValue, `option "${option.flags}"`, diagnostics),
      valueSchema: option.variadic
        ? {
            type: 'array',
            items: valueSchema(option.argChoices, `option "${option.flags}"`, diagnostics),
          }
        : valueSchema(option.argChoices, `option "${option.flags}"`, diagnostics),
    },
  ];
}

function valueSchema(
  choices: readonly unknown[] | undefined,
  subject: string,
  diagnostics: AdapterDiagnostic[],
): Record<string, unknown> {
  if (choices === undefined || choices.length === 0) return { type: 'string' };
  if (choices.every(isJsonValue)) return { enum: choices };
  diagnostics.push({
    code: 'commander/non-json-choices-omitted',
    message: `Choices for ${subject} are omitted because they are not JSON values.`,
    severity: 'warn',
  });
  return { type: 'string' };
}

function jsonDefault(
  value: unknown,
  subject: string,
  diagnostics: AdapterDiagnostic[],
): Record<string, unknown> {
  if (value === undefined) return {};
  if (isJsonValue(value)) return { default: value };
  diagnostics.push({
    code: 'commander/non-json-default-omitted',
    message: `Default for ${subject} is omitted because it is not a JSON value.`,
    severity: 'warn',
  });
  return {};
}

function isCommanderCommand(value: unknown): value is CommanderCommand {
  return (
    isRecord(value) &&
    typeof value.name === 'function' &&
    typeof value.description === 'function' &&
    typeof value.summary === 'function' &&
    typeof value.aliases === 'function' &&
    Array.isArray(value.commands) &&
    Array.isArray(value.options) &&
    Array.isArray(value.registeredArguments)
  );
}

function exportedProperty(value: unknown, property: string): unknown {
  return isRecord(value) ? value[property] : undefined;
}

function normalizeIdentifier(value: string): string {
  const normalized = value.replace(/[^A-Za-z0-9._-]/gu, '-');
  return /^[A-Za-z]/u.test(normalized) ? normalized : `value-${normalized}`;
}

function nonEmpty(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object';
}

function isJsonValue(value: unknown): value is JsonValue {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (Array.isArray(value)) return value.every(isJsonValue);
  return (
    isRecord(value) &&
    (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null) &&
    Object.values(value).every(isJsonValue)
  );
}

function createDocumentUri(source: string): string {
  return `urn:clistd:adapter:commander:${encodeURIComponent(pathToFileURL(source).href)}`;
}
