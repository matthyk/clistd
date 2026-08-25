import type { AstNode, CliDocumentAst, DiagnosticSeverity, DocumentIndexes } from '@clistd/core';
import type { JsonSchema } from '@clistd/spec';

import type { AstVisitor } from './ast-visitor.js';

/** A transient, node-based report that the runner converts to a core diagnostic. */
export interface RuleReport {
  readonly message: string;
  readonly node: AstNode;
  readonly related?: readonly AstNode[];
}

export interface RuleMetadata {
  /** Stable, package-qualified identifier, for example "clistd/require-description". */
  readonly id: string;
  readonly description: string;
  /** `off` keeps a rule configurable without enabling it in the default set. */
  readonly defaultSeverity: DiagnosticSeverity | 'off';
  /** Optional agent-facing guidance for resolving findings from this rule. */
  readonly prompt?: string;
  /** Optional JSON Schema for the rule's configuration options. */
  readonly optionsSchema?: JsonSchema;
}

export interface RuleContext {
  readonly ast: CliDocumentAst;
  readonly indexes: DocumentIndexes;
  readonly options: unknown;
  report(report: RuleReport): void;
}

/**
 * A rule creates typed callbacks. The linter owns AST traversal and invokes
 * those callbacks in one shared pre-order traversal for all enabled rules.
 */
export interface Rule {
  readonly meta: RuleMetadata;
  create(context: RuleContext): AstVisitor;
}
