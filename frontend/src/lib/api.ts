const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000";

export class ApiError extends Error {}

/**
 * Thin fetch wrapper for the Go backend. Always sends cookies (the session
 * lives in an httpOnly cookie set by /auth/login) and returns parsed JSON.
 */
export async function api<T = unknown>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
    },
  });

  if (!res.ok && res.status !== 401 && res.status !== 403) {
    throw new ApiError(`Request to ${path} failed with status ${res.status}`);
  }

  return res.json() as Promise<T>;
}

export function apiGet<T = unknown>(path: string) {
  return api<T>(path);
}

export function apiPost<T = unknown>(path: string, body: unknown) {
  return api<T>(path, { method: "POST", body: JSON.stringify(body) });
}
