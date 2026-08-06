/// <reference types="vite/client" />

import { StoryRenderer } from "@datapulse/renderer";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, within } from "storybook/test";

import { prepareViewerStory } from "../../apps/viewer/src/composition.js";
import metricFixtureSource from "../../apps/viewer/src/fixtures/metric-runtime.json?raw";
import storyArtifactSource from "../../apps/viewer/src/fixtures/story-artifact.json?raw";

const prepared = prepareViewerStory(
  new TextEncoder().encode(storyArtifactSource),
  new TextEncoder().encode(metricFixtureSource),
);

if (!prepared.ok) {
  throw new Error(`M0_016_STORYBOOK_PREPARE_FAILED:${prepared.error.code}`);
}

const meta = {
  args: {
    blueprint: prepared.blueprint,
    composition: prepared.composition,
  },
  component: StoryRenderer,
  title: "DataPulse/Renderer/最小故事",
} satisfies Meta<typeof StoryRenderer>;

export default meta;
type Story = StoryObj<typeof meta>;

export const 正式最小故事: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByRole("heading", { level: 1, name: "订单概览" }),
    ).toBeVisible();
    await expect(
      canvas.getByRole("heading", { level: 2, name: "订单总数" }),
    ).toBeVisible();
    await expect(canvas.getByText("23")).toBeVisible();
    await expect(
      canvas.getByText("范围：全部数据（无附加条件）"),
    ).toBeVisible();
    await expect(canvas.getByText("evidence_order-count")).toBeVisible();
  },
};
