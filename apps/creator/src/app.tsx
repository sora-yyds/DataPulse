import {
  createProjectRepository,
  ensureDeviceKey,
  openProjectObjectStore,
  type ProjectRepository,
} from "@datapulse/local-storage";
import { StoryRenderer } from "@datapulse/renderer";
import { useEffect, useState, type ReactElement } from "react";

import {
  M0_015_STORY_CONTEXT,
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

type RepositoryNote =
  | Readonly<{ kind: "unavailable" }>
  | Readonly<{ kind: "restored" }>
  | Readonly<{ kind: "recovered" }>
  | Readonly<{ kind: "saved"; transactionId: string }>;

type AppState =
  | Readonly<{ phase: "loading" }>
  | Readonly<{
      phase: "ready";
      value: PreparedStorySuccess;
      repository: RepositoryNote;
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

/**
 * Opens the local project repository when IndexedDB/OPFS are available.
 * Returns undefined when the browser cannot provide the storage seams, so
 * the probe degrades to the read-only fixture path instead of failing.
 */
async function openLocalRepository(): Promise<ProjectRepository | undefined> {
  try {
    const handle = await ensureDeviceKey();
    const store = await openProjectObjectStore({ key: handle.key });
    return createProjectRepository({
      key: handle.key,
      objects: store,
      context: M0_015_STORY_CONTEXT,
    });
  } catch {
    return undefined;
  }
}

function repositoryNoteText(note: RepositoryNote): string {
  switch (note.kind) {
    case "restored":
      return "项目仓库：已从本机恢复最近保存的项目";
    case "recovered":
      return "项目仓库：最近保存内容无法读取，已回退到最后可读副本";
    case "saved":
      return `项目仓库：已保存到本机（${note.transactionId}）`;
    default:
      return "项目仓库：当前环境不可用，仅只读验证";
  }
}

function CreatorProbeHeader(): ReactElement {
  return (
    <header aria-label="Creator 桌面只读验证">
      <p>DataPulse AI</p>
      <p>
        <strong>Creator 桌面只读验证</strong>
      </p>
      <p>本页面验证正式故事读取、本机保存与刷新恢复；项目数据仅保存在当前设备。</p>
    </header>
  );
}

export function App(): ReactElement {
  const [state, setState] = useState<AppState>(INITIAL_STATE);

  useEffect(() => {
    const controller = new AbortController();

    const prepare = async (): Promise<void> => {
      try {
        const repository = await openLocalRepository();
        if (controller.signal.aborted) {
          return;
        }

        if (repository) {
          const open = await repository.openProject();
          if (controller.signal.aborted) {
            return;
          }
          if (open.ok) {
            const restored = prepareCreatorStory(
              open.value.storyArtifact,
              open.value.metricFixture,
            );
            if (restored.ok) {
              setState(
                Object.freeze({
                  phase: "ready",
                  value: restored,
                  repository: Object.freeze({
                    kind: open.recovered ? "recovered" : "restored",
                  }),
                }),
              );
              return;
            }
          }
        }

        const [storyBytes, metricBytes] = await Promise.all([
          fetchFixtureBytes(storyArtifactUrl, controller.signal),
          fetchFixtureBytes(metricFixtureUrl, controller.signal),
        ]);
        if (controller.signal.aborted) {
          return;
        }

        const result = prepareCreatorStory(storyBytes, metricBytes);
        if (!result.ok) {
          setState(
            Object.freeze({
              phase: "failure",
              error: result.error,
            }),
          );
          return;
        }

        let repositoryNote: RepositoryNote = Object.freeze({
          kind: "unavailable",
        });
        if (repository) {
          const commit = await repository.commitProject({
            storyArtifact: storyBytes,
            metricFixture: metricBytes,
          });
          if (commit.ok) {
            repositoryNote = Object.freeze({
              kind: "saved",
              transactionId: commit.transactionId,
            });
          }
        }
        if (controller.signal.aborted) {
          return;
        }
        setState(
          Object.freeze({
            phase: "ready",
            value: result,
            repository: repositoryNote,
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
      <p role="status">{repositoryNoteText(state.repository)}</p>
      <StoryRenderer
        blueprint={state.value.blueprint}
        composition={state.value.composition}
      />
    </main>
  );
}