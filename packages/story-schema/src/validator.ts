import generatedFormalStructureValidator from "./generated/formal-story-blueprint-v1_0_0.validator.generated.js";
import {
  validateStoryWithStructure,
  type StandaloneStructureValidator,
} from "./semantic-core.js";
import type {
  StoryValidationContext,
  StoryValidationResult,
  ValidatedStoryBlueprint,
} from "./validation-contract.js";

const validateCurrentStructure =
  generatedFormalStructureValidator as StandaloneStructureValidator;

/**
 * 对进程内未知对象执行当前正式故事蓝图校验。该 Interface 不解析字符串或字节；
 * 外部 artifact 必须先经过 Story Artifact Reader seam 的原始字节限制与版本迁移。
 */
export function validateCurrentStory(
  input: unknown,
  contextInput: StoryValidationContext,
): StoryValidationResult {
  return validateStoryWithStructure<ValidatedStoryBlueprint>(
    input,
    contextInput,
    validateCurrentStructure,
  );
}
