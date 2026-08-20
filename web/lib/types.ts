export type Role = "clinician" | "pharmacist" | "researcher" | "admin";

export interface Profile {
  id: string;
  email: string;
  role: Role;
  display_name: string | null;
  created_at: string;
}

export interface Patient {
  id: string;
  created_by: string;
  name: string;
  age: number | null;
  gender: string | null;
  weight_kg: number | null;
  height_cm: number | null;
  pregnant: boolean | null;
  breastfeeding: boolean | null;
  created_at: string;
}

export type PrescriptionStatus =
  | "draft"
  | "interviewing"
  | "completed"
  | "cancelled";

export interface Prescription {
  id: string;
  patient_id: string;
  clinician_id: string;
  status: PrescriptionStatus;
  created_at: string;
}

export interface PrescriptionItem {
  id: string;
  prescription_id: string;
  drug_name: string;
  rxcui: string | null;
  dosage: string | null;
  route: string | null;
}

export interface DrugMapping {
  id: number;
  drug_name: string;
  rxcui: string | null;
  drug_class: string | null;
  mechanism_flag: number;
  risk_factor_flag: number;
}

export const PRESCRIPTION_ROUTES = [
  "oral",
  "topical",
  "injection",
  "inhalation",
  "sublingual",
  "rectal",
  "otic",
  "ophthalmic",
] as const;

export type PrescriptionRoute = (typeof PRESCRIPTION_ROUTES)[number];

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}