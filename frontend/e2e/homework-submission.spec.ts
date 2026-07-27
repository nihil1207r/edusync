import { test, expect } from "@playwright/test";

/** See login.spec.ts header — same run requirements apply here. */
test.describe("Homework submission", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/login");
    await page.getByPlaceholder("your@email.com").fill("rahul@edunexus.com");
    await page.getByPlaceholder("Enter your password").fill("student123");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL(/\/student/);
  });

  test("student can submit an unsubmitted homework item", async ({ page }) => {
    await page.getByRole("button", { name: "Homework" }).click();
    const submitButton = page.getByRole("button", { name: "Submit" }).first();
    await expect(submitButton).toBeVisible();
    await submitButton.click();
    await expect(page.getByText("Submitted").first()).toBeVisible();
  });

  test("a submitted item shows a Submitted badge instead of a Submit button", async ({ page }) => {
    await page.getByRole("button", { name: "Homework" }).click();
    await expect(page.getByText("Submitted").first()).toBeVisible();
  });
});
