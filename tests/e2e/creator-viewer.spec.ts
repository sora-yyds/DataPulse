import { expect, test } from "playwright/test";

const PROJECT_EXPECTATIONS = Object.freeze({
  "creator-http-chromium": Object.freeze({
    app: "creator",
    documentTitle: "DataPulse AI Creator 验证",
  }),
  "viewer-http-chromium": Object.freeze({
    app: "viewer",
    documentTitle: "DataPulse AI Viewer 验证",
  }),
});

function expectationForProject(projectName: string):
  (typeof PROJECT_EXPECTATIONS)[keyof typeof PROJECT_EXPECTATIONS] {
  if (projectName in PROJECT_EXPECTATIONS) {
    return PROJECT_EXPECTATIONS[
      projectName as keyof typeof PROJECT_EXPECTATIONS
    ];
  }
  throw new Error(`未登记的 Playwright 项目：${projectName}`);
}

test("真实 HTTP 页面显示已验证且可追溯的订单 KPI", async ({
  page,
}, testInfo) => {
  const expected = expectationForProject(testInfo.project.name);

  await page.goto("/");

  await expect(page).toHaveTitle(expected.documentTitle);
  await expect(page.locator("main")).toHaveAttribute(
    "data-datapulse-app",
    expected.app,
  );

  const story = page.getByRole("article", { name: "订单概览" });
  await expect(story).toBeVisible();
  await expect(
    story.getByRole("heading", { level: 1, name: "订单概览" }),
  ).toBeVisible();
  await expect(
    story.getByRole("heading", { level: 2, name: "订单总数" }),
  ).toBeVisible();
  await expect(story.getByText("23", { exact: true })).toBeVisible();
  await expect(
    story.getByText("范围：全部数据（无附加条件）", { exact: true }),
  ).toBeVisible();
  await expect(
    story.getByText("evidence_order-count", { exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("alert")).toHaveCount(0);
});
