export type SafeRecord = Record<string, unknown>;

export type SafeArraySnapshotResult =
  | Readonly<{ ok: true; value: readonly unknown[] }>
  | Readonly<{ ok: false; reason: "type" | "shape" | "limit" }>;

function readDataDescriptor(
  value: object,
  key: PropertyKey,
  enumerable: boolean,
): PropertyDescriptor | undefined {
  const descriptor = Reflect.getOwnPropertyDescriptor(value, key);
  if (
    descriptor === undefined ||
    !("value" in descriptor) ||
    descriptor.enumerable !== enumerable
  ) {
    return undefined;
  }
  return descriptor;
}

export function snapshotRecord(
  value: unknown,
  allowedKeys: ReadonlySet<string>,
): SafeRecord | undefined {
  try {
    if (
      typeof value !== "object" ||
      value === null ||
      Array.isArray(value) ||
      Object.getPrototypeOf(value) !== Object.prototype
    ) {
      return undefined;
    }
    const ownKeys = Reflect.ownKeys(value);
    if (ownKeys.length > allowedKeys.size) {
      return undefined;
    }
    if (ownKeys.some((key) => typeof key === "symbol")) {
      return undefined;
    }

    const stringKeys = ownKeys as string[];
    const snapshot: SafeRecord = {};
    for (const key of stringKeys) {
      if (!allowedKeys.has(key)) {
        return undefined;
      }
      const descriptor = readDataDescriptor(value, key, true);
      if (descriptor === undefined) {
        return undefined;
      }
      snapshot[key] = descriptor.value;
    }
    return snapshot;
  } catch {
    return undefined;
  }
}

export function hasExactKeys(
  value: SafeRecord,
  expectedKeys: readonly string[],
): boolean {
  const actual = Object.keys(value).sort();
  const expected = [...expectedKeys].sort();
  return (
    actual.length === expected.length &&
    actual.every((key, index) => key === expected[index])
  );
}

export function snapshotDenseArray(
  value: unknown,
  maxLength: number,
): SafeArraySnapshotResult {
  try {
    if (
      typeof value !== "object" ||
      value === null ||
      !Array.isArray(value) ||
      Object.getPrototypeOf(value) !== Array.prototype
    ) {
      return Object.freeze({ ok: false, reason: "type" });
    }
    const lengthDescriptor = readDataDescriptor(value, "length", false);
    if (lengthDescriptor === undefined || !Number.isSafeInteger(lengthDescriptor.value)) {
      return Object.freeze({ ok: false, reason: "shape" });
    }
    const length = lengthDescriptor.value as number;
    if (length < 0) {
      return Object.freeze({ ok: false, reason: "shape" });
    }
    if (length > maxLength) {
      return Object.freeze({ ok: false, reason: "limit" });
    }

    const keys = Reflect.ownKeys(value);
    if (keys.some((key) => typeof key === "symbol") || keys.length !== length + 1) {
      return Object.freeze({ ok: false, reason: "shape" });
    }
    const keySet = new Set(keys as string[]);
    if (!keySet.has("length")) {
      return Object.freeze({ ok: false, reason: "shape" });
    }

    const snapshot = new Array<unknown>(length);
    for (let index = 0; index < length; index += 1) {
      const key = String(index);
      if (!keySet.has(key)) {
        return Object.freeze({ ok: false, reason: "shape" });
      }
      const descriptor = readDataDescriptor(value, key, true);
      if (descriptor === undefined) {
        return Object.freeze({ ok: false, reason: "shape" });
      }
      snapshot[index] = descriptor.value;
    }
    return Object.freeze({ ok: true, value: Object.freeze(snapshot) });
  } catch {
    return Object.freeze({ ok: false, reason: "shape" });
  }
}
