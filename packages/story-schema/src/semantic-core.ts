import type {
  AnalysisCondition,
  KpiBlock,
  StoryBlock,
  StoryBlueprint,
  TitleSummaryBlock,
} from "./generated/formal-story-blueprint-v1_0_0.generated.js";
import {
  createSafeJsonSnapshot,
  deepFreezeJson,
  type JsonValue,
  type SnapshotFailureReason,
} from "./safe-json-snapshot.js";
import {
  STORY_BLUEPRINT_VALIDATION_LIMITS,
  STORY_BLUEPRINT_VALIDATION_ERROR_CODES,
  type DeepReadonly,
  type StoryReferenceCatalog,
  type StoryBlueprintValidationError,
  type StoryBlueprintValidationIssue,
  type StoryBlueprintValidationIssueCode,
  type StoryValidationContext,
} from "./validation-contract.js";

export type StandaloneStructureValidator = ((value: unknown) => boolean) & {
  errors?: readonly Readonly<{ instancePath?: unknown }>[] | null;
};

type TrustedContextSnapshot = DeepReadonly<StoryValidationContext>;
type SemanticStoryBlueprint = Pick<
  StoryBlueprint,
  | "storyId"
  | "datasetVersionId"
  | "references"
  | "conditions"
  | "globalConditionIds"
  | "blocks"
>;

const limits = STORY_BLUEPRINT_VALIDATION_LIMITS;

const SNAPSHOT_FAILURE_CODES: Readonly<Record<SnapshotFailureReason, StoryBlueprintValidationIssueCode>> =
  Object.freeze({
    accessor: STORY_BLUEPRINT_VALIDATION_ERROR_CODES.inputAccessor,
    alias: STORY_BLUEPRINT_VALIDATION_ERROR_CODES.inputAlias,
    byte_limit: STORY_BLUEPRINT_VALIDATION_ERROR_CODES.snapshotByteLimit,
    depth_limit: STORY_BLUEPRINT_VALIDATION_ERROR_CODES.depthLimit,
    non_json_value: STORY_BLUEPRINT_VALIDATION_ERROR_CODES.inputNonJsonValue,
    non_plain_object: STORY_BLUEPRINT_VALIDATION_ERROR_CODES.inputNonPlainObject,
    node_limit: STORY_BLUEPRINT_VALIDATION_ERROR_CODES.nodeLimit,
    sparse_array: STORY_BLUEPRINT_VALIDATION_ERROR_CODES.inputSparseArray,
    symbol_property: STORY_BLUEPRINT_VALIDATION_ERROR_CODES.inputSymbolProperty,
    unreadable: STORY_BLUEPRINT_VALIDATION_ERROR_CODES.inputUnreadable,
  });

const REFERENCE_KEYS = Object.freeze([
  "fieldIds",
  "metricIds",
  "evidenceIds",
  "judgmentRuleIds",
  "narrativeRuleIds",
] as const);

type ReferenceKey = (typeof REFERENCE_KEYS)[number];

const ID_RULES: Readonly<Record<ReferenceKey | "storyId" | "datasetVersionId" | "conditionId", RegExp>> =
  Object.freeze({
    storyId: /^story_[a-z0-9]+(?:-[a-z0-9]+)*$/u,
    datasetVersionId: /^dataset_version_[a-z0-9]+(?:-[a-z0-9]+)*$/u,
    fieldIds: /^field_[a-z0-9]+(?:-[a-z0-9]+)*$/u,
    metricIds: /^metric_[a-z0-9]+(?:-[a-z0-9]+)*$/u,
    evidenceIds: /^evidence_[a-z0-9]+(?:-[a-z0-9]+)*$/u,
    judgmentRuleIds: /^judgment_rule_[a-z0-9]+(?:-[a-z0-9]+)*$/u,
    narrativeRuleIds: /^narrative_rule_[a-z0-9]+(?:-[a-z0-9]+)*$/u,
    conditionId: /^analysis_condition_[a-z0-9]+(?:-[a-z0-9]+)*$/u,
  });

