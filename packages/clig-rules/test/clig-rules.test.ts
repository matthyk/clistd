import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  cligRules,
  commandNameStyle,
  noSecretValueFlag,
  preferFlagsToArguments,
  requireFailureExitCode,
  requireJsonOutputFlag,
  requireSuccessExitCode,
  standardFlagNames,
} from '@clistd/clig-rules';
import type { Rule, RuleContext, RuleReport } from '@clistd/linter';

type Visitor = ReturnType<Rule['create']>;

test('exports the ordered CLIG rule set with disabled exit-code contracts', () => {
  assert.deepEqual(cligRules, [
    commandNameStyle,
    standardFlagNames,
    preferFlagsToArguments,
    noSecretValueFlag,
    requireJsonOutputFlag,
    requireSuccessExitCode,
    requireFailureExitCode,
  ]);
  assert.deepEqual(
    cligRules.map((rule) => rule.meta.id),
    [
      'clig/command-name-style',
      'clig/standard-flag-names',
      'clig/prefer-flags-to-arguments',
      'clig/no-secret-value-flag',
      'clig/require-json-output-flag',
      'clig/require-success-exit-code',
      'clig/require-failure-exit-code',
    ],
  );
  assert.equal(requireSuccessExitCode.meta.defaultSeverity, 'off');
  assert.equal(requireFailureExitCode.meta.defaultSeverity, 'off');
  assert.equal(requireJsonOutputFlag.meta.defaultSeverity, 'off');
});

test('enforces document-observable naming and flag conventions', () => {
  const invalidName = { kind: 'document', path: [], cli: { name: 'MyCLI' } };
  assert.deepEqual(runCallback(commandNameStyle, 'onDocument', invalidName), [
    {
      message: 'CLI names should contain only lowercase letters and optional dashes.',
      node: invalidName,
    },
  ]);

  const help = { kind: 'boolean', path: [], long: 'help' };
  assert.deepEqual(runCallback(standardFlagNames, 'onBooleanFlag', help), [
    { message: 'The --help flag should use -h as its short form.', node: help },
  ]);

  const secret = { kind: 'value', path: [], long: 'api-key' };
  assert.deepEqual(runCallback(noSecretValueFlag, 'onValueFlag', secret), [
    {
      message:
        'The --api-key flag appears to accept a secret; secrets should not be passed as flags.',
      node: secret,
    },
  ]);
});

test('checks positional arguments, JSON output, and exit-code contracts', () => {
  const command = {
    kind: 'command',
    path: [],
    arguments: [
      { kind: 'argument', path: ['arguments', 0], required: true, variadic: false },
      { kind: 'argument', path: ['arguments', 1], required: true, variadic: false },
    ],
    flags: [],
    outputs: [{ kind: 'output', path: ['outputs', 0], format: 'json' }],
    exitCodes: [],
  };
  assert.equal(runCallback(preferFlagsToArguments, 'onCommand', command).length, 1);
  assert.deepEqual(runCallback(requireJsonOutputFlag, 'onCommand', command), [
    { message: 'Commands declaring JSON output should provide a --json flag.', node: command },
  ]);
  assert.equal(runCallback(requireSuccessExitCode, 'onCommand', command).length, 1);
  assert.equal(runCallback(requireFailureExitCode, 'onCommand', command).length, 1);
});

function runCallback(rule: Rule, callback: keyof Visitor, node: object): readonly RuleReport[] {
  const reports: RuleReport[] = [];
  const visitor = rule.create({
    report(report: RuleReport) {
      reports.push(report);
    },
  } as RuleContext);
  const handler = visitor[callback] as ((value: object) => void) | undefined;
  handler?.(node);
  return reports;
}
