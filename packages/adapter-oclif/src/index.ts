import { fork } from 'node:child_process';
import { access } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { Config } from '@oclif/core';
import type { Command } from '@oclif/core';

import type { AdapterRequest, AdapterResult, ClistdAdapter } from '@clistd/adapter';

type JsonValue = boolean | null | number | string | readonly JsonValue[] | JsonObject;

interface JsonObject {
  readonly [key: string]: JsonValue;
}

export const oclifAdapter: ClistdAdapter = {
  metadata: {
    id: 'oclif',
    description: 'Generate a clistd document from an Oclif CLI project root.',
    protocolVersion: '0.1',
  },
  adapt: adaptOclifProject,
};

export async function adaptOclifProject(request: AdapterRequest): Promise<AdapterResult> {
  const root = resolve(request.source);
  const sourceDiscovery = process.env.CLISTD_OCLIF_SOURCE_WORKER === '1';
  const config = await Config.load(sourceDiscovery ? { ignoreManifest: true, root } : { root });
  assertSupportedOclifVersion(config.pjson);
  const document = createOclifDocument(root, config);
  if (sourceDiscovery || !(await hasTypeScriptConfiguration(root))) {
    return { document, uri: document.$id };
  }

  const sourceDocument = await discoverSourceDocument(root);
  if (sourceDocument !== undefined && commandCount(sourceDocument) > document.commands.length) {
    return { document: sourceDocument, uri: document.$id };
  }
  return { document, uri: document.$id };
}

function createOclifDocument(root: string, config: Config) {
  return {
    $id: createDocumentUri(root),
    specVersion: '0.1' as const,
    cli: { name: config.bin, commandSeparator: config.topicSeparator, endOfOptions: true },
    commands: canonicalCommands(config.commands).map(toCommand),
  };
}

async function hasTypeScriptConfiguration(root: string): Promise<boolean> {
  try {
    await access(join(root, 'tsconfig.json'));
    return true;
  } catch {
    return false;
  }
}

async function discoverSourceDocument(root: string): Promise<unknown | undefined> {
  return await new Promise((resolveDocument) => {
    const child = fork(new URL('./source-worker.js', import.meta.url), [root], {
      env: {
        ...process.env,
        CLISTD_OCLIF_SOURCE_WORKER: '1',
        NODE_ENV: 'development',
      },
      silent: true,
    });
    const timeout = setTimeout(() => {
      child.kill();
      resolveDocument(undefined);
    }, 30_000);
    const complete = (document: unknown | undefined): void => {
      clearTimeout(timeout);
      resolveDocument(document);
    };
    child.once('error', () => complete(undefined));
    child.once('exit', () => complete(undefined));
    child.once('message', (message: unknown) => {
      if (!isRecord(message) || message.type !== 'result' || !('document' in message)) {
        complete(undefined);
        return;
      }
      complete(message.document);
    });
  });
}

