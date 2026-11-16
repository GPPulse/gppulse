// Talks to the firm-watch edge function. Same auth as the newsletter pipeline:
// the shared PIPELINE_SECRET header plus the public anon key.
const FN = process.env.FIRM_WATCH_URL || (process.env.SUPABASE_PROJECT_REF ? `https://${process.env.SUPABASE_PROJECT_REF}.supabase.co/functions/v1/firm-watch` : '');

export const configured = () => Boolean(FN && process.env.PIPELINE_SECRET);

export async function api(action, payload = {}) {
  if (!configured()) throw new Error('Set SUPABASE_PROJECT_REF (or FIRM_WATCH_URL) and PIPELINE_SECRET');
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(FN, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-pipeline-secret': process.env.PIPELINE_SECRET, authorization: `Bearer ${process.env.SUPABASE_ANON_KEY || ''}` },
      body: JSON.stringify({ action, ...payload }),
    }).catch((err) => ({ ok: false, status: 0, text: async () => String(err) }));
    if (res.ok) return res.json();
    const detail = (await res.text()).slice(0, 300);
    if (attempt >= 3 || (res.status >= 400 && res.status < 500 && res.status !== 429)) throw new Error(`firm-watch ${action} failed: HTTP ${res.status} ${detail}`);
    await new Promise((r) => setTimeout(r, attempt * 3000));
  }
}

export const chunk = (arr, n) => Array.from({ length: Math.ceil(arr.length / n) }, (_, i) => arr.slice(i * n, i * n + n));
