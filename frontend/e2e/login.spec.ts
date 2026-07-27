import { test, expect } from "@playwright/test";

/**
 * Requires the app running against a seeded database (see
 * backend/scripts/seed.ts and NOTES.md) — the demo accounts below are the
 * ones scripts/seed.ts creates. Not executed in this sandbox (no live
 * Supabase project, no browser binaries available here); structurally
 * validated with `npx playwright test --list`.
 */
test.describe("Login", () => {
  test("teacher can log in and lands on the teacher dashboard", async ({ page }) => {
    await page.goto("/login");
    await page.getByPlaceholder("your@email.com").fill("priya@edunexus.com");
    await page.getByPlaceholder("Enter your password").fill("teacher123");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL(/\/teacher/);
  });

  test("rejects an invalid password with an inline error, not a redirect", async ({ page }) => {
    await page.goto("/login");
    await page.getByPlaceholder("your@email.com").fill("priya@edunexus.com");
    await page.getByPlaceholder("Enter your password").fill("wrong-password");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.getByText(/invalid email or password/i)).toBeVisible();
    await expect(page).toHaveURL(/\/login/);
  });

  test("parent can log in and lands on the parent dashboard", async ({ page }) => {
    await page.goto("/login");
    await page.getByPlaceholder("your@email.com").fill("arjun@edunexus.com");
    await page.getByPlaceholder("Enter your password").fill("parent123");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL(/\/parent/);
  });
});
