import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";

import { describe, expect, it, vi } from "vitest";
import { build as viteBuild } from "vite";

import {
  STORY_BLUEPRINT_TEXT_RULES,
  STORY_BLUEPRINT_VALIDATION_LIMITS,
  STORY_BLUEPRINT_VALIDATION_ERROR_CODES,
  validateCurrentStory,
  type StoryValidationResult,
} from "../../packages/story-schema/dist/index.js";

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
  theme: { themeId: "enterprise-minimal" },
  visual: { renderMode: "2d", scenePreset: "none", motionPreset: "none" },
  blocks: [
    {
      blockId: "story_block_overview",
      blockType: "title-summary",
      layout: { variant: "full-width" },
      additionalConditionIds: [] as string[],
      evidenceIds: ["evidence_revenue"],
      judgmentRuleIds: [] as string[],
      narrativeRuleIds: [] as string[],
      content: {
        title: "季度经营复盘",
        summary: "本故事只呈现可由已登记证据复算的结果。",
      },
      visualVariant: "hero",
    },
    {
      blockId: "story_block_revenue",
      blockType: "kpi",
      layout: { variant: "emphasis" },
      additionalConditionIds: [] as string[],
      metricId: "metric_revenue",
      evidenceIds: ["evidence_revenue"],
      judgmentRuleIds: ["judgment_rule_target-gap"],
      narrativeRuleIds: ["narrative_rule_target-gap"],
      label: "营业收入",
      visualVariant: "metric-feature",
    },
  ],
});

const clone = <Value>(value: Value): Value => JSON.parse(JSON.stringify(value)) as Value;

const createValidContext = (blueprint = createValidBlueprint()) => ({
  expectedStoryId: blueprint.storyId,
  expectedDatasetVersionId: blueprint.datasetVersionId,
  references: clone(blueprint.references),
  expectedGlobalConditions: clone(
    blueprint.conditions.filter((condition) => blueprint.globalConditionIds.includes(condition.conditionId)),
  ),
  kpiApplicableMetricIds: ["metric_revenue"],
});

function expectFailureCode(
  result: StoryValidationResult,
  code: (typeof STORY_BLUEPRINT_VALIDATION_ERROR_CODES)[keyof typeof STORY_BLUEPRINT_VALIDATION_ERROR_CODES],
): void {
  expect(result.ok).toBe(false);
  if (result.ok) return;
  expect(result.error.issues.map((issue) => issue.code)).toContain(code);
  result.error.issues.forEach((issue) => expect(issue.path).toMatch(/^\$(?:\/[^.]*)?$/u));
  expect(Object.isFrozen(result)).toBe(true);
  expect(Object.isFrozen(result.error)).toBe(true);
  expect(Object.isFrozen(result.error.issues)).toBe(true);
  result.error.issues.forEach((issue) => expect(Object.isFrozen(issue)).toBe(true));
}