const KNOWN_SCHEMA_PATH_SEGMENTS = new Set([
  "additionalConditionIds",
  "blocks",
  "blockId",
  "blockType",
  "conditions",
  "conditionId",
  "content",
  "datasetVersionId",
  "end",
  "evidenceIds",
  "fieldId",
  "fieldIds",
  "globalConditionIds",
  "includeMissing",
  "judgmentRuleIds",
  "kind",
  "label",
  "layout",
  "maximum",
  "metricId",
  "metricIds",
  "minimum",
  "motionPreset",
  "narrativeRuleIds",
  "references",
  "renderMode",
  "reportGoal",
  "scenePreset",
  "schemaVersion",
  "start",
  "storyId",
  "storyTimezone",
  "summary",
  "theme",
  "themeId",
  "title",
  "values",
  "variant",
  "visual",
  "visualVariant",
]);

const UNICODE_NUMBER_PATTERN = /\p{Number}/u;
const DEFAULT_IGNORABLE_PATTERN = /\p{Default_Ignorable_Code_Point}/gu;
const CHINESE_DIGIT = "零〇○一二两三四五六七八九壹贰叁肆伍陆柒捌玖";
const CHINESE_UNIT = "十百千万亿兆拾佰仟萬億";
const CHINESE_MEASURE = "个项年月日季周天时分秒元人件笔次倍成折半";
const CHINESE_NUMBER_PATTERNS = Object.freeze([
  new RegExp(`[${CHINESE_DIGIT}]{2,}`, "u"),
  new RegExp(`(?:第|百分之)[${CHINESE_DIGIT}${CHINESE_UNIT}]+`, "u"),
  new RegExp(
    `[${CHINESE_DIGIT}](?:[${CHINESE_UNIT}]|点[${CHINESE_DIGIT}]|[${CHINESE_MEASURE}])`,
    "u",
  ),
  new RegExp(`[${CHINESE_UNIT}](?:[${CHINESE_DIGIT}]+|[${CHINESE_MEASURE}])`, "u"),
  new RegExp(`[${CHINESE_UNIT}]{2,}`, "u"),
]);
const SINGLE_CHINESE_NUMBER_SEPARATOR = `[\\s:：]{0,4}`;
const SINGLE_CHINESE_RANK_BOUNDARY = `(?=$|[位名，。！？；、,.!?;:%％）)\\]】》」』])`;
const SINGLE_CHINESE_QUANTITY_BOUNDARY =
  `(?=$|[${CHINESE_MEASURE}种类组家名台份条位，。！？；、,.!?;:%％）)\\]】》」』])`;
const SINGLE_CHINESE_NUMBER_CONTEXT_PATTERNS = Object.freeze([
  new RegExp(
    `(?:排名|位列|名列|排在|排序(?:为|是)?)${SINGLE_CHINESE_NUMBER_SEPARATOR}[${CHINESE_DIGIT}]${SINGLE_CHINESE_RANK_BOUNDARY}`,
    "u",
  ),
  new RegExp(
    `(?:结果|数量|总数|合计|总计|共计|共有|仅有|只有)${SINGLE_CHINESE_NUMBER_SEPARATOR}(?:为|是)?${SINGLE_CHINESE_NUMBER_SEPARATOR}[${CHINESE_DIGIT}]${SINGLE_CHINESE_QUANTITY_BOUNDARY}`,
    "u",
  ),
]);
const LEXICAL_QUANTITY_PATTERN = /(?:翻倍|翻番|倍增|减半|半数|过半|成倍|一半)/u;
const JUDGMENT_LANGUAGE_PATTERN =
  /(?:增长|上升|提升|下降|降低|减少|暴涨|暴跌|大涨|大跌|激增|骤降|翻倍|翻番|倍增|减半|达标|未达标|超标|领先|落后|异常|显著|强劲|稳健|亮眼|突出|疲软|疲弱|低迷|承压|改善|恶化|偏高|偏低|高于|低于|优于|劣于|超过|不足|优秀|欠佳|较好|较差|最好|最差|最高|最低|持平|超预期|主要贡献|核心贡献)/u;

