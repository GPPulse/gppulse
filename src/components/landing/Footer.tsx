import { Link } from "react-router-dom";
import { SubscribeForm } from "./SubscribeForm";
import { SITE } from "@/lib/site";

export const Footer = () => {
  return (
    <footer className="py-16 md:py-24">
      <div className="container max-w-5xl mx-auto px-4">
        <div className="grid lg:grid-cols-[1fr_420px] gap-10 items-center mb-16 border-2 border-foreground p-8 md:p-10 shadow-md">
          <div>
            <p className="font-mono text-[11px] uppercase tracking-[0.16em] font-bold mb-3">Tomorrow, 6:00am ET</p>
            <h2 className="text-3xl md:text-4xl font-extrabold tracking-tight leading-tight">Know what printed in your market before your first call.</h2>
            <p className="font-serif text-muted-foreground mt-3">Free. Weekday mornings. One click to leave, and we won't make it weird.</p>
          </div>
          <SubscribeForm source="footer" />
        </div>

        <div className="border-t-2 border-foreground pt-8">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
            <div>
              <p className="font-extrabold tracking-tight">THE GP PULSE</p>
              <p className="text-xs text-muted-foreground mt-1 max-w-sm">{SITE.tagline} Not investment advice. The editor's firm is excluded from coverage while deals are live.</p>
            </div>
            <nav className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-muted-foreground">
              <Link to="/deals" className="hover:text-foreground">Deals</Link>
              <Link to="/funds" className="hover:text-foreground">Funds</Link>
              <Link to="/deal-stats" className="hover:text-foreground">Index</Link>
              <Link to="/tip" className="hover:text-foreground">Send a tip</Link>
              <Link to="/archive" className="hover:text-foreground">Archive</Link>
              <Link to="/referrals" className="hover:text-foreground">Referrals</Link>
              <Link to="/about" className="hover:text-foreground">About</Link>
              <Link to="/privacy" className="hover:text-foreground">Privacy</Link>
              <Link to="/admin" className="hover:text-foreground opacity-40 hover:opacity-100">Editor</Link>
            </nav>
            <p className="text-sm text-muted-foreground">© {new Date().getFullYear()} The GP Pulse</p>
          </div>
        </div>
      </div>
    </footer>
  );
};
