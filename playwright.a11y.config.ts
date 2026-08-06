import { createHttpPreviewConfig } from "./playwright.config.js";

export default createHttpPreviewConfig(
  "./tests/a11y",
  "./test-results/a11y",
);
