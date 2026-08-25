export type {
  AllOfConditionAst,
  AllOrNoneConstraintAst,
  AnyOfConditionAst,
  ArgumentAst,
  AstNode,
  BooleanFlagAst,
  CliDocumentAst,
  CliMetadataAst,
  CommandAliasAst,
  CommandAst,
  CommandIndexes,
  ConditionAst,
  ConstraintAst,
  CountConstraintAst,
  DocumentIndexes,
  EqualityConditionAst,
  ExitCodeAst,
  FlagAst,
  FlagBaseAst,
  JsonPath,
  NotConditionAst,
  OutputAst,
  RequiresConstraintAst,
  TopicAst,
  ValueFlagAst,
} from './ast.js';

export type { BuildResult, DiagnosticSeverity, DocumentDiagnostic } from './diagnostics.js';
export type { DocumentInput, SourceLocation, SourceMap, SourcePosition } from './input.js';
export { buildDocument } from './build.js';
export { findBreakingChanges } from './breaking-diff.js';
export type { BreakingChange, BreakingDiff, CliChange, DiffSeverity } from './breaking-diff.js';
export { validateDocument } from './validation.js';
export type { ValidationResult } from './validation.js';
