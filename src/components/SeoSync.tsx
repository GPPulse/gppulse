import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import { TITLES } from "../../api/_lib/copy.js";

const ORIGIN = "https://thegppulse.com";

/**
 * The server sends each page with its own title, canonical address and structured data
 * (api/page.js). That is right for the page you land on. When you then click to another page
 * without a reload, this keeps the title and canonical address in step and drops the first
 * page's structured data, which no longer describes what is on screen.
 */
export function SeoSync() {
  const { pathname } = useLocation();
  const first = useRef(true);
  useEffect(() => {
    const path = pathname === "/" ? "/" : pathname.replace(/\/+$/, "");
    const title = (TITLES as Record<string, string>)[path];
    if (title) document.title = title;
    if (first.current) { first.current = false; return; }
    const url = ORIGIN + path;
    document.querySelector('link[rel="canonical"]')?.setAttribute("href", url);
    document.querySelector('meta[property="og:url"]')?.setAttribute("content", url);
    document.querySelectorAll('script[type="application/ld+json"]').forEach((el) => el.remove());
  }, [pathname]);
  return null;
}
