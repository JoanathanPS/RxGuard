"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { DrugMapping } from "@/lib/types";

export function DrugPicker({
  value,
  onSelect,
  excluded,
}: {
  value: string;
  onSelect: (drug: DrugMapping) => void;
  excluded: string[];
}) {
  const supabase = createClient();
  const [catalog, setCatalog] = useState<DrugMapping[]>([]);
  const [matches, setMatches] = useState<Array<{ name: string; rxcui: string | null }>>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    supabase
      .from("drug_mapping")
      .select("*")
      .order("drug_name")
      .then(({ data }) => {
        if (!cancelled && data) setCatalog(data as DrugMapping[]);
      });
    return () => {
      cancelled = true;
    };
  }, [supabase]);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  useEffect(() => {
    const q = value.trim().toLowerCase();
    if (!q) {
      setMatches([]);
      return;
    }

    let cancelled = false;
    setLoading(true);

    const timer = setTimeout(async () => {
      try {
        const [ctRes, rxRes] = await Promise.all([
          fetch(`https://clinicaltables.nlm.nih.gov/api/rxterms/v3/search?terms=${encodeURIComponent(q)}&ef=RXCUIS`),
          fetch(`https://rxnav.nlm.nih.gov/REST/approximateTerm.json?term=${encodeURIComponent(q)}&maxEntries=4`)
        ]);
        
        let results: Array<{name: string, rxcui: string | null}> = [];
        
        // Add local catalog matches first
        const localMatches = catalog
          .filter((d) => d.drug_name.toLowerCase().includes(q))
          .map((d) => ({ name: d.drug_name, rxcui: d.rxcui }));
        results.push(...localMatches);
        
        // Aliases for common non-US terms to help the API out when typing partially
        if ("paracetamol".includes(q)) {
          results.push({ name: "paracetamol", rxcui: "161" });
        }
        
        if (ctRes.ok) {
          const data = await ctRes.json();
          const names: string[] = data[1] ?? [];
          const rxcuis: string[][] = data[2]?.RXCUIS ?? [];
          results.push(...names.map((n, i) => ({
            name: n.toLowerCase(),
            rxcui: rxcuis[i]?.[0] ?? null,
          })));
        }
        
        if (rxRes.ok) {
          const rxData = await rxRes.json();
          const candidates = rxData.approximateGroup?.candidate ?? [];
          for (const c of candidates) {
            if (c.rxcui) {
              results.push({
                name: c.name ? c.name.toLowerCase() : q.toLowerCase(),
                rxcui: c.rxcui
              });
            }
          }
        }
        
        if (!cancelled) {
          // Deduplicate by name or rxcui
          const seen = new Set();
          const unique = results.filter(r => {
            const key = r.rxcui || r.name;
            if (seen.has(key)) return false;
            seen.add(key);
            return !excluded.includes(r.name);
          }).slice(0, 8);
          
          setMatches(unique);
        }
      } catch (e) {
        console.error("Live search failed", e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 250); // debounce

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [value, excluded, catalog]);

  function choose(drug: { name: string; rxcui: string | null }) {
    onSelect({ drug_name: drug.name.toLowerCase(), rxcui: drug.rxcui, drug_class: null } as DrugMapping);
    setOpen(false);
  }

  return (
    <div ref={rootRef} className="relative">
      <input
        value={value}
        onChange={(e) => {
          onSelect({ drug_name: e.target.value } as DrugMapping);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        placeholder="Type a drug name (e.g., paracetamol)…"
        autoComplete="off"
        className="w-full rounded border border-ink/30 bg-canvas px-3 py-2 text-sm placeholder:text-ink/40 focus:border-accent"
      />
      {open && value.trim() && (
        <ul className="absolute z-20 mt-1 max-h-64 w-full overflow-auto rounded border border-ink/20 bg-canvas py-1 text-sm shadow-sm">
          {loading ? (
            <li className="px-3 py-2 text-xs text-ink/50">Searching global database…</li>
          ) : matches.length > 0 ? (
            matches.map((d, i) => (
              <li key={i}>
                <button
                  type="button"
                  onClick={() => choose(d)}
                  className="flex w-full items-center justify-between px-3 py-2 text-left hover:bg-card"
                >
                  <span className="font-medium capitalize">{d.name}</span>
                  <span className="text-xs text-ink/50">
                    {d.rxcui ? `RXCUI ${d.rxcui}` : "Live API"}
                  </span>
                </button>
              </li>
            ))
          ) : (
            <li className="px-3 py-2 text-xs text-ink/50">
              No match — will treat as a free-text drug
            </li>
          )}
        </ul>
      )}
    </div>
  );
}