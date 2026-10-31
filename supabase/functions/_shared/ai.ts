// Provider-agnostic chat helper with automatic failover.
//
// Providers (any OpenAI-compatible endpoint works for the second one):
//   anthropic  ANTHROPIC_API_KEY                       Messages API. Default: Sonnet (editorial) / Haiku (fast).
//   openai     OPENAI_API_KEY [+ OPENAI_BASE_URL]      /v1/chat/completions. Default: gpt-4o / gpt-4o-mini.
//              OPENAI_BASE_URL lets you point at OpenRouter, Groq, Together, Azure, a local vLLM, etc.
//
// Order: AI_PROVIDER="anthropic" (default) or "openai" picks the primary. If the primary fails after
// retries (429/5xx/overloaded/timeout/network), the other provider is tried when its key is set.
// If the primary returns a 4xx that isn't a rate limit (bad key, bad request) we also fail over, because
// a dead key at 5pm should not stop the issue from being drafted.
//
// Model overrides: ANTHROPIC_MODEL_EDITORIAL / ANTHROPIC_MODEL_FAST / OPENAI_MODEL_EDITORIAL / OPENAI_MODEL_FAST.
// (AI_MODEL_EDITORIAL / AI_MODEL_FAST still work and apply to whichever provider is primary.)
// The `apiKey` argument is kept for backward compatibility and ignored; keys come from env.

export interface AIOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  /** "editorial" = the writing model, "fast" = cheap extraction/classification. Default: fast. */
  tier?: "editorial" | "fast";
  /** Per-call timeout in ms. Default 90s. */
  timeoutMs?: number;
}

type Provider = "anthropic" | "openai";

const DEFAULTS: Record<Provider, { editorial: string; fast: string }> = {
  anthropic: { editorial: "claude-sonnet-5-5", fast: "claude-haiku-5-5" },
  openai: { editorial: "gpt-4o", fast: "gpt-4o-mini" },
};

export class AIError extends Error {
  constructor(public provider: Provider, public status: number, message: string) {
    super(`${provider} ${status}: ${message}`);
  }
  get retryable(): boolean {
    return this.status === 0 || this.status === 408 || this.status === 429 || this.status >= 500;
  }
}

function keyFor(p: Provider): string | undefined {
  return p === "anthropic" ? Deno.env.get("ANTHROPIC_API_KEY") : Deno.env.get("OPENAI_API_KEY");
}

function providerOrder(): Provider[] {
  const pref = (Deno.env.get("AI_PROVIDER") ?? "anthropic").toLowerCase() as Provider;
  const primary: Provider = pref === "openai" ? "openai" : "anthropic";
  const secondary: Provider = primary === "anthropic" ? "openai" : "anthropic";
  return [primary, secondary].filter((p) => Boolean(keyFor(p)));
}

function pickModel(provider: Provider, isPrimary: boolean, opts: AIOptions): string {
  if (opts.model && !opts.model.startsWith("google/")) return opts.model; // legacy gateway model ids are ignored
  const tier = opts.tier ?? "fast";
  const specific = Deno.env.get(`${provider.toUpperCase()}_MODEL_${tier.toUpperCase()}`);
  if (specific) return specific;
  if (isPrimary) {
    const generic = Deno.env.get(tier === "editorial" ? "AI_MODEL_EDITORIAL" : "AI_MODEL_FAST");
    if (generic) return generic;
  }
  return DEFAULTS[provider][tier];
}

async function fetchWithTimeout(url: string, init: RequestInit, ms: number): Promise<Response> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: ctl.signal });
  } finally {
    clearTimeout(t);
  }
}

async function callAnthropic(system: string, user: string, model: string, temperature: number, maxTokens: number, timeoutMs: number): Promise<string> {
  let r: Response;
  try {
    r = await fetchWithTimeout("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": keyFor("anthropic")!, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({ model, system, max_tokens: maxTokens, temperature, messages: [{ role: "user", content: user }] }),
    }, timeoutMs);
  } catch (e) {
    throw new AIError("anthropic", 0, String(e));
  }
  if (!r.ok) throw new AIError("anthropic", r.status, (await r.text()).slice(0, 300));
  const d = await r.json();
  const text = (d.content ?? []).filter((b: { type: string }) => b.type === "text").map((b: { text: string }) => b.text).join("");
  if (!text) throw new AIError("anthropic", 502, "empty completion");
  return text;
}

