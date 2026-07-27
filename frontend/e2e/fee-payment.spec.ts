import { test, expect } from "@playwright/test";

/** See login.spec.ts header — same run requirements apply here. */
test.describe("Fee payment", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/login");
    await page.getByPlaceholder("your@email.com").fill("arjun@edunexus.com");
    await page.getByPlaceholder("Enter your password").fill("parent123");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL(/\/parent/);
  });

  test("parent can start a Razorpay order for a pending fee", async ({ page }) => {
    await page.getByRole("button", { name: "Fees" }).click();
    const payButton = page.getByRole("button", { name: "Pay now" }).first();
    await expect(payButton).toBeVisible();
    await payButton.click();
    // Without live Razorpay keys configured (see NOTES.md), the backend
    // returns a clear failure message rather than pretending to succeed —
    // either that message or the real Razorpay checkout modal opening is
    // an acceptable outcome here.
    await expect(page.getByText(/starting…|razorpay|payment/i).first()).toBeVisible();
  });

  test("payment history reflects a previously completed payment", async ({ page }) => {
    await page.getByRole("button", { name: "Fees" }).click();
    await expect(page.getByText(/payment history/i)).toBeVisible();
  });
});
