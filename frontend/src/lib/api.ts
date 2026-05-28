/**
 * Cliente HTTP minimalista para la API NestJS.
 * Base URL: NEXT_PUBLIC_API_URL (default localhost:3000/api en dev).
 */
export const API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000/api";

export async function apiFetch<T = unknown>(
  path: string,
  init: RequestInit & { token?: string } = {},
): Promise<T> {
  const { token, headers, ...rest } = init;
  const res = await fetch(`${API_URL}${path}`, {
    ...rest,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}) as Record<string, unknown>);
    const message = Array.isArray((body as { message?: unknown }).message)
      ? ((body as { message: string[] }).message ?? []).join("; ")
      : (body as { message?: string }).message;
    throw new Error(message || `HTTP ${res.status}`);
  }

  return res.json() as Promise<T>;
}
