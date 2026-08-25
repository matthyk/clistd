import type { CliDocumentAst, DiagnosticSeverity, DocumentDiagnostic } from '@clistd/core';

import { visitAst } from './ast-visitor.js';
import type { Rule, RuleContext } from './rule.js';
import { createRuleRegistry } from './registry.js';
import type { RuleRegistry } from './registry.js';

export type RuleConfiguration =
  | ConfiguredRuleSeverity
  | readonly [severity: ConfiguredRuleSeverity, options: unknown];

export type RuleConfigurationMap = Readonly<Record<string, RuleConfiguration>>;

export function runRules(
  ast: CliDocumentAst,
  registry: RuleRegistry,
  configuration: RuleConfigurationMap = {},
): readonly DocumentDiagnostic[] {
  assertKnownRuleIds(configuration, registry);

  const enabledRules = registry.rules.flatMap((rule) => {
    const setting = resolveRuleConfiguration(rule, configuration[rule.meta.id]);
    if (setting.severity === 'off') return [];
    const severity = setting.severity;

    const diagnostics: DocumentDiagnostic[] = [];
    const context: RuleContext = {
      ast,
      indexes: ast.indexes,
      options: setting.options,
      report(report) {
        diagnostics.push({
          code: rule.meta.id,
          message: report.message,
          severity,
          paths: [report.node.path, ...(report.related ?? []).map((node) => node.path)],
          ...(rule.meta.prompt === undefined ? {} : { prompt: rule.meta.prompt }),
        });
      },
    };

    return [{ diagnostics, visitor: rule.create(context) }];
  });

  visitAst(
    ast,
    enabledRules.map((enabledRule) => enabledRule.visitor),
  );
  return enabledRules.flatMap((enabledRule) => enabledRule.diagnostics);
}

export function runRule(
  ast: CliDocumentAst,
  rule: Rule,
  configuration?: RuleConfiguration,
): readonly DocumentDiagnostic[] {
  return runRules(ast, createRuleRegistry([rule]), {
    [rule.meta.id]: configuration ?? rule.meta.defaultSeverity,
  });
}

interface ResolvedRuleConfiguration {
  readonly severity: ConfiguredRuleSeverity;
  readonly options: unknown;
}

export type ConfiguredRuleSeverity = DiagnosticSeverity | 'off';

function resolveRuleConfiguration(
  rule: Rule,
  configuration: RuleConfiguration | undefined,
): ResolvedRuleConfiguration {
  if (configuration === undefined) {
    return { severity: rule.meta.defaultSeverity, options: undefined };
  }
  if (typeof configuration === 'string') {
    return { severity: configuration, options: undefined };
  }
  return { severity: configuration[0], options: configuration[1] };
}

function assertKnownRuleIds(configuration: RuleConfigurationMap, registry: RuleRegistry): void {
  for (const ruleId of Object.keys(configuration)) {
    if (registry.get(ruleId) === undefined) {
      throw new Error(`Configuration refers to an unregistered rule: "${ruleId}".`);
    }
  }
}
