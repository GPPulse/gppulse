// Runs after `vite build` on Vercel only (see vercel.json).
//
// The built index.html becomes "the shell": api/page.js fills its two marked slots for each
// page. It is (1) written into the function bundle and (2) kept as dist/shell.html for the
// private pages. dist/index.html is removed so that "/" also goes through api/page.js; while it
// exists, Vercel serves it for "/" before any rewrite is considered.
import { readFileSync, writeFileSync, renameSync } from "node:fs";

const html = readFileSync("dist/index.html", "utf8");
if (!html.includes("<!--seo:head-->") || !html.includes("<!--seo:body-->")) {
  console.error("postbuild: index.html has lost its seo:head / seo:body markers"); process.exit(1);
}
writeFileSync("api/_lib/shell.generated.js", `export default ${JSON.stringify(html)};\n`);
renameSync("dist/index.html", "dist/shell.html");
console.log(`postbuild: shell is ${html.length} bytes`);