class IssueCollector {
  readonly #issues = new Map<string, StoryBlueprintValidationIssue>();
  #truncated = false;

  add(code: StoryBlueprintValidationIssueCode, path: string): void {
    const key = `${code}\u0000${path}`;
    if (this.#issues.has(key)) return;
    if (this.#issues.size >= limits.maxIssues) {
      this.#truncated = true;
      return;
    }
    this.#issues.set(key, Object.freeze({ code, path }));
  }

  get hasIssues(): boolean {
    return this.#issues.size > 0;
  }

  toError(): StoryBlueprintValidationError {
    const issues = [...this.#issues.values()].sort(
      (left, right) =>
        (left.path < right.path ? -1 : left.path > right.path ? 1 : 0) ||
        (left.code < right.code ? -1 : left.code > right.code ? 1 : 0),
    );
    return Object.freeze({
      code: STORY_BLUEPRINT_VALIDATION_ERROR_CODES.validationFailed,
      issues: Object.freeze(issues),
      truncated: this.#truncated,
    });
  }
}

type ValidationFailure = Readonly<{
  ok: false;
  error: StoryBlueprintValidationError;
  value?: never;
}>;

type ValidationResult<Value> =
  | Readonly<{ ok: true; value: Value; error?: never }>
  | ValidationFailure;

function failure(collector: IssueCollector): ValidationFailure {
  return Object.freeze({ ok: false, error: collector.toError() });
}

function singleFailure(
  code: StoryBlueprintValidationIssueCode,
  path = "$",
): ValidationFailure {
  const collector = new IssueCollector();
  collector.add(code, path);
  return failure(collector);
}

function isRecord(value: JsonValue | undefined): value is { [key: string]: JsonValue } {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function hasExactKeys(value: { [key: string]: JsonValue }, expected: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const sortedExpected = [...expected].sort();
  return actual.length === sortedExpected.length && actual.every((key, index) => key === sortedExpected[index]);
}

function isValidId(value: JsonValue | undefined, rule: keyof typeof ID_RULES): value is string {
  if (typeof value !== "string") return false;
  const prefixLength = rule === "storyId"
    ? 6
    : rule === "datasetVersionId"
      ? 16
      : rule === "fieldIds"
        ? 6
        : rule === "metricIds"
          ? 7
          : rule === "evidenceIds"
            ? 9
            : rule === "judgmentRuleIds"
              ? 14
              : rule === "narrativeRuleIds"
                ? 15
                : 19;
  return value.length >= prefixLength + 1 && value.length <= prefixLength + 64 && ID_RULES[rule].test(value);
}

function isUniqueStringList(
  value: JsonValue | undefined,
  rule: ReferenceKey,
  maxItems = 256,
): value is string[] {
  return (
    Array.isArray(value) &&
    value.length <= maxItems &&
    value.every((item) => isValidId(item, rule)) &&
    new Set(value).size === value.length
  );
}

function isCategoryValue(value: JsonValue): value is string | number | boolean {
  return typeof value === "string" || typeof value === "number" || typeof value === "boolean";
}

function categoryValueKey(value: string | number | boolean): string {
  if (typeof value === "string") return `string:${JSON.stringify(value)}`;
  if (typeof value === "boolean") return `boolean:${value ? "true" : "false"}`;
  return `number:${Object.is(value, -0) ? "0" : String(value)}`;
}

function isContextCondition(value: JsonValue): boolean {
  if (!isRecord(value)) return false;
  if (!isValidId(value["conditionId"], "conditionId") || !isValidId(value["fieldId"], "fieldIds")) {
    return false;
  }

  if (value["kind"] === "time-range") {
    return (
      hasExactKeys(value, ["conditionId", "kind", "fieldId", "start", "end"]) &&
      typeof value["start"] === "string" &&
      value["start"].length >= 10 &&
      value["start"].length <= 64 &&
      typeof value["end"] === "string" &&
      value["end"].length >= 10 &&
      value["end"].length <= 64
    );
  }
  if (value["kind"] === "category-in") {
    const values = value["values"];
    return (
      hasExactKeys(value, ["conditionId", "kind", "fieldId", "values", "includeMissing"]) &&
      Array.isArray(values) &&
      values.length >= 1 &&
      values.length <= 64 &&
      values.every(isCategoryValue) &&
      values.every((item) => typeof item !== "string" || (item.length >= 1 && item.length <= 256)) &&
      new Set(values.map(categoryValueKey)).size === values.length &&
      typeof value["includeMissing"] === "boolean"
    );
  }
  if (value["kind"] === "number-range") {
    const keys = Object.keys(value);
    return (
      keys.every((key) => ["conditionId", "kind", "fieldId", "minimum", "maximum"].includes(key)) &&
      (Object.hasOwn(value, "minimum") || Object.hasOwn(value, "maximum")) &&
      (!Object.hasOwn(value, "minimum") || typeof value["minimum"] === "number") &&
      (!Object.hasOwn(value, "maximum") || typeof value["maximum"] === "number")
    );
  }
  return false;
}

function parseTrustedContext(value: JsonValue): TrustedContextSnapshot | null {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, [
      "expectedStoryId",
      "expectedDatasetVersionId",
      "references",
      "expectedGlobalConditions",
      "kpiApplicableMetricIds",
    ]) ||
    !isValidId(value["expectedStoryId"], "storyId") ||
    !isValidId(value["expectedDatasetVersionId"], "datasetVersionId") ||
    !isRecord(value["references"]) ||
    !hasExactKeys(value["references"], REFERENCE_KEYS)
  ) {
    return null;
  }

