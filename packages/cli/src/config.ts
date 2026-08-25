import { access, readFile } from 'node:fs/promises';
import { dirname, isAbsolute, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { load as loadYaml } from 'js-yaml';

import type { DocumentDiagnostic } from '@clistd/core';
import { createRuleRegistry } from '@clistd/linter';
import type { Rule, RuleConfiguration, RuleConfigurationMap, RuleRegistry } from '@clistd/linter';

const CONFIG_FILENAMES = ['clistd.json', 'clistd.yaml', 'clistd.yml'] as const;

export interface AdapterConfiguration {
  readonly id: string;
  readonly command: string;
  readonly args: readonly string[];
  /** The resolved process working directory; defaults to the configuration directory. */
  readonly cwd: string;
  readonly timeoutMs?: number;
  readonly maxStdoutBytes?: number;
  readonly maxStderrBytes?: number;
  readonly prompt?: boolean;
  /** JSON-serializable adapter-specific data sent as AdapterRequest.options. */
  readonly options?: unknown;
}

export interface LoadedConfiguration {
  readonly configuration: RuleConfigurationMap;
  readonly adapters: readonly AdapterConfiguration[];
  readonly diagnostics: readonly DocumentDiagnostic[];
  readonly registry?: RuleRegistry;
  readonly path?: string;
}

export async function loadConfiguration(
  registry: RuleRegistry,
  searchDirectory: string,
  explicitPath?: string,
  options: ConfigurationLoadOptions = {},
): Promise<LoadedConfiguration> {
  const path =
    explicitPath === undefined
      ? await findConfiguration(resolve(searchDirectory))
      : resolve(explicitPath);
  if (path === undefined) {
    return loadConfigurationValue({}, registry, options, resolve(searchDirectory));
  }

  let source: string;
  try {
    source = await readFile(path, 'utf8');
  } catch (error: unknown) {
    return {
      ...emptyConfiguration(registry, [errorDiagnostic(error)]),
      path,
    };
  }

  let value: unknown;
  try {
    value = path.endsWith('.json') ? JSON.parse(source) : loadYaml(source);
  } catch (error: unknown) {
    return {
      ...emptyConfiguration(registry, [parseDiagnostic(error)]),
      path,
    };
  }

  const parsed = await loadConfigurationValue(value, registry, options, dirname(path));
  return { ...parsed, path };
}

export interface ConfigurationLoadOptions {
  /** IDs reserved by built-in adapters and therefore unavailable to configuration. */
  readonly reservedAdapterIds?: readonly string[];
  /** Additional rule modules, normally supplied through the --rule-module flag. */
  readonly ruleModules?: readonly string[];
}

async function loadConfigurationValue(
  value: unknown,
  registry: RuleRegistry,
  options: ConfigurationLoadOptions,
  configurationDirectory: string,
): Promise<Omit<LoadedConfiguration, 'path'>> {
  if (!isRecord(value)) return invalidConfiguration('Configuration must be an object.', []);
  if (
    Object.keys(value).some(
      (key) => key !== '$schema' && key !== 'rules' && key !== 'adapters' && key !== 'ruleModules',
    )
  ) {
    return invalidConfiguration(
      'Configuration supports only the "$schema", "rules", "adapters", and "ruleModules" properties.',
      [],
    );
  }
  const configuredModules = parseRuleModules(value.ruleModules, configurationDirectory);
  if ('diagnostics' in configuredModules) return configuredModules;
  const moduleSpecifiers = [
    ...configuredModules,
    ...(options.ruleModules ?? []).map((specifier) =>
      resolvePathLikeString(specifier, configurationDirectory),
    ),
  ];
  const loadedRules = await loadRuleModules(moduleSpecifiers);
  if ('diagnostics' in loadedRules) return loadedRules;
  let combinedRegistry: RuleRegistry;
  try {
    combinedRegistry = createRuleRegistry([...registry.rules, ...loadedRules]);
  } catch (error: unknown) {
    return emptyConfiguration(registry, [
      {
        code: 'configuration/invalid',
        message: errorMessage(error),
        severity: 'error',
        paths: [['ruleModules']],
      },
    ]);
  }
  return parseConfiguration(value, combinedRegistry, options, configurationDirectory);
}

async function findConfiguration(startDirectory: string): Promise<string | undefined> {
  let directory = startDirectory;
  while (true) {
    for (const filename of CONFIG_FILENAMES) {
      const candidate = resolve(directory, filename);
      if (await exists(candidate)) return candidate;
    }
    const parent = dirname(directory);
    if (parent === directory) return undefined;
    directory = parent;
  }
}

function parseRuleModules(
  value: unknown,
  configurationDirectory: string,
): readonly string[] | Omit<LoadedConfiguration, 'path'> {
  if (value === undefined) return [];
  if (
    !Array.isArray(value) ||
    value.some((specifier) => typeof specifier !== 'string' || specifier.length === 0)
  ) {
    return invalidConfiguration('"ruleModules" must be an array of non-empty module specifiers.', [
      'ruleModules',
    ]);
  }
  return value.map((specifier) => resolvePathLikeString(specifier, configurationDirectory));
}

async function loadRuleModules(
  specifiers: readonly string[],
): Promise<readonly Rule[] | Omit<LoadedConfiguration, 'path'>> {
  const rules: Rule[] = [];
  for (const [index, specifier] of specifiers.entries()) {
    let module: unknown;
    try {
      module = await import(toImportSpecifier(specifier));
    } catch (error: unknown) {
      return invalidConfiguration(
        `Could not load rule module "${specifier}": ${errorMessage(error)}`,
        ['ruleModules', index],
      );
    }
    const exportedRules = getExportedRules(module);
    if (exportedRules === undefined) {
      return invalidConfiguration(
        `Rule module "${specifier}" must export a "rules" array or a default array.`,
        ['ruleModules', index],
      );
    }
    if (!exportedRules.every(isRule)) {
      return invalidConfiguration(
        `Rule module "${specifier}" exports an invalid rule. Every rule needs metadata and a create function.`,
        ['ruleModules', index],
      );
    }
    rules.push(...exportedRules);
  }
  return rules;
}

function toImportSpecifier(specifier: string): string {
  return isAbsolute(specifier) ? pathToFileURL(specifier).href : specifier;
}

function getExportedRules(module: unknown): readonly unknown[] | undefined {
  if (!isRecord(module)) return undefined;
  const candidate = module.rules ?? module.default;
  return Array.isArray(candidate) ? candidate : undefined;
}

function isRule(value: unknown): value is Rule {
  return (
    isRecord(value) &&
    isRecord(value.meta) &&
    typeof value.meta.id === 'string' &&
    value.meta.id.trim().length > 0 &&
    typeof value.meta.description === 'string' &&
    isSeverity(value.meta.defaultSeverity) &&
    typeof value.create === 'function'
  );
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown error.';
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

function parseConfiguration(
  value: Record<string, unknown>,
  registry: RuleRegistry,
  options: ConfigurationLoadOptions,
  configurationDirectory: string,
): Omit<LoadedConfiguration, 'path'> {
  const configuration: Record<string, RuleConfiguration> = {};
  if (value.rules !== undefined && !isRecord(value.rules)) {
    return invalidConfiguration('"rules" must be an object.', ['rules']);
  }
  for (const [ruleId, setting] of Object.entries(value.rules ?? {})) {
    if (registry.get(ruleId) === undefined) {
      return invalidConfiguration(`Configuration refers to an unregistered rule: "${ruleId}".`, [
        'rules',
        ruleId,
      ]);
    }
    if (isSeverity(setting)) {
      configuration[ruleId] = setting;
      continue;
    }
    if (Array.isArray(setting) && setting.length === 2 && isSeverity(setting[0])) {
      configuration[ruleId] = [setting[0], setting[1]];
      continue;
    }
    return invalidConfiguration(
      'A rule setting must be "off", "warn", "error", or [severity, options].',
      ['rules', ruleId],
    );
  }
  const adapters = parseAdapters(
    value.adapters,
    options.reservedAdapterIds ?? [],
    configurationDirectory,
  );
  if ('diagnostics' in adapters) return { ...adapters, registry };
  return { configuration, adapters, diagnostics: [], registry };
}

function parseAdapters(
  value: unknown,
  reservedAdapterIds: readonly string[],
  configurationDirectory: string,
): readonly AdapterConfiguration[] | Omit<LoadedConfiguration, 'path'> {
  if (value === undefined) return [];
  const entries = Array.isArray(value)
    ? value.map((adapter, index) => ({
        adapter,
        id: isRecord(adapter) ? adapter.id : undefined,
        index,
      }))
    : isRecord(value)
      ? Object.entries(value).map(([id, adapter]) => ({ adapter, id, index: id }))
      : undefined;
  if (entries === undefined) {
    return invalidConfiguration(
      '"adapters" must be an object or an array of ID-bearing descriptors.',
      ['adapters'],
    );
  }
  const adapters: AdapterConfiguration[] = [];
  const ids = new Set<string>();
  for (const entry of entries) {
    const path = ['adapters', entry.index] as const;
    if (!isRecord(entry.adapter) || typeof entry.id !== 'string' || entry.id.trim().length === 0) {
      return invalidConfiguration('An adapter must have a non-empty ID.', path);
    }
    if (ids.has(entry.id)) {
      return invalidConfiguration(`Adapter ID "${entry.id}" is declared more than once.`, path);
    }
    if (reservedAdapterIds.includes(entry.id)) {
      return invalidConfiguration(
        `Adapter ID "${entry.id}" is reserved by a built-in adapter and cannot be configured.`,
        path,
      );
    }
    const parsed = parseAdapterConfiguration(entry.id, entry.adapter, path, configurationDirectory);
    if ('diagnostics' in parsed) return parsed;
    ids.add(entry.id);
    adapters.push(parsed);
  }
  return adapters;
}

function parseAdapterConfiguration(
  id: string,
  value: Record<string, unknown>,
  path: readonly (string | number)[],
  configurationDirectory: string,
): AdapterConfiguration | Omit<LoadedConfiguration, 'path'> {
  const supportedKeys = new Set([
    'id',
    'command',
    'args',
    'cwd',
    'timeoutMs',
    'maxStdoutBytes',
    'maxStderrBytes',
    'options',
    'prompt',
  ]);
  const unknownKey = Object.keys(value).find((key) => !supportedKeys.has(key));
  if (unknownKey !== undefined) {
    return invalidConfiguration(`Adapter configuration does not support "${unknownKey}".`, [
      ...path,
      unknownKey,
    ]);
  }
  if (typeof value.command !== 'string' || value.command.trim().length === 0) {
    return invalidConfiguration('An adapter must provide a non-empty "command" string.', path);
  }
  const args = value.args;
  if (args !== undefined && (!Array.isArray(args) || args.some((arg) => typeof arg !== 'string'))) {
    return invalidConfiguration('Adapter "args" must be an array of strings.', [...path, 'args']);
  }
  const cwd = value.cwd;
  if (cwd !== undefined && (typeof cwd !== 'string' || cwd.length === 0)) {
    return invalidConfiguration('Adapter "cwd" must be a non-empty string.', [...path, 'cwd']);
  }
  for (const key of ['timeoutMs', 'maxStdoutBytes', 'maxStderrBytes'] as const) {
    const setting = value[key];
    if (setting !== undefined && !isPositiveSafeInteger(setting)) {
      return invalidConfiguration(`Adapter "${key}" must be a positive safe integer.`, [
        ...path,
        key,
      ]);
    }
  }
  if (value.options !== undefined && !isJsonValue(value.options)) {
    return invalidConfiguration('Adapter "options" must be JSON-serializable data.', [
      ...path,
      'options',
    ]);
  }
  if (value.prompt !== undefined && typeof value.prompt !== 'boolean') {
    return invalidConfiguration('Adapter "prompt" must be a boolean.', [...path, 'prompt']);
  }
  const timeoutMs = optionalPositiveSafeInteger(value.timeoutMs);
  const maxStdoutBytes = optionalPositiveSafeInteger(value.maxStdoutBytes);
  const maxStderrBytes = optionalPositiveSafeInteger(value.maxStderrBytes);
  return {
    id,
    command: resolvePathLikeString(value.command, configurationDirectory),
    args:
      args === undefined
        ? []
        : args.map((argument) => resolvePathLikeString(argument, configurationDirectory)),
    cwd: resolve(configurationDirectory, cwd ?? '.'),
    ...(timeoutMs === undefined ? {} : { timeoutMs }),
    ...(maxStdoutBytes === undefined ? {} : { maxStdoutBytes }),
    ...(maxStderrBytes === undefined ? {} : { maxStderrBytes }),
    ...(value.options === undefined ? {} : { options: value.options }),
    ...(value.prompt === true ? { prompt: true } : {}),
  };
}

function resolvePathLikeString(value: string, configurationDirectory: string): string {
  return isAbsolute(value) || (!value.startsWith('./') && !value.startsWith('../'))
    ? value
    : resolve(configurationDirectory, value);
}

function isJsonValue(value: unknown): boolean {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (Array.isArray(value)) return value.every(isJsonValue);
  return isRecord(value) && Object.values(value).every(isJsonValue);
}

function isPositiveSafeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
}

function optionalPositiveSafeInteger(value: unknown): number | undefined {
  return isPositiveSafeInteger(value) ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isSeverity(value: unknown): value is 'off' | 'warn' | 'error' {
  return value === 'off' || value === 'warn' || value === 'error';
}

function invalidConfiguration(
  message: string,
  path: readonly (string | number)[],
): Omit<LoadedConfiguration, 'path'> {
  return {
    configuration: {},
    adapters: [],
    diagnostics: [{ code: 'configuration/invalid', message, severity: 'error', paths: [path] }],
  };
}

function emptyConfiguration(
  registry: RuleRegistry,
  diagnostics: readonly DocumentDiagnostic[],
): Omit<LoadedConfiguration, 'path'> {
  return { configuration: {}, adapters: [], diagnostics, registry };
}

function errorDiagnostic(error: unknown): DocumentDiagnostic {
  return {
    code: 'configuration/read',
    message: error instanceof Error ? error.message : 'Could not read configuration.',
    severity: 'error',
    paths: [[]],
  };
}

function parseDiagnostic(error: unknown): DocumentDiagnostic {
  return {
    code: 'configuration/parse',
    message: error instanceof Error ? error.message : 'Could not parse configuration.',
    severity: 'error',
    paths: [[]],
  };
}
