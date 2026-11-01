import { useEffect } from "react";
import { Header } from "@/components/landing/Header";
import { Footer } from "@/components/landing/Footer";
import { SITE } from "@/lib/site";

const UPDATED = "October 31, 2026";

const sections: { h: string; p: string[] }[] = [
  {
    h: "What we collect",
    p: [
      "Your email address when you subscribe. Optionally your first name, firm, role and sector interests if you tell us, so the issue and alerts fit your seat.",
      "Whether you open an issue and which links you click. Our email provider (Resend) reports this; we use it to see what's working and to stop sending to addresses that bounce.",
      "If you send a tip, the tip and your email so we can follow up. Tips are published attributed by role only unless you explicitly ask for credit.",
      "Standard server logs on the website: IP address, browser, pages viewed. No advertising trackers, no third-party analytics scripts.",
    ],
  },
  {
    h: "What we do with it",
    p: [
      "Send you The GP Pulse and, if you opted in, sector deal alerts. That's the whole list.",
      "We don't sell, rent or share subscriber data with anyone. If we ever run a sponsored placement, the sponsor gets aggregate numbers (how many readers, open rate), never a list.",
      "Aggregate, anonymized statistics (\"readership is 40% GPs, 20% lenders\") may be shared publicly.",
    ],
  },
  {
    h: "Who touches it",
    p: [
      "Supabase (database and hosting, US), Resend (email delivery), Vercel (website). Each is bound by its own terms and processes data only to provide the service.",
      "The AI models that help draft the newsletter never see subscriber data. They see public news articles.",
    ],
  },
  {
    h: "Your choices",
    p: [
      "Unsubscribe with one click in any email, or at /unsubscribe. It takes effect immediately.",
      "Change your name, firm, role or alert sectors at /preferences, linked at the bottom of every issue.",
      "Ask us to delete everything we hold about you: reply to any issue or email the address below. We'll confirm within 7 days.",
      "If you're in the EU, UK or California, you have the usual rights of access, correction, portability and deletion. The same email address handles those.",
    ],
  },
  {
    h: "Retention",
    p: [
      "Active subscribers: for as long as you're subscribed. Unsubscribed addresses are kept on a suppression list so we don't accidentally re-add you, then deleted on request.",
      "Open and click events: 24 months, then aggregated and deleted.",
    ],
  },
  {
    h: "Cookies",
    p: [
      "The website sets a session cookie only if you sign in to the editor dashboard. Reading the site or the archive sets nothing.",
    ],
  },
  {
    h: "Not advice, and conflicts",
    p: [
      "The GP Pulse is news and commentary. Nothing in it is investment, legal or tax advice, and nothing in it is an offer to buy or sell anything.",
      `The editor is a partner at an active private equity firm. Deals and processes that firm is party to are excluded from coverage while they're live. The newsletter doesn't take payment for placement.`,
    ],
  },
  {
    h: "Changes and contact",
    p: [
      "If this policy changes in a way that matters, we'll say so in an issue. The date at the top is the last revision.",
      "Questions: reply to any issue. It goes to a person.",
    ],
  },
];

export default function Privacy() {
  useEffect(() => { document.title = `Privacy | ${SITE.name}`; }, []);
  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="pt-16">
        <section className="py-16 md:py-24">
          <div className="container max-w-2xl mx-auto px-4">
            <p className="font-mono text-[11px] uppercase tracking-[0.16em] font-bold mb-3">Privacy</p>
            <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight leading-tight mb-3">Short, because there isn't much to say.</h1>
            <p className="font-mono text-xs text-muted-foreground mb-10">Last revised {UPDATED}</p>
            <div className="divide-y-2 divide-foreground border-y-2 border-foreground">
              {sections.map((s) => (
                <div key={s.h} className="py-6 grid sm:grid-cols-[180px_1fr] gap-3">
                  <h2 className="font-bold text-base leading-snug">{s.h}</h2>
                  <div className="space-y-3">
                    {s.p.map((t, i) => <p key={i} className="text-[15px] leading-relaxed text-foreground/85">{t}</p>)}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
        <Footer />
      </main>
    </div>
  );
}
