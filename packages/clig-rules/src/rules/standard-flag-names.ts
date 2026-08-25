import type { AstVisitor, Rule } from '@clistd/linter';

const STANDARD_SHORT_NAMES: Readonly<Record<string, string>> = {
  all: 'a',
  debug: 'd',
  'dry-run': 'n',
  force: 'f',
  help: 'h',
  output: 'o',
  port: 'p',
  quiet: 'q',
  user: 'u',
};

type Flag =
  | Parameters<NonNullable<AstVisitor['onBooleanFlag']>>[0]
  | Parameters<NonNullable<AstVisitor['onValueFlag']>>[0];

export const standardFlagNames: Rule = {
  meta: {
    id: 'clig/standard-flag-names',
    description: 'Require conventional short names for standard long flags.',
    defaultSeverity: 'warn',
    prompt:
      'Use the conventional short form for this standard flag, or rename the flag to avoid a misleading convention.',
  },
  create(context) {
    return {
      onBooleanFlag(flag) {
        reportIfNonstandard(flag.long, flag.short, flag);
      },
      onValueFlag(flag) {
        reportIfNonstandard(flag.long, flag.short, flag);
      },
    };

    function reportIfNonstandard(long: string, short: string | undefined, flag: Flag): void {
      const expectedShort = STANDARD_SHORT_NAMES[long];
      if (expectedShort !== undefined && short !== expectedShort) {
        context.report({
          message: `The --${long} flag should use -${expectedShort} as its short form.`,
          node: flag,
        });
      }
    }
  },
};