async function callOpenAI(system: string, user: string, model: string, temperature: number, maxTokens: number, timeoutMs: number): Promise<string> {
  const base = (Deno.env.get("OPENAI_BASE_URL") ?? Deno.env.get("AI_GATEWAY_URL") ?? "https://api.openai.com/v1").replace(/\/$/, "");
  const headers: Record<string, string> = { Authorization: `Bearer ${keyFor("openai")}`, "Content-Type": "application/json" };
  if (base.includes("openrouter.ai")) { headers["HTTP-Referer"] = Deno.env.get("SITE_URL") ?? "https://thegppulse.com"; headers["X-Title"] = "The GP Pulse"; }
  // Newer OpenAI models reject max_tokens/temperature; send the modern field and drop temperature for o-series/gpt-5.
  const modern = /^(o\d|gpt-5)/.test(model);
  const body: Record<string, unknown> = { model, messages: [{ role: "system", content: system }, { role: "user", content: user }] };
  if (modern) body.max_completion_tokens = maxTokens; else { body.max_tokens = maxTokens; body.temperature = temperature; }
  let r: Response;
  try {
    r = await fetchWithTimeout(`${base}/chat/completions`, { method: "POST", headers, body: JSON.stringify(body) }, timeoutMs);
  } catch (e) {
    throw new AIError("openai", 0, String(e));
  }
  if (!r.ok) throw new AIError("openai", r.status, (await r.text()).slice(0, 300));
  const d = await r.json();
  const text: string = d.choices?.[0]?.message?.content ?? "";
  if (!text) throw new AIError("openai", 502, "empty completion");
  return text;
}

async function withRetry<T>(fn: () => Promise<T>, tries = 3): Promise<T> {
  let last: unknown;
  for (let i = 0; i < tries; i++) {
    try {
      return await fn();
    } catch (e) {
      last = e;
      if (!(e instanceof AIError) || !e.retryable || i === tries - 1) throw e;
      await new Promise((res) => setTimeout(res, 800 * (i + 1) ** 2));
    }
  }
  throw last;
}

/** Which provider served the last successful call. Useful in logs and the pipeline step output. */
export let lastProviderUsed: Provider | null = null;

export async function chat(_apiKey: string, system: string, user: string, opts: AIOptions = {}): Promise<string> {
  const temperature = opts.temperature ?? 0.4;
  const maxTokens = opts.maxTokens ?? 2000;
  const timeoutMs = opts.timeoutMs ?? 90_000;
  const order = providerOrder();
  if (!order.length) throw new Error("No AI provider configured: set ANTHROPIC_API_KEY and/or OPENAI_API_KEY");

  const errors: string[] = [];
  for (let i = 0; i < order.length; i++) {
    const provider = order[i];
    const model = pickModel(provider, i === 0, opts);
    try {
      const text = await withRetry(() =>
        provider === "anthropic"
          ? callAnthropic(system, user, model, temperature, maxTokens, timeoutMs)
          : callOpenAI(system, user, model, temperature, maxTokens, timeoutMs));
      if (i > 0) console.warn(`[ai] failed over to ${provider}/${model} after: ${errors.join(" | ")}`);
      lastProviderUsed = provider;
      return text;
    } catch (e) {
      errors.push(String(e));
      console.error(`[ai] ${provider}/${model} failed: ${String(e).slice(0, 200)}`);
    }
  }
  throw new Error(`All AI providers failed: ${errors.join(" | ")}`);
}

/** True when at least one provider key is present. Functions use this to skip AI steps gracefully. */
export function aiConfigured(): boolean {
  return providerOrder().length > 0;
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
