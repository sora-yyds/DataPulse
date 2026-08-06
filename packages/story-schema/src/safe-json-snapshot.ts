export type JsonPrimitive = null | boolean | number | string;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

export type SnapshotFailureReason =
  | "accessor"
  | "alias"
  | "byte_limit"
  | "depth_limit"
  | "non_json_value"
  | "non_plain_object"
  | "node_limit"
  | "sparse_array"
  | "symbol_property"
  | "unreadable";

export type SnapshotLimits = Readonly<{
  maxDepth: number;
  maxNodes: number;
  maxSnapshotUtf8Bytes: number;
}>;

export type SafeJsonSnapshotResult =
  | Readonly<{
      ok: true;
      value: JsonValue;
      measurements: Readonly<{ nodes: number; snapshotUtf8Bytes: number }>;
    }>
  | Readonly<{ ok: false; reason: SnapshotFailureReason }>;

type SnapshotState = {
  bytes: number;
  nodes: number;
  readonly limits: SnapshotLimits;
  readonly seen: WeakSet<object>;
};

class SnapshotRejected {
  readonly reason: SnapshotFailureReason;

  constructor(reason: SnapshotFailureReason) {
    this.reason = reason;
  }
}

function reject(reason: SnapshotFailureReason): never {
  throw new SnapshotRejected(reason);
}

function utf8BytesForCodePoint(codePoint: number): number {
  if (codePoint <= 0x7f) return 1;
  if (codePoint <= 0x7ff) return 2;
  if (codePoint <= 0xffff) return 3;
  return 4;
}

function consumeJsonString(state: SnapshotState, value: string): void {
  consumeBytes(state, 2);
  for (let index = 0; index < value.length; index += 1) {
    const codeUnit = value.charCodeAt(index);
    if (codeUnit === 0x22 || codeUnit === 0x5c || codeUnit === 0x08 || codeUnit === 0x0c) {
      consumeBytes(state, 2);
      continue;
    }
    if (codeUnit === 0x0a || codeUnit === 0x0d || codeUnit === 0x09) {
      consumeBytes(state, 2);
      continue;
    }
    if (codeUnit <= 0x1f) {
      consumeBytes(state, 6);
      continue;
    }
    if (codeUnit >= 0xd800 && codeUnit <= 0xdbff) {
      const trailing = value.charCodeAt(index + 1);
      if (trailing >= 0xdc00 && trailing <= 0xdfff) {
        consumeBytes(state, 4);
        index += 1;
      } else {
        consumeBytes(state, 6);
      }
      continue;
    }
    if (codeUnit >= 0xdc00 && codeUnit <= 0xdfff) {
      consumeBytes(state, 6);
      continue;
    }
    consumeBytes(state, utf8BytesForCodePoint(codeUnit));
  }
}

function utf8Bytes(value: string): number {
  let bytes = 0;
  for (const character of value) {
    const codePoint = character.codePointAt(0);
    if (codePoint === undefined) reject("unreadable");
    bytes += utf8BytesForCodePoint(codePoint);
  }
  return bytes;
}

function consumeBytes(state: SnapshotState, bytes: number): void {
  state.bytes += bytes;
  if (state.bytes > state.limits.maxSnapshotUtf8Bytes) {
    reject("byte_limit");
  }
}

function consumeNode(state: SnapshotState, depth: number): void {
  if (depth > state.limits.maxDepth) reject("depth_limit");
  state.nodes += 1;
  if (state.nodes > state.limits.maxNodes) reject("node_limit");
}

function copyPrimitive(value: unknown, state: SnapshotState): JsonPrimitive {
  if (value === null) {
    consumeBytes(state, 4);
    return null;
  }
  if (typeof value === "string") {
    consumeJsonString(state, value);
    return value;
  }
  if (typeof value === "boolean") {
    consumeBytes(state, value ? 4 : 5);
    return value;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) reject("non_json_value");
    const serialized = JSON.stringify(value);
    if (serialized === undefined) reject("non_json_value");
    consumeBytes(state, serialized.length);
    return value;
  }
  reject("non_json_value");
}

function requireDataDescriptor(descriptor: PropertyDescriptor | undefined): PropertyDescriptor {
  if (descriptor === undefined || !("value" in descriptor)) reject("accessor");
  if (!descriptor.enumerable) reject("non_plain_object");
  return descriptor;
}

function readOwnDescriptor(value: object, key: PropertyKey): PropertyDescriptor {
  let descriptor: PropertyDescriptor | undefined;
  try {
    descriptor = Reflect.getOwnPropertyDescriptor(value, key);
  } catch {
    reject("unreadable");
  }
  return requireDataDescriptor(descriptor);
}