  const referenceValue = value["references"];
  for (const referenceKey of REFERENCE_KEYS) {
    if (!isUniqueStringList(referenceValue[referenceKey], referenceKey)) return null;
  }
  const kpiApplicableMetricIds = value["kpiApplicableMetricIds"];
  const expectedGlobalConditionValues = value["expectedGlobalConditions"];
  if (!isUniqueStringList(kpiApplicableMetricIds, "metricIds", 256)) return null;
  if (
    !Array.isArray(expectedGlobalConditionValues) ||
    expectedGlobalConditionValues.length > 64 ||
    !expectedGlobalConditionValues.every(isContextCondition)
  ) {
    return null;
  }

  const references = referenceValue as unknown as StoryReferenceCatalog;
  const expectedGlobalConditions = expectedGlobalConditionValues as unknown as AnalysisCondition[];
  const trustedMetricIds = new Set(references.metricIds);
  const trustedFieldIds = new Set(references.fieldIds);
  if (!kpiApplicableMetricIds.every((metricId) => trustedMetricIds.has(metricId))) return null;
  if (!expectedGlobalConditions.every((condition) => trustedFieldIds.has(condition.fieldId))) return null;
  if (new Set(expectedGlobalConditions.map((condition) => condition.conditionId)).size !== expectedGlobalConditions.length) {
    return null;
  }
  if (!expectedGlobalConditions.every(conditionIsSemanticallyValid)) return null;

  return value as unknown as TrustedContextSnapshot;
}

type ParsedTemporal = Readonly<{ precision: "date" | "datetime"; scalar: bigint }>;

const TEMPORAL_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,9}))?(Z|[+-]\d{2}:\d{2}))?$/u;

