/**
 * M0-022/M0-023 fixed-vector device probe. Load this page on Chrome, Edge,
 * iOS Safari, Android WeChat and iOS WeChat to verify KDF/AES/JCS/Fragment
 * interoperability vectors and single-derivation timing (target ≤ 5 s, no
 * memory termination). Fixed salts/keys/nonces appear ONLY in this device
 * probe and the repo test fixtures; production material comes from Web
 * Crypto CSPRNG.
 */
import {
  ARGON2_KDF_PROFILES,
  CRYPTO_ERROR_CODES,
  CRYPTO_PURPOSES,
  base64urlDecode,
  base64urlEncode,
  decryptAesGcm,
  deriveArgon2KdfKey,
  encryptAesGcm,
  jcsString,
} from "@datapulse/crypto";

const KDF_PROFILE_ID = "a2id-v1-64m-t3-p1";

/** Cross-validated with argon2-cffi 25.1.0 and hash-wasm 4.12.0. */
const KDF_VECTOR = Object.freeze({
  password: "correct horse battery staple",
  saltHex: "42424242424242424242424242424242",
  keyHex: "072ff0797a5f92ef6138da5a67dc311a330469923b4b14390e9ddfbbc97ab683",
});

/** NIST/purpose vectors from tests/unit/crypto-vectors.ts. */
const AES_VECTOR = Object.freeze({
  keyHex: "000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f",
  nonceHex: "202122232425262728292a2b",
  plaintextHex: "68656c6c6f2063727970746f",
  ciphertextHex: "ba5fca1c03b8797c630c36a1",
  tagHex: "ceeec784184a8553c42469f790175f27",
  purpose: CRYPTO_PURPOSES.publishedPackage,
});

/** Fragment envelope inputs with precomputed wrap values (M0-022). */
const FRAGMENT_VECTOR = Object.freeze({
  password: "correct horse battery staple",
  saltHex: "42424242424242424242424242424242",
  wrapNonceHex: "202122232425262728292a2b",
  shareKeyHex: "000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f",
  publicationId: "pub-0000-0000",
  expiresAt: "2030-01-01T00:00:00Z",
  schemaVersion: "1.0.0",
  wrappedKeyCiphertext: "83jeA-dP9kfomC_XY4OWyny7Ls-4T_wGGqsOHWLwL_M",
  wrapTag: "3XOQoOozOHgGck6i7BFEXw",
});

type ProbeResult = Readonly<{ name: string; passed: boolean; detail: string }>;

function fromHex(hex: string): Uint8Array {
  const output = new Uint8Array(hex.length / 2);
  for (let index = 0; index < output.length; index += 1) {
    output[index] = Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16);
  }
  return output;
}

