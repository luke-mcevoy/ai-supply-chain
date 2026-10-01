import { test, expect, type Page } from "@playwright/test";

function watchErrors(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  return errors;
}

test("globe loads the verified atlas with labels and no errors", async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto("/");
  await expect(page.locator("canvas").first()).toBeVisible();
  await expect(page.locator(".brand-name")).toHaveText("AI SUPPLY CHAIN ATLAS");
  await expect(page.locator(".draft-flag")).toHaveCount(0);
  await expect(page.locator(".glabel").first()).toBeAttached();
  expect(errors).toEqual([]);
});

test("deep link opens the inspector with evidence", async ({ page }) => {
  await page.goto("/#sel=co:nvidia");
  await expect(page.locator(".inspector h2")).toHaveText("NVIDIA Corporation");
  await expect(page.locator(".inspector .ev").first()).toBeVisible();
  await expect(page.locator(".inspector .reach.spof")).toBeVisible();
});

test("walk the chain steps through stages", async ({ page }) => {
  await page.goto("/");
  await page.locator(".walk-btn:not(.story-btn)").click();
  const title = page.locator(".tour-title h3");
  await expect(title).toHaveText("AI data centers");
  await page.locator(".tour-nav .primary").click();
  await expect(title).not.toHaveText("AI data centers");
  await page.keyboard.press("Escape");
  await expect(page.locator(".tour")).toHaveCount(0);
});

test("data table lists rows, filters, and exports CSV", async ({ page }) => {
  await page.goto("/");
  await page.locator(".data-btn").click();
  const rows = page.locator(".datatable tbody tr");
  expect(await rows.count()).toBeGreaterThan(100);
  await page.locator(".dt-head input").fill("ASML");
  expect(await rows.count()).toBeGreaterThan(0);
  const download = page.waitForEvent("download");
  await page.locator(".dt-csv").click();
  expect((await download).suggestedFilename()).toMatch(/^ai-supply-chain-atlas-sites-.*\.csv$/);
});

test("controls view shows the rule timeline", async ({ page }) => {
  await page.goto("/#mode=controls");
  await expect(page.locator(".timeline")).toBeVisible();
  expect(await page.locator(".tl-tick").count()).toBeGreaterThan(20);
});

test("phone layout: bottom sheet and chips fit", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/#sel=co:nvidia");
  await expect(page.locator(".inspector")).toBeVisible();
  const box = await page.locator(".inspector").boundingBox();
  expect(box!.width).toBeLessThanOrEqual(390);
  const scrollW = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(scrollW).toBeLessThanOrEqual(390);
});

test("stories play with verbatim, linked quotes", async ({ page }) => {
  await page.goto("/");
  await page.locator(".story-btn").click();
  await page.locator(".story-picker li").first().locator("button").click();
  await expect(page.locator(".story-quote blockquote").first()).toBeVisible();
  await expect(page.locator(".story-quote a").first()).toHaveAttribute("href", /^https?:\/\//);
  await page.keyboard.press("ArrowRight");
  await expect(page.locator(".tour-title .mono")).toHaveText("02/05");
});
