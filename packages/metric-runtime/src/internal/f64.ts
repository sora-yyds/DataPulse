const F64_BYTES = 8;
const CANONICAL_F64_PATTERN =
  /^(?!(?:7ff|fff|8000000000000000$))[0-9a-f]{16}$/u;

export function canonicalizeNumericZero(value: number): number {
  return Object.is(value, -0) ? 0 : value;
}

export function encodeFiniteF64(value: number): string | undefined {
  if (!Number.isFinite(value)) {
    return undefined;
  }
  const buffer = new ArrayBuffer(F64_BYTES);
  const view = new DataView(buffer);
  view.setFloat64(0, canonicalizeNumericZero(value), false);

  let encoded = "";
  for (let index = 0; index < F64_BYTES; index += 1) {
    encoded += view.getUint8(index).toString(16).padStart(2, "0");
  }
  return encoded;
}

export function decodeFiniteF64(encoded: string): number | undefined {
  if (!CANONICAL_F64_PATTERN.test(encoded)) {
    return undefined;
  }
  const buffer = new ArrayBuffer(F64_BYTES);
  const view = new DataView(buffer);
  for (let index = 0; index < F64_BYTES; index += 1) {
    const pair = encoded.slice(index * 2, index * 2 + 2);
    const value = Number.parseInt(pair, 16);
    if (!Number.isInteger(value)) {
      return undefined;
    }
    view.setUint8(index, value);
  }
  const decoded = view.getFloat64(0, false);
  if (!Number.isFinite(decoded) || Object.is(decoded, -0)) {
    return undefined;
  }
  return decoded;
}

export function addFiniteF64(left: number, right: number): number | undefined {
  const sum = canonicalizeNumericZero(left + right);
  return Number.isFinite(sum) ? sum : undefined;
}
