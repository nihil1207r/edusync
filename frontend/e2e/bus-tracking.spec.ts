import { test, expect } from "@playwright/test";

/**
 * See login.spec.ts header — same run requirements apply here. This
 * additionally requires a driver to have pinged a location for the
 * parent's assigned bus (see backend/internal/handlers/bus_eta_sos.go)
 * so there's a live location to render.
 */
test.describe("Bus tracking", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/login");
    await page.getByPlaceholder("your@email.com").fill("arjun@edunexus.com");
    await page.getByPlaceholder("Enter your password").fill("parent123");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL(/\/parent/);
  });

  test("parent sees a live map with an ETA once the bus has a location", async ({ page }) => {
    await page.getByRole("button", { name: "Bus Tracking" }).click();
    // MapLibre renders into a canvas inside this container — assert the
    // container mounts rather than pixel-inspecting the canvas.
    await expect(page.locator(".maplibregl-map")).toBeVisible();
    await expect(page.getByText(/min away/)).toBeVisible();
  });

  test("geofence events (arrived/departed) appear in the feed below the map", async ({ page }) => {
    await page.getByRole("button", { name: "Bus Tracking" }).click();
    await expect(page.getByText(/arrived at|departed/i).first()).toBeVisible();
  });
});