describe("M0-048 正式 StoryBlueprint 生成产物", () => {
  it("提交的 standalone validator 只使用静态 ESM helper 且不含动态代码", async () => {
    const validatorSource = await readFile(
      new URL(
        "../../packages/story-schema/src/generated/formal-story-blueprint-v1_0_0.validator.generated.ts",
        import.meta.url,
      ),
      "utf8",
    );
    const generatedTypes = await readFile(
      new URL(
        "../../packages/story-schema/src/generated/formal-story-blueprint-v1_0_0.generated.ts",
        import.meta.url,
      ),
      "utf8",
    );

    expect(validatorSource.charCodeAt(0)).not.toBe(0xfeff);
    expect(validatorSource).not.toContain("\r");
    expect(validatorSource).not.toMatch(/\brequire\s*\(/u);
    expect(validatorSource).not.toMatch(/\beval\s*\(/u);
    expect(validatorSource).not.toMatch(/\bnew\s+Function\b/u);
    expect(validatorSource).not.toMatch(/\bimport\s*\(/u);
    expect(validatorSource).toContain('from "ajv/dist/runtime/ucs2length.js"');
    expect(validatorSource).toContain('from "ajv/dist/runtime/equal.js"');
    expect(generatedTypes).toContain("export interface StoryBlueprint");
    expect(validatorSource).not.toContain(process.cwd());
    expect(generatedTypes).not.toContain(process.cwd());
  });

  it("固定正式 1.0.0 的 Windows 对象资源与文本规则 profile", () => {
    expect(STORY_BLUEPRINT_VALIDATION_LIMITS).toEqual({
      profileVersion: "1.0.0",
      maxSnapshotUtf8Bytes: 16 * 1024 * 1024,
      maxDepth: 16,
      maxNodes: 65_536,
      maxReferenceOccurrences: 65_536,
      maxIssues: 32,
    });
    expect(STORY_BLUEPRINT_TEXT_RULES.numericLexiconVersion).toBe(
      "zh-CN-numeric-v1",
    );
    expect(Object.isFrozen(STORY_BLUEPRINT_VALIDATION_LIMITS)).toBe(true);
  });

  it("生成器从外部 cwd 仍可核对含空格 workspace 路径", () => {
    const generatorPath = fileURLToPath(
      new URL("../../packages/story-schema/scripts/generate-artifacts.mjs", import.meta.url),
    );
    const result = spawnSync(process.execPath, [generatorPath, "--check"], {
      cwd: tmpdir(),
      encoding: "utf8",
      timeout: 10_000,
      windowsHide: true,
    });

    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain('"check": "story-schema-generated-artifacts"');
    expect(result.stdout).toContain('"result": "passed"');
    expect(result.stdout).not.toContain(process.cwd());

    const invalidResult = spawnSync(process.execPath, [generatorPath, "--bad"], {
      cwd: tmpdir(),
      encoding: "utf8",
      timeout: 10_000,
      windowsHide: true,
    });
    const invalidSummary = JSON.parse(invalidResult.stderr) as {
      error?: string;
      result?: string;
    };

    expect(invalidResult.status).toBe(1);
    expect(invalidResult.stdout).toBe("");
    expect(invalidSummary).toMatchObject({
      error: "STORY_SCHEMA_GENERATION_FAILED",
      result: "failed",
    });
    expect(invalidResult.stderr).not.toContain(process.cwd());
    expect(invalidResult.stderr).not.toMatch(/(?:file:\/\/\/|\n\s+at\s)/u);
  });

  it("Node 原生 ESM 可从含空格绝对 URL 加载并调用公开 dist seam", () => {
    const moduleUrl = new URL(
      "../../packages/story-schema/dist/index.js",
      import.meta.url,
    ).href;
    const probe = [
      `import { validateCurrentStory } from ${JSON.stringify(moduleUrl)};`,
      "const result = validateCurrentStory({}, {});",
      'if (result.ok !== false) throw new Error("validator probe unexpectedly passed");',
      'process.stdout.write("native-esm-probe=passed");',
    ].join("\n");
    const result = spawnSync(process.execPath, ["--input-type=module", "--eval", probe], {
      cwd: tmpdir(),
      encoding: "utf8",
      timeout: 10_000,
      windowsHide: true,
    });

    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toBe("native-esm-probe=passed");
    expect(result.stderr).toBe("");
  });

  it("通过 Vite 8 no-write ESM 打包探针（不冒充产品应用构建）", async () => {
    const result = await viteBuild({
      configFile: false,
      logLevel: "silent",
      build: {
        write: false,
        minify: false,
        lib: {
          entry: fileURLToPath(
            new URL("../../packages/story-schema/dist/index.js", import.meta.url),
          ),
          formats: ["es"],
          name: "DataPulseStorySchemaProbe",
        },
      },
    });
    const outputs = Array.isArray(result)
      ? result.flatMap((output) => output.output)
      : result.output;
    const chunks = outputs.filter((output) => output.type === "chunk");

    expect(chunks).toHaveLength(1);
    expect(chunks[0]!.code.length).toBeGreaterThan(0);
    expect(chunks[0]!.code).toContain("validateCurrentStory");
    expect(chunks[0]!.code).not.toContain("experimental");
    expect(chunks[0]!.code).not.toContain("0.1.0");
    expect(chunks[0]!.code).not.toContain("storyTimeZone");
  });
});

describe("M0-048 正式 StoryBlueprint 安全快照与结构校验", () => {
  it("返回与输入隔离、深冻结且无运行时品牌字段的安全快照", () => {
    const blueprint = createValidBlueprint();
    const originalTitle = blueprint.blocks[0]!.content.title;
    const result = validateCurrentStory(blueprint, createValidContext(blueprint));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).not.toBe(blueprint);
    expect(result.value.blocks).not.toBe(blueprint.blocks);
    expect(result.value.blocks[0]).not.toBe(blueprint.blocks[0]);
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.value)).toBe(true);
    expect(Object.isFrozen(result.value.blocks)).toBe(true);
    expect(Object.isFrozen(result.value.blocks[0])).toBe(true);
    expect(Object.getOwnPropertySymbols(result.value)).toEqual([]);

    blueprint.blocks[0]!.content.title = "输入已被后续修改";
    expect(result.value.blocks[0].blockType).toBe("title-summary");
    if (result.value.blocks[0].blockType === "title-summary") {
      expect(result.value.blocks[0].content.title).toBe(originalTitle);
    }
    expect(Object.isFrozen(blueprint)).toBe(false);
  });

  it("结构错误有界且不回显攻击者控制的属性名", () => {
    const blueprint = createValidBlueprint();
    const secretProperty = "secret-attacker-controlled-property";
    Object.assign(blueprint, { [secretProperty]: "不要回显" });
    const result = validateCurrentStory(blueprint, createValidContext());

    expectFailureCode(result, STORY_BLUEPRINT_VALIDATION_ERROR_CODES.structureInvalid);
    expect(JSON.stringify(result)).not.toContain(secretProperty);
    if (!result.ok) {
      expect(result.error.issues.length).toBeLessThanOrEqual(
        STORY_BLUEPRINT_VALIDATION_LIMITS.maxIssues,
      );
    }
  });

  it("拒绝 getter 且不执行 getter", () => {
    const blueprint = createValidBlueprint();
    let getterCalls = 0;
    Object.defineProperty(blueprint, "hostile", {
      enumerable: true,
      get() {
        getterCalls += 1;
        throw new Error("getter-secret-marker");
      },
    });

    const result = validateCurrentStory(blueprint, createValidContext());
    expectFailureCode(result, STORY_BLUEPRINT_VALIDATION_ERROR_CODES.inputAccessor);
    expect(getterCalls).toBe(0);
    expect(JSON.stringify(result)).not.toContain("getter-secret-marker");
  });

  it("捕获 revoked Proxy trap 且不让异常逃逸", () => {
    const { proxy, revoke } = Proxy.revocable(createValidBlueprint(), {});
    revoke();
    const result = validateCurrentStory(proxy, createValidContext());
    expectFailureCode(result, STORY_BLUEPRINT_VALIDATION_ERROR_CODES.inputUnreadable);
  });

  it.each([
    ["循环", STORY_BLUEPRINT_VALIDATION_ERROR_CODES.inputAlias, (blueprint: ReturnType<typeof createValidBlueprint>) => {
      Object.assign(blueprint, { cycle: blueprint });
    }],
    ["共享别名", STORY_BLUEPRINT_VALIDATION_ERROR_CODES.inputAlias, (blueprint: ReturnType<typeof createValidBlueprint>) => {
      const shared = { marker: "synthetic" };
      Object.assign(blueprint, { first: shared, second: shared });
    }],
    ["稀疏数组", STORY_BLUEPRINT_VALIDATION_ERROR_CODES.inputSparseArray, (blueprint: ReturnType<typeof createValidBlueprint>) => {
      Object.assign(blueprint, { sparse: new Array(2) });
    }],
    ["Symbol 属性", STORY_BLUEPRINT_VALIDATION_ERROR_CODES.inputSymbolProperty, (blueprint: ReturnType<typeof createValidBlueprint>) => {
      Object.defineProperty(blueprint, Symbol("synthetic"), { enumerable: true, value: true });
    }],
    ["Date 实例", STORY_BLUEPRINT_VALIDATION_ERROR_CODES.inputNonPlainObject, (blueprint: ReturnType<typeof createValidBlueprint>) => {
      Object.assign(blueprint, { date: new Date(0) });
    }],
    ["null prototype", STORY_BLUEPRINT_VALIDATION_ERROR_CODES.inputNonPlainObject, (blueprint: ReturnType<typeof createValidBlueprint>) => {
      Object.assign(blueprint, { record: Object.create(null) });
    }],
    ["BigInt", STORY_BLUEPRINT_VALIDATION_ERROR_CODES.inputNonJsonValue, (blueprint: ReturnType<typeof createValidBlueprint>) => {
      Object.assign(blueprint, { bigint: 1n });
    }],
    ["NaN", STORY_BLUEPRINT_VALIDATION_ERROR_CODES.inputNonJsonValue, (blueprint: ReturnType<typeof createValidBlueprint>) => {
      Object.assign(blueprint, { invalidNumber: Number.NaN });
    }],
    ["undefined", STORY_BLUEPRINT_VALIDATION_ERROR_CODES.inputNonJsonValue, (blueprint: ReturnType<typeof createValidBlueprint>) => {
      Object.assign(blueprint, { missing: undefined });
    }],
  ])("拒绝%s", (_name, errorCode, mutate) => {
    const blueprint = createValidBlueprint();
    mutate(blueprint);
    expectFailureCode(
      validateCurrentStory(blueprint, createValidContext()),
      errorCode,
    );
  });

  it("拒绝超过深度、节点和对象快照 UTF-8 上限的输入", () => {
    const tooDeep = createValidBlueprint();
    let cursor: Record<string, unknown> = tooDeep;
    for (let index = 0; index < STORY_BLUEPRINT_VALIDATION_LIMITS.maxDepth; index += 1) {
      const nested: Record<string, unknown> = {};
      cursor["nested"] = nested;
      cursor = nested;
    }
    expectFailureCode(
      validateCurrentStory(tooDeep, createValidContext()),
      STORY_BLUEPRINT_VALIDATION_ERROR_CODES.depthLimit,
    );

    const tooManyNodes = createValidBlueprint();
    let nodeArrayOwnKeysCalls = 0;
    let nodeArrayDescriptorCalls = 0;
    const nodeArray = new Proxy(
      Array.from(
        { length: STORY_BLUEPRINT_VALIDATION_LIMITS.maxNodes },
        () => 0,
      ),
      {
        ownKeys(target) {
          nodeArrayOwnKeysCalls += 1;
          return Reflect.ownKeys(target);
        },
        getOwnPropertyDescriptor(target, key) {
          nodeArrayDescriptorCalls += 1;
          return Reflect.getOwnPropertyDescriptor(target, key);
        },
      },
    );
    Object.assign(tooManyNodes, { nodes: nodeArray });
    expectFailureCode(
      validateCurrentStory(tooManyNodes, createValidContext()),
      STORY_BLUEPRINT_VALIDATION_ERROR_CODES.nodeLimit,
    );
    expect(nodeArrayOwnKeysCalls).toBe(0);
    expect(nodeArrayDescriptorCalls).toBe(1);

    const tooManyObjectKeys = createValidBlueprint();
    let nodeObjectOwnKeysCalls = 0;
    let nodeObjectDescriptorCalls = 0;
    const objectKeys = Array.from(
      { length: STORY_BLUEPRINT_VALIDATION_LIMITS.maxNodes },
      (_value, index) => `key_${index}`,
    );
    const nodeObject = new Proxy(
      {},
      {
        ownKeys() {
          nodeObjectOwnKeysCalls += 1;
          return objectKeys;
        },
        getOwnPropertyDescriptor() {
          nodeObjectDescriptorCalls += 1;
          return undefined;
        },
      },
    );
    Object.assign(tooManyObjectKeys, { nodes: nodeObject });
    expectFailureCode(
      validateCurrentStory(tooManyObjectKeys, createValidContext()),
      STORY_BLUEPRINT_VALIDATION_ERROR_CODES.nodeLimit,
    );
    expect(nodeObjectOwnKeysCalls).toBe(1);
    expect(nodeObjectDescriptorCalls).toBe(0);

    const tooManyBytes = createValidBlueprint();
    Object.assign(tooManyBytes, {
      bytes: "x".repeat(STORY_BLUEPRINT_VALIDATION_LIMITS.maxSnapshotUtf8Bytes),
    });
    expectFailureCode(
      validateCurrentStory(tooManyBytes, createValidContext()),
      STORY_BLUEPRINT_VALIDATION_ERROR_CODES.snapshotByteLimit,
    );
  });

  it("对恶意 trusted context 同样 fail-closed 且不执行 getter", () => {
    const context = createValidContext();
    let getterCalls = 0;
    Object.defineProperty(context, "hostile", {
      enumerable: true,
      get() {
        getterCalls += 1;
        return "secret-context-marker";
      },
    });
    const result = validateCurrentStory(createValidBlueprint(), context);
    expectFailureCode(result, STORY_BLUEPRINT_VALIDATION_ERROR_CODES.contextInvalid);
    expect(getterCalls).toBe(0);
    expect(JSON.stringify(result)).not.toContain("secret-context-marker");
  });
});

