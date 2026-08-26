import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  recommendedRules,
  requireArgumentDescription,
  requireCliDescription,
  requireCommandDescription,
  requireFlagDescription,
  requireJsonFlag,
  requireOutputDescription,
  requireSuccessExitCode,
  requireTopicDescription,
  requireValueFlagValueName,
  noDuplicateDocumentation,
  noSimilarFlagNames,
  maxCommandsPerTopic,
} from '@clistd/recommend-rules';
import type { Rule, RuleContext, RuleReport } from '@clistd/linter';

type Visitor = ReturnType<Rule['create']>;

test('exports the stable recommended rule collection in its documented order', () => {
  assert.deepEqual(recommendedRules, [
    noSimilarFlagNames,
    noDuplicateDocumentation,
    maxCommandsPerTopic,
    requireCliDescription,
    requireTopicDescription,
    requireCommandDescription,
    requireArgumentDescription,
    requireFlagDescription,
    requireJsonFlag,
    requireOutputDescription,
    requireSuccessExitCode,
    requireValueFlagValueName,
  ]);
  assert.deepEqual(
    recommendedRules.map((rule) => rule.meta.id),
    [
      'clistd/no-similar-flag-names',
      'clistd/no-duplicate-documentation',
      'clistd/max-commands-per-topic',
      'clistd/require-cli-description',
      'clistd/require-topic-description',
      'clistd/require-command-description',
      'clistd/require-argument-description',
      'clistd/require-flag-description',
      'clistd/require-json-flag',
      'clistd/require-output-description',
      'clistd/require-success-exit-code',
      'clistd/require-value-flag-value-name',
    ],
  );
  assert.equal(requireCliDescription.meta.defaultSeverity, 'off');
  assert.equal(requireSuccessExitCode.meta.defaultSeverity, 'off');
  assert.equal(requireValueFlagValueName.meta.defaultSeverity, 'off');
  assert.equal(noSimilarFlagNames.meta.defaultSeverity, 'warn');
  assert.equal(noDuplicateDocumentation.meta.defaultSeverity, 'error');
  assert.ok(
    recommendedRules
      .filter(
        (rule) =>
          rule !== requireCliDescription &&
          rule !== requireSuccessExitCode &&
          rule !== requireValueFlagValueName &&
          rule !== noDuplicateDocumentation,
      )
      .every((rule) => rule.meta.defaultSeverity === 'warn'),
  );
  assert.ok(recommendedRules.every((rule) => rule.meta.prompt !== undefined));
});

test('reports missing descriptions for documentable CLI nodes', () => {
  const cases: readonly {
    readonly rule: Rule;
    readonly callback: keyof Visitor;
    readonly node: object;
    readonly message: string;
  }[] = [
    {
      rule: requireCliDescription,
      callback: 'onDocument',
      node: { kind: 'document', path: [], cli: {} },
      message: 'CLIs need a description.',
    },
    {
      rule: requireTopicDescription,
      callback: 'onTopic',
      node: { kind: 'topic', path: ['topics', 0] },
      message: 'Topics need a description.',
    },
    {
      rule: requireCommandDescription,
      callback: 'onCommand',
      node: { kind: 'command', path: ['commands', 0] },
      message: 'Commands need a description.',
    },
    {
      rule: requireArgumentDescription,
      callback: 'onArgument',
      node: { kind: 'argument', path: ['commands', 0, 'arguments', 0], hidden: false },
      message: 'Visible arguments need a description.',
    },
    {
      rule: requireFlagDescription,
      callback: 'onBooleanFlag',
      node: { kind: 'boolean', path: ['commands', 0, 'flags', 0], hidden: false },
      message: 'Visible flags need a description.',
    },
    {
      rule: requireOutputDescription,
      callback: 'onOutput',
      node: { kind: 'output', path: ['commands', 0, 'outputs', 0] },
      message: 'Output contracts need a description.',
    },
  ];

  for (const { rule, callback, node, message } of cases) {
    const reports = runCallback(rule, callback, node);
    assert.deepEqual(reports, [{ message, node }]);
  }
});

test('does not report described nodes or hidden inputs', () => {
  assert.deepEqual(
    runCallback(requireArgumentDescription, 'onArgument', {
      kind: 'argument',
      path: [],
      hidden: true,
    }),
    [],
  );
  assert.deepEqual(
    runCallback(requireFlagDescription, 'onValueFlag', {
      kind: 'value',
      path: [],
      hidden: false,
      description: 'Select the output format.',
    }),
    [],
  );
});

test('requires a success exit-code contract', () => {
  const command = { kind: 'command', path: [], exitCodes: [] };
  assert.deepEqual(runCallback(requireSuccessExitCode, 'onCommand', command), [
    {
      message: 'Commands need an exit-code contract for successful completion (code 0).',
      node: command,
    },
  ]);
  assert.deepEqual(
    runCallback(requireSuccessExitCode, 'onCommand', {
      kind: 'command',
      path: [],
      exitCodes: [{ code: 0 }],
    }),
    [],
  );
});

