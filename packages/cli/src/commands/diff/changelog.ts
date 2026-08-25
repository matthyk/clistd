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

import { formatChangelog } from '../../changelog.js';
import { loadConfiguration } from '../../config.js';
import { formatDiagnostics } from '../../diagnostics.js';
import { loadAdapterDocument, loadDocument } from '../../document-loader.js';

const execFileAsync = promisify(execFile);

interface SourceResolution {
  readonly cleanup: () => Promise<void>;
  readonly source: string;
}

export default class DiffChangelog extends Command {
  public static readonly description =
    'Generate a Markdown changelog between two clistd documents.';
  public static readonly hidden = true;
  public static readonly flags = {
    adapter: Flags.string({ description: 'Name of a built-in or configured adapter.' }),
    base: Flags.string({ description: 'Base document path or adapter source.', required: true }),
    'base-ref': Flags.string({ description: 'Local Git ref used for the base source.' }),
    config: Flags.string({ char: 'c', description: 'Path to a clistd configuration file.' }),
    head: Flags.string({ description: 'Head document path or adapter source.', required: true }),
    'head-ref': Flags.string({ description: 'Local Git ref used for the head source.' }),
    repo: Flags.string({ description: 'Git repository used with --base-ref or --head-ref.' }),
  };

  public async run(): Promise<void> {
    const { flags } = await this.parse(DiffChangelog);
    const baseSource = await resolveSource(flags.base, flags['base-ref'], flags.repo, 'base');
    const headSource = await resolveSource(flags.head, flags['head-ref'], flags.repo, 'head');
    try {
      const configuration = await loadConfiguration(
        createRuleRegistry([]),
        flags.adapter === undefined
          ? dirname(resolve(baseSource.source))
          : resolve(baseSource.source),
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
        this.load(flags.adapter, baseSource.source, adapters, options),
        this.load(flags.adapter, headSource.source, adapters, options),
      ]);
      const builds = await Promise.all(
        loaded.map(async (document) =>
          document.diagnostics.length === 0 ? buildDocument(document.input) : undefined,
        ),
      );
      const diagnostics: Array<{ readonly diagnostic: DocumentDiagnostic; readonly side: string }> =
        [
          ...configuration.diagnostics.map((diagnostic) => ({ side: 'configuration', diagnostic })),
          ...loaded.flatMap((document, index) =>
            document.diagnostics.map((diagnostic) => ({
              side: index === 0 ? 'base' : 'head',
              diagnostic,
            })),
          ),
          ...builds.flatMap((build, index) =>
            build === undefined
              ? []
              : build.diagnostics.map((diagnostic) => ({
                  side: index === 0 ? 'base' : 'head',
                  diagnostic,
                })),
          ),
        ];
      const base = builds[0];
      const head = builds[1];
      if (configuration.diagnostics.length > 0 || base?.ok !== true || head?.ok !== true) {
        for (const { diagnostic, side } of diagnostics)
          this.error(formatDiagnostics([diagnostic], side));
        return;
      }
      this.log(formatChangelog(findBreakingChanges(base.ast, head.ast).changes));
    } finally {
      await Promise.all([baseSource.cleanup(), headSource.cleanup()]);
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

async function resolveSource(
  source: string,
  ref: string | undefined,
  repository: string | undefined,
  side: string,
): Promise<SourceResolution> {
  if (ref === undefined) return { source, cleanup: async () => {} };
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
