"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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
  const [open, setOpen] = useState(false);
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

  const matches = useMemo(() => {
    const q = value.trim().toLowerCase();
    if (!q) return [];
    return catalog
      .filter((d) => d.drug_name.toLowerCase().includes(q))
      .filter((d) => !excluded.includes(d.drug_name))
      .slice(0, 8);
  }, [catalog, value, excluded]);

  function choose(drug: DrugMapping) {
    onSelect(drug);
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
        placeholder="Type a drug name…"
        autoComplete="off"
        className="w-full rounded border border-ink/30 bg-canvas px-3 py-2 text-sm placeholder:text-ink/40 focus:border-accent"
      />
      {open && value.trim() && (
        <ul className="absolute z-20 mt-1 max-h-64 w-full overflow-auto rounded border border-ink/20 bg-canvas py-1 text-sm shadow-sm">
          {matches.length > 0 ? (
            matches.map((d) => (
              <li key={d.id}>
                <button
                  type="button"
                  onClick={() => choose(d)}
                  className="flex w-full items-center justify-between px-3 py-2 text-left hover:bg-card"
                >
                  <span className="font-medium">{d.drug_name}</span>
                  <span className="text-xs text-ink/50">
                    {d.rxcui ? `RXCUI ${d.rxcui}` : d.drug_class}
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