function isLeapYear(year: number): boolean {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

function daysInMonth(year: number, month: number): number {
  if (month === 2) return isLeapYear(year) ? 29 : 28;
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

function dayOrdinal(year: number, month: number, day: number): number {
  const daysBeforeYear =
    365 * (year - 1) +
    Math.floor((year - 1) / 4) -
    Math.floor((year - 1) / 100) +
    Math.floor((year - 1) / 400);
  const monthOffsets = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];
  const monthOffset = monthOffsets[month - 1];
  if (monthOffset === undefined) return Number.NaN;
  return daysBeforeYear + monthOffset + (month > 2 && isLeapYear(year) ? 1 : 0) + day - 1;
}

function parseTemporal(value: string): ParsedTemporal | null {
  const match = TEMPORAL_PATTERN.exec(value);
  if (match === null) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (year < 1 || month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) {
    return null;
  }

  const ordinal = dayOrdinal(year, month, day);
  if (match[4] === undefined) {
    return Object.freeze({ precision: "date", scalar: BigInt(ordinal) });
  }

  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6]);
  const fraction = (match[7] ?? "").padEnd(9, "0");
  const zone = match[8];
  if (hour > 23 || minute > 59 || second > 59 || zone === undefined) return null;

  let offsetMinutes = 0;
  if (zone !== "Z") {
    const offsetHour = Number(zone.slice(1, 3));
    const offsetMinute = Number(zone.slice(4, 6));
    if (offsetHour > 14 || offsetMinute > 59 || (offsetHour === 14 && offsetMinute !== 0)) return null;
    offsetMinutes = (offsetHour * 60 + offsetMinute) * (zone.startsWith("+") ? 1 : -1);
  }

  const seconds =
    BigInt(ordinal) * 86_400n +
    BigInt(hour * 3600 + minute * 60 + second - offsetMinutes * 60);
  return Object.freeze({
    precision: "datetime",
    scalar: seconds * 1_000_000_000n + BigInt(fraction || "0"),
  });
}

function conditionIsSemanticallyValid(condition: AnalysisCondition): boolean {
  if (condition.kind === "time-range") {
    const start = parseTemporal(condition.start);
    const end = parseTemporal(condition.end);
    return start !== null && end !== null && start.precision === end.precision && start.scalar <= end.scalar;
  }
  if (condition.kind === "number-range") {
    return condition.minimum === undefined || condition.maximum === undefined || condition.minimum <= condition.maximum;
  }
  return true;
}

function conditionsEquivalent(left: AnalysisCondition, right: AnalysisCondition): boolean {
  if (
    left.conditionId !== right.conditionId ||
    left.kind !== right.kind ||
    left.fieldId !== right.fieldId
  ) {
    return false;
  }
  if (left.kind === "time-range" && right.kind === "time-range") {
    return left.start === right.start && left.end === right.end;
  }
  if (left.kind === "number-range" && right.kind === "number-range") {
    return left.minimum === right.minimum && left.maximum === right.maximum;
  }
  if (left.kind === "category-in" && right.kind === "category-in") {
    const rightValues = new Set(right.values.map(categoryValueKey));
    return (
      left.includeMissing === right.includeMissing &&
      left.values.length === right.values.length &&
      left.values.every((value) => rightValues.has(categoryValueKey(value)))
    );
  }
  return false;
}

function conditionIsSubset(additional: AnalysisCondition, global: AnalysisCondition): boolean {
  if (additional.kind !== global.kind) return false;
  if (additional.kind === "time-range" && global.kind === "time-range") {
    const additionalStart = parseTemporal(additional.start);
    const additionalEnd = parseTemporal(additional.end);
    const globalStart = parseTemporal(global.start);
    const globalEnd = parseTemporal(global.end);
    return (
      additionalStart !== null &&
      additionalEnd !== null &&
      globalStart !== null &&
      globalEnd !== null &&
      additionalStart.precision === globalStart.precision &&
      additionalEnd.precision === globalEnd.precision &&
      additionalStart.scalar >= globalStart.scalar &&
      additionalEnd.scalar <= globalEnd.scalar
    );
  }
  if (additional.kind === "number-range" && global.kind === "number-range") {
    const lowerBoundPreserved =
      global.minimum === undefined ||
      (additional.minimum !== undefined && additional.minimum >= global.minimum);
    const upperBoundPreserved =
      global.maximum === undefined ||
      (additional.maximum !== undefined && additional.maximum <= global.maximum);
    return lowerBoundPreserved && upperBoundPreserved;
  }
  if (additional.kind === "category-in" && global.kind === "category-in") {
    const globalValues = new Set(global.values.map(categoryValueKey));
    return (
      !(global.includeMissing === false && additional.includeMissing === true) &&
      additional.values.every((value) => globalValues.has(categoryValueKey(value)))
    );
  }
  return false;
}

