import { ux } from '@oclif/core';

import type {
  BreakingChange,
  CliDocumentAst,
  CommandAst,
  DocumentDiagnostic,
  JsonPath,
} from '@clistd/core';

export interface DiagnosticJson {
  readonly code: string;
  readonly message: string;
  readonly severity: 'warn' | 'error';
  readonly paths: readonly string[];
  /** Human-readable semantic location, when the document could be normalized. */
  readonly location?: string;
  readonly adapterPrompt?: string;
  readonly prompt?: string;
  readonly source?: string;
}

export interface DiagnosticPresentationGroup {
  readonly diagnostics: readonly DocumentDiagnostic[];
  readonly kind: 'configuration' | 'document';
}

export function formatDiagnostics(
  diagnostics: readonly DocumentDiagnostic[],
  source: string,
  showPrompts = false,
): string {
  if (diagnostics.length === 0) return `${source}: no diagnostics`;

  return diagnostics
    .map((diagnostic) => {
      const locations = diagnostic.paths.map(formatPath).join(', ');
      const prompt =
        showPrompts && diagnostic.prompt !== undefined ? `\n  prompt: ${diagnostic.prompt}` : '';
      return `${source}:${locations} ${diagnostic.severity} ${diagnostic.code}: ${diagnostic.message}${prompt}`;
    })
    .join('\n');
}

/** Formats lint findings in a compact, command-grouped human presentation. */
export function formatLintDiagnostics(
  diagnosticGroups: readonly DiagnosticPresentationGroup[],
  document?: CliDocumentAst,
): string {
  const groups = new Map<string, FormattedDiagnosticGroup>();
  for (const diagnosticGroup of diagnosticGroups) {
    for (const diagnostic of diagnosticGroup.diagnostics) {
      const group = diagnosticGroupFor(diagnostic, diagnosticGroup.kind, document);
      const existing = groups.get(group.key);
      if (existing === undefined) groups.set(group.key, { ...group, diagnostics: [diagnostic] });
      else existing.diagnostics.push(diagnostic);
    }
  }
  const diagnostics = diagnosticGroups.flatMap((group) => group.diagnostics);
  if (diagnostics.length === 0) return '';

  const findings = [...groups]
    .map(([, group]) =>
      [
        formatGroupHeading(group),
        ...group.diagnostics.map((diagnostic) => formatLintDiagnostic(diagnostic, document)),
      ].join('\n\n'),
    )
    .join('\n\n');
  return `${findings}\n\n\n${formatSummary(diagnostics)}`;
}

/** Formats compatibility findings as a concise, non-diagnostic list. */
export function formatBreakingChanges(
  changes: readonly BreakingChange[],
  base?: CliDocumentAst,
  head?: CliDocumentAst,
): string {
  if (changes.length === 0) return '';
  const bullets = changes
    .map((change) => {
      const presentation = changePresentation(change.severity);
      const location = describeChangeLocation(change, base, head);
      return [
        `  ${ux.colorize(presentation.color, presentation.icon)} ${change.severity.padEnd(7)} ${location}`,
        `             ${ux.colorize('dim', `${change.code}: ${change.message}`)}`,
      ].join('\n');
    })
    .join('\n\n');
  const counts = (['error', 'warn', 'info'] as const).map(
    (severity) => changes.filter((change) => change.severity === severity).length,
  );
  const summary = `${changes.length} changes (${counts[0]} errors, ${counts[1]} warnings, ${counts[2]} info)`;
  const highestSeverity = changes.some((change) => change.severity === 'error')
    ? 'error'
    : changes.some((change) => change.severity === 'warn')
      ? 'warn'
      : 'info';
  return `\n${bullets}\n\n\n${ux.colorize(changePresentation(highestSeverity).color, summary)}`;
}

function describeChangeLocation(
  change: BreakingChange,
  base: CliDocumentAst | undefined,
  head: CliDocumentAst | undefined,
): string {
  const document = change.basePath === undefined ? head : base;
  const path = change.basePath ?? change.headPath ?? [];
  if (document === undefined) return 'document';
  return describeDiagnosticLocation(
    { code: change.code, message: change.message, severity: 'error', paths: [path] },
    'document',
    document,
  );
}

function changePresentation(severity: BreakingChange['severity']): {
  readonly color: 'blue' | 'red' | 'yellow';
  readonly icon: '•' | '⚠' | '✖';
} {
  if (severity === 'error') return { color: 'red', icon: '✖' };
  return severity === 'warn' ? { color: 'yellow', icon: '⚠' } : { color: 'blue', icon: '•' };
}

export function toDiagnosticJson(
  diagnostics: readonly DocumentDiagnostic[],
  source?: string,
  locationForDiagnostic?: (diagnostic: DocumentDiagnostic) => string | undefined,
): readonly DiagnosticJson[] {
  return diagnostics.map((diagnostic) => ({
    code: diagnostic.code,
    message: diagnostic.message,
    severity: diagnostic.severity,
    paths: diagnostic.paths.map(formatPath),
    ...(locationForDiagnostic?.(diagnostic) === undefined
      ? {}
      : { location: locationForDiagnostic(diagnostic) }),
    ...(diagnostic.prompt === undefined ? {} : { prompt: diagnostic.prompt }),
    ...(source === undefined ? {} : { source }),
  }));
}

