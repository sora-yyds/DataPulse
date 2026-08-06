import { StoryRenderer } from "@datapulse/renderer";
import { useEffect, useState, type ReactElement } from "react";

import {
  prepareCreatorStory,
  type PreparedStorySuccess,
} from "./composition.js";

const metricFixtureUrl = new URL(
  "./fixtures/metric-runtime.json",
  import.meta.url,
).href;
const storyArtifactUrl = new URL(
  "./fixtures/story-artifact.json",
  import.meta.url,
).href;

type AppState =
  | Readonly<{ phase: "loading" }>
  | Readonly<{
      phase: "ready";
      value: PreparedStorySuccess;
    }>
  | Readonly<{
      phase: "failure";
      error: Readonly<{
        code: string;
        message: string;
      }>;
    }>;

const INITIAL_STATE: AppState = Object.freeze({ phase: "loading" });

async function fetchFixtureBytes(
  url: string,
  signal: AbortSignal,
): Promise<Uint8Array> {
  const response = await fetch(url, {
    cache: "no-store",
    credentials: "omit",
    signal,
  });
  if (!response.ok) {
    throw new Error("M0_015_FIXTURE_RESPONSE_FAILED");
  }
  return new Uint8Array(await response.arrayBuffer());
}

function CreatorProbeHeader(): ReactElement {
  return (
    <header aria-label="Creator 桌面只读验证">
      <p>DataPulse AI</p>
      <p>
        <strong>Creator 桌面只读验证</strong>
      </p>
      <p>本页面仅验证正式故事读取与渲染，不提供编辑、保存或发布功能。</p>
    </header>
  );
}

export function App(): ReactElement {
  const [state, setState] = useState<AppState>(INITIAL_STATE);

  useEffect(() => {
    const controller = new AbortController();

    const prepare = async (): Promise<void> => {
      try {
        const [storyBytes, metricBytes] = await Promise.all([
          fetchFixtureBytes(storyArtifactUrl, controller.signal),
          fetchFixtureBytes(metricFixtureUrl, controller.signal),
        ]);
        if (controller.signal.aborted) {
          return;
        }

        const result = prepareCreatorStory(storyBytes, metricBytes);
        if (result.ok) {
          setState(Object.freeze({ phase: "ready", value: result }));
          return;
        }
        setState(
          Object.freeze({
            phase: "failure",
            error: result.error,
          }),
        );
      } catch {
        if (!controller.signal.aborted) {
          setState(
            Object.freeze({
              phase: "failure",
              error: Object.freeze({
                code: "M0_015_FIXTURE_LOAD_FAILED",
                message: "验证资源加载失败，未显示候选内容。",
              }),
            }),
          );
        }
      }
    };

    void prepare();
    return () => {
      controller.abort();
    };
  }, []);

  if (state.phase === "loading") {
    return (
      <main data-datapulse-app="creator" data-probe-mode="desktop-read-only">
        <CreatorProbeHeader />
        <p role="status">正在读取并验证正式合成故事……</p>
      </main>
    );
  }

  if (state.phase === "failure") {
    return (
      <main data-datapulse-app="creator" data-probe-mode="desktop-read-only">
        <CreatorProbeHeader />
        <h1>Creator 验证内容不可用</h1>
        <p role="alert">{state.error.message}</p>
        <p>
          错误代码：<code>{state.error.code}</code>
        </p>
      </main>
    );
  }

  return (
    <main data-datapulse-app="creator" data-probe-mode="desktop-read-only">
      <CreatorProbeHeader />
      <StoryRenderer
        blueprint={state.value.blueprint}
        composition={state.value.composition}
      />
    </main>
  );
}