test('requires readable value placeholders for value flags', () => {
  const flag = { kind: 'value', path: [], valueName: '  ' };
  assert.deepEqual(runCallback(requireValueFlagValueName, 'onValueFlag', flag), [
    {
      message: 'Value flags need a readable value placeholder.',
      node: flag,
    },
  ]);
  assert.deepEqual(
    runCallback(requireValueFlagValueName, 'onValueFlag', {
      kind: 'value',
      path: [],
      valueName: 'FILE',
    }),
    [],
  );
});

test('requires every command to provide a --json flag or alias', () => {
  const command = { kind: 'command', path: [], flags: [] };
  assert.deepEqual(runCallback(requireJsonFlag, 'onCommand', command), [
    {
      message: 'Commands should provide a --json flag for machine-readable output.',
      node: command,
    },
  ]);
  assert.deepEqual(
    runCallback(requireJsonFlag, 'onCommand', {
      kind: 'command',
      path: [],
      flags: [{ long: 'output', longAliases: ['json'] }],
    }),
    [],
  );
});

test('warns once when a topic exceeds its configured command maximum', () => {
  const reports: RuleReport[] = [];
  const visitor = maxCommandsPerTopic.create(createContext(reports, { maxCommands: 2 }));
  const topic = { kind: 'topic', path: ['topics', 0], id: 'projects' };
  const commands = [
    { kind: 'command', path: ['commands', 0], topics: ['projects'] },
    { kind: 'command', path: ['commands', 1], topics: ['projects'] },
    { kind: 'command', path: ['commands', 2], topics: ['projects'] },
    { kind: 'command', path: ['commands', 3], topics: ['projects'] },
  ];

  callVisitor(visitor, 'onTopic', topic);
  for (const command of commands) callVisitor(visitor, 'onCommand', command);

  assert.deepEqual(reports, [
    {
      message: 'Topic "projects" has more than 2 commands.',
      node: topic,
      related: [commands[2]],
    },
  ]);
});

test('reports later duplicate summaries and descriptions with their original locations', () => {
  const reports: RuleReport[] = [];
  const visitor = noDuplicateDocumentation.create(createContext(reports));
  const firstCommand = {
    kind: 'command',
    path: ['commands', 0],
    invocation: ['deploy'],
    description: 'Deploy an app.',
  };
  const secondCommand = {
    kind: 'command',
    path: ['commands', 1],
    invocation: ['release'],
    summary: 'Deploy an app.',
  };

  callVisitor(visitor, 'onCommand', firstCommand);
  callVisitor(visitor, 'onCommand', secondCommand);

  assert.deepEqual(reports, [
    {
      message: 'The summary on command release duplicates the description on command deploy.',
      node: secondCommand,
      related: [firstCommand],
    },
  ]);
});

test('allows repeated documentation on elements with the same name', () => {
  const reports: RuleReport[] = [];
  const visitor = noDuplicateDocumentation.create(createContext(reports));
  const firstJsonFlag = {
    kind: 'boolean',
    path: ['commands', 0, 'flags', 0],
    long: 'json',
    description: 'Format output as JSON.',
  };
  const secondJsonFlag = {
    kind: 'boolean',
    path: ['commands', 1, 'flags', 0],
    long: 'json',
    description: 'Format output as JSON.',
  };

  callVisitor(visitor, 'onBooleanFlag', firstJsonFlag);
  callVisitor(visitor, 'onBooleanFlag', secondJsonFlag);

  assert.deepEqual(reports, []);
});

test('warns about similar, but not identical, visible flag names', () => {
  const reports: RuleReport[] = [];
  const visitor = noSimilarFlagNames.create(createContext(reports));
  const formatFlag = {
    kind: 'value',
    path: ['commands', 0, 'flags', 0],
    hidden: false,
    long: 'format',
  };
  const formattFlag = {
    kind: 'boolean',
    path: ['commands', 1, 'flags', 0],
    hidden: false,
    long: 'formatt',
  };

  callVisitor(visitor, 'onValueFlag', formatFlag);
  callVisitor(visitor, 'onBooleanFlag', formattFlag);
  callVisitor(visitor, 'onBooleanFlag', {
    kind: 'boolean',
    path: ['commands', 2, 'flags', 0],
    hidden: false,
    long: 'format',
  });

  assert.deepEqual(reports, [
    {
      message: 'Flag --formatt is confusingly similar to --format.',
      node: formattFlag,
      related: [formatFlag],
    },
  ]);
});

function runCallback(rule: Rule, callback: keyof Visitor, node: object): readonly RuleReport[] {
  const reports: RuleReport[] = [];
  const visitor = rule.create(createContext(reports));
  callVisitor(visitor, callback, node);
  return reports;
}

function createContext(reports: RuleReport[], options: unknown = undefined): RuleContext {
  return {
    options,
    report(report: RuleReport) {
      reports.push(report);
    },
  } as RuleContext;
}

function callVisitor(visitor: Visitor, callback: keyof Visitor, node: object): void {
  const handler = visitor[callback] as ((value: object) => void) | undefined;
  handler?.(node);
}
