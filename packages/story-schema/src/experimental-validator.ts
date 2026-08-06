import generatedExperimentalStructureValidator from "./generated/experimental-story-blueprint.validator.generated.js";
import type {
  ExperimentalStoryBlueprintValidationContext,
  ExperimentalStoryBlueprintValidationResult,
  ValidatedExperimentalStoryBlueprint,
} from "./development-validation-contract.js";
import {
  validateStoryWithStructure,
  type StandaloneStructureValidator,
} from "./semantic-core.js";

const validateExperimentalStructure =
  generatedExperimentalStructureValidator as StandaloneStructureValidator;

/**
 * 仅供未发布 0.x development seam 使用；不从包根导出，也不构成正式兼容承诺。
 */
export function validateExperimentalStoryBlueprint(
  input: unknown,
  contextInput: ExperimentalStoryBlueprintValidationContext,
): ExperimentalStoryBlueprintValidationResult {
  return validateStoryWithStructure<ValidatedExperimentalStoryBlueprint>(
    input,
    contextInput,
    validateExperimentalStructure,
  );
}