function copyArray(value: unknown[], state: SnapshotState, depth: number): JsonValue[] {
  let lengthDescriptor: PropertyDescriptor | undefined;
  try {
    lengthDescriptor = Reflect.getOwnPropertyDescriptor(value, "length");
  } catch {
    reject("unreadable");
  }
  if (lengthDescriptor === undefined || !("value" in lengthDescriptor)) reject("unreadable");
  const length = lengthDescriptor.value;
  if (!Number.isSafeInteger(length) || length < 0) reject("unreadable");
  if (length + state.nodes > state.limits.maxNodes) reject("node_limit");

  let keys: (string | symbol)[];
  try {
    keys = Reflect.ownKeys(value);
  } catch {
    reject("unreadable");
  }

  if (keys.some((key) => typeof key === "symbol")) reject("symbol_property");
  if (keys.length !== length + 1) reject("sparse_array");
  const stringKeys = keys as string[];
  if (!stringKeys.includes("length")) {
    reject("sparse_array");
  }
  const stringKeySet = new Set(stringKeys);

  consumeBytes(state, 2 + Math.max(0, length - 1));
  const copy = new Array<JsonValue>(length);
  for (let index = 0; index < length; index += 1) {
    const key = String(index);
    if (!stringKeySet.has(key)) reject("sparse_array");
    const descriptor = readOwnDescriptor(value, key);
    copy[index] = copyJsonValue(descriptor.value, state, depth + 1);
  }
  return copy;
}

function copyObject(
  value: object,
  state: SnapshotState,
  depth: number,
): { [key: string]: JsonValue } {
  let keys: (string | symbol)[];
  try {
    keys = Reflect.ownKeys(value);
  } catch {
    reject("unreadable");
  }

  if (keys.some((key) => typeof key === "symbol")) reject("symbol_property");
  if (keys.length + state.nodes > state.limits.maxNodes) reject("node_limit");
  const stringKeys = keys as string[];
  consumeBytes(state, 2 + Math.max(0, stringKeys.length - 1));

  const copy: { [key: string]: JsonValue } = {};
  for (const key of stringKeys) {
    const descriptor = readOwnDescriptor(value, key);
    consumeJsonString(state, key);
    consumeBytes(state, 1);
    Object.defineProperty(copy, key, {
      configurable: true,
      enumerable: true,
      value: copyJsonValue(descriptor.value, state, depth + 1),
      writable: true,
    });
  }
  return copy;
}

function copyJsonValue(value: unknown, state: SnapshotState, depth: number): JsonValue {
  consumeNode(state, depth);
  if (value === null || typeof value !== "object") {
    return copyPrimitive(value, state);
  }

  if (state.seen.has(value)) reject("alias");
  state.seen.add(value);

  let prototype: object | null;
  let isArray: boolean;
  try {
    prototype = Object.getPrototypeOf(value);
    isArray = Array.isArray(value);
  } catch {
    reject("unreadable");
  }

  if (isArray) {
    if (prototype !== Array.prototype) reject("non_plain_object");
    return copyArray(value as unknown[], state, depth);
  }
  if (prototype !== Object.prototype) reject("non_plain_object");
  return copyObject(value, state, depth);
}

export function createSafeJsonSnapshot(
  input: unknown,
  limits: SnapshotLimits,
): SafeJsonSnapshotResult {
  const state: SnapshotState = {
    bytes: 0,
    limits,
    nodes: 0,
    seen: new WeakSet<object>(),
  };

  try {
    const value = copyJsonValue(input, state, 1);
    const serialized = JSON.stringify(value);
    if (serialized === undefined || utf8Bytes(serialized) !== state.bytes) {
      return Object.freeze({ ok: false, reason: "unreadable" });
    }
    return Object.freeze({
      ok: true,
      value,
      measurements: Object.freeze({
        nodes: state.nodes,
        snapshotUtf8Bytes: state.bytes,
      }),
    });
  } catch (error) {
    const reason = error instanceof SnapshotRejected ? error.reason : "unreadable";
    return Object.freeze({ ok: false, reason });
  }
}

function deepFreezeJsonValue(value: JsonValue): void {
  if (value === null || typeof value !== "object" || Object.isFrozen(value)) {
    return;
  }
  for (const nested of Object.values(value)) {
    deepFreezeJsonValue(nested);
  }
  Object.freeze(value);
}

export function deepFreezeJson(value: JsonValue): JsonValue {
  deepFreezeJsonValue(value);
  return value;
}
