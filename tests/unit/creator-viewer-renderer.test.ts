import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  prepareCreatorStory,
  type PreparedStoryResult as CreatorPreparedStoryResult,
} from "../../apps/creator/dist/composition.js";
import {
  prepareViewerStory,
  type PreparedStoryResult as ViewerPreparedStoryResult,
} from "../../apps/viewer/dist/composition.js";
import { StoryRenderer } from "../../packages/renderer/dist/index.js";
import {
  DESIGN_SYSTEM_VARIABLES,
  THEMES,
  THEME_IDS,
  THEME_SEMANTIC_VARIABLES,
} from "../../packages/themes/dist/index.js";

const repositoryRoot = fileURLToPath(new URL("../../", import.meta.url));
const encoder = new TextEncoder();
const decoder = new TextDecoder("utf-8", { fatal: true });

type FileIdentity = Readonly<{
  path: string;
  bytes: number;
  sha256: string;
}>;

type FixtureCopy = Readonly<{
  storyArtifact: FileIdentity;
  metricRuntime: FileIdentity;
}>;

type CompositionFixtureManifest = Readonly<{
  schemaVersion: string;
  kind: string;
  hashAlgorithm: string;
  generatorVersion: string;
  storySchema: FileIdentity &
    Readonly<{
      schemaVersion: string;
      schemaId: string;
    }>;
  metricRuntimeCanonicalReference: Readonly<{
    manifest: FileIdentity;
    fixture: FileIdentity &
      Readonly<{
        id: string;
        caseId: string;
      }>;
  }>;
  contentIdentity: Readonly<{
    storyArtifactSha256: string;
    metricRuntimeSha256: string;
  }>;
  expected: Readonly<{
    storyId: string;
    datasetVersionId: string;
    title: string;
    summary: string;
    kpiBlockId: string;
    kpiLabel: string;
    metricId: string;
    evidenceId: string;
    metricStatus: string;
    metricValue: number;
    metricValueText: string;
    metricScopeText: string;
    renderMode: string;
    scenePreset: string;
    motionPreset: string;
  }>;
  copies: Readonly<{
    creator: FixtureCopy;
    viewer: FixtureCopy;
  }>;
}>;

type MutableStoryFixture = {
  storyId: string;
  theme: { themeId: string };
  blocks: Array<
    | {
        blockType: "title-summary";
        content: { title: string; summary: string };
      }
    | {
        blockType: "kpi";
        metricId: string;
      }
  >;
};

type MutableMetricFixture = {
  caseId: string;
  plan: unknown;
  accumulators: Array<Record<string, unknown>>;
  expected: { status: string; value: number };
};

type CanonicalMetricFixture = Readonly<{
  cases: readonly Readonly<{
    id: string;
    plan: unknown;
    accumulators: unknown;
    expected: Readonly<{ value?: number }>;
  }>[];
}>;

type PreparedStoryResult =
  | CreatorPreparedStoryResult
  | ViewerPreparedStoryResult;

function repositoryPath(path: string): string {
  return resolve(repositoryRoot, path);
}

async function readRepositoryBytes(path: string): Promise<Uint8Array> {
  return Uint8Array.from(await readFile(repositoryPath(path)));
}

async function readCompositionManifest(): Promise<CompositionFixtureManifest> {
  return JSON.parse(
    await readFile(
      repositoryPath(
        "tests/fixtures/creator-viewer-composition/manifest.v1.json",
      ),
      "utf8",
    ),
  ) as CompositionFixtureManifest;
}

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

async function expectFileIdentity(identity: FileIdentity): Promise<Uint8Array> {
  expect(identity.path).not.toMatch(/(?:^[/\\]|(?:^|[/\\])\.\.(?:[/\\]|$))/u);
  const bytes = await readRepositoryBytes(identity.path);
  expect(bytes.byteLength).toBe(identity.bytes);
  expect(sha256(bytes)).toBe(identity.sha256);
  return bytes;
}

function parseStoryFixture(bytes: Uint8Array): MutableStoryFixture {
  return JSON.parse(decoder.decode(bytes)) as MutableStoryFixture;
}

function parseMetricFixture(bytes: Uint8Array): MutableMetricFixture {
  return JSON.parse(decoder.decode(bytes)) as MutableMetricFixture;
}

function encodeFixture(value: unknown): Uint8Array {
  return encoder.encode(JSON.stringify(value));
}

function staticRenderCandidate(result: PreparedStoryResult): string | null {
  if (!result.ok) return null;
  return renderToStaticMarkup(
    createElement(StoryRenderer, {
      blueprint: result.blueprint,
      composition: result.composition,
    }),
  );
}

