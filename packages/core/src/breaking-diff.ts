import type { CliDocumentAst, CommandAst, FlagAst, JsonPath } from './ast.js';

export type DiffSeverity = 'error' | 'info' | 'warn';

export interface CliChange {
  readonly basePath?: JsonPath;
  readonly code: string;
  readonly headPath?: JsonPath;
  readonly message: string;
  readonly severity: DiffSeverity;
}

/** @deprecated Use CliChange. */
export type BreakingChange = CliChange;

export interface BreakingDiff {
  readonly changes: readonly CliChange[];
  readonly breakingChanges: readonly BreakingChange[];
}

/** Finds changes that can invalidate consumers of the base CLI contract. */
export function findBreakingChanges(base: CliDocumentAst, head: CliDocumentAst): BreakingDiff {
  const changes: CliChange[] = [];
  if (base.cli.name !== head.cli.name)
    change(changes, 'diff/cli-name-changed', 'CLI name changed.', base.path, head.path);
  if (base.cli.commandSeparator !== head.cli.commandSeparator)
    change(
      changes,
      'diff/command-separator-changed',
      'Command separator changed.',
      base.path,
      head.path,
    );
  if (base.cli.endOfOptions && !head.cli.endOfOptions)
    change(
      changes,
      'diff/end-of-options-removed',
      'End-of-options support was removed.',
      base.path,
      head.path,
    );

  for (const baseCommand of base.commands) {
    const headCommand = head.indexes.commands.byId.get(baseCommand.id);
    if (headCommand === undefined) {
      change(
        changes,
        'diff/command-removed',
        `Command "${baseCommand.id}" was removed.`,
        baseCommand.path,
      );
      continue;
    }
    compareCommand(baseCommand, headCommand, changes);
  }
  for (const headCommand of head.commands)
    if (!base.indexes.commands.byId.has(headCommand.id))
      change(
        changes,
        'info/command-added',
        `Command "${headCommand.id}" was added.`,
        base.path,
        headCommand.path,
        'info',
      );
  return {
    changes,
    breakingChanges: changes.filter((diffChange) => diffChange.severity === 'error'),
  };
}

function compareCommand(base: CommandAst, head: CommandAst, changes: CliChange[]): void {
  const accepted = new Set([
    pathKey(head.invocation),
    ...head.aliases.map((alias) => pathKey(alias.segments)),
  ]);
  for (const path of [base.invocation, ...base.aliases.map((alias) => alias.segments)]) {
    if (!accepted.has(pathKey(path)))
      change(
        changes,
        'diff/command-path-removed',
        `Command path "${path.join(' ')}" was removed.`,
        base.path,
        head.path,
      );
  }
  compareArguments(base, head, changes);
  compareFlags(base, head, changes);
  compareCollections(
    base.constraints,
    head.constraints,
    'diff/constraint-added',
    'A command constraint was added.',
    base.path,
    head.path,
    changes,
  );
  compareById(
    base.outputs,
    head.outputs,
    'output',
    changes,
    (left, right) => left.format !== right.format || stable(left.when) !== stable(right.when),
  );
  const outputsById = new Map(head.outputs.map((output) => [output.id, output]));
  for (const output of base.outputs) {
    const candidate = outputsById.get(output.id);
    if (candidate !== undefined && stable(output.schema) !== stable(candidate.schema))
      change(
        changes,
        'warn/output-schema-changed',
        `Output "${output.id}" changed its schema.`,
        output.path,
        candidate.path,
        'warn',
      );
  }
  compareById(
    base.exitCodes,
    head.exitCodes,
    'exit-code',
    changes,
    (left, right) => left.code !== right.code,
  );
}

function compareArguments(base: CommandAst, head: CommandAst, changes: CliChange[]): void {
  const headById = new Map(head.arguments.map((argument) => [argument.id, argument]));
  for (const [index, argument] of base.arguments.entries()) {
    const candidate = headById.get(argument.id);
    if (candidate === undefined) {
      change(
        changes,
        'diff/argument-removed',
        `Argument "${argument.id}" was removed.`,
        argument.path,
        head.path,
      );
      continue;
    }
    if (head.arguments.indexOf(candidate) !== index)
      change(
        changes,
        'diff/argument-reordered',
        `Argument "${argument.id}" changed position.`,
        argument.path,
        candidate.path,
      );
    if (!argument.required && candidate.required)
      change(
        changes,
        'diff/argument-required',
        `Argument "${argument.id}" became required.`,
        argument.path,
        candidate.path,
      );
    if (
      argument.variadic !== candidate.variadic ||
      stable(argument.defaultValue) !== stable(candidate.defaultValue)
    )
      change(
        changes,
        'diff/argument-contract-changed',
        `Argument "${argument.id}" changed its value contract.`,
        argument.path,
        candidate.path,
      );
    if (stable(argument.valueSchema) !== stable(candidate.valueSchema))
      change(
        changes,
        'warn/argument-schema-changed',
        `Argument "${argument.id}" changed its value schema.`,
        argument.path,
        candidate.path,
        'warn',
      );
  }
  for (const argument of head.arguments)
    if (!base.arguments.some((item) => item.id === argument.id) && argument.required)
      change(
        changes,
        'diff/argument-added-required',
        `Required argument "${argument.id}" was added.`,
        base.path,
        argument.path,
      );
    else if (!base.arguments.some((item) => item.id === argument.id))
      change(
        changes,
        'info/argument-added',
        `Optional argument "${argument.id}" was added.`,
        base.path,
        argument.path,
        'info',
      );
}

