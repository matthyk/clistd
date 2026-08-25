import type { JsonSchema, JsonValue, OutputFormat } from '@clistd/spec';

export type JsonPath = readonly (string | number)[];

export interface AstNode {
  readonly path: JsonPath;
}

export interface CliDocumentAst extends AstNode {
  readonly kind: 'document';
  readonly id: string;
  readonly specVersion: '0.1';
  readonly cli: CliMetadataAst;
  readonly topics: readonly TopicAst[];
  readonly commands: readonly CommandAst[];
  readonly indexes: DocumentIndexes;
}

export interface CliMetadataAst {
  readonly name: string;
  readonly summary?: string;
  readonly description?: string;
  readonly commandSeparator: ':' | ' ';
  readonly endOfOptions: boolean;
}

export interface TopicAst extends AstNode {
  readonly kind: 'topic';
  readonly id: string;
  readonly title: string;
  readonly description?: string;
}

export interface CommandAst extends AstNode {
  readonly kind: 'command';
  readonly id: string;
  readonly invocation: readonly string[];
  readonly aliases: readonly CommandAliasAst[];
  readonly topics: readonly string[];
  readonly summary?: string;
  readonly description?: string;
  readonly arguments: readonly ArgumentAst[];
  readonly flags: readonly FlagAst[];
  readonly constraints: readonly ConstraintAst[];
  readonly outputs: readonly OutputAst[];
  readonly exitCodes: readonly ExitCodeAst[];
}

export interface CommandAliasAst extends AstNode {
  readonly kind: 'command-alias';
  readonly segments: readonly string[];
}

export interface ArgumentAst extends AstNode {
  readonly kind: 'argument';
  readonly id: string;
  readonly name: string;
  readonly summary?: string;
  readonly description?: string;
  readonly hidden: boolean;
  readonly required: boolean;
  readonly variadic: boolean;
  readonly defaultValue?: JsonValue;
  readonly valueSchema: JsonSchema;
}

export interface FlagBaseAst extends AstNode {
  readonly id: string;
  readonly long: string;
  readonly short?: string;
  readonly longAliases: readonly string[];
  readonly shortAliases: readonly string[];
  readonly summary?: string;
  readonly description?: string;
  readonly hidden: boolean;
}

export interface ValueFlagAst extends FlagBaseAst {
  readonly kind: 'value';
  readonly valueName?: string;
  readonly required: boolean;
  readonly multiple: boolean;
  readonly defaultValue?: JsonValue;
  readonly valueSchema: JsonSchema;
}

export interface BooleanFlagAst extends FlagBaseAst {
  readonly kind: 'boolean';
  readonly defaultValue?: boolean;
  readonly valueSchema: JsonSchema;
}

export type FlagAst = BooleanFlagAst | ValueFlagAst;

export interface EqualityConditionAst extends AstNode {
  readonly kind: 'equality-condition';
  readonly input: string;
  readonly equals: JsonValue;
}

export interface AllOfConditionAst extends AstNode {
  readonly kind: 'all-of-condition';
  readonly conditions: readonly ConditionAst[];
}

export interface AnyOfConditionAst extends AstNode {
  readonly kind: 'any-of-condition';
  readonly conditions: readonly ConditionAst[];
}

export interface NotConditionAst extends AstNode {
  readonly kind: 'not-condition';
  readonly condition: ConditionAst;
}

export type ConditionAst =
  | EqualityConditionAst
  | AllOfConditionAst
  | AnyOfConditionAst
  | NotConditionAst;

export interface RequiresConstraintAst extends AstNode {
  readonly kind: 'requires';
  readonly input: string;
  readonly allOf: readonly string[];
  readonly anyOf: readonly string[];
}

export interface CountConstraintAst extends AstNode {
  readonly kind: 'count';
  readonly type: 'atLeast' | 'atMost' | 'exactly';
  readonly inputs: readonly string[];
  readonly count: number;
}

export interface AllOrNoneConstraintAst extends AstNode {
  readonly kind: 'all-or-none';
  readonly type: 'allOrNone';
  readonly inputs: readonly string[];
}

export type ConstraintAst = RequiresConstraintAst | CountConstraintAst | AllOrNoneConstraintAst;

export interface OutputAst extends AstNode {
  readonly kind: 'output';
  readonly id: string;
  readonly summary?: string;
  readonly description?: string;
  readonly format: OutputFormat;
  readonly when?: ConditionAst;
  readonly schema?: JsonSchema;
}

export interface ExitCodeAst extends AstNode {
  readonly kind: 'exit-code';
  readonly id: string;
  readonly code: number;
  readonly description: string;
}

export interface DocumentIndexes {
  readonly commands: CommandIndexes;
  readonly topics: ReadonlyMap<string, TopicAst>;
}

export interface CommandIndexes {
  readonly byId: ReadonlyMap<string, CommandAst>;
  readonly byInvocation: ReadonlyMap<string, CommandAst>;
  readonly inputsByCommandId: ReadonlyMap<string, ReadonlyMap<string, ArgumentAst | FlagAst>>;
  readonly flagsByCommandId: ReadonlyMap<string, ReadonlyMap<string, FlagAst>>;
  readonly argumentsByCommandId: ReadonlyMap<string, ReadonlyMap<string, ArgumentAst>>;
}
