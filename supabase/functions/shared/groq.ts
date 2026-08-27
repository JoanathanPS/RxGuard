export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string | Array<{ type: string; text?: string; image_url?: { url: string } }>;
}

export interface GroqOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
}

/**
 * Calls Groq's OpenAI-compatible chat completions API with JSON-mode output
 * enabled and returns the parsed object. The model is never allowed to invent
 * facts — prompts must only ask it to reason over the grounding supplied.
 */
export async function groqJson(
  messages: ChatMessage[],
  opts: GroqOptions = {},
): Promise<Record<string, unknown>> {
  const model = opts.model ?? Deno.env.get("GROQ_MODEL") ?? "openai/gpt-oss-120b";
  const key = Deno.env.get("GROQ_API_KEY");
  if (!key) throw new Error("GROQ_API_KEY is not set on this function");

  const attempt = async (): Promise<Response> => {
    return await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: opts.temperature ?? 0.2,
        max_tokens: opts.maxTokens ?? 900,
        response_format: { type: "json_object" },
      }),
    });
  };

  // Retry 429 (rate limit) and 400 json_validate_failed with capped backoff.
  // Total sleep must stay well under the 150s function idle timeout.
  let res = await attempt();
  let body = await res.text().catch(() => "");
  for (let retry = 0; retry < 3; retry++) {
    const is429 = res.status === 429;
    const isJsonFail = res.status === 400 && body.includes("json_validate_failed");
    if (!is429 && !isJsonFail) break;
    const retryAfter = Number(res.headers.get("retry-after") ?? 3);
    await new Promise((r) => setTimeout(r, Math.min(6, retryAfter) * 1000));
    res = await attempt();
    body = await res.text().catch(() => "");
  }

  if (!res.ok) {
    throw new Error(`Groq ${res.status}: ${body.slice(0, 500)}`);
  }

  let data: Record<string, unknown>;
  try {
    data = JSON.parse(body);
  } catch {
    throw new Error(`Groq returned non-JSON body: ${body.slice(0, 300)}`);
  }
  const content: string | undefined = (data.choices as Array<{ message?: { content?: string } }> | undefined)?.[0]?.message?.content;
  if (!content) throw new Error("Groq returned an empty completion");

  try {
    return JSON.parse(content);
  } catch {
    throw new Error(
      `Groq returned non-JSON content: ${content.slice(0, 300)}`,
    );
  }
}