describe("M0-048 正式 StoryBlueprint 可信身份与引用", () => {
  it.each([
    ["storyId", (blueprint: ReturnType<typeof createValidBlueprint>) => {
      blueprint.storyId = "story_other";
    }],
    ["datasetVersionId", (blueprint: ReturnType<typeof createValidBlueprint>) => {
      blueprint.datasetVersionId = "dataset_version_other";
    }],
  ])("拒绝与可信 context 不一致的%s", (_name, mutate) => {
    const blueprint = createValidBlueprint();
    const context = createValidContext(blueprint);
    mutate(blueprint);
    expectFailureCode(
      validateCurrentStory(blueprint, context),
      STORY_BLUEPRINT_VALIDATION_ERROR_CODES.identityMismatch,
    );
  });

  it("拒绝候选把伪引用同时加入自身 catalog 和使用点", () => {
    const blueprint = createValidBlueprint();
    blueprint.references.metricIds.push("metric_fabricated");
    blueprint.blocks[1]!.metricId = "metric_fabricated";
    const result = validateCurrentStory(blueprint, createValidContext());
    expectFailureCode(result, STORY_BLUEPRINT_VALIDATION_ERROR_CODES.referenceCatalogUntrusted);
    expectFailureCode(result, STORY_BLUEPRINT_VALIDATION_ERROR_CODES.referenceUnknown);
  });

  it("拒绝使用点未在候选 catalog 声明的可信引用", () => {
    const blueprint = createValidBlueprint();
    blueprint.references.evidenceIds = [];
    expectFailureCode(
      validateCurrentStory(blueprint, createValidContext()),
      STORY_BLUEPRINT_VALIDATION_ERROR_CODES.referenceUnknown,
    );
  });

  it("拒绝重复 blockId、conditionId 和悬空条件引用", () => {
    const duplicateBlock = createValidBlueprint();
    duplicateBlock.blocks[1]!.blockId = duplicateBlock.blocks[0]!.blockId;
    expectFailureCode(
      validateCurrentStory(duplicateBlock, createValidContext()),
      STORY_BLUEPRINT_VALIDATION_ERROR_CODES.blockIdDuplicate,
    );

    const duplicateCondition = createValidBlueprint();
    duplicateCondition.conditions.push(clone(duplicateCondition.conditions[0]!));
    expectFailureCode(
      validateCurrentStory(duplicateCondition, createValidContext()),
      STORY_BLUEPRINT_VALIDATION_ERROR_CODES.conditionIdDuplicate,
    );

    const dangling = createValidBlueprint();
    dangling.blocks[1]!.additionalConditionIds.push("analysis_condition_missing");
    expectFailureCode(
      validateCurrentStory(dangling, createValidContext()),
      STORY_BLUEPRINT_VALIDATION_ERROR_CODES.referenceUnknown,
    );
  });

  it("拒绝删除或改写可信的全局条件", () => {
    const removed = createValidBlueprint();
    const removedContext = createValidContext(removed);
    removed.globalConditionIds = [];
    expectFailureCode(
      validateCurrentStory(removed, removedContext),
      STORY_BLUEPRINT_VALIDATION_ERROR_CODES.globalConditionMismatch,
    );

    const widened = createValidBlueprint();
    const widenedContext = createValidContext(widened);
    widened.conditions[0]!.start = "2026-01-01";
    expectFailureCode(
      validateCurrentStory(widened, widenedContext),
      STORY_BLUEPRINT_VALIDATION_ERROR_CODES.globalConditionMismatch,
    );
  });

  it("拒绝无效 context catalog、重复 ID 和越权 KPI 白名单", () => {
    const duplicateContext = createValidContext();
    duplicateContext.references.metricIds.push("metric_revenue");
    expectFailureCode(
      validateCurrentStory(createValidBlueprint(), duplicateContext),
      STORY_BLUEPRINT_VALIDATION_ERROR_CODES.contextInvalid,
    );

    const widenedWhitelist = createValidContext();
    widenedWhitelist.kpiApplicableMetricIds.push("metric_not-trusted");
    expectFailureCode(
      validateCurrentStory(createValidBlueprint(), widenedWhitelist),
      STORY_BLUEPRINT_VALIDATION_ERROR_CODES.contextInvalid,
    );
  });
});

