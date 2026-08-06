import Ajv2020 from "ajv/dist/2020.js";
import { describe, expect, it } from "vitest";

import {
  DOMAIN_ID_PREFIXES,
  DOMAIN_ID_SUFFIX_LIMITS,
} from "../../packages/domain/dist/index.js";
import {
  STORY_BLUEPRINT_VALIDATION_ERROR_CODES,
  currentStoryContract,
  validateCurrentStory,
} from "../../packages/story-schema/dist/index.js";
import { THEME_IDS } from "../../packages/themes/dist/index.js";

const createValidBlueprint = () => ({
  schemaVersion: "1.0.0",
  storyId: "story_quarterly-review",
  datasetVersionId: "dataset_version_2026-q2",
  reportGoal: "解释本季度核心经营结果及其主要限制",
  storyTimezone: "Asia/Shanghai",
  references: {
    fieldIds: ["field_order-date", "field_region"],
    metricIds: ["metric_revenue"],
    evidenceIds: ["evidence_revenue"],
    judgmentRuleIds: ["judgment_rule_target-gap"],
    narrativeRuleIds: ["narrative_rule_target-gap"],
  },
  conditions: [
    {
      conditionId: "analysis_condition_q2",
      kind: "time-range",
      fieldId: "field_order-date",
      start: "2026-04-01",
      end: "2026-06-30",
    },
  ],
  globalConditionIds: ["analysis_condition_q2"],
  theme: {
    themeId: "enterprise-minimal",
  },
  visual: {
    renderMode: "2d",
    scenePreset: "none",
    motionPreset: "none",
  },
  blocks: [
    {
      blockId: "story_block_overview",
      blockType: "title-summary",
      layout: {
        variant: "full-width",
      },
      additionalConditionIds: [],
      evidenceIds: ["evidence_revenue"],
      judgmentRuleIds: [],
      narrativeRuleIds: [],
      content: {
        title: "季度经营复盘",
        summary: "本故事只呈现可由已登记证据复算的结果。",
      },
      visualVariant: "hero",
    },
    {
      blockId: "story_block_revenue",
      blockType: "kpi",
      layout: {
        variant: "emphasis",
      },
      additionalConditionIds: [],
      metricId: "metric_revenue",
      evidenceIds: ["evidence_revenue"],
      judgmentRuleIds: ["judgment_rule_target-gap"],
      narrativeRuleIds: ["narrative_rule_target-gap"],
      label: "营业收入",
      visualVariant: "metric-feature",
    },
  ],
});

const createValidContext = () => ({
  expectedStoryId: "story_quarterly-review",
  expectedDatasetVersionId: "dataset_version_2026-q2",
  references: {
    fieldIds: ["field_order-date", "field_region"],
    metricIds: ["metric_revenue"],
    evidenceIds: ["evidence_revenue"],
    judgmentRuleIds: ["judgment_rule_target-gap"],
    narrativeRuleIds: ["narrative_rule_target-gap"],
  },
  expectedGlobalConditions: [
    {
      conditionId: "analysis_condition_q2",
      kind: "time-range" as const,
      fieldId: "field_order-date",
      start: "2026-04-01",
      end: "2026-06-30",
    },
  ],
  kpiApplicableMetricIds: ["metric_revenue"],
});

const compileSchema = () => {
  const ajv = new Ajv2020({
    allErrors: true,
    strict: true,
    validateFormats: false,
  });
  return ajv.compile(currentStoryContract.schema);
};

const schema = currentStoryContract.schema;