function normalizeAjvPath(value: unknown): string {
  if (typeof value !== "string" || value.length === 0) return "$";
  const segments = value.split("/").slice(1);
  if (
    segments.some(
      (segment) => !/^\d+$/u.test(segment) && !KNOWN_SCHEMA_PATH_SEGMENTS.has(segment),
    )
  ) {
    return "$";
  }
  return `$${value}`;
}

function recordStructureErrors(
  collector: IssueCollector,
  structureValidator: StandaloneStructureValidator,
): void {
  const errors = structureValidator.errors;
  if (!Array.isArray(errors) || errors.length === 0) {
    collector.add(STORY_BLUEPRINT_VALIDATION_ERROR_CODES.structureInvalid, "$" );
    return;
  }
  for (const error of errors) {
    collector.add(
      STORY_BLUEPRINT_VALIDATION_ERROR_CODES.structureInvalid,
      normalizeAjvPath(error.instancePath),
    );
  }
}

function countReferenceOccurrences(blueprint: SemanticStoryBlueprint): number {
  let count = 2;
  for (const key of REFERENCE_KEYS) count += blueprint.references[key].length;
  count += blueprint.globalConditionIds.length;
  for (const condition of blueprint.conditions) count += 2;
  for (const block of blueprint.blocks) {
    count += 1 + block.additionalConditionIds.length;
    count += block.evidenceIds.length + block.judgmentRuleIds.length + block.narrativeRuleIds.length;
    if (block.blockType === "kpi") count += 1;
  }
  return count;
}

function hasHardcodedNumber(value: string): boolean {
  const stripped = value.replace(DEFAULT_IGNORABLE_PATTERN, "");
  const normalized = stripped.normalize("NFKC");
  return (
    UNICODE_NUMBER_PATTERN.test(stripped) ||
    UNICODE_NUMBER_PATTERN.test(normalized) ||
    LEXICAL_QUANTITY_PATTERN.test(normalized) ||
    CHINESE_NUMBER_PATTERNS.some((pattern) => pattern.test(normalized)) ||
    SINGLE_CHINESE_NUMBER_CONTEXT_PATTERNS.some((pattern) => pattern.test(normalized))
  );
}

function hasJudgmentLanguage(value: string): boolean {
  return JUDGMENT_LANGUAGE_PATTERN.test(
    value.normalize("NFKC").replace(DEFAULT_IGNORABLE_PATTERN, ""),
  );
}

function validateText(
  block: TitleSummaryBlock | KpiBlock,
  blockIndex: number,
  collector: IssueCollector,
): void {
  const texts = block.blockType === "title-summary"
    ? [
        [`$/blocks/${blockIndex}/content/title`, block.content.title],
        [`$/blocks/${blockIndex}/content/summary`, block.content.summary],
      ] as const
    : [[`$/blocks/${blockIndex}/label`, block.label]] as const;

  for (const [path, value] of texts) {
    if (hasHardcodedNumber(value)) {
      collector.add(STORY_BLUEPRINT_VALIDATION_ERROR_CODES.hardcodedNumber, path);
    }
    if (hasJudgmentLanguage(value) && block.judgmentRuleIds.length === 0) {
      collector.add(STORY_BLUEPRINT_VALIDATION_ERROR_CODES.judgmentRuleRequired, path);
    }
  }
}

