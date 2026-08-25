import type { JsonPath } from './ast.js';

export interface SourcePosition {
  /** One-based line and column, suitable for display in editors and terminals. */
  readonly line: number;
  readonly column: number;
  /** Zero-based UTF-16 offset into the original source text. */
  readonly offset?: number;
}

export interface SourceLocation {
  readonly uri: string;
  readonly start: SourcePosition;
  readonly end?: SourcePosition;
}

export interface SourceMap {
  /**
   * Returns the concrete source range for a logical document path, when the
   * input originated from a format that preserves source positions.
   */
  locate(path: JsonPath): SourceLocation | undefined;
}

export interface DocumentInput {
  readonly value: unknown;
  readonly uri?: string;
  readonly sourceMap?: SourceMap;
}
