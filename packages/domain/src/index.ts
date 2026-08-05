export {
  DOMAIN_ERROR_CODES,
  type DomainError,
  type DomainErrorCode,
  type DomainIdInvalidError,
  type DomainIdInvalidReason,
  type DomainVersionDuplicateError,
  type DomainVersionInvalidError,
  type DomainVersionInvalidReason,
  type DomainVersionUnsupportedError,
} from "./errors.js";

export {
  DOMAIN_ID_PREFIXES,
  DOMAIN_ID_SUFFIX_LIMITS,
  isDomainId,
  parseAnalysisConditionId,
  parseDatasetVersionId,
  parseDomainId,
  parseEvidenceId,
  parseFieldId,
  parseJudgmentRuleId,
  parseMetricId,
  parseNarrativeRuleId,
  parseStoryBlockId,
  parseStoryId,
  type AnalysisConditionId,
  type DatasetVersionId,
  type DomainId,
  type DomainIdKind,
  type DomainIdPrefix,
  type EvidenceId,
  type FieldId,
  type JudgmentRuleId,
  type MetricId,
  type NarrativeRuleId,
  type StoryBlockId,
  type StoryId,
} from "./ids.js";

export {
  type DomainResult,
  type Result,
  type ResultFailure,
  type ResultSuccess,
} from "./results.js";

export {
  CORE_VERSION_LIMITS,
  createVersionRegistry,
  isVersionRegistry,
  parseCoreVersion,
  resolveVersion,
  type CoreVersion,
  type RegisteredVersion,
  type VersionRegistry,
  type VersionRegistryCreationError,
  type VersionResolutionError,
} from "./versions.js";
