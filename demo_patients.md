# Example Patients for RxGuard Demo

These profiles are designed to test the different risk pathways of the AI interview and the final assessment engine. You can use these when running the app to demonstrate the adaptive interviewing capabilities and drug-safety evaluation.

## Patient 1: High Risk (Pregnancy + Kidney Disease)
This patient should trigger pregnancy warnings, kidney function checks, and severe drug interaction warnings.

**Profile:**
- **Name:** Jane Doe
- **Age:** 34
- **Sex:** Female
- **Presenting Symptoms:** Mild pain and high blood pressure.
- **Chronic Conditions:** Chronic Kidney Disease (CKD) Stage 4, Type 2 Diabetes
- **Current Medications:** None
- **Other factors:** Currently pregnant (2nd trimester)

**Prescription to test:**
- **Warfarin** (Anticoagulant)
- **Ibuprofen** (NSAID)
- **Metformin** (Biguanide)

*Expected AI Behavior:* The AI should immediately ask about pregnancy status due to her age/sex, and kidney labs (eGFR/Creatinine) due to the CKD. The final assessment should flag Warfarin as "Avoid" (teratogenic in pregnancy) and Metformin as "Avoid" or "Caution" (lactic acidosis risk in CKD). Ibuprofen and Warfarin will trigger a severe drug-drug interaction (bleeding risk).

---

## Patient 2: Moderate Risk (Elderly Polypharmacy)
This patient tests age-related precautions and moderate drug-drug interactions.

**Profile:**
- **Name:** Robert Smith
- **Age:** 78
- **Sex:** Male
- **Presenting Symptoms:** Heart palpitations and muscle pain.
- **Chronic Conditions:** Atrial Fibrillation, Hypertension, Hyperlipidemia
- **Current Medications:** Simvastatin 40mg
- **Other factors:** History of mild liver enzyme elevation.

**Prescription to test:**
- **Amiodarone** (Antiarrhythmic)
- **Clarithromycin** (Antibiotic)

*Expected AI Behavior:* The AI should inquire about current medications and liver function. The final assessment should flag a severe interaction between Amiodarone and Clarithromycin (QT prolongation risk) and between Clarithromycin and Simvastatin (increased risk of myopathy/rhabdomyolysis).

---

## Patient 3: Low Risk / Safe (Healthy Adult)
This patient demonstrates a clean safety pass.

**Profile:**
- **Name:** Alice Johnson
- **Age:** 28
- **Sex:** Female
- **Presenting Symptoms:** Seasonal allergies and a mild headache.
- **Chronic Conditions:** None
- **Current Medications:** None
- **Allergies:** None

**Prescription to test:**
- **Cetirizine** (Antihistamine)
- **Acetaminophen** (Analgesic)

*Expected AI Behavior:* The AI will run through standard questions (allergies, other meds, pregnancy). Assuming she answers "No" to pregnancy and other risks, the final assessment will mark both drugs as "Safe" with no drug-drug interactions.
