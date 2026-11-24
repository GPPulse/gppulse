// Sponsor names as they appear in deals: co-sponsors in one field, and the same firm spelled
// several ways. Shared by the public Sponsors page and the follow-a-sponsor alerts.

/** "A; B" and "A and B" name co-sponsors; each gets credit for the deal. */
export function splitSponsors(s: string): string[] {
  return s.split(/\s*;\s*|\s+and\s+(?=[A-Z])|\s*\/\s*/).map((x) => x.replace(/\s*\(.*?\)\s*$/, "").trim()).filter((x) => x.length > 1);
}

/** Same firm, written two ways ("Kian Capital" / "Kian Capital Partners, LLC"). */
export function sponsorKey(name: string): string {
  return name.toLowerCase().replace(/&/g, " and ").replace(/[.,]/g, " ")
    .replace(/\b(llc|l\.?p\.?|inc|the|partners|capital|equity|group|management|private|investments?|holdings|advisors|company|co)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ").trim() || name.toLowerCase().trim();
}

/** A reader's list of firms to follow, as typed: trimmed, de-duplicated by firm, capped. */
export function cleanFollowList(input: unknown, max = 25): string[] {
  if (!Array.isArray(input)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of input) {
    if (typeof raw !== "string") continue;
    const name = raw.replace(/\s+/g, " ").trim().slice(0, 80);
    const key = sponsorKey(name);
    if (name.length < 2 || key.length < 2 || seen.has(key)) continue;
    seen.add(key);
    out.push(name);
    if (out.length >= max) break;
  }
  return out;
}

/** Which of `followed` does this deal's sponsor field name? Returns the reader's own spellings. */
export function followedIn(sponsorField: string, followed: string[]): string[] {
  const keys = new Set(splitSponsors(sponsorField ?? "").map(sponsorKey));
  return followed.filter((f) => keys.has(sponsorKey(f)));
}
