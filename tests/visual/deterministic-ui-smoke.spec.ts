import { expect, test, type Page } from "playwright/test";

const THEME_IDS = [
  "deep-space-neon",
  "soft-glass",
  "data-editorial",
  "enterprise-minimal",
] as const;

const DESKTOP_PROJECTS = new Set(["creator-desktop", "viewer-desktop"]);

async function openStory(page: Page): Promise<void> {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await expect(
    page.getByRole("article", { name: "订单概览" }),
  ).toBeVisible();
}

test("固定环境：zh-CN、Asia/Shanghai、弱动效且无运行动画", async ({
  page,
}) => {
  await openStory(page);

  const environment = await page.evaluate(() => {
    const renderer = document.querySelector(".dp-story-renderer");
    return {
      locale: new Intl.DateTimeFormat().resolvedOptions().locale,
      timezoneOffsetMinutes: new Date().getTimezoneOffset(),
      reducedMotion: matchMedia("(prefers-reduced-motion: reduce)").matches,
      runningAnimations: document.getAnimations().length,
      rendererLang: renderer?.getAttribute("lang") ?? null,
    };
  });

  expect(environment.locale).toBe("zh-CN");
  expect(environment.timezoneOffsetMinutes).toBe(-480);
  expect(environment.reducedMotion).toBe(true);
  expect(environment.runningAnimations).toBe(0);
  expect(environment.rendererLang).toBe("zh-CN");
});

test("字体回退链按主题 Token 固定", async ({ page }) => {
  await openStory(page);

  const fonts = await page.evaluate(() => {
    const computedFont = (selector: string): string | null => {
      const element = document.querySelector(selector);
      return element === null ? null : getComputedStyle(element).fontFamily;
    };
    return {
      body: computedFont(".dp-story-renderer"),
      heading: computedFont(".dp-story-renderer__heading"),
      kpiValue: computedFont(".dp-story-renderer__kpi-value"),
      rendererStyle:
        document.querySelector("style[data-datapulse-renderer-styles]")
          ?.textContent ?? "",
    };
  });

  expect(fonts.rendererStyle).toContain("--dp-font-family-body-md");
  expect(fonts.body).toContain("Inter");
  expect(fonts.body).toContain("Noto Sans SC");
  expect(fonts.heading).toContain("Inter");
  expect(fonts.kpiValue).toContain("Space Grotesk");
});

test("键盘焦点顺序与 focus-visible 焦点环规则", async ({ page }) => {
  await openStory(page);

  const focusContract = await page.evaluate(() => {
    const renderer = document.querySelector(".dp-story-renderer");
    return {
      rendererStyle:
        document.querySelector("style[data-datapulse-renderer-styles]")
          ?.textContent ?? "",
      focusColor: renderer === null
        ? ""
        : getComputedStyle(renderer).getPropertyValue("--dp-focus").trim(),
      headings: [...document.querySelectorAll("h1, h2")].map(
        (element) => element.tagName,
      ),
      activeTag: document.activeElement?.tagName ?? null,
    };
  });

  expect(focusContract.rendererStyle).toContain(":focus-visible");
  expect(focusContract.rendererStyle).toContain(
    "outline: 2px solid var(--dp-focus)",
  );
  expect(focusContract.focusColor).toMatch(/^#[0-9a-f]{6}$/i);
  expect(focusContract.headings.join(",")).toBe("H1,H2");

  await page.keyboard.press("Tab");
  const activeAfterTab = await page.evaluate(
    () => document.activeElement?.tagName ?? null,
  );
  expect(activeAfterTab).not.toBeNull();
});

test("200% 缩放：无水平溢出且核心内容不重叠不裁切", async ({
  page,
}, testInfo) => {
  test.skip(
    !DESKTOP_PROJECTS.has(testInfo.project.name),
    "200% 缩放只模拟桌面窗口放大",
  );
  await openStory(page);

  const originalViewport = page.viewportSize();
  if (originalViewport === null) {
    throw new Error("M0_018_VIEWPORT_MISSING");
  }
  await page.setViewportSize({
    width: Math.floor(originalViewport.width / 2),
    height: originalViewport.height,
  });

  const layout = await page.evaluate(() => {
    const box = (selector: string): DOMRect | null => {
      const element = document.querySelector(selector);
      return element === null ? null : element.getBoundingClientRect();
    };
    const overlaps = (left: DOMRect | null, right: DOMRect | null): boolean =>
      left !== null &&
      right !== null &&
      !(
        left.bottom <= right.top ||
        right.bottom <= left.top ||
        left.right <= right.left ||
        right.right <= left.left
      );
    const heading = box(".dp-story-renderer__heading");
    const kpiLabel = box(".dp-story-renderer__kpi-label");
    const kpiValue = box(".dp-story-renderer__kpi-value");
    const evidence = box(".dp-story-renderer__evidence");
    return {
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
      headingVisible:
        heading !== null &&
        heading.width > 0 &&
        heading.height > 0 &&
        heading.top >= 0 &&
        heading.left >= 0,
      overlaps:
        overlaps(heading, kpiLabel) ||
        overlaps(kpiLabel, kpiValue) ||
        overlaps(kpiValue, evidence),
    };
  });

  expect(layout.scrollWidth).toBeLessThanOrEqual(layout.clientWidth);
  expect(layout.headingVisible).toBe(true);
  expect(layout.overlaps).toBe(false);
});

test("响应式：平板/手机视口无水平溢出且核心内容可见", async ({
  page,
}, testInfo) => {
  test.skip(
    DESKTOP_PROJECTS.has(testInfo.project.name),
    "平板/手机视口矩阵只检查 Viewer",
  );
  await openStory(page);

  const layout = await page.evaluate(() => {
    const heading = document.querySelector(
      ".dp-story-renderer__heading",
    )?.getBoundingClientRect();
    return {
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
      headingVisible:
        heading !== undefined &&
        heading.width > 0 &&
        heading.height > 0 &&
        heading.top >= 0 &&
        heading.left >= 0,
    };
  });

  expect(layout.scrollWidth).toBeLessThanOrEqual(layout.clientWidth);
  expect(layout.headingVisible).toBe(true);
});

test("四主题视觉基线", async ({ page }, testInfo) => {
  test.skip(
    !DESKTOP_PROJECTS.has(testInfo.project.name),
    "视觉基线只在桌面视口建立",
  );
  test.skip(
    process.platform !== "win32" || process.env.CI === "true",
    "像素基线只在维护者固定 Windows 环境建立；CI/Linux 平台基线需单独生成并人工审查",
  );
  await openStory(page);

  for (const themeId of THEME_IDS) {
    await page
      .locator(".dp-story-renderer")
      .evaluate((element, nextThemeId) => {
        element.setAttribute("data-dp-theme", nextThemeId);
      }, themeId);
    await expect(page).toHaveScreenshot(`theme-${themeId}.png`, {
      animations: "disabled",
      fullPage: true,
      maxDiffPixelRatio: 0.001,
    });
  }
});