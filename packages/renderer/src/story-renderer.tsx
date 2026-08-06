import type {
  MetricId,
  StoryBlockId,
  ValidatedStoryBlueprint,
} from "@datapulse/story-schema";
import {
  DESIGN_SYSTEM_VARIABLES,
  THEMES,
  THEME_IDS,
  type ThemeId,
} from "@datapulse/themes";
import type { ReactElement, ReactNode } from "react";

type ValidatedStoryBlock = ValidatedStoryBlueprint["blocks"][number];
type ValidatedTitleSummaryBlock = Extract<
  ValidatedStoryBlock,
  { readonly blockType: "title-summary" }
>;
type ValidatedKpiBlock = Extract<
  ValidatedStoryBlock,
  { readonly blockType: "kpi" }
>;

export const REGISTERED_STORY_BLOCK_TYPES = Object.freeze([
  "title-summary",
  "kpi",
] as const satisfies readonly ValidatedStoryBlock["blockType"][]);

export const RENDERER_ERROR_CODES = Object.freeze({
  kpiDisplayMissing: "RENDERER_KPI_DISPLAY_MISSING",
  kpiDisplayDuplicate: "RENDERER_KPI_DISPLAY_DUPLICATE",
  kpiMetricMismatch: "RENDERER_KPI_METRIC_MISMATCH",
} as const);

export type RendererErrorCode =
  (typeof RENDERER_ERROR_CODES)[keyof typeof RENDERER_ERROR_CODES];

type ResolvedKpiDisplayBase = Readonly<{
  blockId: StoryBlockId;
  metricId: MetricId;
  scopeText: string;
}>;

export type AvailableKpiDisplay = ResolvedKpiDisplayBase &
  Readonly<{
    status: "available";
    valueText: string;
    unitText?: string;
    comparisonText?: string;
  }>;

export type UnavailableKpiDisplay = ResolvedKpiDisplayBase &
  Readonly<{
    status: "unavailable";
    reasonCode: string;
    message: string;
  }>;

export type ErrorKpiDisplay = ResolvedKpiDisplayBase &
  Readonly<{
    status: "error";
    errorCode: string;
    message: string;
  }>;

/**
 * KPI composition is intentionally presentation-only. The Creator and Viewer
 * evaluate and format metrics before constructing this DTO; the Renderer never
 * receives accumulators, plans, raw numeric values, or narrative rules.
 */
export type ResolvedKpiDisplay =
  | AvailableKpiDisplay
  | UnavailableKpiDisplay
  | ErrorKpiDisplay;

export type ResolvedStoryComposition = Readonly<{
  kpis: readonly ResolvedKpiDisplay[];
}>;

export type StoryRendererProps = Readonly<{
  blueprint: ValidatedStoryBlueprint;
  composition: ResolvedStoryComposition;
}>;

