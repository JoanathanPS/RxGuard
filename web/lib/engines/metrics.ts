// Classification metrics for the comparative evaluation (Module 4 of the deck).
//
// Every drug-level verdict is binarized: "action needed" (caution | avoid)
// versus "safe". Expected verdicts come from benchmark_cases.expected_results;
// predicted verdicts come from an engine run.
//
// Verdicts are matched per (case, drug) pair, because the same drug recurs
// across different benchmark cases and must be evaluated within each case.

export interface Metrics {
  accuracy: number;
  precision: number;
  recall: number;
  f1: number;
  fpr: number;
  fnr: number;
}

const ACTION = new Set(["caution", "avoid"]);

export function isAction(v: string): boolean {
  return ACTION.has(v.toLowerCase());
}

export interface VerdictRow {
  caseId: number;
  drug: string;
  verdict: string;
}

export function computeMetrics(
  expectedByCase: VerdictRow[],
  predictedByCase: VerdictRow[],
): Metrics {
  const pred = new Map(predictedByCase.map((p) => [`${p.caseId}:${p.drug.toLowerCase()}`, p.verdict]));
  let tp = 0;
  let tn = 0;
  let fp = 0;
  let fn = 0;

  for (const exp of expectedByCase) {
    const p = pred.get(`${exp.caseId}:${exp.drug.toLowerCase()}`);
    const expectedAction = isAction(exp.verdict);
    const predictedAction = p ? isAction(p) : false; // missing verdict counts as safe
    if (expectedAction && predictedAction) tp++;
    else if (!expectedAction && !predictedAction) tn++;
    else if (!expectedAction && predictedAction) fp++;
    else fn++;
  }

  const total = tp + tn + fp + fn || 1;
  const accuracy = (tp + tn) / total;
  const precision = tp + fp === 0 ? 0 : tp / (tp + fp);
  const recall = tp + fn === 0 ? 0 : tp / (tp + fn);
  const f1 = precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall);
  const fpr = tn + fp === 0 ? 0 : fp / (tn + fp);
  const fnr = tp + fn === 0 ? 0 : fn / (tp + fn);

  return { accuracy, precision, recall, f1, fpr, fnr };
}

export function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}