function commandCount(document: unknown): number {
  return isRecord(document) && Array.isArray(document.commands) ? document.commands.length : 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function assertSupportedOclifVersion(pjson: {
  readonly dependencies?: Readonly<Record<string, string>>;
  readonly devDependencies?: Readonly<Record<string, string>>;
}): void {
  const version = pjson.dependencies?.['@oclif/core'] ?? pjson.devDependencies?.['@oclif/core'];
  // A CLI can obtain Oclif through one of its dependencies. Config.load has
  // already verified that the adapter can load its Oclif metadata in that case.
  if (version !== undefined && !/^(?:\^|~)?4(?:\.|$)/u.test(version)) {
    throw new Error(`The Oclif adapter supports @oclif/core v4. Found "${version}".`);
  }
}

interface CanonicalCommand {
  readonly aliases: readonly string[];
  readonly command: Command.Loadable;
  readonly id: string;
}

/**
 * Oclif exposes each alias as a separate loadable command. Collapse those
 * records back into the single command that users invoke through its ID and
 * aliases before producing the canonical document.
 */
function canonicalCommands(commands: readonly Command.Loadable[]): readonly CanonicalCommand[] {
  const directCommands = commands.filter((command) => !command.aliases.includes(command.id));
  const commandsWithoutDuplicateAliases = commands.filter(
    (command) =>
      !command.aliases.includes(command.id) ||
      !directCommands.some((directCommand) => directCommand.aliases.includes(command.id)),
  );
  const groups = new Map<string, Command.Loadable[]>();
  for (const command of commandsWithoutDuplicateAliases) {
    const key =
      command.relativePath === undefined
        ? command.id
        : `${command.pluginName ?? ''}\u0000${command.relativePath.join('\u0000')}`;
    const group = groups.get(key);
    if (group === undefined) groups.set(key, [command]);
    else group.push(command);
  }

  return [...groups.values()].map((group) => {
    const command =
      group.find((candidate) => !candidate.aliases.includes(candidate.id)) ?? group[0];
    if (command === undefined) throw new Error('Expected an Oclif command.');
    const id = command.permutations?.[0] ?? command.id;
    return {
      aliases: [...new Set(group.flatMap((candidate) => candidate.aliases))].filter(
        (alias) => alias !== id,
      ),
      command,
      id,
    };
  });
}

function toCommand({ aliases, command, id }: CanonicalCommand) {
  return {
    // Oclif stores topic paths with colons even when the displayed separator is a space.
    id: id.replaceAll(':', '.'),
    invocation: splitCommandPath(id),
    ...(aliases.length === 0
      ? {}
      : {
          aliases: aliases.map((alias) => ({ path: splitCommandPath(alias) })),
        }),
    ...(command.summary === undefined ? {} : { summary: command.summary }),
    ...(command.description === undefined ? {} : { description: command.description }),
    arguments: Object.values(command.args).map((argument) => {
      return {
        id: argument.name,
        name: argument.name,
        required: argument.required ?? false,
        variadic: argument.multiple ?? false,
        hidden: argument.hidden ?? false,
        ...(argument.description === undefined ? {} : { description: argument.description }),
        valueSchema: argument.multiple
          ? { type: 'array', items: valueSchema(argument.options) }
          : valueSchema(argument.options),
      };
    }),
    flags: Object.values(command.flags).map((flag) => {
      const longAliases = flag.aliases ?? [];
      const shortAliases = flag.charAliases ?? [];
      if (flag.type === 'boolean') {
        return {
          id: flag.name,
          long: flag.name,
          ...(flag.char === undefined ? {} : { short: flag.char }),
          ...(longAliases.length === 0 ? {} : { longAliases }),
          ...(shortAliases.length === 0 ? {} : { shortAliases }),
          kind: 'boolean' as const,
          hidden: flag.hidden ?? false,
          ...(flag.summary === undefined ? {} : { summary: flag.summary }),
          ...(flag.description === undefined ? {} : { description: flag.description }),
          valueSchema: { type: 'boolean' },
        };
      }
      return {
        id: flag.name,
        long: flag.name,
        ...(flag.char === undefined ? {} : { short: flag.char }),
        ...(longAliases.length === 0 ? {} : { longAliases }),
        ...(shortAliases.length === 0 ? {} : { shortAliases }),
        required: flag.required ?? false,
        multiple: flag.multiple ?? false,
        hidden: flag.hidden ?? false,
        ...(flag.summary === undefined ? {} : { summary: flag.summary }),
        ...(flag.description === undefined ? {} : { description: flag.description }),
        ...(typeof flag.helpValue === 'string' ? { valueName: flag.helpValue } : {}),
        valueSchema: flag.multiple
          ? { type: 'array', items: valueSchema(flag.options) }
          : valueSchema(flag.options),
      };
    }),
  };
}

function splitCommandPath(id: string): string[] {
  return id.split(':').filter((segment) => segment.length > 0);
}

function valueSchema(options: readonly unknown[] | undefined): {
  readonly type?: string;
  readonly enum?: readonly JsonValue[];
} {
  return options === undefined || options.length === 0 || !options.every(isJsonValue)
    ? { type: 'string' }
    : { enum: options };
}

function isJsonValue(value: unknown): value is JsonValue {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') {
    return true;
  }
  if (typeof value === 'number') return Number.isFinite(value);
  if (Array.isArray(value)) return value.every(isJsonValue);
  if (typeof value !== 'object') return false;
  if (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) {
    return false;
  }
  return Object.values(value).every(isJsonValue);
}

function createDocumentUri(root: string): string {
  return `urn:clistd:adapter:oclif:${encodeURIComponent(pathToFileURL(root).href)}`;
}
