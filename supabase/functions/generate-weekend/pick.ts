/** At most `max` picks from any one publisher, keeping the order given. */
export function capPerPublisher<T extends { publisher: string }>(picks: T[], max = 2): T[] {
  const seen = new Map<string, number>();
  return picks.filter((p) => {
    const k = p.publisher.toLowerCase().trim();
    const n = (seen.get(k) ?? 0) + 1;
    seen.set(k, n);
    return n <= max;
  });
}

/** "the weekend of Nov 28" for the Saturday on or after the given day. */
export function weekendLabel(d: Date): string {
  const sat = new Date(d);
  sat.setUTCDate(sat.getUTCDate() + ((6 - sat.getUTCDay() + 7) % 7));
  return `the weekend of ${sat.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })}`;
}
