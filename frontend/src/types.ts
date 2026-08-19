export type Role = "clinician" | "pharmacist" | "researcher" | "admin";

export type Severity = "critical" | "high" | "moderate" | "low" | "safe";

export interface User {
  id: number;
  email: string;
  name: string;
  role: Role;
  created_at: string;
}

export interface AuthResponse {
  access_token: string;
  token_type: string;
  user: User;
}

export interface Patient {
  id: number;
  name: string;
  age: number | null;
  gender: string | null;
  weight_kg: number | null;
  height_cm: number | null;
  pregnant: boolean | null;
  breastfeeding: boolean | null;
  created_by: string;
  created_at: string;
  conditions: Condition[];
  allergies: Allergy[];
  labs: Lab[];
  lifestyle: Lifestyle | null;
}

export interface Condition {
  id: number;
  patient_id: number;
  condition_name: string;
  diagnosed_date: string | null;
  active: boolean;
}

export interface Allergy {
  id: number;
  patient_id: number;
  allergen: string;
  reaction: string | null;
  severity: Severity | null;
}

export interface Lab {
  id: number;
  patient_id: number;
  test_name: string;
  value: number | null;
  unit: string | null;
  recorded_at: string | null;
}

export interface Lifestyle {
  id: number;
  patient_id: number;
  smoking_status: string | null;
  alcohol_use: string | null;
}

export interface PrescriptionItem {
  id: number;
  drug_name: string;
  rxcui: string | null;
  dosage: string | null;
  route: string | null;
}

export interface Prescription {
  id: number;
  patient_id: number;
  clinician_id: string;
  status: string;
  created_at: string;
  items: PrescriptionItem[];
}

export interface DrugSearchResult {
  name: string;
  rxcui: string;
  drug_class: string;
}

export interface InteractionResult {
  drug_a: string;
  drug_b: string;
  severity: Severity;
  mechanism: string;
  action: string | null;
  source: string;
  confidence: number;
  in_dataset: boolean;
}

export interface CheckResponse {
  prescription_id: number | null;
  patient_id: number | null;
  engine: "ai" | "manual";
  drug_count: number;
  pairs_checked: number;
  detection_time_ms: number;
  results: InteractionResult[];
}