function toHex(input: Uint8Array): string {
  return Array.from(input, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function probeKdfFixedVector(): Promise<ProbeResult> {
  const salt = fromHex(KDF_VECTOR.saltHex);
  const startedAt = performance.now();
  const key = await deriveArgon2KdfKey({
    profileId: KDF_PROFILE_ID,
    password: KDF_VECTOR.password,
    salt,
  });
  const elapsedMs = performance.now() - startedAt;
  const matches = toHex(key) === KDF_VECTOR.keyHex;
  return {
    name: "KDF a2id-v1-64m-t3-p1 固定向量",
    passed: matches && elapsedMs <= 5000,
    detail: `derived=${toHex(key)} expected=${KDF_VECTOR.keyHex} elapsed=${elapsedMs.toFixed(1)}ms target<=5000ms`,
  };
}

async function probeKdfRejectsArbitraryProfile(): Promise<ProbeResult> {
  try {
    await deriveArgon2KdfKey({
      profileId: "a2id-v1-16m-t3-p1",
      password: KDF_VECTOR.password,
      salt: fromHex(KDF_VECTOR.saltHex),
    });
    return { name: "KDF 拒绝任意参数 profile", passed: false, detail: "unexpectedly accepted unknown profile id" };
  } catch (error) {
    const code =
      typeof error === "object" && error !== null && "code" in error
        ? String((error as { code: unknown }).code)
        : String(error);
    const passed = code === CRYPTO_ERROR_CODES.profileUnknown;
    return { name: "KDF 拒绝任意参数 profile", passed, detail: `code=${code}` };
  }
}

async function probeAesGcmFixedVector(): Promise<ProbeResult> {
  const key = fromHex(AES_VECTOR.keyHex);
  const nonce = fromHex(AES_VECTOR.nonceHex);
  const plaintext = fromHex(AES_VECTOR.plaintextHex);
  const sealed = await encryptAesGcm({
    key,
    purpose: AES_VECTOR.purpose,
    plaintext,
    nonce,
  });
  const sealedMatches =
    toHex(sealed.ciphertext) === AES_VECTOR.ciphertextHex &&
    toHex(sealed.tag) === AES_VECTOR.tagHex;
  const opened = await decryptAesGcm({
    key,
    purpose: AES_VECTOR.purpose,
    nonce,
    ciphertext: sealed.ciphertext,
    tag: sealed.tag,
  });
  const openedMatches = toHex(opened) === AES_VECTOR.plaintextHex;
  return {
    name: "AES-256-GCM purpose 固定向量",
    passed: sealedMatches && openedMatches,
    detail: `seal=${sealedMatches} open=${openedMatches}`,
  };
}

function probeJcsFixedVector(): ProbeResult {
  const canonical = jcsString({ b: "y", a: "z" });
  const passed = canonical === '{"a":"z","b":"y"}';
  return { name: "JCS RFC 8785 固定向量", passed, detail: `canonical=${canonical}` };
}

async function probeFragmentFixedVector(): Promise<ProbeResult> {
  const salt = fromHex(FRAGMENT_VECTOR.saltHex);
  const wrapNonce = fromHex(FRAGMENT_VECTOR.wrapNonceHex);
  const shareKey = fromHex(FRAGMENT_VECTOR.shareKeyHex);
  const fields = Object.freeze({
    publicationId: FRAGMENT_VECTOR.publicationId,
    expiresAt: FRAGMENT_VECTOR.expiresAt,
    schemaVersion: FRAGMENT_VECTOR.schemaVersion,
    kdfProfile: KDF_PROFILE_ID,
    salt: base64urlEncode(salt),
    wrapNonce: base64urlEncode(wrapNonce),
  });
  const kek = await deriveArgon2KdfKey({
    profileId: KDF_PROFILE_ID,
    password: FRAGMENT_VECTOR.password,
    salt,
  });
  const sealed = await encryptAesGcm({
    key: kek,
    purpose: CRYPTO_PURPOSES.shareKeyWrap,
    plaintext: shareKey,
    nonce: wrapNonce,
    fields,
  });
  const wrapMatches =
    base64urlEncode(sealed.ciphertext) === FRAGMENT_VECTOR.wrappedKeyCiphertext &&
    base64urlEncode(sealed.tag) === FRAGMENT_VECTOR.wrapTag;
  const envelope = Object.freeze({
    v: 1,
    purpose: CRYPTO_PURPOSES.shareKeyWrap,
    ...fields,
    wrappedKeyCiphertext: FRAGMENT_VECTOR.wrappedKeyCiphertext,
    wrapTag: FRAGMENT_VECTOR.wrapTag,
  });
  const canonical = jcsString(envelope);
  const fragment = `#dp1.p.${base64urlEncode(new TextEncoder().encode(canonical))}`;
  const lengthOk = fragment.length <= 2048;
  const opened = await decryptAesGcm({
    key: kek,
    purpose: CRYPTO_PURPOSES.shareKeyWrap,
    nonce: wrapNonce,
    ciphertext: base64urlDecode(FRAGMENT_VECTOR.wrappedKeyCiphertext),
    tag: base64urlDecode(FRAGMENT_VECTOR.wrapTag),
    fields,
  });
  const roundTripMatches = toHex(opened) === FRAGMENT_VECTOR.shareKeyHex;
  return {
    name: "Fragment passwordEnvelope 固定向量",
    passed: wrapMatches && lengthOk && roundTripMatches,
    detail: `wrap=${wrapMatches} length=${fragment.length}/2048 roundtrip=${roundTripMatches}`,
  };
}

function render(results: readonly ProbeResult[], summary: Record<string, unknown>): void {
  const table = document.querySelector<HTMLTableElement>("#results");
  const output = document.querySelector<HTMLPreElement>("#output");
  const status = document.querySelector<HTMLParagraphElement>("#summary");
  if (!table || !output || !status) {
    return;
  }
  const allPassed = results.every((result) => result.passed);
  status.textContent = allPassed ? "全部探针通过；请记录下方 JSON 结果。".concat(
    "（M0-023：此结果不代表完整 WCAG/真实设备认证）",
  ) : "存在未通过探针，请检查下方详情。";
  table.replaceChildren();
  for (const result of results) {
    const row = table.insertRow();
    const nameCell = row.insertCell();
    const detailCell = row.insertCell();
    const stateCell = row.insertCell();
    nameCell.textContent = result.name;
    detailCell.textContent = result.detail;
    stateCell.textContent = result.passed ? "通过" : "失败";
  }
  output.textContent = JSON.stringify(summary, null, 2);
}

async function run(): Promise<void> {
  const results = [
    await probeKdfFixedVector(),
    await probeKdfRejectsArbitraryProfile(),
    await probeAesGcmFixedVector(),
    probeJcsFixedVector(),
    await probeFragmentFixedVector(),
  ];
  const summary = {
    schemaVersion: "1.0.0",
    kind: "datapulse-device-probe",
    profileId: KDF_PROFILE_ID,
    recordedAt: new Date().toISOString(),
    userAgent: navigator.userAgent,
    language: navigator.language,
    hardwareConcurrency: navigator.hardwareConcurrency,
    results,
    allPassed: results.every((result) => result.passed),
  };
  render(results, summary);
}

void run();
