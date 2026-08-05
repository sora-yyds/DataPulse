import {
  createDomainVersionDuplicateError,
  createDomainVersionInvalidError,
  createDomainVersionUnsupportedError,
  type DomainVersionDuplicateError,
  type DomainVersionInvalidError,
  type DomainVersionUnsupportedError,
} from "./errors.js";
import {
  domainFailure,
  domainSuccess,
  type DomainResult,
} from "./results.js";

/**
 * 每个 core SemVer 数字分量限制到有符号 32 位正整数上限。
 * 这让版本值可被常见跨语言实现精确持久化，同时远低于 JS 安全整数边界。
 */
export const CORE_VERSION_LIMITS = Object.freeze({
  maxNumericIdentifier: 2_147_483_647,
  maxEncodedLength: 32,
  maxRegistryEntries: 64,
} as const);

declare const coreVersionBrand: unique symbol;
declare const registeredVersionBrand: unique symbol;
declare const versionRegistryBrand: unique symbol;

export type CoreVersion = `${number}.${number}.${number}` & {
  readonly [coreVersionBrand]: true;
};

export type RegisteredVersion<Kind extends string> = CoreVersion & {
  readonly [registeredVersionBrand]: Kind;
};

export interface VersionRegistry<Kind extends string> {
  readonly kind: Kind;
  readonly versions: readonly RegisteredVersion<Kind>[];
  readonly latest: RegisteredVersion<Kind>;
  readonly [versionRegistryBrand]: Kind;
}

export type VersionRegistryCreationError =
  | DomainVersionInvalidError
  | DomainVersionDuplicateError;

export type VersionResolutionError =
  | DomainVersionInvalidError
  | DomainVersionUnsupportedError;

const CORE_VERSION_PATTERN =
  /^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$/;
const VERSION_REGISTRY_KIND_PATTERN = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
const VERSION_REGISTRY_KIND_MAX_LENGTH = 64;
const versionRegistryInstances = new WeakMap<object, string>();

type VersionParts = readonly [major: number, minor: number, patch: number];

function readVersionParts(input: string): VersionParts | undefined {
  const match = CORE_VERSION_PATTERN.exec(input);
  if (match === null) {
    return undefined;
  }

  const majorText = match[1];
  const minorText = match[2];
  const patchText = match[3];
  if (majorText === undefined || minorText === undefined || patchText === undefined) {
    return undefined;
  }

  return [Number(majorText), Number(minorText), Number(patchText)];
}

function partsAreInRange(parts: VersionParts): boolean {
  return parts.every(
    (part) => Number.isSafeInteger(part) && part <= CORE_VERSION_LIMITS.maxNumericIdentifier,
  );
}

function isVersionRegistryKind(input: unknown): input is string {
  return (
    typeof input === "string" &&
    input.length >= 1 &&
    input.length <= VERSION_REGISTRY_KIND_MAX_LENGTH &&
    VERSION_REGISTRY_KIND_PATTERN.test(input)
  );
}

export function parseCoreVersion(
  input: unknown,
): DomainResult<CoreVersion, DomainVersionInvalidError> {
  if (typeof input !== "string") {
    return domainFailure(createDomainVersionInvalidError("type"));
  }

  if (input.length > CORE_VERSION_LIMITS.maxEncodedLength) {
    return domainFailure(createDomainVersionInvalidError("range"));
  }

  const parts = readVersionParts(input);
  if (parts === undefined) {
    return domainFailure(createDomainVersionInvalidError("format"));
  }

  if (!partsAreInRange(parts)) {
    return domainFailure(createDomainVersionInvalidError("range"));
  }

  return domainSuccess(input as CoreVersion);
}

function compareCoreVersions(left: CoreVersion, right: CoreVersion): number {
  const leftParts = readVersionParts(left);
  const rightParts = readVersionParts(right);
  if (leftParts === undefined || rightParts === undefined) {
    return 0;
  }

  for (let index = 0; index < leftParts.length; index += 1) {
    const leftPart = leftParts[index];
    const rightPart = rightParts[index];
    if (leftPart === undefined || rightPart === undefined) {
      return 0;
    }
    if (leftPart !== rightPart) {
      return leftPart - rightPart;
    }
  }

  return 0;
}

/**
 * 创建协议隔离的只读注册表。`kind` 必须是 1–64 字符的小写 ASCII kebab-case，
 * 调用方应传入字面量，以便 TypeScript 保留协议 kind 并阻止跨协议混用。
 */