const STORY_RENDERER_CSS = `
.dp-story-renderer,
.dp-story-renderer * {
  box-sizing: border-box;
}

.dp-story-renderer {
  min-inline-size: var(--dp-space-none);
  inline-size: 100%;
  max-inline-size: 90rem;
  margin-block: var(--dp-space-none);
  margin-inline: auto;
  padding: var(--dp-space-lg);
  color: var(--dp-text);
  background: var(--dp-canvas);
  font-family: var(--dp-font-family-body-md);
  font-size: var(--dp-font-size-body-md);
  font-weight: var(--dp-font-weight-body-md);
}

.dp-story-renderer__blocks {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: var(--dp-space-xl);
}

.dp-story-renderer__block {
  min-inline-size: var(--dp-space-none);
  padding: var(--dp-space-xl);
  overflow-wrap: anywhere;
  color: var(--dp-text);
  background: var(--dp-surface);
  border-radius: var(--dp-radius-card);
}

.dp-story-renderer__block[data-visual-variant="hero"] {
  padding: var(--dp-space-2xl);
  border-radius: var(--dp-radius-hero);
}

.dp-story-renderer__block[data-visual-variant="metric-card"],
.dp-story-renderer__block[data-visual-variant="metric-feature"] {
  background: var(--dp-surface-raised);
}

.dp-story-renderer__heading,
.dp-story-renderer__summary,
.dp-story-renderer__kpi-label,
.dp-story-renderer__kpi-value,
.dp-story-renderer__kpi-detail,
.dp-story-renderer__status,
.dp-story-renderer__status-code,
.dp-story-renderer__evidence-label,
.dp-story-renderer__evidence-list {
  margin-block: var(--dp-space-none);
}

.dp-story-renderer__heading {
  color: var(--dp-text);
  font-family: var(--dp-font-family-display-md);
  font-size: var(--dp-font-size-display-md);
  font-weight: var(--dp-font-weight-display-md);
  letter-spacing: var(--dp-letter-spacing-display-md);
}

.dp-story-renderer__summary {
  margin-block-start: var(--dp-space-lg);
  color: var(--dp-text-secondary);
  font-family: var(--dp-font-family-body-lg);
  font-size: var(--dp-font-size-body-lg);
  font-weight: var(--dp-font-weight-body-lg);
}

.dp-story-renderer__kpi-label,
.dp-story-renderer__evidence-label {
  color: var(--dp-text-secondary);
  font-family: var(--dp-font-family-label);
  font-size: var(--dp-font-size-label);
  font-weight: var(--dp-font-weight-label);
  letter-spacing: var(--dp-letter-spacing-label);
}

.dp-story-renderer__kpi-value {
  margin-block-start: var(--dp-space-sm);
  color: var(--dp-text);
  font-family: var(--dp-font-family-metric-lg);
  font-size: var(--dp-font-size-metric-lg);
  font-weight: var(--dp-font-weight-metric-lg);
  letter-spacing: var(--dp-letter-spacing-metric-lg);
}

.dp-story-renderer__kpi-unit {
  margin-inline-start: var(--dp-space-sm);
  color: var(--dp-text-secondary);
  font-family: var(--dp-font-family-body-sm);
  font-size: var(--dp-font-size-body-sm);
  font-weight: var(--dp-font-weight-body-sm);
}

.dp-story-renderer__kpi-detail,
.dp-story-renderer__status {
  margin-block-start: var(--dp-space-md);
  color: var(--dp-text-secondary);
  font-family: var(--dp-font-family-body-sm);
  font-size: var(--dp-font-size-body-sm);
  font-weight: var(--dp-font-weight-body-sm);
}

.dp-story-renderer__status[data-status="unavailable"] {
  color: var(--dp-text);
}

.dp-story-renderer__status[data-status="error"] {
  color: var(--dp-text);
}

.dp-story-renderer__status::before {
  content: "";
  display: inline-block;
  inline-size: var(--dp-space-sm);
  block-size: var(--dp-space-sm);
  margin-inline-end: var(--dp-space-sm);
  border-radius: var(--dp-radius-pill);
  vertical-align: middle;
}

.dp-story-renderer__status[data-status="unavailable"]::before {
  background: var(--dp-warning);
}

.dp-story-renderer__status[data-status="error"]::before {
  background: var(--dp-danger);
}

.dp-story-renderer__status-code {
  margin-block-start: var(--dp-space-xs);
  color: var(--dp-text-muted);
  font-family: var(--dp-font-family-data-mono);
  font-size: var(--dp-font-size-data-mono);
  font-weight: var(--dp-font-weight-data-mono);
}

.dp-story-renderer__evidence {
  margin-block-start: var(--dp-space-lg);
}

.dp-story-renderer__evidence-list {
  display: grid;
  gap: var(--dp-space-xxs);
  margin-block-start: var(--dp-space-xs);
  padding-inline-start: var(--dp-space-xl);
  color: var(--dp-text-muted);
  font-family: var(--dp-font-family-data-mono);
  font-size: var(--dp-font-size-data-mono);
  font-weight: var(--dp-font-weight-data-mono);
}

@media (min-width: 768px) {
  .dp-story-renderer {
    padding: var(--dp-space-xl);
  }
}

@media (min-width: 1200px) {
  .dp-story-renderer {
    padding: var(--dp-space-2xl);
  }

  .dp-story-renderer__blocks {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .dp-story-renderer__block[data-layout="full-width"],
  .dp-story-renderer__block[data-layout="emphasis"] {
    grid-column: 1 / -1;
  }

  .dp-story-renderer__block[data-layout="split-left"] {
    grid-column: 1;
  }

  .dp-story-renderer__block[data-layout="split-right"] {
    grid-column: 2;
  }
}
`;

function serializeThemeVariables(themeId: ThemeId): string {
  const variables = {
    ...DESIGN_SYSTEM_VARIABLES,
    ...THEMES[themeId].variables,
  };
  return Object.entries(variables)
    .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
    .map(([name, value]) => `${name}:${value};`)
    .join("");
}