function validateSemantics(
  blueprint: SemanticStoryBlueprint,
  context: TrustedContextSnapshot,
  collector: IssueCollector,
): void {
  if (blueprint.storyId !== context.expectedStoryId) {
    collector.add(STORY_BLUEPRINT_VALIDATION_ERROR_CODES.identityMismatch, "$/storyId");
  }
  if (blueprint.datasetVersionId !== context.expectedDatasetVersionId) {
    collector.add(STORY_BLUEPRINT_VALIDATION_ERROR_CODES.identityMismatch, "$/datasetVersionId");
  }

  if (countReferenceOccurrences(blueprint) > limits.maxReferenceOccurrences) {
    collector.add(STORY_BLUEPRINT_VALIDATION_ERROR_CODES.referenceLimit, "$");
    return;
  }

  const candidateReferences = Object.fromEntries(
    REFERENCE_KEYS.map((key) => [key, new Set(blueprint.references[key])]),
  ) as Record<ReferenceKey, Set<string>>;
  const trustedReferences = Object.fromEntries(
    REFERENCE_KEYS.map((key) => [key, new Set(context.references[key])]),
  ) as Record<ReferenceKey, Set<string>>;

  for (const key of REFERENCE_KEYS) {
    blueprint.references[key].forEach((reference, index) => {
      if (!trustedReferences[key].has(reference)) {
        collector.add(
          STORY_BLUEPRINT_VALIDATION_ERROR_CODES.referenceCatalogUntrusted,
          `$/references/${key}/${index}`,
        );
      }
    });
  }

  const requireReference = (key: ReferenceKey, reference: string, path: string): void => {
    if (!candidateReferences[key].has(reference) || !trustedReferences[key].has(reference)) {
      collector.add(STORY_BLUEPRINT_VALIDATION_ERROR_CODES.referenceUnknown, path);
    }
  };

  const conditionById = new Map<string, AnalysisCondition>();
  blueprint.conditions.forEach((condition, index) => {
    if (conditionById.has(condition.conditionId)) {
      collector.add(
        STORY_BLUEPRINT_VALIDATION_ERROR_CODES.conditionIdDuplicate,
        `$/conditions/${index}/conditionId`,
      );
    } else {
      conditionById.set(condition.conditionId, condition);
    }
    requireReference("fieldIds", condition.fieldId, `$/conditions/${index}/fieldId`);
    if (!conditionIsSemanticallyValid(condition)) {
      collector.add(STORY_BLUEPRINT_VALIDATION_ERROR_CODES.conditionInvalid, `$/conditions/${index}`);
    }
  });

  const globalConditionIds = new Set(blueprint.globalConditionIds);
  blueprint.globalConditionIds.forEach((conditionId, index) => {
    if (!conditionById.has(conditionId)) {
      collector.add(
        STORY_BLUEPRINT_VALIDATION_ERROR_CODES.referenceUnknown,
        `$/globalConditionIds/${index}`,
      );
    }
  });

  const expectedGlobalById = new Map(
    context.expectedGlobalConditions.map((condition) => [condition.conditionId, condition as AnalysisCondition]),
  );
  if (
    expectedGlobalById.size !== globalConditionIds.size ||
    [...expectedGlobalById.keys()].some((conditionId) => !globalConditionIds.has(conditionId))
  ) {
    collector.add(
      STORY_BLUEPRINT_VALIDATION_ERROR_CODES.globalConditionMismatch,
      "$/globalConditionIds",
    );
  }
  for (const [conditionId, expectedCondition] of expectedGlobalById) {
    const candidateCondition = conditionById.get(conditionId);
    if (candidateCondition === undefined || !conditionsEquivalent(candidateCondition, expectedCondition)) {
      collector.add(
        STORY_BLUEPRINT_VALIDATION_ERROR_CODES.globalConditionMismatch,
        "$/globalConditionIds",
      );
    }
  }

  const blockIds = new Set<string>();
  const applicableKpiMetrics = new Set(context.kpiApplicableMetricIds);
  blueprint.blocks.forEach((block: StoryBlock, blockIndex) => {
    if (blockIds.has(block.blockId)) {
      collector.add(
        STORY_BLUEPRINT_VALIDATION_ERROR_CODES.blockIdDuplicate,
        `$/blocks/${blockIndex}/blockId`,
      );
    } else {
      blockIds.add(block.blockId);
    }

    block.evidenceIds.forEach((reference, index) =>
      requireReference("evidenceIds", reference, `$/blocks/${blockIndex}/evidenceIds/${index}`),
    );
    block.judgmentRuleIds.forEach((reference, index) =>
      requireReference(
        "judgmentRuleIds",
        reference,
        `$/blocks/${blockIndex}/judgmentRuleIds/${index}`,
      ),
    );
    block.narrativeRuleIds.forEach((reference, index) =>
      requireReference(
        "narrativeRuleIds",
        reference,
        `$/blocks/${blockIndex}/narrativeRuleIds/${index}`,
      ),
    );

    if (block.blockType === "kpi") {
      requireReference("metricIds", block.metricId, `$/blocks/${blockIndex}/metricId`);
      if (!applicableKpiMetrics.has(block.metricId)) {
        collector.add(
          STORY_BLUEPRINT_VALIDATION_ERROR_CODES.kpiMetricNotApplicable,
          `$/blocks/${blockIndex}/metricId`,
        );
      }
    }

    block.additionalConditionIds.forEach((conditionId, conditionIndex) => {
      const path = `$/blocks/${blockIndex}/additionalConditionIds/${conditionIndex}`;
      const additional = conditionById.get(conditionId);
      if (additional === undefined) {
        collector.add(STORY_BLUEPRINT_VALIDATION_ERROR_CODES.referenceUnknown, path);
        return;
      }
      if (globalConditionIds.has(conditionId)) {
        collector.add(STORY_BLUEPRINT_VALIDATION_ERROR_CODES.conditionLoosened, path);
        return;
      }
      const sameFieldGlobals = blueprint.globalConditionIds
        .map((globalId) => conditionById.get(globalId))
        .filter(
          (condition): condition is AnalysisCondition =>
            condition !== undefined && condition.fieldId === additional.fieldId,
        );
      if (sameFieldGlobals.some((global) => !conditionIsSubset(additional, global))) {
        collector.add(STORY_BLUEPRINT_VALIDATION_ERROR_CODES.conditionLoosened, path);
      }
    });

    validateText(block, blockIndex, collector);
  });
}

