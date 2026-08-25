import { execFile } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { promisify } from 'node:util';

import { Command, Flags } from '@oclif/core';

import { createAdapterRegistry, createProcessAdapter } from '@clistd/adapter';
import { commanderAdapter } from '@clistd/adapter-commander';
import { oclifAdapter } from '@clistd/adapter-oclif';
import { buildDocument, findBreakingChanges } from '@clistd/core';
import type { DocumentDiagnostic } from '@clistd/core';
import { createRuleRegistry } from '@clistd/linter';

import { loadConfiguration } from '../../config.js';
import { formatBreakingChanges, formatDiagnostics, toDiagnosticJson } from '../../diagnostics.js';
import { loadAdapterDocument, loadDocument } from '../../document-loader.js';
import { DIFF_REPORT_VERSION } from '../../diff-report.js';
import type { DiffInputDiagnostic, DiffReport } from '../../diff-report.js';

const execFileAsync = promisify(execFile);

interface SourceResolution {
  readonly cleanup: () => Promise<void>;
  readonly source: string;
  readonly sourceIdentity: string;
}

export default class DiffBreaking extends Command {
  public static enableJsonFlag = true;
  public static readonly description = 'Detect breaking changes between two clistd documents.';
  public static readonly flags = {
    adapter: Flags.string({ description: 'Name of a built-in or configured adapter.' }),
    base: Flags.string({ description: 'Base document path or adapter source.', required: true }),
    'base-ref': Flags.string({ description: 'Local Git ref used for the base source.' }),
    config: Flags.string({ char: 'c', description: 'Path to a clistd configuration file.' }),
    'fail-on': Flags.string({
      default: 'error',
      description: 'Lowest change severity that makes the command fail.',
      options: ['error', 'warn', 'info', 'none'],
    }),
    head: Flags.string({ description: 'Head document path or adapter source.', required: true }),
    'head-ref': Flags.string({ description: 'Local Git ref used for the head source.' }),
    repo: Flags.string({ description: 'Git repository used with --base-ref or --head-ref.' }),
  };

  public async run(): Promise<DiffReport> {
    const { flags } = await this.parse(DiffBreaking);
    const base = await resolveSource(flags.base, flags['base-ref'], flags.repo, 'base');
    const head = await resolveSource(flags.head, flags['head-ref'], flags.repo, 'head');
    try {
      const configuration = await loadConfiguration(
        createRuleRegistry([]),
        flags.adapter === undefined ? dirname(resolve(base.source)) : resolve(base.source),
        flags.config,
        { reservedAdapterIds: [oclifAdapter.metadata.id, commanderAdapter.metadata.id] },
      );
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
      const options = new Map(
        configuration.adapters.map((adapter) => [adapter.id, adapter.options] as const),
      );
      const loaded = await Promise.all([
        this.load(flags.adapter, base.source, adapters, options),
        this.load(flags.adapter, head.source, adapters, options),
      ]);
      const builds = await Promise.all(
        loaded.map(async (document) =>
          document.diagnostics.length === 0 ? buildDocument(document.input) : undefined,
        ),
      );
      const inputDiagnostics: Array<{
        readonly diagnostic: DocumentDiagnostic;
        readonly side: DiffInputDiagnostic['side'];
      }> = [
        ...configuration.diagnostics.map((diagnostic) => ({
          side: 'configuration' as const,
          diagnostic,
        })),
        ...loaded.flatMap((document, index) =>
          document.diagnostics.map((diagnostic) => ({
            side: index === 0 ? ('base' as const) : ('head' as const),
            diagnostic,
          })),
        ),
        ...builds.flatMap((build, index) =>
          build === undefined
            ? []
            : build.diagnostics.map((diagnostic) => ({
                side: index === 0 ? ('base' as const) : ('head' as const),
                diagnostic,
              })),
        ),
      ];
      const baseBuild = builds[0];
      const headBuild = builds[1];
      const valid =
        configuration.diagnostics.length === 0 && baseBuild?.ok === true && headBuild?.ok === true;
      const diff =
        baseBuild?.ok === true && headBuild?.ok === true
          ? findBreakingChanges(baseBuild.ast, headBuild.ast)
          : { changes: [], breakingChanges: [] };
      const report = {
        reportVersion: DIFF_REPORT_VERSION,
        base: { source: base.sourceIdentity },
        head: { source: head.sourceIdentity },
        diagnostics: inputDiagnostics.map(({ side, diagnostic }) => ({
          side,
          ...toDiagnosticJson([diagnostic])[0],
        })),
        changes: diff.changes.map((change) => ({
          ...change,
          basePath: change.basePath?.map(String).join('/'),
          headPath: change.headPath?.map(String).join('/'),
        })),
        changeCount: diff.changes.length,
        breakingChanges: diff.breakingChanges.map((change) => ({
          ...change,
          basePath: change.basePath?.map(String).join('/'),
          headPath: change.headPath?.map(String).join('/'),
        })),
        breakingChangeCount: diff.breakingChanges.length,
      };
      if (!this.jsonEnabled()) {
        const formattedDiff = formatBreakingChanges(
          diff.changes,
          baseBuild?.ok === true ? baseBuild.ast : undefined,
          headBuild?.ok === true ? headBuild.ast : undefined,
        );
        if (formattedDiff.length > 0) this.log(formattedDiff);
        for (const { side, diagnostic } of inputDiagnostics)
          this.log(formatDiagnostics([diagnostic], side));
      }
      if (!valid) process.exitCode = 2;
      else if (shouldFail(diff.changes, parseFailOn(flags['fail-on']))) process.exitCode = 1;
      return report;
    } finally {
      await Promise.all([base.cleanup(), head.cleanup()]);
    }
  }

