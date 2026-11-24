// Which morning an issue belongs to.
//
// The draft is built the evening before it is read (about 5pm Eastern) and sent about 6am
// Eastern. So the issue built on Thursday evening is Friday's issue. Anything that depends on
// the day of the week (the Friday week-in-review edition, the date in the prompt) has to use
// the day the issue is read, not the day it was built.

const NY = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York", year: "numeric", month: "numeric", day: "numeric", hour: "numeric", hourCycle: "h23",
});

/**
 * The calendar day (in New York) on which an issue built at `now` will go out, returned as
 * noon UTC of that day so getUTCDay() and a UTC-formatted label are stable everywhere.
 * Built at or after noon Eastern → the next day. Saturdays and Sundays roll to Monday.
 */
export function issueDay(now: Date = new Date()): Date {
  const p: Record<string, number> = {};
  for (const part of NY.formatToParts(now)) if (part.type !== "literal") p[part.type] = Number(part.value);
  const day = new Date(Date.UTC(p.year, p.month - 1, p.day, 12));
  if (p.hour >= 12) day.setUTCDate(day.getUTCDate() + 1);
  while (day.getUTCDay() === 0 || day.getUTCDay() === 6) day.setUTCDate(day.getUTCDate() + 1);
  return day;
}

export const isFridayIssue = (now: Date = new Date()): boolean => issueDay(now).getUTCDay() === 5;

export const issueDateLabel = (now: Date = new Date()): string =>
  issueDay(now).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });
