import type { Rule } from './rule.js';

export interface RuleRegistry {
  readonly rules: readonly Rule[];
  get(id: string): Rule | undefined;
}

export function createRuleRegistry(rules: readonly Rule[]): RuleRegistry {
  const byId = new Map<string, Rule>();

  for (const rule of rules) {
    if (rule.meta.id.trim().length === 0) {
      throw new Error('Rule IDs must not be empty.');
    }
    if (byId.has(rule.meta.id)) {
      throw new Error(`A rule with ID "${rule.meta.id}" is already registered.`);
    }
    byId.set(rule.meta.id, rule);
  }

  return {
    rules: [...rules],
    get(id: string): Rule | undefined {
      return byId.get(id);
    },
  };
}