async function readTypeScriptTree(directory: string): Promise<string> {
  const entries = await readdir(directory, { withFileTypes: true });
  const chunks = await Promise.all(
    entries.map(async (entry) => {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) return readTypeScriptTree(path);
      if (!entry.isFile() || !/\.tsx?$/u.test(entry.name)) return "";
      return readFile(path, "utf8");
    }),
  );
  return chunks.join("\n");
}

describe("M0-015 Creator/Viewer composition fixture", () => {
  it("manifest 逐字节绑定两端独立副本、正式 Story Schema 与既有指标黄金夹具", async () => {
    const manifest = await readCompositionManifest();
    expect(manifest).toMatchObject({
      schemaVersion: "1.0.0",
      kind: "datapulse-creator-viewer-composition-fixture-manifest",
      hashAlgorithm: "SHA-256",
      generatorVersion: "hand-authored-m0-015-v1",
      storySchema: {
        schemaVersion: "1.0.0",
        schemaId: "urn:datapulse:story-blueprint:formal:1.0.0",
      },
      metricRuntimeCanonicalReference: {
        fixture: {
          id: "canonical-creator-viewer-metric-runtime-1.0.0",
          caseId: "count-rows-merge",
        },
      },
    });
    expect(manifest.expected).toEqual({
      storyId: "story_m0-015-renderer",
      datasetVersionId: "dataset_version_m0-015-renderer",
      title: "订单概览",
      summary:
        "该合成故事验证 Creator 与 Viewer 共享正式故事契约和确定性指标结果。",
      kpiBlockId: "story_block_order-count",
      kpiLabel: "订单总数",
      metricId: "metric_order-count",
      evidenceId: "evidence_order-count",
      metricStatus: "available",
      metricValue: 23,
      metricValueText: "23",
      metricScopeText: "范围：全部数据（无附加条件）",
      renderMode: "2d",
      scenePreset: "none",
      motionPreset: "none",
    });

    const storySchemaBytes = await expectFileIdentity(manifest.storySchema);
    const canonicalManifestBytes = await expectFileIdentity(
      manifest.metricRuntimeCanonicalReference.manifest,
    );
    const canonicalFixtureBytes = await expectFileIdentity(
      manifest.metricRuntimeCanonicalReference.fixture,
    );
    expect(storySchemaBytes.byteLength).toBe(11_572);

    const creatorStoryBytes = await expectFileIdentity(
      manifest.copies.creator.storyArtifact,
    );
    const viewerStoryBytes = await expectFileIdentity(
      manifest.copies.viewer.storyArtifact,
    );
    const creatorMetricBytes = await expectFileIdentity(
      manifest.copies.creator.metricRuntime,
    );
    const viewerMetricBytes = await expectFileIdentity(
      manifest.copies.viewer.metricRuntime,
    );

    expect(manifest.copies.creator.storyArtifact.path).not.toBe(
      manifest.copies.viewer.storyArtifact.path,
    );
    expect(manifest.copies.creator.metricRuntime.path).not.toBe(
      manifest.copies.viewer.metricRuntime.path,
    );
    expect(creatorStoryBytes).not.toBe(viewerStoryBytes);
    expect(creatorMetricBytes).not.toBe(viewerMetricBytes);
    expect(sha256(creatorStoryBytes)).toBe(
      manifest.contentIdentity.storyArtifactSha256,
    );
    expect(sha256(viewerStoryBytes)).toBe(
      manifest.contentIdentity.storyArtifactSha256,
    );
    expect(sha256(creatorMetricBytes)).toBe(
      manifest.contentIdentity.metricRuntimeSha256,
    );
    expect(sha256(viewerMetricBytes)).toBe(
      manifest.contentIdentity.metricRuntimeSha256,
    );

    const canonicalManifest = JSON.parse(
      decoder.decode(canonicalManifestBytes),
    ) as Readonly<{
      fixtures: readonly Readonly<{
        id: string;
        path: string;
        sha256: string;
      }>[];
    }>;
    expect(
      canonicalManifest.fixtures.find(
        ({ id }) => id === manifest.metricRuntimeCanonicalReference.fixture.id,
      ),
    ).toMatchObject({
      path: "1.0.0/canonical.creator-viewer.json",
      sha256: manifest.metricRuntimeCanonicalReference.fixture.sha256,
    });

    const canonicalFixture = JSON.parse(
      decoder.decode(canonicalFixtureBytes),
    ) as CanonicalMetricFixture;
    const canonicalCase = canonicalFixture.cases.find(
      ({ id }) => id === manifest.metricRuntimeCanonicalReference.fixture.caseId,
    );
    expect(canonicalCase).toBeDefined();
    if (canonicalCase === undefined) return;
    const creatorMetric = parseMetricFixture(creatorMetricBytes);
    expect(creatorMetric.caseId).toBe(canonicalCase.id);
    expect(creatorMetric.plan).toEqual(canonicalCase.plan);
    expect(creatorMetric.accumulators).toEqual(canonicalCase.accumulators);
    expect(creatorMetric.expected).toEqual({ status: "available", value: 23 });
    expect(canonicalCase.expected.value).toBe(23);
  });

  it("两端经 Reader 与共享指标 seam 产生逐值一致但对象隔离的 Renderer DTO", async () => {
    const manifest = await readCompositionManifest();
    const creator = prepareCreatorStory(
      await readRepositoryBytes(manifest.copies.creator.storyArtifact.path),
      await readRepositoryBytes(manifest.copies.creator.metricRuntime.path),
    );
    const viewer = prepareViewerStory(
      await readRepositoryBytes(manifest.copies.viewer.storyArtifact.path),
      await readRepositoryBytes(manifest.copies.viewer.metricRuntime.path),
    );

    expect(creator.ok).toBe(true);
    expect(viewer.ok).toBe(true);
    if (!creator.ok || !viewer.ok) return;

    expect(creator.blueprint).toEqual(viewer.blueprint);
    expect(creator.composition).toEqual(viewer.composition);
    expect(creator.blueprint).not.toBe(viewer.blueprint);
    expect(creator.blueprint.blocks).not.toBe(viewer.blueprint.blocks);
    expect(creator.composition).not.toBe(viewer.composition);
    expect(creator.composition.kpis).not.toBe(viewer.composition.kpis);
    expect(creator.composition).toEqual({
      kpis: [
        {
          blockId: "story_block_order-count",
          metricId: "metric_order-count",
          scopeText: "范围：全部数据（无附加条件）",
          status: "available",
          valueText: "23",
        },
      ],
    });
    expect(JSON.stringify(creator.composition)).not.toMatch(
      /(?:accumulators|mergeOrdinal|COUNT_ROWS|"value"\s*:)/u,
    );
    expect(Object.isFrozen(creator.blueprint)).toBe(true);
    expect(Object.isFrozen(creator.composition)).toBe(true);
  });

  it("两端静态渲染同一正式标题、摘要、KPI、结果与证据引用", async () => {
    const manifest = await readCompositionManifest();
    const results = [
      prepareCreatorStory(
        await readRepositoryBytes(manifest.copies.creator.storyArtifact.path),
        await readRepositoryBytes(manifest.copies.creator.metricRuntime.path),
      ),
      prepareViewerStory(
        await readRepositoryBytes(manifest.copies.viewer.storyArtifact.path),
        await readRepositoryBytes(manifest.copies.viewer.metricRuntime.path),
      ),
    ];

    for (const result of results) {
      const markup = staticRenderCandidate(result);
      expect(markup).not.toBeNull();
      if (markup === null) continue;
      expect(markup).toContain("订单概览");
      expect(markup).toContain(
        "该合成故事验证 Creator 与 Viewer 共享正式故事契约和确定性指标结果。",
      );
      expect(markup).toContain("订单总数");
      expect(markup).toMatch(/>23<\/p>/u);
      expect(markup).toContain("范围：全部数据（无附加条件）");
      expect(markup).toContain("evidence_order-count");
      expect(markup).toContain('data-render-mode="2d"');
      expect(markup).toContain('data-scene-preset="none"');
      expect(markup).toContain('data-motion-preset="none"');
    }
  });

  it("Reader 拒绝候选后不暴露 blueprint、composition 或攻击文本", async () => {
    const manifest = await readCompositionManifest();
    const story = parseStoryFixture(
      await readRepositoryBytes(manifest.copies.creator.storyArtifact.path),
    );
    const marker = "reader-candidate-must-not-render";
    story.storyId = "story_context-mismatch";
    const titleBlock = story.blocks.find(
      (block) => block.blockType === "title-summary",
    );
    expect(titleBlock?.blockType).toBe("title-summary");
    if (titleBlock?.blockType !== "title-summary") return;
    titleBlock.content.title = marker;

    const result = prepareCreatorStory(
      encodeFixture(story),
      await readRepositoryBytes(manifest.copies.creator.metricRuntime.path),
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("STORY_ARTIFACT_FINAL_VALIDATION_FAILED");
    expect(result).not.toHaveProperty("blueprint");
    expect(result).not.toHaveProperty("composition");
    expect(JSON.stringify(result)).not.toContain(marker);
    expect(staticRenderCandidate(result)).toBeNull();
  });

  it("指标运行时拒绝输入后不暴露已读取故事或候选 composition", async () => {
    const manifest = await readCompositionManifest();
    const metric = parseMetricFixture(
      await readRepositoryBytes(manifest.copies.viewer.metricRuntime.path),
    );
    const marker = "metric_attack-marker";
    expect(metric.accumulators[0]).toBeDefined();
    if (metric.accumulators[0] === undefined) return;
    metric.accumulators[0].metricId = marker;

    const result = prepareViewerStory(
      await readRepositoryBytes(manifest.copies.viewer.storyArtifact.path),
      encodeFixture(metric),
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("M0_015_METRIC_EVALUATION_FAILED");
    expect(result).not.toHaveProperty("blueprint");
    expect(result).not.toHaveProperty("composition");
    expect(JSON.stringify(result)).not.toContain(marker);
    expect(staticRenderCandidate(result)).toBeNull();
  });
});

describe("M0-015 受控 Renderer", () => {
  it("四个正式主题逐一提供完整语义变量与共享设计变量", async () => {
    const manifest = await readCompositionManifest();
    const baseStoryBytes = await readRepositoryBytes(
      manifest.copies.creator.storyArtifact.path,
    );
    const metricBytes = await readRepositoryBytes(
      manifest.copies.creator.metricRuntime.path,
    );

    for (const themeId of THEME_IDS) {
      const story = parseStoryFixture(baseStoryBytes);
      story.theme.themeId = themeId;
      const result = prepareCreatorStory(encodeFixture(story), metricBytes);
      const markup = staticRenderCandidate(result);
      expect(markup, themeId).not.toBeNull();
      if (markup === null) continue;
      expect(markup).toContain(`data-dp-theme="${themeId}"`);
      expect(markup).not.toContain(' style="');
      for (const variable of THEME_SEMANTIC_VARIABLES) {
        expect(markup, `${themeId}:${variable}`).toContain(
          `${variable}:${THEMES[themeId].variables[variable]}`,
        );
      }
      for (const variable of Object.keys(DESIGN_SYSTEM_VARIABLES)) {
        expect(markup, `${themeId}:${variable}`).toContain(`${variable}:`);
      }
    }
  });

  it("攻击文本只作为 React 文本转义且不会执行", async () => {
    const manifest = await readCompositionManifest();
    const story = parseStoryFixture(
      await readRepositoryBytes(manifest.copies.creator.storyArtifact.path),
    );
    const marker = "__datapulse_renderer_attack_marker__";
    const titleBlock = story.blocks.find(
      (block) => block.blockType === "title-summary",
    );
    expect(titleBlock?.blockType).toBe("title-summary");
    if (titleBlock?.blockType !== "title-summary") return;
    titleBlock.content.title = `<script>globalThis.${marker}=true</script>`;
    titleBlock.content.summary = `<img src=x onerror="globalThis.${marker}=true">`;
    expect(Object.hasOwn(globalThis, marker)).toBe(false);

    const result = prepareCreatorStory(
      encodeFixture(story),
      await readRepositoryBytes(manifest.copies.creator.metricRuntime.path),
    );
    const markup = staticRenderCandidate(result);
    expect(markup).not.toBeNull();
    if (markup === null) return;
    expect(markup).toContain(
      `&lt;script&gt;globalThis.${marker}=true&lt;/script&gt;`,
    );
    expect(markup).toContain(
      `&lt;img src=x onerror=&quot;globalThis.${marker}=true&quot;&gt;`,
    );
    expect(markup).not.toMatch(/<(?:script|img)\b/iu);
    expect(Object.hasOwn(globalThis, marker)).toBe(false);
  });

  it("Renderer 包不依赖或导入 metric-runtime，也没有任意代码执行入口", async () => {
    const packageManifest = JSON.parse(
      await readFile(repositoryPath("packages/renderer/package.json"), "utf8"),
    ) as Readonly<{
      dependencies?: Readonly<Record<string, string>>;
    }>;
    const source = await readTypeScriptTree(
      repositoryPath("packages/renderer/src"),
    );

    expect(packageManifest.dependencies).toEqual({
      "@datapulse/story-schema": "workspace:*",
      "@datapulse/themes": "workspace:*",
    });
    expect(source).not.toMatch(/@datapulse\/metric-runtime|\bevaluateMetric\b/u);
    expect(source).not.toMatch(
      /dangerouslySetInnerHTML|\beval\s*\(|\bnew\s+Function\b|\bimport\s*\(/u,
    );
  });
});
