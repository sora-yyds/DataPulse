import {
  STORY_ARTIFACT_READ_ERROR_CODES,
  type StoryArtifactReadError,
  type StoryArtifactReadResult,
  type StoryArtifactValidationContext,
} from "./contract.js";
import { formalStoryHistoryAdapter } from "./internal/formal-registry.js";
import { readStoryArtifactWithHistory } from "./internal/reader-core.js";

/**
 * 从不可信原始字节读取当前正式故事蓝图。正式 history registry 当前仅包含
 * 1.0.0，未发布的 0.x 开发样本会作为不支持版本拒绝。该 Reader 不访问存储，
 * 也不修改调用方现有的草稿、故事版本或项目包；失败结果始终没有 value。
 */
export function readStoryArtifact(
  input: Uint8Array,
  context: StoryArtifactValidationContext,
): StoryArtifactReadResult {
  const result = readStoryArtifactWithHistory(
    input,
    context,
    formalStoryHistoryAdapter,
  );
  if (result.ok) {
    return Object.freeze({
      ok: true,
      value: result.value,
    });
  }

  const internalError = result.error;
  let error: StoryArtifactReadError;
  switch (internalError.code) {
    case STORY_ARTIFACT_READ_ERROR_CODES.byteLimitExceeded:
      error = Object.freeze({
        code: internalError.code,
        details: internalError.details,
        phase: "size",
      });
      break;
    case STORY_ARTIFACT_READ_ERROR_CODES.sourceStructureInvalid:
      error = Object.freeze({
        code: internalError.code,
        details: internalError.details,
        phase: "source-validation",
      });
      break;
    case STORY_ARTIFACT_READ_ERROR_CODES.migratedStructureInvalid:
      error = Object.freeze({
        code: internalError.code,
        details: internalError.details,
        phase: "step-validation",
      });
      break;
    case STORY_ARTIFACT_READ_ERROR_CODES.finalValidationFailed:
      error = Object.freeze({
        code: internalError.code,
        details: internalError.details,
        phase: "final-validation",
      });
      break;
    case STORY_ARTIFACT_READ_ERROR_CODES.versionUnsupported:
      error = Object.freeze({
        code: internalError.code,
        phase: "version",
      });
      break;
    case STORY_ARTIFACT_READ_ERROR_CODES.migrationUnavailable:
    case STORY_ARTIFACT_READ_ERROR_CODES.migrationFailed:
      error = Object.freeze({
        code: internalError.code,
        phase: "migration",
      });
      break;
    default:
      error = Object.freeze({
        code: internalError.code,
        phase: internalError.phase,
      });
  }
  return Object.freeze({ error, ok: false });
}
