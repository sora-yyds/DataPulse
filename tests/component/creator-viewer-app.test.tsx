import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { render, screen, within } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";

import { App as CreatorApp } from "../../apps/creator/src/app.js";
import { App as ViewerApp } from "../../apps/viewer/src/app.js";

const creatorStoryBytes = readFileSync(
  resolve(process.cwd(), "apps/creator/src/fixtures/story-artifact.json"),
);
const creatorMetricBytes = readFileSync(
  resolve(process.cwd(), "apps/creator/src/fixtures/metric-runtime.json"),
);
const viewerStoryBytes = readFileSync(
  resolve(process.cwd(), "apps/viewer/src/fixtures/story-artifact.json"),
);
const viewerMetricBytes = readFileSync(
  resolve(process.cwd(), "apps/viewer/src/fixtures/metric-runtime.json"),
);

function inputUrl(input: RequestInfo | URL): string {
  if (input instanceof Request) {
    return input.url;
  }
  return String(input);
}

function installFixtureFetch(
  storyBytes: Uint8Array,
  metricBytes: Uint8Array,
): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = inputUrl(input);
      if (url.endsWith("/story-artifact.json")) {
        return new Response(new Uint8Array(storyBytes), { status: 200 });
      }
      if (url.endsWith("/metric-runtime.json")) {
        return new Response(new Uint8Array(metricBytes), { status: 200 });
      }
      return new Response(null, { status: 404 });
    }),
  );
}

function expectVerifiedStory(article: HTMLElement): void {
  const story = within(article);
  expect(story.getByRole("heading", { level: 1, name: "订单概览" })).toBeVisible();
  expect(story.getByRole("heading", { level: 2, name: "订单总数" })).toBeVisible();
  expect(story.getByText("23")).toBeVisible();
  expect(story.getByText("范围：全部数据（无附加条件）")).toBeVisible();
  expect(story.getByText("evidence_order-count")).toBeVisible();
}

afterEach(() => {
  vi.unstubAllGlobals();
});

test("Creator 在正式字节通过验证后显示可追溯 KPI", async () => {
  installFixtureFetch(creatorStoryBytes, creatorMetricBytes);

  render(<CreatorApp />);

  expectVerifiedStory(
    await screen.findByRole("article", { name: "订单概览" }),
  );
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});

test("Viewer 在正式字节通过验证后显示与 Creator 一致的可追溯 KPI", async () => {
  installFixtureFetch(viewerStoryBytes, viewerMetricBytes);

  render(<ViewerApp />);

  expectVerifiedStory(
    await screen.findByRole("article", { name: "订单概览" }),
  );
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});
