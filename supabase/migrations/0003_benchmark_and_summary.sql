-- 0003: owner-readable assessment summary + benchmark patient profiles
--
-- * prescriptions.assessment_summary — the final-assessment combined summary,
--   readable by the prescription owner so the results view works without
--   granting owner access to the researcher-only audit log.
-- * benchmark_cases.patient_profile — structured JSON used to drive the
--   comparative evaluation: each case seeds a prescription + a patient profile
--   that both engines (AI-interview and manual) assess.

alter table public.prescriptions
    add column assessment_summary text;

alter table public.benchmark_cases
    add column patient_profile jsonb;

-- Seed a spread of benchmark cases: drug lists x patient-factor combinations,
-- deliberately including both obvious-risk and subtle cases. expected_results
-- holds the reference verdicts + interaction severities the engines are scored
-- against.
insert into public.benchmark_cases (description, drug_list, expected_results, patient_profile)
values
    ('Warfarin + high-dose aspirin, elderly patient, GI bleed history, no INR available — interaction-driven caution.',
     '["warfarin","aspirin"]',
     '{"verdicts":{"warfarin":"caution"},"interactions":{"warfarin+aspirin":"high"}}',
     '{"age":"78","sex_gender":"male","weight":"72","height":"170","reason_for_prescription":"AF stroke prevention + post-MI aspirin","chronic_conditions":"hypertension, GI bleed history","drug_allergies":"none reported","current_medications":"none reported","inr_pt":"don''t know"}'),
    ('Metformin in CKD with eGFR < 30 — rule-driven avoid.',
     '["metformin"]',
     '{"verdicts":{"metformin":"avoid"},"interactions":{}}',
     '{"age":"64","sex_gender":"female","weight":"80","height":"165","reason_for_prescription":"type 2 diabetes","chronic_conditions":"diabetes, chronic kidney disease","kidney_labs":"eGFR 22","blood_sugar_labs":"HbA1c 8.1","current_medications":"atorvastatin"}'),
    ('Metformin with eGFR 30-45 — rule-driven caution + dose monitor.',
     '["metformin"]',
     '{"verdicts":{"metformin":"caution"},"interactions":{}}',
     '{"age":"70","sex_gender":"male","weight":"86","height":"175","reason_for_prescription":"type 2 diabetes","chronic_conditions":"diabetes, hypertension","kidney_labs":"eGFR 38","blood_sugar_labs":"HbA1c 7.6","current_medications":"lisinopril"}'),
    ('Warfarin + amiodarone with a known moderate interaction, monitored INR 2.4.',
     '["warfarin","amiodarone"]',
     '{"verdicts":{"warfarin":"caution"},"interactions":{"warfarin+amiodarone":"moderate"}}',
     '{"age":"68","sex_gender":"male","weight":"81","height":"178","reason_for_prescription":"AF + ventricular arrhythmia","chronic_conditions":"atrial fibrillation","inr_pt":"INR 2.4","current_medications":"amiodarone","drug_allergies":"none reported"}'),
    ('Aspirin alone, young healthy adult, no risk factors.',
     '["aspirin"]',
     '{"verdicts":{"aspirin":"safe"},"interactions":{}}',
     '{"age":"29","sex_gender":"female","weight":"58","height":"163","reason_for_prescription":"headache prophylaxis","chronic_conditions":"none reported","pregnant":"no","drug_allergies":"none reported","current_medications":"none reported"}'),
    ('Warfarin with clean labs and INR in range, no interacting drugs — safe.',
     '["warfarin"]',
     '{"verdicts":{"warfarin":"safe"},"interactions":{}}',
     '{"age":"60","sex_gender":"female","weight":"66","height":"161","reason_for_prescription":"AF stroke prevention","chronic_conditions":"atrial fibrillation","inr_pt":"INR 2.6","kidney_labs":"eGFR 84","liver_labs":"ALT 28","current_medications":"none reported","drug_allergies":"none reported"}');
