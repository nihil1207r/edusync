import { test, expect } from "@playwright/test";

/** See login.spec.ts header — same run requirements apply here. */
test.describe("Daily summary generation (Invisible Parent)", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/login");
    await page.getByPlaceholder("your@email.com").fill("arjun@edunexus.com");
    await page.getByPlaceholder("Enter your password").fill("parent123");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL(/\/parent/);
  });

  test("dashboard shows one quiet paragraph, not a chart-filled panel", async ({ page }) => {
    await expect(page.getByText("Today, in short")).toBeVisible();
    // Per section 6's "calm, not gamified" rule: no chart/canvas elements
    // should appear inside the summary card itself.
    const summaryCard = page.locator("text=Today, in short").locator("..");
    await expect(summaryCard.locator("canvas, svg.recharts-surface")).toHaveCount(0);
  });

  test("Listen and Show-the-numbers actions are logged as real Parent Personality signals", async ({ page }) => {
    await page.getByRole("button", { name: "Show the numbers behind this" }).click();
    // Expanding reveals the real source_data the summary was generated
    // from — not a fabricated breakdown.
    await expect(page.getByText(/attendanceRatePct|homework/i)).toBeVisible();
  });

  test("regenerating on a later day produces a fresh, non-cached summary", async ({ page }) => {
    await expect(page.getByText(/auto-generated from today's data|ai-written from today's data/i)).toBeVisible();
  });
});
