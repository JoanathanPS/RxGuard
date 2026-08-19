import { getToken } from "./token";

export const API = {
  user: import.meta.env.VITE_USER_API ?? "http://localhost:8001",
  patient: import.meta.env.VITE_PATIENT_API ?? "http://localhost:8002",
  prescription: import.meta.env.VITE_PRESCRIPTION_API ?? "http://localhost:8003",
  interaction: import.meta.env.VITE_INTERACTION_API ?? "http://localhost:8004",
};

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

async function handleResponse<T>(res: Response): Promise<T> {
  const body = (await res.json().catch(() => ({}))) as unknown;
  if (!res.ok) {
    const error = (body as { error?: { code?: string; message?: string } }).error;
    throw new ApiError(res.status, error?.code ?? "unknown", error?.message ?? res.statusText);
  }
  return body as T;
}

export async function apiFetch<T>(
  base: string,
  path: string,
  options: { method?: string; body?: unknown; auth?: boolean } = {},
): Promise<T> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (options.auth !== false) {
    const token = getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }
  const res = await fetch(`${base}${path}`, {
    method: options.method ?? "GET",
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });
  return handleResponse<T>(res);
}