export function validateStoryWithStructure<
  Value extends DeepReadonly<SemanticStoryBlueprint>,
>(
  input: unknown,
  contextInput: StoryValidationContext,
  structureValidator: StandaloneStructureValidator,
): ValidationResult<Value> {
  try {
    const contextSnapshot = createSafeJsonSnapshot(contextInput, limits);
    if (!contextSnapshot.ok) {
      return singleFailure(STORY_BLUEPRINT_VALIDATION_ERROR_CODES.contextInvalid);
    }
    const context = parseTrustedContext(contextSnapshot.value);
    if (context === null) {
      return singleFailure(STORY_BLUEPRINT_VALIDATION_ERROR_CODES.contextInvalid);
    }

    const candidateSnapshot = createSafeJsonSnapshot(input, limits);
    if (!candidateSnapshot.ok) {
      return singleFailure(SNAPSHOT_FAILURE_CODES[candidateSnapshot.reason]);
    }

    if (!structureValidator(candidateSnapshot.value)) {
      const collector = new IssueCollector();
      recordStructureErrors(collector, structureValidator);
      return failure(collector);
    }

    const blueprint = candidateSnapshot.value as unknown as SemanticStoryBlueprint;
    const collector = new IssueCollector();
    validateSemantics(blueprint, context, collector);
    if (collector.hasIssues) return failure(collector);

    const value = deepFreezeJson(candidateSnapshot.value) as unknown as Value;
    return Object.freeze({ ok: true, value });
  } catch {
    return singleFailure(STORY_BLUEPRINT_VALIDATION_ERROR_CODES.validatorUnavailable);
  }
}
