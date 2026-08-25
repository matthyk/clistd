import { rename, rm, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { dirname, resolve } from 'node:path';

import { Command, Constraints, Flags } from '@oclif/core';

import { createAdapterRegistry, createProcessAdapter } from '@clistd/adapter';
import type { ClistdAdapter } from '@clistd/adapter';
import { commanderAdapter } from '@clistd/adapter-commander';
import { oclifAdapter } from '@clistd/adapter-oclif';
import { cligRules } from '@clistd/clig-rules';
import { buildDocument } from '@clistd/core';
import type { CliDocumentAst, DocumentDiagnostic } from '@clistd/core';
import { createRuleRegistry, runRules } from '@clistd/linter';
import { recommendedRules } from '@clistd/recommend-rules';

import { loadConfiguration } from '../config.js';
import {
  describeDiagnosticLocation,
  formatLintDiagnostics,
  toDiagnosticJson,
} from '../diagnostics.js';
import { loadAdapterDocument, loadDocument } from '../document-loader.js';
import { formatPromptReport, LINT_REPORT_VERSION } from '../lint-report.js';
import type { LintReport } from '../lint-report.js';

interface DiagnosticGroup {
  readonly diagnostics: readonly DocumentDiagnostic[];
  readonly kind: 'configuration' | 'document';
  readonly source: string;
}

export default class Lint extends Command {
  public static enableJsonFlag = true;

  public static readonly description =
    'Validate and lint a clistd document from a file or adapter.';

  public static readonly flags = {
    adapter: Flags.string({
      description: 'Name of a built-in or configured adapter.',
    }),
    adapterr: Flags.string({
      description: 'Name of a built-in or configured adapter.',
    }),
    config: Flags.string({ char: 'c', description: 'Path to a clistd configuration file.' }),
    file: Flags.string({ description: 'Path to a canonical clistd JSON or YAML document.' }),
    format: Flags.string({
      description: 'Write a report as FORMAT=FILE. Repeat for each report.',
      multiple: true,
    }),
    'rule-module': Flags.string({
      description: 'Load rules from an ESM module. Repeat to load multiple modules.',
      multiple: true,
    }),
    source: Flags.string({
      description: 'Root directory or identifier consumed by the selected adapter.',
    }),
  };

  public static constraints: Array<ReturnType<typeof Constraints.flag>> = [
    Constraints.flags('file', 'adapter').are.mutuallyExclusive(),
    Constraints.flags('file', 'adapter').are.requiredAny(),
    Constraints.flags('adapter', 'source').are.mutuallyDependent(),
  ];

  public async run(): Promise<LintReport> {
    const { flags } = await this.parse(Lint);
    const outputs = this.resolveOutputs(flags.format);
    const builtInRegistry = createRuleRegistry([...recommendedRules, ...cligRules]);
    const searchDirectory =
      flags.file === undefined ? resolve(flags.source ?? '.') : dirname(resolve(flags.file));
    const configuration = await loadConfiguration(builtInRegistry, searchDirectory, flags.config, {
      reservedAdapterIds: [oclifAdapter.metadata.id, commanderAdapter.metadata.id],
      ruleModules: flags['rule-module'],
    });
    const registry = configuration.registry ?? builtInRegistry;
    const adapters = createAdapterRegistry([
      oclifAdapter,
      commanderAdapter,
      ...configuration.adapters.map((adapter) =>
        createProcessAdapter(
          {
            id: adapter.id,
            description: `Configured external adapter "${adapter.id}".`,
            protocolVersion: '0.1',
          },
          adapter,
        ),
      ),
    ]);
    const adapterOptions = new Map(
      configuration.adapters.map((adapter) => [adapter.id, adapter.options] as const),
    );
    const document =
      flags.file === undefined
        ? await this.loadFromAdapter(flags.adapter, flags.source, adapters, adapterOptions)
        : await loadDocument(flags.file);

    const documentSource = document.input.uri ?? flags.file ?? flags.source ?? '--source';
    const configurationSource = configuration.path ?? '--config';
    const groups: DiagnosticGroup[] = [
      { diagnostics: document.diagnostics, kind: 'document', source: documentSource },
      {
        diagnostics: configuration.diagnostics,
        kind: 'configuration',
        source: configurationSource,
      },
    ];
    let ast: CliDocumentAst | undefined;
    if (document.diagnostics.length === 0 && configuration.diagnostics.length === 0) {
      const build = await buildDocument(document.input);
      groups[0] = { diagnostics: build.diagnostics, kind: 'document', source: documentSource };
      if (build.ok) {
        ast = build.ast;
        groups[0] = {
          diagnostics: [
            ...build.diagnostics,
            ...runRules(build.ast, registry, configuration.configuration),
          ],
          kind: 'document',
          source: documentSource,
        };
      }
    }

    const diagnostics = groups.flatMap((group) => group.diagnostics);
    const errors = diagnostics.filter((diagnostic) => diagnostic.severity === 'error').length;
    let report: LintReport = {
      reportVersion: LINT_REPORT_VERSION,
      diagnostics: groups.flatMap((group) =>
        toDiagnosticJson(group.diagnostics, group.source, (diagnostic) =>
          describeDiagnosticLocation(diagnostic, group.kind, ast),
        ),
      ),
      errorCount: errors,
      warningCount: diagnostics.length - errors,
    };
    if (
      outputs.some(({ format }) => format === 'prompt') &&
      flags.adapter !== undefined &&
      flags.source !== undefined
    ) {
      report = await this.enrichPrompts(
        report,
        adapters.get(flags.adapter),
        flags.source,
        adapterOptions.get(flags.adapter),
      );
    }

    await this.writeReports(outputs, report);
    if (!this.jsonEnabled() && outputs.length === 0) {
      const output = formatLintDiagnostics(groups, ast);
      if (output.length > 0) this.log(output);
    }
    if (errors > 0) process.exitCode = 1;
    return report;
  }

  private resolveOutputs(formats: readonly string[] | undefined): readonly ReportOutput[] {
    if (formats === undefined) return [];

    const outputFormats = new Set<ReportFormat>();
    const destinations = new Set<string>();
    return formats.map((value) => {
      let output: ReportOutput;
      try {
        output = parseReportOutput(value);
      } catch (error) {
        this.error(error instanceof Error ? error.message : 'Invalid report output.', { exit: 2 });
      }
      if (outputFormats.has(output.format)) {
        this.error(`The ${output.format} report format was specified more than once.`, { exit: 2 });
      }
      if (destinations.has(output.destination)) {
        this.error(`The output file "${output.destination}" was specified more than once.`, {
          exit: 2,
        });
      }
      outputFormats.add(output.format);
      destinations.add(output.destination);
      return output;
    });
  }

  private async writeReports(outputs: readonly ReportOutput[], report: LintReport): Promise<void> {
    for (const { format, destination } of outputs) {
      await writeReport(destination, `${this.formatReport(format, report)}\n`);
    }
  }

  private formatReport(format: ReportFormat, report: LintReport): string {
    switch (format) {
      case 'json': {
        return JSON.stringify(report, undefined, 2);
      }
      case 'prompt': {
        return formatPromptReport(report);
      }
    }
  }

  private async enrichPrompts(
    report: LintReport,
    adapter: ClistdAdapter | undefined,
    source: string,
    options: unknown,
  ): Promise<LintReport> {
    if (adapter?.prompt === undefined) return report;
    try {
      const result = await adapter.prompt({
        protocolVersion: '0.1',
        source,
        ...(options === undefined ? {} : { options }),
        diagnostics: report.diagnostics.map((diagnostic) => ({
          code: diagnostic.code,
          ...(diagnostic.location === undefined ? {} : { location: diagnostic.location }),
          message: diagnostic.message,
          ...(diagnostic.prompt === undefined ? {} : { prompt: diagnostic.prompt }),
          severity: diagnostic.severity,
        })),
      });
      const prompts = new Map(
        result.prompts.map((prompt) => [prompt.diagnosticIndex, prompt.prompt]),
      );
      return {
        ...report,
        diagnostics: report.diagnostics.map((diagnostic, index) => {
          const adapterPrompt = prompts.get(index);
          return adapterPrompt === undefined ? diagnostic : { ...diagnostic, adapterPrompt };
        }),
      };
    } catch {
      return report;
    }
  }

  private async loadFromAdapter(
    adapterName: string | undefined,
    source: string | undefined,
    adapters: ReturnType<typeof createAdapterRegistry>,
    adapterOptions: ReadonlyMap<string, unknown>,
  ) {
    if (adapterName === undefined || source === undefined) {
      throw new Error('Adapter input was not validated.');
    }
    const adapter = adapters.get(adapterName);
    if (adapter === undefined) {
      return {
        input: { uri: `urn:clistd:adapter:${encodeURIComponent(adapterName)}`, value: undefined },
        diagnostics: [
          {
            code: 'adapter/unknown',
            message: `No adapter named "${adapterName}" is available.`,
            severity: 'error' as const,
            paths: [[]],
          },
        ],
      };
    }
    try {
      return await loadAdapterDocument(adapter, source, adapterOptions.get(adapterName));
    } catch (error: unknown) {
      this.error(
        error instanceof Error ? error.message : 'The adapter could not produce a document.',
        {
          exit: 2,
        },
      );
    }
  }
}

type ReportFormat = 'json' | 'prompt';

interface ReportOutput {
  readonly destination: string;
  readonly format: ReportFormat;
}

function parseReportOutput(value: string): ReportOutput {
  const separator = value.indexOf('=');
  const format = value.slice(0, Math.max(separator, 0));
  const destination = value.slice(separator + 1);
  if (separator < 1 || destination.length === 0) {
    throw new Error(`Expected --format to use FORMAT=FILE, received "${value}".`);
  }
  if (format !== 'json' && format !== 'prompt') {
    throw new Error(`Unsupported report format "${format}". Use json or prompt.`);
  }
  if (destination === '-') {
    throw new Error('Report formats must write to a file; use --json for JSON on stdout.');
  }
  return { destination: resolve(destination), format };
}

async function writeReport(destination: string, contents: string): Promise<void> {
  const temporaryPath = `${destination}.clistd-${randomUUID()}.tmp`;
  try {
    await writeFile(temporaryPath, contents);
    await rename(temporaryPath, destination);
  } catch (error) {
    await rm(temporaryPath, { force: true });
    throw error;
  }
}
