import type { CliChange } from '@clistd/core';

/** Renders a compatibility diff as a Markdown changelog. */
export function formatChangelog(changes: readonly CliChange[]): string {
  const sections = [
    { heading: 'Breaking changes', severity: 'error' as const },
    { heading: 'Changed', severity: 'warn' as const },
    { heading: 'Added', severity: 'info' as const },
  ]
    .map(({ heading, severity }) => {
      const items = changes.filter((change) => change.severity === severity);
      if (items.length === 0) return undefined;
      return `## ${heading}\n\n${items.map((change) => `- ${change.message}`).join('\n')}`;
    })
    .filter((section): section is string => section !== undefined);

  return ['# Changelog', ...(sections.length === 0 ? ['No CLI contract changes.'] : sections)].join(
    '\n\n',
  );
}