describe("M0-048 正式 StoryBlueprint 条件语义", () => {
  it("接受真实闰日和显式 offset，并且不调用 Date.parse", () => {
    const blueprint = createValidBlueprint();
    blueprint.conditions[0]!.start = "2024-02-29T08:00:00+08:00";
    blueprint.conditions[0]!.end = "2024-02-29T00:30:00Z";
    const context = createValidContext(blueprint);
    const dateParse = vi.spyOn(Date, "parse").mockImplementation(() => {
      throw new Error("Date.parse must not be used");
    });

    const result = validateCurrentStory(blueprint, context);
    expect(result.ok).toBe(true);
    expect(dateParse).not.toHaveBeenCalled();
  });

  it.each([
    ["不存在的日期", "2026-02-29", "2026-03-01"],
    ["反向范围", "2026-06-30", "2026-04-01"],
    ["date-only 与 datetime 混用", "2026-04-01", "2026-06-30T00:00:00Z"],
    ["非法 offset", "2026-04-01T00:00:00+14:30", "2026-06-30T00:00:00Z"],
  ])("拒绝%s", (_name, start, end) => {
    const blueprint = createValidBlueprint();
    const context = createValidContext(blueprint);
    blueprint.conditions[0]!.start = start;
    blueprint.conditions[0]!.end = end;
    expectFailureCode(
      validateCurrentStory(blueprint, context),
      STORY_BLUEPRINT_VALIDATION_ERROR_CODES.conditionInvalid,
    );
  });

  it("接受新区块字段上的追加条件", () => {
    const blueprint = createValidBlueprint();
    blueprint.conditions.push({
      conditionId: "analysis_condition_east",
      kind: "category-in",
      fieldId: "field_region",
      values: ["华东"],
      includeMissing: false,
    });
    blueprint.blocks[1]!.additionalConditionIds.push("analysis_condition_east");
    expect(validateCurrentStory(blueprint, createValidContext()).ok).toBe(true);
  });

  it("接受同字段时间子集并拒绝放宽或复用全局条件", () => {
    const narrowed = createValidBlueprint();
    narrowed.conditions.push({
      conditionId: "analysis_condition_may",
      kind: "time-range",
      fieldId: "field_order-date",
      start: "2026-05-01",
      end: "2026-05-31",
    });
    narrowed.blocks[1]!.additionalConditionIds.push("analysis_condition_may");
    expect(validateCurrentStory(narrowed, createValidContext()).ok).toBe(true);

    const widened = createValidBlueprint();
    widened.conditions.push({
      conditionId: "analysis_condition_wide",
      kind: "time-range",
      fieldId: "field_order-date",
      start: "2026-03-01",
      end: "2026-07-31",
    });
    widened.blocks[1]!.additionalConditionIds.push("analysis_condition_wide");
    expectFailureCode(
      validateCurrentStory(widened, createValidContext()),
      STORY_BLUEPRINT_VALIDATION_ERROR_CODES.conditionLoosened,
    );

    const reused = createValidBlueprint();
    reused.blocks[1]!.additionalConditionIds.push("analysis_condition_q2");
    expectFailureCode(
      validateCurrentStory(reused, createValidContext()),
      STORY_BLUEPRINT_VALIDATION_ERROR_CODES.conditionLoosened,
    );
  });

  it("数值和分类 additional 必须是全部同字段 global 的子集", () => {
    const numeric = createValidBlueprint();
    numeric.references.fieldIds.push("field_amount");
    numeric.conditions = [
      {
        conditionId: "analysis_condition_amount",
        kind: "number-range",
        fieldId: "field_amount",
        minimum: 0,
        maximum: 100,
      },
      {
        conditionId: "analysis_condition_amount-narrow",
        kind: "number-range",
        fieldId: "field_amount",
        minimum: 10,
        maximum: 90,
      },
    ];
    numeric.globalConditionIds = ["analysis_condition_amount"];
    numeric.blocks[1]!.additionalConditionIds = ["analysis_condition_amount-narrow"];
    expect(validateCurrentStory(numeric, createValidContext(numeric)).ok).toBe(true);
    numeric.conditions[1]!.minimum = -1;
    expectFailureCode(
      validateCurrentStory(numeric, createValidContext({
        ...numeric,
        conditions: [numeric.conditions[0]!],
      })),
      STORY_BLUEPRINT_VALIDATION_ERROR_CODES.conditionLoosened,
    );

    const category = createValidBlueprint();
    category.conditions = [
      {
        conditionId: "analysis_condition_regions",
        kind: "category-in",
        fieldId: "field_region",
        values: ["华东", "华北"],
        includeMissing: false,
      },
      {
        conditionId: "analysis_condition_east",
        kind: "category-in",
        fieldId: "field_region",
        values: ["华东"],
        includeMissing: false,
      },
    ];
    category.globalConditionIds = ["analysis_condition_regions"];
    category.blocks[1]!.additionalConditionIds = ["analysis_condition_east"];
    expect(validateCurrentStory(category, createValidContext(category)).ok).toBe(true);
    category.conditions[1]!.values = ["华南"];
    expectFailureCode(
      validateCurrentStory(category, createValidContext({
        ...category,
        conditions: [category.conditions[0]!],
      })),
      STORY_BLUEPRINT_VALIDATION_ERROR_CODES.conditionLoosened,
    );
  });
});

