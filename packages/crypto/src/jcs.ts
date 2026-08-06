import { createJcsInvalidError } from "./errors.js";

const textEncoder = new TextEncoder();

export type JcsPrimitive = null | boolean | number | string;
export type JcsValue = JcsPrimitive | JcsValue[] | { [key: string]: JcsValue };

/**
 * RFC 8785 JSON Canonicalization Scheme.
 * Serializes a JSON-safe value to canonical UTF-8 bytes.
 */
export function jcs(input: JcsValue): Uint8Array {
  return textEncoder.encode(jcsString(input));
}

/** RFC 8785 canonical serialization as a string (UTF-8 decoded). */
export function jcsString(input: JcsValue): string {
  const output: string[] = [];
  serialize(input, output, new Set<object>());
  return output.join("");
}

function serialize(value: JcsValue, output: string[], active: Set<object>): void {
  if (value === null) {
    output.push("null");
    return;
  }
  if (typeof value === "boolean") {
    output.push(value ? "true" : "false");
    return;
  }
  if (typeof value === "string") {
    output.push(escapeString(value));
    return;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw createJcsInvalidError("non-finite");
    }
    output.push(numberToCanonicalString(value));
    return;
  }
  if (Array.isArray(value)) {
    if (active.has(value)) {
      throw createJcsInvalidError("circular");
    }
    active.add(value);
    output.push("[");
    for (let index = 0; index < value.length; index += 1) {
      if (index > 0) {
        output.push(",");
      }
      const member = value[index];
      if (member === undefined) {
        throw createJcsInvalidError("unsupported-type");
      }
      serialize(member, output, active);
    }
    output.push("]");
    active.delete(value);
    return;
  }
  if (typeof value === "object" && value !== null && isPlainObject(value)) {
    if (active.has(value)) {
      throw createJcsInvalidError("circular");
    }
    active.add(value);
    const record = value as Record<string, JcsValue>;
    const keys = Object.keys(record).sort(compareUtf16CodeUnits);
    output.push("{");
    for (let index = 0; index < keys.length; index += 1) {
      const key = keys[index];
      if (key === undefined) {
        continue;
      }
      if (index > 0) {
        output.push(",");
      }
      output.push(escapeString(key));
      output.push(":");
      const member = record[key];
      if (member === undefined) {
        throw createJcsInvalidError("unsupported-type");
      }
      serialize(member, output, active);
    }
    output.push("}");
    active.delete(value);
    return;
  }
  throw createJcsInvalidError("unsupported-type");
}

function isPlainObject(value: object): boolean {
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function compareUtf16CodeUnits(left: string, right: string): number {
  const sharedLength = Math.min(left.length, right.length);
  for (let index = 0; index < sharedLength; index += 1) {
    const leftCode = left.charCodeAt(index);
    const rightCode = right.charCodeAt(index);
    if (leftCode !== rightCode) {
      return leftCode - rightCode;
    }
  }
  return left.length - right.length;
}

/**
 * ECMAScript JSON string escaping: escapes quotes, backslash, control
 * characters below U+0020, and lone surrogates. Valid surrogate pairs are
 * emitted raw and then UTF-8 encoded.
 */
function escapeString(value: string): string {
  let result = '"';
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = index + 1 < value.length ? value.charCodeAt(index + 1) : 0;
      if (next >= 0xdc00 && next <= 0xdfff) {
        result += value.charAt(index);
        result += value.charAt(index + 1);
        index += 1;
        continue;
      }
      result += `\\u${code.toString(16).padStart(4, "0")}`;
      continue;
    }
    if (code >= 0xdc00 && code <= 0xdfff) {
      result += `\\u${code.toString(16).padStart(4, "0")}`;
      continue;
    }
    switch (code) {
      case 0x22:
        result += '\\"';
        break;
      case 0x5c:
        result += "\\\\";
        break;
      case 0x08:
        result += "\\b";
        break;
      case 0x09:
        result += "\\t";
        break;
      case 0x0a:
        result += "\\n";
        break;
      case 0x0c:
        result += "\\f";
        break;
      case 0x0d:
        result += "\\r";
        break;
      default:
        if (code < 0x20) {
          result += `\\u${code.toString(16).padStart(4, "0")}`;
        } else {
          result += value.charAt(index);
        }
    }
  }
  result += '"';
  return result;
}

/**
 * Shortest round-trip ECMAScript number serialization. V8 produces the same
 * text as JSON.stringify for finite numbers; negative zero must serialize as
 * "0" per RFC 8785.
 */
function numberToCanonicalString(value: number): string {
  if (Object.is(value, -0)) {
    return "0";
  }
  return String(value);
}