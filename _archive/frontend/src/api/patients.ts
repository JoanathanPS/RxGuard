import type { Patient } from "../types";
import { API, apiFetch } from "./client";

export interface PatientInput {
  name: string;
  age?: number | null;
  gender?: string | null;
  weight_kg?: number | null;
  height_cm?: number | null;
}

export async function listPatients(): Promise<Patient[]> {
  return apiFetch<Patient[]>(API.patient, "/patients");
}

export async function getPatient(id: number): Promise<Patient> {
  return apiFetch<Patient>(API.patient, `/patients/${id}`);
}

export async function createPatient(input: PatientInput): Promise<Patient> {
  return apiFetch<Patient>(API.patient, "/patients", {
    method: "POST",
    body: input,
  });
}