describe("M0-048 正式 StoryBlueprint 文本与最小 KPI 适用性", () => {
  it.each([
    ["ASCII 数字", "收入增长 12%"],
    ["全角数字", "收入增长１２％"],
    ["阿拉伯-印度数字", "收入增长 ١٢٪"],
    ["中文日期", "二〇二六年收入"],
    ["中文数量", "收入增长三十倍"],
    ["财务大写数字", "收入增长壹佰美元"],
    ["隐含倍数", "收入翻倍"],
    ["隐含翻番", "净利翻番"],
    ["隐含分数", "收入减少一半"],
    ["零宽绕过", "收入增长 1\u200B2%"],
    ["罗马数字", "第Ⅳ阶段收入"],
  ])("拒绝%s硬编码", (_name, text) => {
    const blueprint = createValidBlueprint();
    blueprint.blocks[0]!.content.summary = text;
    expectFailureCode(
      validateCurrentStory(blueprint, createValidContext()),
      STORY_BLUEPRINT_VALIDATION_ERROR_CODES.hardcodedNumber,
    );
  });

  it("中性词中的单个中文数字字形不误报", () => {
    const blueprint = createValidBlueprint();
    blueprint.blocks[0]!.content.summary = "统一口径，结果与证据一致。";
    expect(validateCurrentStory(blueprint, createValidContext()).ok).toBe(true);
  });

  it("评价词必须在同一区块绑定可信 judgment rule", () => {
    const blueprint = createValidBlueprint();
    blueprint.blocks[0]!.content.summary = "营业表现显著改善。";
    expectFailureCode(
      validateCurrentStory(blueprint, createValidContext()),
      STORY_BLUEPRINT_VALIDATION_ERROR_CODES.judgmentRuleRequired,
    );

    blueprint.blocks[0]!.judgmentRuleIds = ["judgment_rule_target-gap"];
    expect(validateCurrentStory(blueprint, createValidContext()).ok).toBe(true);
  });

  it.each(["营业表现暴跌。", "营业表现稳健。", "营业表现低迷。", "盈利承压。"])(
    "拒绝未绑定 judgment rule 的扩展评价词：%s",
    (text) => {
      const blueprint = createValidBlueprint();
      blueprint.blocks[0]!.content.summary = text;
      expectFailureCode(
        validateCurrentStory(blueprint, createValidContext()),
        STORY_BLUEPRINT_VALIDATION_ERROR_CODES.judgmentRuleRequired,
      );
    },
  );

  it("KPI metric 必须属于可信的最小适用白名单", () => {
    const blueprint = createValidBlueprint();
    const context = createValidContext(blueprint);
    context.kpiApplicableMetricIds = [];
    expectFailureCode(
      validateCurrentStory(blueprint, context),
      STORY_BLUEPRINT_VALIDATION_ERROR_CODES.kpiMetricNotApplicable,
    );
  });
});
