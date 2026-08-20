import type { DrugSearchResult, Prescription } from "../types";
import { API, apiFetch } from "./client";

export interface PrescriptionInput {
  patient_id: number;
  items: { drug_name: string; dosage?: string; route?: string }[];
}

export async function searchDrugs(query: string): Promise<DrugSearchResult[]> {
  return apiFetch<DrugSearchResult[]>(
    API.prescription,
    `/drugs/search?q=${encodeURIComponent(query)}`,
  );
}

export async function createPrescription(input: PrescriptionInput): Promise<Prescription> {
  return apiFetch<Prescription>(API.prescription, "/prescriptions", {
    method: "POST",
    body: input,
  });
}