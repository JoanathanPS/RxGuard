import type { CheckResponse } from "../types";
import { API, apiFetch } from "./client";

export interface CheckInput {
  patient_id?: number | null;
  prescription_id?: number | null;
  drugs: { drug_name: string }[];
}

export async function checkInteractions(input: CheckInput): Promise<CheckResponse> {
  return apiFetch<CheckResponse>(API.interaction, "/interactions/check", {
    method: "POST",
    body: input,
  });
}