export function createVersionRegistry<const Kind extends string>(
  kind: Kind,
  input: unknown,
): DomainResult<VersionRegistry<Kind>, VersionRegistryCreationError> {
  if (!isVersionRegistryKind(kind)) {
    return domainFailure(createDomainVersionInvalidError("registry_kind"));
  }

  let candidates: unknown[];
  try {
    if (!Array.isArray(input)) {
      return domainFailure(createDomainVersionInvalidError("registry_type"));
    }

    const candidateCount = input.length;
    if (!Number.isSafeInteger(candidateCount) || candidateCount < 0) {
      return domainFailure(createDomainVersionInvalidError("registry_type"));
    }
    if (candidateCount === 0) {
      return domainFailure(createDomainVersionInvalidError("registry_empty"));
    }
    if (candidateCount > CORE_VERSION_LIMITS.maxRegistryEntries) {
      return domainFailure(createDomainVersionInvalidError("registry_size"));
    }

    candidates = [];
    for (let index = 0; index < candidateCount; index += 1) {
      candidates.push(input[index]);
    }
  } catch {
    return domainFailure(createDomainVersionInvalidError("registry_type"));
  }

  const versions: CoreVersion[] = [];
  const seen = new Set<string>();
  for (const candidate of candidates) {
    const parsed = parseCoreVersion(candidate);
    if (!parsed.ok) {
      return parsed;
    }
    if (seen.has(parsed.value)) {
      return domainFailure(createDomainVersionDuplicateError());
    }
    seen.add(parsed.value);
    versions.push(parsed.value);
  }

  versions.sort(compareCoreVersions);
  const frozenVersions = Object.freeze(versions.slice()) as readonly RegisteredVersion<Kind>[];
  const latest = frozenVersions[frozenVersions.length - 1];
  if (latest === undefined) {
    return domainFailure(createDomainVersionInvalidError("registry_empty"));
  }

  const registry = Object.freeze({
    kind,
    versions: frozenVersions,
    latest,
  }) as VersionRegistry<Kind>;
  versionRegistryInstances.set(registry, kind);
  return domainSuccess(registry);
}

export function isVersionRegistry<const Kind extends string>(
  input: unknown,
  expectedKind: Kind,
): input is VersionRegistry<Kind> {
  return (
    isVersionRegistryKind(expectedKind) &&
    typeof input === "object" &&
    input !== null &&
    versionRegistryInstances.get(input) === expectedKind
  );
}

/** 只在注册表与调用方声明的协议 kind 完全一致时解析已登记版本。 */
export function resolveVersion<Registry extends VersionRegistry<string>>(
  registry: Registry,
  expectedKind: Registry["kind"],
  input: unknown,
): DomainResult<RegisteredVersion<Registry["kind"]>, VersionResolutionError> {
  if (!isVersionRegistryKind(expectedKind)) {
    return domainFailure(createDomainVersionInvalidError("registry_kind"));
  }
  if (typeof registry !== "object" || registry === null) {
    return domainFailure(createDomainVersionInvalidError("registry_type"));
  }
  const registeredKind = versionRegistryInstances.get(registry);
  if (registeredKind === undefined) {
    return domainFailure(createDomainVersionInvalidError("registry_type"));
  }
  if (registeredKind !== expectedKind) {
    return domainFailure(createDomainVersionInvalidError("registry_kind"));
  }

  const parsed = parseCoreVersion(input);
  if (!parsed.ok) {
    return parsed;
  }

  if (!(registry.versions as readonly string[]).includes(parsed.value)) {
    return domainFailure(createDomainVersionUnsupportedError());
  }

  return domainSuccess(parsed.value as RegisteredVersion<Registry["kind"]>);
}

type ExpectFalse<Value extends false> = Value;
type _CoreVersionRejectsUnparsedLiteral = ExpectFalse<
  "1.0.0" extends CoreVersion ? true : false
>;
type _RegisteredVersionKindsStayDistinct = ExpectFalse<
  RegisteredVersion<"story-blueprint"> extends RegisteredVersion<"metric-accumulator">
    ? true
    : false
>;
type _VersionRegistryKindsStayDistinct = ExpectFalse<
  VersionRegistry<"story-blueprint"> extends VersionRegistry<"metric-accumulator">
    ? true
    : false
>;
type _StructuralRegistryIsRejected = ExpectFalse<
  {
    readonly kind: "story-blueprint";
    readonly versions: readonly RegisteredVersion<"story-blueprint">[];
    readonly latest: RegisteredVersion<"story-blueprint">;
  } extends VersionRegistry<"story-blueprint">
    ? true
    : false
>;
