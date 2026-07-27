import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { api, apiGet, apiPost, ApiError } from "@/lib/api";

describe("api()", () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("always sends credentials and JSON content-type", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ success: true }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    await api("/api/whatever");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, options] = fetchMock.mock.calls[0];
    expect(options.credentials).toBe("include");
    expect(options.headers["Content-Type"]).toBe("application/json");
  });

  it("returns parsed JSON on success", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ success: true, value: 42 }),
    }) as unknown as typeof fetch;

    const result = await api<{ success: boolean; value: number }>("/api/thing");
    expect(result).toEqual({ success: true, value: 42 });
  });

  it("does NOT throw on 401/403 — callers rely on reading a false success flag instead", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ success: false, message: "unauthorized" }),
    }) as unknown as typeof fetch;

    const result = await api("/api/protected");
    expect(result).toEqual({ success: false, message: "unauthorized" });
  });

  it("throws ApiError on other failure statuses (e.g. 500)", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({}),
    }) as unknown as typeof fetch;

    await expect(api("/api/broken")).rejects.toBeInstanceOf(ApiError);
  });
});

describe("apiGet / apiPost", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("apiGet issues a GET with no body", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ success: true }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    await apiGet("/api/things");
    const [, options] = fetchMock.mock.calls[0];
    expect(options.method).toBeUndefined();
    expect(options.body).toBeUndefined();
  });

  it("apiPost issues a POST with a JSON-stringified body", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ success: true }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    await apiPost("/api/things", { studentId: "abc", marks: 90 });
    const [, options] = fetchMock.mock.calls[0];
    expect(options.method).toBe("POST");
    expect(options.body).toBe(JSON.stringify({ studentId: "abc", marks: 90 }));
  });
});
