// Non-secret newsletter settings. Env vars (pushed from GitHub repo secrets) override these
// defaults when set; an unset or empty env var falls back to the value here.
// API keys and tokens never belong in this file.

const env = (k: string): string | undefined => {
  const v = Deno.env.get(k);
  return v && v.trim() ? v.trim() : undefined;
};

export const CONFIG = {
  siteUrl: (env("SITE_URL") ?? "https://gppulse.vercel.app").replace(/\/$/, ""),
  from: env("NEWSLETTER_FROM") ?? "The GP Pulse <pulse@mail.thegppulse.com>",
  replyTo: env("NEWSLETTER_REPLY_TO") ?? "cschlotman@littlejohncapital.com",
  // CAN-SPAM requires a valid physical postal address. Replace with a street address or PO box.
  postalAddress: env("NEWSLETTER_POSTAL_ADDRESS") ?? "The GP Pulse · Austin, TX 78746",
  editorName: env("NEWSLETTER_EDITOR_NAME") ?? "Carl Schlotman",
  editorTitle: env("NEWSLETTER_EDITOR_TITLE") ?? "Partner, Eaglehead Capital Management",
};
