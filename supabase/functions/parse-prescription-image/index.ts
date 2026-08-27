import { userClient } from "../shared/supabase.ts";
import { groqJson } from "../shared/groq.ts";
import { corsHeaders, corsOk } from "../shared/cors.ts";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return corsOk();
  try {
    const auth = req.headers.get("Authorization");
    if (!auth) return json({ error: "unauthorized" }, 401);

    let body: { image?: string } = {};
    try {
      body = await req.json();
    } catch {
      return json({ error: "invalid body" }, 400);
    }

    const { image } = body;
    if (!image) return json({ error: "image (base64 data URL) is required" }, 400);

    // Limit base64 length to ~20MB
    if (image.length > 20 * 1024 * 1024 * 1.34) {
      return json({ error: "image exceeds 20MB limit" }, 413);
    }

    const user = userClient(auth);

    const systemPrompt = `You are a medical OCR assistant. Your job is to extract drugs, dosages, and routes from prescription images.
Return ONLY a strict JSON object with this exact structure:
{"drugs": [{"drug_name": "name", "dosage": "dosage string or empty", "route": "route string or empty", "raw_text_matched": "the exact text you read", "confidence": 0.0 to 1.0}]}
If no drugs are found, return {"drugs": []}.`;

    const out = await groqJson([
      { role: "system", content: systemPrompt },
      { 
        role: "user", 
        content: [
          { type: "text", text: "Extract the drugs from this prescription." },
          { type: "image_url", image_url: { url: image } }
        ]
      }
    ], {
      model: "qwen/qwen3.6-27b",
      maxTokens: 1500,
      temperature: 0.1
    });

    const drugs = (out.drugs as Array<Record<string, unknown>>) || [];
    
    // Fuzzy match against local drug catalog
    const { data: catalog } = await user.from("drug_mapping").select("drug_name, rxcui");
    const localDrugs = catalog || [];

    const enriched = await Promise.all(drugs.map(async (d) => {
      const name = String(d.drug_name ?? "").toLowerCase();
      let matchedName = name;
      let matchedRxcui: string | null = null;
      let unmatched = true;

      // 1. Try exact local match
      const exact = localDrugs.find(l => l.drug_name.toLowerCase() === name);
      if (exact) {
        matchedName = exact.drug_name;
        matchedRxcui = exact.rxcui;
        unmatched = false;
      } else {
        // 2. Try partial local match
        const partial = localDrugs.find(l => l.drug_name.toLowerCase().includes(name) || name.includes(l.drug_name.toLowerCase()));
        if (partial) {
          matchedName = partial.drug_name;
          matchedRxcui = partial.rxcui;
          unmatched = false;
        } else {
          // 3. Try RxNorm live fuzzy match API
          try {
            const rxRes = await fetch(`https://rxnav.nlm.nih.gov/REST/approximateTerm.json?term=${encodeURIComponent(name)}&maxEntries=1`);
            if (rxRes.ok) {
              const rxData = await rxRes.json();
              const candidate = rxData.approximateGroup?.candidate?.[0];
              if (candidate && candidate.rxcui) {
                matchedName = candidate.name ? candidate.name.toLowerCase() : name;
                matchedRxcui = candidate.rxcui;
                unmatched = false;
              }
            }
          } catch (e) {
            console.error("RxNorm fallback failed for", name, e);
          }
        }
      }

      return {
        drug_name: matchedName,
        rxcui: matchedRxcui,
        dosage: String(d.dosage ?? ""),
        route: String(d.route ?? "oral").toLowerCase(), // default oral
        raw_text_matched: String(d.raw_text_matched ?? ""),
        confidence: Number(d.confidence ?? 0),
        unmatched
      };
    }));

    return json({ drugs: enriched });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 400);
  }
});