describe("M0-048 正式 StoryBlueprint Schema 1.0.0", () => {
  it("接受只包含受控标题、摘要和 KPI 的最小蓝图", () => {
    const validate = compileSchema();

    expect(schema.$id).toBe(currentStoryContract.schemaId);
    expect(schema.properties.schemaVersion.const).toBe(currentStoryContract.schemaVersion);
    expect(validate(createValidBlueprint()), JSON.stringify(validate.errors)).toBe(true);
  });

  it.each([
    ["未知根字段", (blueprint: ReturnType<typeof createValidBlueprint>) => {
      Object.assign(blueprint, { html: "<script>run()</script>" });
    }],
    ["任意图表配置", (blueprint: ReturnType<typeof createValidBlueprint>) => {
      Object.assign(blueprint.blocks[1]!, { echartsOption: { series: [] } });
    }],
    ["任意 Shader", (blueprint: ReturnType<typeof createValidBlueprint>) => {
      Object.assign(blueprint.visual, { shader: "void main() {}" });
    }],
    ["未登记区块", (blueprint: ReturnType<typeof createValidBlueprint>) => {
      blueprint.blocks[1]!.blockType = "custom-html";
    }],
    ["错误 ID 前缀", (blueprint: ReturnType<typeof createValidBlueprint>) => {
      blueprint.storyId = "metric_quarterly-review";
    }],
    ["隐式设备时区", (blueprint: ReturnType<typeof createValidBlueprint>) => {
      blueprint.storyTimezone = "local";
    }],
    ["3D 数据模式", (blueprint: ReturnType<typeof createValidBlueprint>) => {
      blueprint.visual.renderMode = "3d";
    }],
  ])("拒绝%s", (_name, mutate) => {
    const validate = compileSchema();
    const blueprint = createValidBlueprint();
    mutate(blueprint);

    expect(validate(blueprint)).toBe(false);
  });

  it("所有对象边界都显式关闭额外属性", () => {
    const visited = new Set<object>();
    const openObjectPaths: string[] = [];

    const visit = (value: unknown, path: string): void => {
      if (value === null || typeof value !== "object" || visited.has(value)) {
        return;
      }
      visited.add(value);

      if (!Array.isArray(value)) {
        const record = value as Record<string, unknown>;
        if (record.type === "object" && record.additionalProperties !== false) {
          openObjectPaths.push(path);
        }
        for (const [key, child] of Object.entries(record)) {
          visit(child, `${path}/${key}`);
        }
        return;
      }

      value.forEach((child, index) => visit(child, `${path}/${index}`));
    };

    visit(schema, "#");
    expect(openObjectPaths).toEqual([]);
  });

  it("公开 Schema 对象及其嵌套节点均不可变", () => {
    const visited = new Set<object>();

    const expectDeeplyFrozen = (value: unknown): void => {
      if (value === null || typeof value !== "object" || visited.has(value)) {
        return;
      }
      visited.add(value);

      expect(Object.isFrozen(value)).toBe(true);
      Object.values(value).forEach(expectDeeplyFrozen);
    };

    expectDeeplyFrozen(schema);
    expect(() => {
      Object.assign(schema.properties.schemaVersion, { const: "9.9.9" });
    }).toThrow(TypeError);
    expect(schema.properties.schemaVersion.const).toBe("1.0.0");
  });

  it("只登记 M0 最小区块与四个 DESIGN.md 主题", () => {
    expect(schema.$defs.storyBlock.oneOf).toEqual([
      { $ref: "#/$defs/titleSummaryBlock" },
      { $ref: "#/$defs/kpiBlock" },
    ]);
    expect(schema.$defs.theme.properties.themeId.enum).toEqual(THEME_IDS);
  });

  it("与 domain 的九类 opaque ID 前缀和长度保持一致", () => {
    const schemaDefinitions = {
      story: schema.$defs.storyId,
      datasetVersion: schema.$defs.datasetVersionId,
      field: schema.$defs.fieldId,
      storyBlock: schema.$defs.storyBlockId,
      analysisCondition: schema.$defs.analysisConditionId,
      metric: schema.$defs.metricId,
      evidence: schema.$defs.evidenceId,
      judgmentRule: schema.$defs.judgmentRuleId,
      narrativeRule: schema.$defs.narrativeRuleId,
    };

    for (const [kind, prefix] of Object.entries(DOMAIN_ID_PREFIXES)) {
      const definition = schemaDefinitions[kind as keyof typeof schemaDefinitions];
      expect(definition.pattern).toBe(`^${prefix}[a-z0-9]+(?:-[a-z0-9]+)*$`);
      expect(definition.minLength).toBe(prefix.length + DOMAIN_ID_SUFFIX_LIMITS.minLength);
      expect(definition.maxLength).toBe(prefix.length + DOMAIN_ID_SUFFIX_LIMITS.maxLength);
    }
  });
});

describe("M0-048 正式 StoryBlueprint 单个中文数词语义边界", () => {
  it.each(["结果排名二", "结果为两"])("拒绝数量或排名语境中的单个中文数词：%s", (text) => {
    const blueprint = createValidBlueprint();
    const titleSummary = blueprint.blocks[0] as { content: { summary: string } };
    titleSummary.content.summary = text;

    const result = validateCurrentStory(blueprint, createValidContext());
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.issues).toContainEqual({
      code: STORY_BLUEPRINT_VALIDATION_ERROR_CODES.hardcodedNumber,
      path: "$/blocks/0/content/summary",
    });
  });

  it.each(["统一口径，结果与证据一致。", "结果为一体化说明。"])(
    "不误报普通词汇中的单个中文数字字形：%s",
    (text) => {
      const blueprint = createValidBlueprint();
      const titleSummary = blueprint.blocks[0] as { content: { summary: string } };
      titleSummary.content.summary = text;

      expect(validateCurrentStory(blueprint, createValidContext()).ok).toBe(true);
    },
  );
});
