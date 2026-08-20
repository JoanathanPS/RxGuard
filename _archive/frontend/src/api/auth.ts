import type { AuthResponse } from "../types";
import { API, apiFetch } from "./client";

export async function login(email: string, password: string): Promise<AuthResponse> {
  return apiFetch<AuthResponse>(API.user, "/auth/login", {
    method: "POST",
    body: { email, password },
    auth: false,
  });
}