// Provider-agnostic chat helper for the edge functions.
//
// Picks the provider from env, in this order:
//   ANTHROPIC_API_KEY  → Anthropic Messages API (default: Sonnet for editorial, Haiku for extraction)
//   OPENAI_API_KEY     → OpenAI-compatible /chat/completions (OpenAI, or any gateway via AI_GATEWAY_URL)
//
// Optional overrides: AI_MODEL_EDITORIAL, AI_MODEL_FAST, AI_GATEWAY_URL.
// The `apiKey` argument is kept for backward compatibility and ignored; keys come from env.

export interface AIOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  /** "editorial" = the writing model, "fast" = cheap extraction/classification. Default: fast. */
  tier?: "editorial" | "fast";
}

const DEFAULTS = {
  anthropic: { editorial: "claude-sonnet-5-5", fast: "claude-haiku-5-5" },
  openai: { editorial: "gpt-4o", fast: "gpt-4o-mini" },
};

function pickModel(provider: "anthropic" | "openai", opts: AIOptions): string {
  if (opts.model && !opts.model.startsWith("google/")) return opts.model; // legacy "google/gemini-…" values are ignored
  const tier = opts.tier ?? "fast";
  const env = tier === "editorial" ? Deno.env.get("AI_MODEL_EDITORIAL") : Deno.env.get("AI_MODEL_FAST");
  return env || DEFAULTS[provider][tier];
}

async function withRetry<T>(fn: () => Promise<T>, tries = 3): Promise<T> {
  let last: unknown;
  for (let i = 0; i < tries; i++) {
    try {
      return await fn();
    } catch (e) {
      last = e;
      const msg = String(e);
      if (!/429|5\d\d|overloaded|rate/i.test(msg)) throw e;
      await new Promise((r) => setTimeout(r, 800 * (i + 1) ** 2));
    }
  }
  throw last;
}

export async function chat(_apiKey: string, system: string, user: string, opts: AIOptions = {}): Promise<string> {
  const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY");
  const openaiKey = Deno.env.get("OPENAI_API_KEY");
  const temperature = opts.temperature ?? 0.4;
  const maxTokens = opts.maxTokens ?? 2000;

  if (anthropicKey) {
    const model = pickModel("anthropic", opts);
    return withRetry(async () => {
      const r = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "x-api-key": anthropicKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
        body: JSON.stringify({ model, system, max_tokens: maxTokens, temperature, messages: [{ role: "user", content: user }] }),
      });
      if (!r.ok) throw new Error(`Anthropic ${r.status}: ${(await r.text()).slice(0, 300)}`);
      const d = await r.json();
      return (d.content ?? []).filter((b: { type: string }) => b.type === "text").map((b: { text: string }) => b.text).join("");
    });
  }

  if (openaiKey) {
    const model = pickModel("openai", opts);
    const url = (Deno.env.get("AI_GATEWAY_URL") ?? "https://api.openai.com/v1").replace(/\/$/, "") + "/chat/completions";
    return withRetry(async () => {
      const r = await fetch(url, {
        method: "POST",
        headers: { Authorization: `Bearer ${openaiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model, temperature, max_tokens: maxTokens, messages: [{ role: "system", content: system }, { role: "user", content: user }] }),
      });
      if (!r.ok) throw new Error(`OpenAI ${r.status}: ${(await r.text()).slice(0, 300)}`);
      const d = await r.json();
      return d.choices?.[0]?.message?.content ?? "";
    });
  }

  throw new Error("No AI provider configured: set ANTHROPIC_API_KEY (recommended) or OPENAI_API_KEY");
}

/** True when some provider key is present. Functions use this to skip AI steps gracefully. */
export function aiConfigured(): boolean {
  return Boolean(Deno.env.get("ANTHROPIC_API_KEY") || Deno.env.get("OPENAI_API_KEY"));
}

/** Extract the first JSON object or array from a model response. */
export function parseJSON<T>(text: string): T | null {
  const cleaned = text.replace(/```json|```/g, "").trim();
  const starts = [cleaned.indexOf("{"), cleaned.indexOf("[")].filter((i) => i >= 0);
  if (!starts.length) return null;
  const start = Math.min(...starts);
  const end = Math.max(cleaned.lastIndexOf("}"), cleaned.lastIndexOf("]"));
  if (end <= start) return null;
  try {
    return JSON.parse(cleaned.slice(start, end + 1)) as T;
  } catch {
    return null;
  }
}

/**
 * House style for everything the model writes in The GP Pulse.
 * Keep this the single source of truth so the Lede, the "why it matters"
 * lines, and the deal takes all sound like the same person.
 */
export const HOUSE_STYLE = `You write for The GP Pulse, a morning briefing read by partners, principals and VPs at lower middle market private equity firms ($2–25M EBITDA targets, funds under $1B), plus the lenders, bankers and LPs who work with them. The reader has done 30 deals. Write like a peer who has too.

VOICE
- Direct. Short declarative sentences. Lead with the number or the fact, then the implication.
- Opinionated and conviction-tagged. When you take a view, label it: "Our read:", "High conviction:", "Low conviction:", "Watch:". Never hedge with "may" or "could" when you actually have a view.
- Name the mechanism. Don't say a deal is "notable" — say why: multiple paid, leverage available, add-on math, exit window, LP appetite, sector rotation.
- Specific over general. "$8M EBITDA industrial services platform at 7x" beats "a mid-sized industrial business".
- Dry humor is fine. Enthusiasm is not.

BANNED
- Words: landscape, robust, poised, leverage (as a verb), synergies, dynamic, ecosystem, unlock, navigate, transformative, game-changer, exciting, delve, tapestry, testament, underscores, highlights, showcases, in today's, it's worth noting, importantly, notably.
- Openers: "In a move that…", "As the market…", "Amid…", "In today's…".
- Exclamation points. Rhetorical questions. Emoji. Restating the headline in the first sentence.
- Inventing numbers. If a figure wasn't disclosed, say "undisclosed" or omit. Never estimate EBITDA, EV or multiples.

FORMAT
- Plain prose. No markdown headers or bullet symbols inside paragraphs unless asked.
- Firms are referred to by name on first mention, no "the firm" preamble.`;