const STORY_RENDERER_THEME_CSS = THEME_IDS.map(
  (themeId) =>
    `.dp-story-renderer[data-dp-theme="${themeId}"]{${serializeThemeVariables(themeId)}}`,
).join("\n");

const STORY_RENDERER_STYLES = `${STORY_RENDERER_CSS}\n${STORY_RENDERER_THEME_CSS}`;

type StoryThemeProviderProps = Readonly<{
  themeId: ThemeId;
  children: ReactNode;
}>;

function StoryThemeProvider({
  themeId,
  children,
}: StoryThemeProviderProps): ReactElement {
  return (
    <>
      <style data-datapulse-renderer-styles>{STORY_RENDERER_STYLES}</style>
      <div
        className="dp-story-renderer"
        data-dp-theme={themeId}
        lang="zh-CN"
      >
        {children}
      </div>
    </>
  );
}

function EvidenceReferences({
  evidenceIds,
}: Readonly<{ evidenceIds: readonly string[] }>): ReactElement | null {
  if (evidenceIds.length === 0) {
    return null;
  }

  return (
    <aside className="dp-story-renderer__evidence" aria-label="证据引用">
      <p className="dp-story-renderer__evidence-label">证据引用</p>
      <ul className="dp-story-renderer__evidence-list">
        {evidenceIds.map((evidenceId) => (
          <li key={evidenceId}>{evidenceId}</li>
        ))}
      </ul>
    </aside>
  );
}

function TitleSummaryBlockView({
  block,
  primaryHeading,
}: Readonly<{
  block: ValidatedTitleSummaryBlock;
  primaryHeading: boolean;
}>): ReactElement {
  const headingId = `dp-story-heading-${block.blockId}`;
  const heading = primaryHeading ? (
    <h1 id={headingId} className="dp-story-renderer__heading">
      {block.content.title}
    </h1>
  ) : (
    <h2 id={headingId} className="dp-story-renderer__heading">
      {block.content.title}
    </h2>
  );

  return (
    <section
      className="dp-story-renderer__block"
      data-block-id={block.blockId}
      data-block-type={block.blockType}
      data-layout={block.layout.variant}
      data-visual-variant={block.visualVariant}
      aria-labelledby={headingId}
    >
      {heading}
      <p className="dp-story-renderer__summary">{block.content.summary}</p>
      <EvidenceReferences evidenceIds={block.evidenceIds} />
    </section>
  );
}

type KpiDisplayResolution =
  | Readonly<{ ok: true; value: ResolvedKpiDisplay }>
  | Readonly<{
      ok: false;
      code: RendererErrorCode;
      message: string;
    }>;

const DUPLICATE_KPI_DISPLAY = Symbol("duplicate-kpi-display");
type KpiDisplayIndexValue = ResolvedKpiDisplay | typeof DUPLICATE_KPI_DISPLAY;

function createKpiDisplayIndex(
  displays: readonly ResolvedKpiDisplay[],
): ReadonlyMap<StoryBlockId, KpiDisplayIndexValue> {
  const index = new Map<StoryBlockId, KpiDisplayIndexValue>();
  for (const display of displays) {
    index.set(
      display.blockId,
      index.has(display.blockId) ? DUPLICATE_KPI_DISPLAY : display,
    );
  }
  return index;
}

function resolveKpiDisplay(
  block: ValidatedKpiBlock,
  index: ReadonlyMap<StoryBlockId, KpiDisplayIndexValue>,
): KpiDisplayResolution {
  const display = index.get(block.blockId);
  if (display === undefined) {
    return {
      ok: false,
      code: RENDERER_ERROR_CODES.kpiDisplayMissing,
      message: "该指标缺少已解析的展示结果。",
    };
  }
  if (display === DUPLICATE_KPI_DISPLAY) {
    return {
      ok: false,
      code: RENDERER_ERROR_CODES.kpiDisplayDuplicate,
      message: "该指标存在重复的展示结果。",
    };
  }
  if (display.metricId !== block.metricId) {
    return {
      ok: false,
      code: RENDERER_ERROR_CODES.kpiMetricMismatch,
      message: "指标展示结果与故事蓝图不匹配。",
    };
  }
  return { ok: true, value: display };
}

function RendererKpiError({
  resolution,
}: Readonly<{
  resolution: Extract<KpiDisplayResolution, { ok: false }>;
}>): ReactElement {
  return (
    <>
      <p className="dp-story-renderer__status" data-status="error" role="alert">
        错误：{resolution.message}
      </p>
      <p className="dp-story-renderer__status-code">{resolution.code}</p>
    </>
  );
}

