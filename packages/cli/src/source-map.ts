import { EVENT_ID, getScalarValue, parseEvents } from 'js-yaml';
import type { Event } from 'js-yaml';

import type { JsonPath, SourceLocation, SourceMap, SourcePosition } from '@clistd/core';

type OffsetRange = readonly [start: number, end: number];

export function createJsonSourceMap(source: string, uri: string): SourceMap {
  const ranges = new Map<string, OffsetRange>();
  const parser = new JsonLocationParser(source, ranges);
  parser.parse();
  return new TextSourceMap(uri, source, ranges);
}

export function createYamlSourceMap(source: string, uri: string): SourceMap {
  const ranges = new Map<string, OffsetRange>();
  const events = parseEvents(source, {});
  const parser = new YamlLocationParser(source, events, ranges);
  parser.parse();
  return new TextSourceMap(uri, source, ranges);
}

class TextSourceMap implements SourceMap {
  readonly #lineStarts: readonly number[];

  public constructor(
    private readonly uri: string,
    source: string,
    private readonly ranges: ReadonlyMap<string, OffsetRange>,
  ) {
    this.#lineStarts = lineStarts(source);
  }

  public locate(path: JsonPath): SourceLocation | undefined {
    const range = this.ranges.get(pathKey(path));
    if (range === undefined) return undefined;
    return {
      uri: this.uri,
      start: this.position(range[0]),
      end: this.position(range[1]),
    };
  }

  private position(offset: number): SourcePosition {
    let low = 0;
    let high = this.#lineStarts.length;
    while (low + 1 < high) {
      const middle = Math.floor((low + high) / 2);
      if ((this.#lineStarts[middle] ?? 0) > offset) high = middle;
      else low = middle;
    }
    const lineStart = this.#lineStarts[low] ?? 0;
    return { line: low + 1, column: offset - lineStart + 1, offset };
  }
}

class JsonLocationParser {
  #offset = 0;

  public constructor(
    private readonly source: string,
    private readonly ranges: Map<string, OffsetRange>,
  ) {}

  public parse(): void {
    this.parseValue([]);
  }

  private parseValue(path: JsonPath): void {
    this.skipWhitespace();
    const start = this.#offset;
    const character = this.source[this.#offset];
    if (character === '{') this.parseObject(path);
    else if (character === '[') this.parseArray(path);
    else if (character === '"') this.parseString();
    else this.parsePrimitive();
    this.ranges.set(pathKey(path), [start, this.#offset]);
  }

  private parseObject(path: JsonPath): void {
    this.#offset++;
    this.skipWhitespace();
    while (this.source[this.#offset] !== '}') {
      const key = this.readString();
      this.skipWhitespace();
      this.#offset++;
      this.parseValue([...path, key]);
      this.skipWhitespace();
      if (this.source[this.#offset] !== ',') break;
      this.#offset++;
      this.skipWhitespace();
    }
    this.#offset++;
  }

  private parseArray(path: JsonPath): void {
    this.#offset++;
    this.skipWhitespace();
    let index = 0;
    while (this.source[this.#offset] !== ']') {
      this.parseValue([...path, index]);
      index++;
      this.skipWhitespace();
      if (this.source[this.#offset] !== ',') break;
      this.#offset++;
      this.skipWhitespace();
    }
    this.#offset++;
  }

  private readString(): string {
    const start = this.#offset;
    this.parseString();
    return JSON.parse(this.source.slice(start, this.#offset)) as string;
  }

  private parseString(): void {
    this.#offset++;
    while (this.#offset < this.source.length) {
      const character = this.source[this.#offset++];
      if (character === '\\') this.#offset++;
      else if (character === '"') return;
    }
  }

  private parsePrimitive(): void {
    while (
      this.#offset < this.source.length &&
      !/[\s,\]}]/u.test(this.source[this.#offset] ?? '')
    ) {
      this.#offset++;
    }
  }

  private skipWhitespace(): void {
    while (/\s/u.test(this.source[this.#offset] ?? '')) this.#offset++;
  }
}

class YamlLocationParser {
  #index = 0;

  public constructor(
    private readonly source: string,
    private readonly events: readonly Event[],
    private readonly ranges: Map<string, OffsetRange>,
  ) {}

  public parse(): void {
    if (this.events[this.#index]?.type === EVENT_ID.DOCUMENT) this.#index++;
    this.parseNode([]);
  }

  private parseNode(path: JsonPath): OffsetRange | undefined {
    const event = this.events[this.#index++];
    if (event === undefined) return undefined;
    if (event.type === EVENT_ID.SCALAR) {
      const range: OffsetRange = [event.valueStart, event.valueEnd];
      this.ranges.set(pathKey(path), range);
      return range;
    }
    if (event.type === EVENT_ID.ALIAS) return [event.anchorStart, event.anchorEnd];
    if (event.type === EVENT_ID.SEQUENCE) return this.parseSequence(event, path);
    if (event.type === EVENT_ID.MAPPING) return this.parseMapping(event, path);
    return undefined;
  }

  private parseSequence(event: Event, path: JsonPath): OffsetRange {
    const start = event.type === EVENT_ID.SEQUENCE ? event.start : 0;
    let end = start + 1;
    let index = 0;
    while (this.events[this.#index]?.type !== EVENT_ID.POP) {
      const child = this.parseNode([...path, index++]);
      if (child !== undefined) end = child[1];
    }
    this.#index++;
    const range: OffsetRange = [start, end];
    this.ranges.set(pathKey(path), range);
    return range;
  }

  private parseMapping(event: Event, path: JsonPath): OffsetRange {
    const start = event.type === EVENT_ID.MAPPING ? event.start : 0;
    let end = start + 1;
    while (this.events[this.#index]?.type !== EVENT_ID.POP) {
      const key = this.readKey();
      const child = this.parseNode([...path, key]);
      if (child !== undefined) end = child[1];
    }
    this.#index++;
    const range: OffsetRange = [start, end];
    this.ranges.set(pathKey(path), range);
    return range;
  }

  private readKey(): string {
    const event = this.events[this.#index++];
    if (event?.type === EVENT_ID.SCALAR) return getScalarValue(this.source, event);
    return '';
  }
}

function pathKey(path: JsonPath): string {
  return JSON.stringify(path);
}

function lineStarts(source: string): readonly number[] {
  const starts = [0];
  for (let index = 0; index < source.length; index++) {
    if (source[index] === '\n') starts.push(index + 1);
  }
  return starts;
}
