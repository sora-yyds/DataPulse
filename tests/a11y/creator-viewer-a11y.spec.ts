import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "playwright/test";

test("真实 HTTP 页面通过未裁剪的 axe 自动扫描", async ({ page }) => {
  await page.goto("/");
  await expect(
    page.getByRole("article", { name: "订单概览" }),
  ).toBeVisible();

  const results = await new AxeBuilder({ page }).analyze();
  const evaluatedRuleCount =
    results.passes.length +
    results.incomplete.length +
    results.inapplicable.length;

  expect(evaluatedRuleCount, "axe 必须实际评估至少一条规则").toBeGreaterThan(
    0,
  );
  expect(
    results.violations,
    "axe 不得报告自动可检测的无障碍违规",
  ).toEqual([]);
});