function compareFlags(base: CommandAst, head: CommandAst, changes: CliChange[]): void {
  const headById = new Map(head.flags.map((flag) => [flag.id, flag]));
  for (const flag of base.flags) {
    const candidate = headById.get(flag.id);
    if (candidate === undefined) {
      change(
        changes,
        'diff/flag-removed',
        `Flag "--${flag.long}" was removed.`,
        flag.path,
        head.path,
      );
      continue;
    }
    const spellings = new Set(flagSpellings(candidate));
    for (const spelling of flagSpellings(flag))
      if (!spellings.has(spelling))
        change(
          changes,
          'diff/flag-spelling-removed',
          `Flag spelling "${spelling}" was removed.`,
          flag.path,
          candidate.path,
        );
    if (
      flag.kind !== candidate.kind ||
      stable(flag.defaultValue) !== stable(candidate.defaultValue) ||
      (flag.kind === 'value' &&
        candidate.kind === 'value' &&
        (flag.multiple !== candidate.multiple || (!flag.required && candidate.required)))
    )
      change(
        changes,
        'diff/flag-contract-changed',
        `Flag "--${flag.long}" changed its value contract.`,
        flag.path,
        candidate.path,
      );
    if (stable(flag.valueSchema) !== stable(candidate.valueSchema))
      change(
        changes,
        'warn/flag-schema-changed',
        `Flag "--${flag.long}" changed its value schema.`,
        flag.path,
        candidate.path,
        'warn',
      );
  }
  for (const flag of head.flags)
    if (!base.flags.some((item) => item.id === flag.id) && flag.kind === 'value' && flag.required)
      change(
        changes,
        'diff/flag-added-required',
        `Required flag "--${flag.long}" was added.`,
        base.path,
        flag.path,
      );
    else if (!base.flags.some((item) => item.id === flag.id))
      change(
        changes,
        'info/flag-added',
        `Optional flag "--${flag.long}" was added.`,
        base.path,
        flag.path,
        'info',
      );
}

function compareById<T extends { readonly id: string; readonly path: JsonPath }>(
  base: readonly T[],
  head: readonly T[],
  name: string,
  changes: CliChange[],
  changed: (base: T, head: T) => boolean,
): void {
  const candidates = new Map(head.map((item) => [item.id, item]));
  for (const item of base) {
    const candidate = candidates.get(item.id);
    if (candidate === undefined)
      change(changes, `diff/${name}-removed`, `${name} "${item.id}" was removed.`, item.path);
    else if (changed(item, candidate))
      change(
        changes,
        `diff/${name}-changed`,
        `${name} "${item.id}" changed.`,
        item.path,
        candidate.path,
      );
  }
  for (const item of head)
    if (!base.some((candidate) => candidate.id === item.id))
      change(
        changes,
        `info/${name}-added`,
        `${name} "${item.id}" was added.`,
        undefined,
        item.path,
        'info',
      );
}

function compareCollections(
  base: readonly unknown[],
  head: readonly unknown[],
  code: string,
  message: string,
  basePath: JsonPath,
  headPath: JsonPath,
  changes: CliChange[],
): void {
  const previous = new Set(base.map(stable));
  for (const item of head)
    if (!previous.has(stable(item))) change(changes, code, message, basePath, headPath);
  const next = new Set(head.map(stable));
  for (const item of base)
    if (!next.has(stable(item)))
      change(
        changes,
        'info/constraint-removed',
        'A command constraint was removed.',
        basePath,
        headPath,
        'info',
      );
}
function flagSpellings(flag: FlagAst): readonly string[] {
  return [
    `--${flag.long}`,
    ...flag.longAliases.map((name) => `--${name}`),
    ...(flag.short === undefined ? [] : [`-${flag.short}`]),
    ...flag.shortAliases.map((name) => `-${name}`),
  ];
}
function pathKey(path: readonly string[]): string {
  return JSON.stringify(path);
}
function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const object = value as Record<string, unknown>;
    return `{${sortedKeys(object)
      .map((key) => `${JSON.stringify(key)}:${stable(object[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function sortedKeys(object: Record<string, unknown>): readonly string[] {
  return Object.keys(object)
    .filter((key) => key !== 'path')
    .reduce<readonly string[]>((keys, key) => {
      const index = keys.findIndex((existing) => key.localeCompare(existing) < 0);
      return index === -1 ? [...keys, key] : [...keys.slice(0, index), key, ...keys.slice(index)];
    }, []);
}
function change(
  changes: CliChange[],
  code: string,
  message: string,
  basePath?: JsonPath,
  headPath?: JsonPath,
  severity: DiffSeverity = 'error',
): void {
  changes.push({
    code,
    message,
    severity,
    ...(basePath === undefined ? {} : { basePath }),
    ...(headPath === undefined ? {} : { headPath }),
  });
}
