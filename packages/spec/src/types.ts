export type JsonPrimitive = boolean | null | number | string;

export type JsonValue = JsonArray | JsonObject | JsonPrimitive;

export interface JsonArray extends ReadonlyArray<JsonValue> {}

export interface JsonObject {
  readonly [key: string]: JsonValue;
}

/** A JSON Schema Draft 2020-12 schema. */
export type JsonSchema = JsonObject | boolean;

export interface ReferenceObject {
  readonly $ref: string;
}

export type ReferenceOr<T> = ReferenceObject | T;

export interface CliMetadata {
  readonly name: string;
  readonly summary?: string;
  readonly description?: string;
  readonly commandSeparator: ':' | ' ';
  readonly endOfOptions: boolean;
}

export interface Topic {
  readonly id: string;
  readonly title: string;
  readonly description?: string;
}

export interface ArgumentDefinition {
  readonly id: string;
  readonly name: string;
  readonly summary?: string;
  readonly description?: string;
  readonly hidden?: boolean;
  readonly required: boolean;
  readonly variadic?: boolean;
  readonly default?: JsonValue;
  readonly valueSchema: JsonSchema;
}

export interface ValueFlagDefinition {
  readonly id: string;
  readonly long: string;
  readonly short?: string;
  readonly longAliases?: readonly string[];
  readonly shortAliases?: readonly string[];
  readonly summary?: string;
  readonly description?: string;
  readonly hidden?: boolean;
  readonly valueName?: string;
  readonly required?: boolean;
  readonly multiple?: boolean;
  readonly default?: JsonValue;
  readonly valueSchema: JsonSchema;
}

export interface BooleanFlagDefinition {
  readonly id: string;
  readonly long: string;
  readonly short?: string;
  readonly longAliases?: readonly string[];
  readonly shortAliases?: readonly string[];
  readonly summary?: string;
  readonly description?: string;
  readonly hidden?: boolean;
  readonly kind: 'boolean';
  readonly default?: boolean;
  readonly valueSchema: JsonSchema;
}

export type FlagDefinition = BooleanFlagDefinition | ValueFlagDefinition;

export interface EqualityCondition {
  readonly input: string;
  readonly equals: JsonValue;
}

export interface AllOfCondition {
  readonly allOf: readonly Condition[];
}

export interface AnyOfCondition {
  readonly anyOf: readonly Condition[];
}

export interface NotCondition {
  readonly not: Condition;
}

export type Condition = AllOfCondition | AnyOfCondition | EqualityCondition | NotCondition;

export interface RequiresConstraint {
  readonly type: 'requires';
  readonly input: string;
  readonly allOf?: readonly string[];
  readonly anyOf?: readonly string[];
}

export interface CountConstraint {
  readonly type: 'atLeast' | 'atMost' | 'exactly';
  readonly inputs: readonly string[];
  readonly count: number;
}

export interface AllOrNoneConstraint {
  readonly type: 'allOrNone';
  readonly inputs: readonly string[];
}

export type Constraint = AllOrNoneConstraint | CountConstraint | RequiresConstraint;

export type OutputFormat = 'json' | 'ndjson' | 'text' | 'yaml';

export interface OutputContract {
  readonly id: string;
  readonly summary?: string;
  readonly description?: string;
  readonly format: OutputFormat;
  readonly when?: Condition;
  readonly schema?: JsonSchema;
}

export interface ExitCode {
  readonly id: string;
  readonly code: number;
  readonly description: string;
}

export interface CommandDefinition {
  readonly id: string;
  readonly invocation: readonly string[];
  readonly aliases?: readonly CommandAlias[];
  readonly topics?: readonly string[];
  readonly summary?: string;
  readonly description?: string;
  readonly arguments?: readonly ArgumentDefinition[];
  readonly flags?: readonly FlagDefinition[];
  readonly constraints?: readonly Constraint[];
  readonly outputs?: readonly OutputContract[];
  readonly exitCodes?: readonly ReferenceOr<ExitCode>[];
}

export interface CommandAlias {
  readonly path: readonly string[];
}

export interface Components {
  readonly commands?: Readonly<Record<string, ReferenceOr<CommandDefinition>>>;
  readonly exitCodes?: Readonly<Record<string, ReferenceOr<ExitCode>>>;
  readonly topics?: Readonly<Record<string, ReferenceOr<Topic>>>;
}

export interface CliDocument {
  readonly $id: string;
  readonly specVersion: '0.1';
  readonly cli: CliMetadata;
  readonly topics?: readonly ReferenceOr<Topic>[];
  readonly components?: Components;
  readonly commands: readonly ReferenceOr<CommandDefinition>[];
}
