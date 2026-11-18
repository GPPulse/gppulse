// deno test supabase/functions/inbound-email/forwarded.test.ts
const assertEquals = (a: unknown, b: unknown) => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${JSON.stringify(a)} !== ${JSON.stringify(b)}`); };
import { findForwarded } from "./forwarded.ts";

const cases = {
gmail: ['Fwd: Gauge Capital acquires Acme', `FYI\n\n---------- Forwarded message ---------\nFrom: Gauge Capital <news@gaugecapital.com>\nDate: Tue, Nov 17, 2026 at 9:02 AM\nSubject: Gauge Capital acquires Acme Industrial\nTo: <cschlotman@littlejohncapital.com>\n\nDALLAS - Gauge Capital today announced...`],
outlook: ['FW: Q3 Deal Update', `see below\n\n________________________________\nFrom: Capstone Partners <marketing@capstonepartners.com>\nSent: Monday, November 16, 2026 4:10 PM\nTo: Carl Schlotman <cschlotman@littlejohncapital.com>\nSubject: Capstone Advises Blue Co. on Sale\n\nCapstone Partners is pleased to announce...`],
outlookMailto: ['FW: News', `From: Harbor Lending [mailto:info@harborlend.com]\nSent: Monday\nTo: Carl\nSubject: Harbor closes $20M facility\n\nBody here`],
apple: ['Fwd: Closing', `Begin forwarded message:\n\nFrom: "Shore Capital" <deals@shorecp.com>\nSubject: Shore closes Fund IV\nDate: Nov 17\nTo: Carl\n\nShore Capital Partners closed...`],
flatHtml: ['Fwd: x', `note ---------- Forwarded message --------- From: Riverside News <news@riversidecompany.com> Date: Nov 17 Subject: Riverside invests in Foo To: carl Riverside today announced`],
notFwd: ['Weekly update', `Hello from the firm, From: our desk to yours`],
};
const want: Record<string, [string, string] | null> = {
  gmail: ["news@gaugecapital.com", "Gauge Capital acquires Acme Industrial"],
  outlook: ["marketing@capstonepartners.com", "Capstone Advises Blue Co. on Sale"],
  outlookMailto: ["info@harborlend.com", "Harbor closes $20M facility"],
  apple: ["deals@shorecp.com", "Shore closes Fund IV"],
  flatHtml: ["news@riversidecompany.com", "Riverside invests in Foo"],
  notFwd: null,
};
for (const [k, [s, t]] of Object.entries(cases)) {
  Deno.test(`forward: ${k}`, () => {
    const f = findForwarded(s, t);
    assertEquals(f ? [f.address, f.subject] : null, want[k]);
  });
}

// A real forward from this morning (Outlook desktop, no divider line, signature above the header).
Deno.test("forward: outlook real, signature first, keeps original date", () => {
  const t = `\n\nCarl R. Schlotman\nPrincipal\nLittlejohn Capital LLC\n3101 Bee Caves Road | Austin, TX 78746\nE: cschlotman@littlejohncapital.com<mailto:cschlotman@littlejohncapital.com>\n\n\nFrom: Brown Gibbons Lang & Company <info@bglco.com>\nSent: Monday, August 3, 2026 10:03 AM\nTo: Carl Schlotman <cschlotman@littlejohncapital.com>\nSubject: BGL Announces the Sale of Camden Yards Steel Company to Triple-S Steel Holdings\n\n\n No images? Click Here\n\nChicago, IL — August 3, 2026 — Brown Gibbons Lang & Company (BGL)...`;
  const f = findForwarded("FW: BGL Announces the Sale of Camden Yards Steel Company to Triple-S Steel Holdings", t);
  assertEquals([f?.address, f?.subject, f?.sentAt?.slice(0, 10), f?.body.includes("Chicago, IL")], ["info@bglco.com", "BGL Announces the Sale of Camden Yards Steel Company to Triple-S Steel Holdings", "2026-08-03", true]);
});
Deno.test("forward: gmail date with 'at'", () => {
  const f = findForwarded("Fwd: x", `---------- Forwarded message ---------\nFrom: A <a@firm.com>\nDate: Tue, Nov 17, 2026 at 9:02 AM\nSubject: Deal\nTo: c\n\nbody`);
  assertEquals(f?.sentAt?.slice(0, 10), "2026-11-17");
});
