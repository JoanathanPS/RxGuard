import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";

export interface DrugRef {
  drug_name: string;
  rxcui: string | null;
}

export interface Grounding {
  mapping: Array<Record<string, unknown>>;
  rules: Array<Record<string, unknown>>;
  interactions: Array<Record<string, unknown>>;
  live: Array<Record<string, unknown>>;
}

/**
 * Retrieves the local grounding records for the prescribed drugs:
 *   - drug_mapping            (drug -> RXCUI -> class -> flags)
 *   - drug_patient_risk_rules (drug + patient factor -> verdict)
 *   - interactions_seed       (drug pair -> severity/mechanism/action)
 * Optionally augments with live RxNorm/OpenFDA lookups (best-effort, short
 * timeouts). All records are the ONLY facts the LLM is allowed to cite.
 */
export async function loadGrounding(
  client: SupabaseClient,
  drugs: DrugRef[],
  opts: { live?: boolean } = {},
): Promise<Grounding> {
  const names = drugs.map((d) => d.drug_name.trim().toLowerCase());

  // NOTE: no outer parentheses here — supabase-js wraps the whole clause in
  // parens itself, so a parenthesised clause would double-wrap and PostgREST
  // would reject it with PGRST100.
  const orClause =
    names.length > 0
      ? names.flatMap((n) => [`drug_a.eq.${n}`, `drug_b.eq.${n}`]).join(",")
      : null;

  const [mapping, rules, interactions] = await Promise.all([
    names.length
      ? client.from("drug_mapping").select("*").in("drug_name", names)
      : Promise.resolve({ data: [] }),
    names.length
      ? client
          .from("drug_patient_risk_rules")
          .select("*")
          .in("drug_name", names)
      : Promise.resolve({ data: [] }),
    names.length && orClause
      ? client
          .from("interactions_seed")
          .select("*")
          .or(orClause)
      : Promise.resolve({ data: [] }),
  ]);

  const live: Array<Record<string, unknown>> = [];
  if (opts.live) {
    live.push(...(await loadLiveGrounding(drugs)));
  }

  return {
    mapping: (mapping.data ?? []) as Array<Record<string, unknown>>,
    rules: (rules.data ?? []) as Array<Record<string, unknown>>,
    interactions: (interactions.data ?? []) as Array<Record<string, unknown>>,
    live,
  };
}

async function loadLiveGrounding(drugs: DrugRef[]): Promise<Array<Record<string, unknown>>> {
  const out: Array<Record<string, unknown>> = [];
  const rxcuiSet = new Set(drugs.map((d) => d.rxcui).filter(Boolean));

  for (const rxcui of rxcuiSet) {
    // RxNorm class/proprietary name lookup — 4s budget, never fatal.
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 4000);
      const res = await fetch(
        `https://rxnav.nlm.nih.gov/REST/rxcui/${rxcui}/properties.json`,
        { signal: ctrl.signal },
      );
      clearTimeout(t);
      if (res.ok) {
        const data = await res.json();
        const p = data?.prop?.name;
        const classRes = await fetch(
          `https://rxnav.nlm.nih.gov/REST/rxclass/class/byRxcui/${rxcui}?relaSource=DAILYMED`,
          { signal: AbortSignal.timeout(4000) },
        );
        if (classRes.ok) {
          const cd = await classRes.json();
          const classes = cd?.rxclassMinConceptList?.rxclassMinConcept ?? [];
          if (p || classes.length) {
            out.push({
              source: "rxnorm",
              rxcui,
              name: p ?? null,
              classes: classes.map((c: { className: string }) => c.className),
            });
          }
        }
      }
    } catch {
      // unreachable/blocked — grounding stays local-only
    }
  }
  return out;
}