/** Describes a finding using the same CLI and element names as the terminal renderer. */
export function describeDiagnosticLocation(
  diagnostic: DocumentDiagnostic,
  kind: DiagnosticPresentationGroup['kind'],
  document?: CliDocumentAst,
): string {
  const group = diagnosticGroupFor(diagnostic, kind, document);
  if (!group.isCommand || document === undefined) return group.heading;
  const element = elementLabel(document, diagnostic.paths[0]);
  return element === undefined ? group.heading : `${element} in ${group.heading}`;
}

export function formatPath(path: JsonPath): string {
  return path.reduce<string>((result, segment) => {
    if (typeof segment === 'number') return `${result}[${segment}]`;
    return /^[A-Za-z_$][A-Za-z0-9_$]*$/u.test(segment)
      ? `${result}.${segment}`
      : `${result}[${JSON.stringify(segment)}]`;
  }, '$');
}

interface FormattedDiagnosticGroup {
  readonly diagnostics: DocumentDiagnostic[];
  readonly heading: string;
  readonly isCommand: boolean;
  readonly key: string;
}

function diagnosticGroupFor(
  diagnostic: DocumentDiagnostic,
  kind: DiagnosticPresentationGroup['kind'],
  document: CliDocumentAst | undefined,
): Omit<FormattedDiagnosticGroup, 'diagnostics'> {
  if (kind === 'configuration') {
    return { heading: 'configuration', isCommand: false, key: 'configuration' };
  }
  if (document !== undefined) {
    const command = findCommand(document, diagnostic.paths[0]);
    if (command !== undefined) {
      const heading = renderInvocation(document, command);
      return { heading, isCommand: true, key: `command:${heading}` };
    }
  }
  const heading = document?.cli.name ?? 'document';
  return { heading, isCommand: false, key: `document:${heading}` };
}

function formatGroupHeading(group: Omit<FormattedDiagnosticGroup, 'diagnostics'>): string {
  return ux.colorize('bold', `$ ${group.heading}`);
}

function findCommand(document: CliDocumentAst, path: JsonPath | undefined): CommandAst | undefined {
  if (path === undefined) return undefined;
  return document.commands.find((command) => isPathPrefix(command.path, path));
}

function isPathPrefix(prefix: JsonPath, path: JsonPath): boolean {
  return prefix.length <= path.length && prefix.every((segment, index) => path[index] === segment);
}

function renderInvocation(document: CliDocumentAst, command: CommandAst): string {
  const separator = document.cli.commandSeparator;
  return `${document.cli.name}${separator}${command.invocation.join(separator)}`;
}

function formatLintDiagnostic(
  diagnostic: DocumentDiagnostic,
  document: CliDocumentAst | undefined,
): string {
  const style = diagnostic.severity === 'error' ? 'red' : 'yellow';
  const icon = diagnostic.severity === 'error' ? '✖' : '⚠';
  const severity = diagnostic.severity === 'error' ? 'error' : 'warning';
  const element = document === undefined ? undefined : elementLabel(document, diagnostic.paths[0]);
  const message = element === undefined ? diagnostic.message : `${element}: ${diagnostic.message}`;
  return `  ${ux.colorize(style, icon)} ${ux.colorize(style, severity.padEnd(8))} ${message}\n             ${ux.colorize('dim', diagnostic.code)}`;
}

function elementLabel(document: CliDocumentAst, path: JsonPath | undefined): string | undefined {
  if (path === undefined) return undefined;
  const command = findCommand(document, path);
  if (command !== undefined) {
    if (command.path.length === path.length) return undefined;
    const argument = command.arguments.find((node) => isPathPrefix(node.path, path));
    if (argument !== undefined) return `argument <${argument.name}>`;
    const flag = command.flags.find((node) => isPathPrefix(node.path, path));
    if (flag !== undefined) return `flag --${flag.long}`;
    const alias = command.aliases.find((node) => isPathPrefix(node.path, path));
    if (alias !== undefined) return `alias ${alias.segments.join(document.cli.commandSeparator)}`;
    const constraint = command.constraints.find((node) => isPathPrefix(node.path, path));
    if (constraint !== undefined) return `constraint ${constraintLabel(constraint)}`;
    const output = command.outputs.find((node) => isPathPrefix(node.path, path));
    if (output !== undefined) return `output ${output.id}`;
    const exitCode = command.exitCodes.find((node) => isPathPrefix(node.path, path));
    if (exitCode !== undefined) return `exit code ${exitCode.id}`;
    return undefined;
  }
  const topic = document.topics.find((node) => isPathPrefix(node.path, path));
  if (topic !== undefined) return `topic ${topic.id}`;
  return isPathPrefix(['cli'], path) ? 'CLI' : undefined;
}

function constraintLabel(constraint: CommandAst['constraints'][number]): string {
  if (constraint.kind === 'count') return constraint.type;
  return constraint.kind === 'all-or-none' ? 'allOrNone' : 'requires';
}

function formatSummary(diagnostics: readonly DocumentDiagnostic[]): string {
  const errors = diagnostics.filter((diagnostic) => diagnostic.severity === 'error').length;
  const warnings = diagnostics.length - errors;
  const problemLabel = diagnostics.length === 1 ? 'problem' : 'problems';
  const summary = `${diagnostics.length} ${problemLabel} (${errors} ${errors === 1 ? 'error' : 'errors'}, ${warnings} ${warnings === 1 ? 'warning' : 'warnings'})`;
  return ux.colorize(errors > 0 ? 'red' : 'yellow', summary);
}
