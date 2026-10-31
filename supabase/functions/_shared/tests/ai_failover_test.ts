import { chat, lastProviderUsed } from "../ai.ts";
Deno.env.set("ANTHROPIC_API_KEY", "a"); Deno.env.set("OPENAI_API_KEY", "o");
const calls: string[] = [];
let anthropicStatus = 529;
globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
  const u = String(url); calls.push(u.includes("anthropic") ? "anthropic" : "openai");
  if (u.includes("anthropic")) return new Response("overloaded", { status: anthropicStatus });
  const body = JSON.parse(String(init?.body));
  return new Response(JSON.stringify({ choices: [{ message: { content: `ok from ${body.model}` } }] }), { status: 200 });
}) as typeof fetch;

// 1. Anthropic down (529 ×3 retries) → OpenAI serves
let out = await chat("", "sys", "user", { tier: "editorial" });
console.log("1:", out, "| provider:", lastProviderUsed, "| calls:", calls.join(","));
if (!(out === "ok from gpt-4o" && lastProviderUsed === "openai" && calls.filter(c => c === "anthropic").length === 3)) throw new Error("test 1 failed");

// 2. Bad key (401) → no retries, immediate failover
calls.length = 0; anthropicStatus = 401;
out = await chat("", "sys", "user");
console.log("2:", out, "| calls:", calls.join(","));
if (!(out === "ok from gpt-4o-mini" && calls.join(",") === "anthropic,openai")) throw new Error("test 2 failed");

// 3. Primary flipped to openai via AI_PROVIDER, custom model
calls.length = 0; Deno.env.set("AI_PROVIDER", "openai"); Deno.env.set("OPENAI_MODEL_FAST", "llama-3.3-70b");
out = await chat("", "sys", "user");
console.log("3:", out, "| calls:", calls.join(","));
if (!(out === "ok from llama-3.3-70b" && calls.join(",") === "openai")) throw new Error("test 3 failed");

// 4. Only Anthropic configured and it's down → clear error
Deno.env.delete("OPENAI_API_KEY"); Deno.env.set("AI_PROVIDER", "anthropic"); anthropicStatus = 500; calls.length = 0;
try { await chat("", "s", "u"); throw new Error("should have thrown"); } catch (e) { console.log("4:", String(e).slice(0, 80)); if (!String(e).includes("All AI providers failed")) throw e; }
console.log("ALL PASS");