function ResolvedKpiValue({
  display,
}: Readonly<{ display: ResolvedKpiDisplay }>): ReactElement {
  switch (display.status) {
    case "available":
      return (
        <>
          <p className="dp-story-renderer__kpi-value">
            {display.valueText}
            {display.unitText === undefined ? null : (
              <span className="dp-story-renderer__kpi-unit">{display.unitText}</span>
            )}
          </p>
          <p className="dp-story-renderer__kpi-detail">{display.scopeText}</p>
          {display.comparisonText === undefined ? null : (
            <p className="dp-story-renderer__kpi-detail">{display.comparisonText}</p>
          )}
        </>
      );
    case "unavailable":
      return (
        <>
          <p
            className="dp-story-renderer__status"
            data-status="unavailable"
            role="status"
          >
            不可用：{display.message}
          </p>
          <p className="dp-story-renderer__kpi-detail">{display.scopeText}</p>
          <p className="dp-story-renderer__status-code">{display.reasonCode}</p>
        </>
      );
    case "error":
      return (
        <>
          <p className="dp-story-renderer__status" data-status="error" role="alert">
            错误：{display.message}
          </p>
          <p className="dp-story-renderer__kpi-detail">{display.scopeText}</p>
          <p className="dp-story-renderer__status-code">{display.errorCode}</p>
        </>
      );
  }
}

function KpiBlockView({
  block,
  displayIndex,
}: Readonly<{
  block: ValidatedKpiBlock;
  displayIndex: ReadonlyMap<StoryBlockId, KpiDisplayIndexValue>;
}>): ReactElement {
  const headingId = `dp-kpi-heading-${block.blockId}`;
  const resolution = resolveKpiDisplay(block, displayIndex);

  return (
    <section
      className="dp-story-renderer__block"
      data-block-id={block.blockId}
      data-block-type={block.blockType}
      data-layout={block.layout.variant}
      data-metric-id={block.metricId}
      data-visual-variant={block.visualVariant}
      aria-labelledby={headingId}
    >
      <h2 id={headingId} className="dp-story-renderer__kpi-label">
        {block.label}
      </h2>
      {resolution.ok ? (
        <ResolvedKpiValue display={resolution.value} />
      ) : (
        <RendererKpiError resolution={resolution} />
      )}
      <EvidenceReferences evidenceIds={block.evidenceIds} />
    </section>
  );
}

function StoryBlockView({
  block,
  primaryTitleBlockId,
  displayIndex,
}: Readonly<{
  block: ValidatedStoryBlock;
  primaryTitleBlockId: StoryBlockId | undefined;
  displayIndex: ReadonlyMap<StoryBlockId, KpiDisplayIndexValue>;
}>): ReactElement {
  switch (block.blockType) {
    case "title-summary":
      return (
        <TitleSummaryBlockView
          block={block}
          primaryHeading={block.blockId === primaryTitleBlockId}
        />
      );
    case "kpi":
      return <KpiBlockView block={block} displayIndex={displayIndex} />;
  }
}

/**
 * Renders the two block kinds registered by the formal M0 Story contract.
 * React escapes every text value; this component has no arbitrary HTML, CSS,
 * script, chart option, metric evaluation, or narrative execution seam.
 */
export function StoryRenderer({
  blueprint,
  composition,
}: StoryRendererProps): ReactElement {
  const primaryTitleBlock = blueprint.blocks.find(
    (block): block is ValidatedTitleSummaryBlock => block.blockType === "title-summary",
  );
  const displayIndex = createKpiDisplayIndex(composition.kpis);
  const articleLabel =
    primaryTitleBlock === undefined
      ? { "aria-label": "数据故事" }
      : { "aria-labelledby": `dp-story-heading-${primaryTitleBlock.blockId}` };

  return (
    <StoryThemeProvider themeId={blueprint.theme.themeId}>
      <article
        {...articleLabel}
        data-story-id={blueprint.storyId}
        data-render-mode={blueprint.visual.renderMode}
        data-scene-preset={blueprint.visual.scenePreset}
        data-motion-preset={blueprint.visual.motionPreset}
      >
        <div className="dp-story-renderer__blocks">
          {blueprint.blocks.map((block) => (
            <StoryBlockView
              key={block.blockId}
              block={block}
              primaryTitleBlockId={primaryTitleBlock?.blockId}
              displayIndex={displayIndex}
            />
          ))}
        </div>
      </article>
    </StoryThemeProvider>
  );
}
