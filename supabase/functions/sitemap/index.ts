import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { CONFIG } from "../_shared/config.ts";

// sitemap.xml for the public site: the standing pages plus every issue that has gone out.
// Served at https://thegppulse.com/sitemap.xml through a rewrite in vercel.json. Public, read-only.

const PAGES: [path: string, changefreq: string, priority: string][] = [
  ["/", "daily", "1.0"], ["/archive", "daily", "0.9"], ["/deals", "daily", "0.9"], ["/comps", "daily", "0.8"],
  ["/pricing", "weekly", "0.8"], ["/funds", "daily", "0.8"], ["/people-moves", "daily", "0.7"], ["/deal-stats", "weekly", "0.7"],
  ["/about", "monthly", "0.5"], ["/tip", "monthly", "0.4"], ["/referrals", "monthly", "0.4"], ["/privacy", "yearly", "0.2"],
];
const xml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

serve(async (): Promise<Response> => {
  const site = (Deno.env.get("PUBLIC_SITE_URL") ?? (CONFIG.siteUrl.includes("vercel.app") ? "https://thegppulse.com" : CONFIG.siteUrl)).replace(/\/$/, "");
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data } = await supabase.from("newsletters").select("slug, id, sent_at").eq("status", "sent").order("sent_at", { ascending: false }).limit(2000);
  const today = new Date().toISOString().slice(0, 10);
  const urls = [
    ...PAGES.map(([p, freq, pri]) => `<url><loc>${xml(site + p)}</loc><lastmod>${today}</lastmod><changefreq>${freq}</changefreq><priority>${pri}</priority></url>`),
    ...((data ?? []) as { slug: string | null; id: string; sent_at: string | null }[]).map((n) =>
      `<url><loc>${xml(`${site}/archive/${n.slug ?? n.id}`)}</loc>${n.sent_at ? `<lastmod>${n.sent_at.slice(0, 10)}</lastmod>` : ""}<changefreq>never</changefreq><priority>0.6</priority></url>`),
  ];
  return new Response(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join("\n")}\n</urlset>\n`, {
    headers: { "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "public, max-age=3600" },
  });
});