  private async load(
    adapterName: string | undefined,
    source: string,
    adapters: ReturnType<typeof createAdapterRegistry>,
    options: ReadonlyMap<string, unknown>,
  ) {
    if (adapterName === undefined) return loadDocument(source);
    const adapter = adapters.get(adapterName);
    if (adapter === undefined)
      return {
        input: { value: undefined },
        diagnostics: [
          {
            code: 'adapter/unknown',
            message: `No adapter named "${adapterName}" is available.`,
            severity: 'error' as const,
            paths: [[]],
          },
        ] satisfies readonly DocumentDiagnostic[],
      };
    return loadAdapterDocument(adapter, source, options.get(adapterName));
  }
}

function shouldFail(
  changes: readonly { readonly severity: 'error' | 'info' | 'warn' }[],
  failOn: 'error' | 'info' | 'none' | 'warn',
): boolean {
  if (failOn === 'none') return false;
  const threshold = { error: 3, warn: 2, info: 1 } as const;
  return changes.some((change) => threshold[change.severity] >= threshold[failOn]);
}

function parseFailOn(value: string): 'error' | 'info' | 'none' | 'warn' {
  if (value === 'error' || value === 'info' || value === 'none' || value === 'warn') return value;
  throw new Error(`Invalid --fail-on value "${value}".`);
}

async function resolveSource(
  source: string,
  ref: string | undefined,
  repository: string | undefined,
  side: string,
): Promise<SourceResolution> {
  if (ref === undefined) return { source, sourceIdentity: source, cleanup: async () => {} };
  if (isAbsolute(source))
    throw new Error(`Git ${side} sources must be relative to the repository.`);
  const repo =
    repository === undefined
      ? await gitOutput(process.cwd(), ['rev-parse', '--show-toplevel'])
      : resolve(repository);
  const commit = await gitOutput(repo, ['rev-parse', '--verify', `${ref}^{commit}`]);
  const directory = await mkdtemp(join(tmpdir(), 'clistd-diff-'));
  const worktree = join(directory, side);
  try {
    await execFileAsync('git', ['-C', repo, 'worktree', 'add', '--detach', worktree, commit]);
  } catch (error) {
    await rm(directory, { force: true, recursive: true });
    throw error;
  }
  return {
    source: join(worktree, source),
    sourceIdentity: `git:${commit}:${source}`,
    cleanup: async () => {
      try {
        await execFileAsync('git', ['-C', repo, 'worktree', 'remove', '--force', worktree]);
      } finally {
        await rm(directory, { force: true, recursive: true });
      }
    },
  };
}

async function gitOutput(repository: string, args: readonly string[]): Promise<string> {
  const { stdout } = await execFileAsync('git', ['-C', repository, ...args]);
  return stdout.trim();
}
