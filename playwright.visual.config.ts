import { defineConfig, devices } from "playwright/test";
import { createHttpPreviewConfig } from "./playwright.config.js";

const PREVIEW_HOST = "127.0.0.1";
const CREATOR_PREVIEW_PORT = 4173;
const VIEWER_PREVIEW_PORT = 4174;

/**
 * M0-018 deterministic UI smoke: fixed locale, timezone, fonts, viewports,
 * reduced motion, keyboard/focus and 200% zoom, plus four-theme visual
 * baselines on the M0 minimal pages. Reuses the same strictly-owned
 * Node/Vite CLI preview lifecycle as E2E/axe.
 */
const base = createHttpPreviewConfig("./tests/visual", "./test-results/visual");

export default defineConfig({
  ...base,
  projects: [
    {
      name: "creator-desktop",
      use: {
        ...devices["Desktop Chrome"],
        baseURL: `http://${PREVIEW_HOST}:${CREATOR_PREVIEW_PORT}`,
        viewport: { width: 1280, height: 720 },
      },
    },
    {
      name: "viewer-desktop",
      use: {
        ...devices["Desktop Chrome"],
        baseURL: `http://${PREVIEW_HOST}:${VIEWER_PREVIEW_PORT}`,
        viewport: { width: 1280, height: 720 },
      },
    },
    {
      name: "viewer-tablet",
      use: {
        ...devices["Desktop Chrome"],
        baseURL: `http://${PREVIEW_HOST}:${VIEWER_PREVIEW_PORT}`,
        viewport: { width: 834, height: 1112 },
      },
    },
    {
      name: "viewer-mobile",
      use: {
        ...devices["Desktop Chrome"],
        baseURL: `http://${PREVIEW_HOST}:${VIEWER_PREVIEW_PORT}`,
        viewport: { width: 390, height: 844 },
      },
    },
  ],
});