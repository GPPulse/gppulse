import {
  Article,
  DEAL_TYPE_LABEL,
  DealRow,
  EditorItem,
  fmtMillions,
  fmtMultiple,
  FUND_STATUS_LABEL,
  FundRow,
  MarketQuote,
  NewsletterContentV2,
  Stat,
} from "@/lib/newsletter-content";
import { SITE } from "@/lib/site";
import { cn } from "@/lib/utils";

// Web rendering of an issue. Mirrors the email sections one-for-one so what the
// archive shows is what landed in the inbox.

interface IssueViewProps {
  content: NewsletterContentV2;
  issueNumber: number;
  date: Date;
  className?: string;
  compact?: boolean;
}

const Label = ({ children, sub }: { children: React.ReactNode; sub?: string }) => (
  <div className="border-t-2 border-foreground pt-2.5 mb-4 flex items-baseline gap-3">
    <span className="font-mono text-[11px] font-bold uppercase tracking-[0.14em]">{children}</span>
    {sub && <span className="text-[11px] text-muted-foreground">{sub}</span>}
  </div>
);

const Ext = ({ href, children, className }: { href?: string | null; children: React.ReactNode; className?: string }) =>
  href ? (
    <a href={href} target="_blank" rel="noopener noreferrer" className={cn("font-bold border-b border-foreground hover:bg-foreground hover:text-background transition-colors", className)}>
      {children}
    </a>
  ) : (
    <span className={cn("font-bold", className)}>{children}</span>
  );

const Take = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div className="mt-2 pl-3 border-l-[3px] border-accent-ink">
    <span className="block font-mono text-[10px] font-bold uppercase tracking-[0.1em] text-accent-ink">{label}</span>
    <p className="text-sm leading-relaxed">{children}</p>
  </div>
);

const Chip = ({ children, dark }: { children: React.ReactNode; dark?: boolean }) => (
  <span className={cn("inline-block font-mono text-[10px] uppercase tracking-[0.08em] px-1.5 py-0.5 border border-foreground mr-1.5", dark && "bg-foreground text-background")}>
    {children}
  </span>
);

function Ticker({ quotes }: { quotes: MarketQuote[] }) {
  if (!quotes?.length) return null;
  return (
    <div className="grid grid-cols-3 sm:grid-cols-5 border-y-2 border-foreground bg-secondary divide-x divide-border/40">
      {quotes.slice(0, 5).map((q) => {
        const isRate = q.unit === "percent" || q.unit === "bps";
        const up = q.change >= 0;
        return (
          <div key={q.symbol} className="p-3 text-center">
            <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{q.name}</p>
            <p className="font-bold text-base mt-0.5">{isRate ? `${q.price.toFixed(2)}%` : q.price.toLocaleString("en-US", { maximumFractionDigits: q.price > 1000 ? 0 : 2 })}</p>
            <p className={cn("font-mono text-xs", up ? "text-accent-ink" : "text-destructive")}>
              {up ? "+" : ""}{isRate ? `${Math.round(q.change * 100)}bp` : `${q.changePercent.toFixed(2)}%`}
            </p>
          </div>
        );
      })}
    </div>
  );
}

function Numbers({ stats }: { stats: Stat[] }) {
  if (!stats?.length) return null;
  return (
    <section className="px-6 md:px-8">
      <Label>By the numbers</Label>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 pb-2">
        {stats.slice(0, 3).map((s, i) => (
          <div key={i}>
            <p className="text-4xl font-extrabold tracking-tight leading-none">{s.value}</p>
            <p className="font-bold text-sm mt-2">{s.label}</p>
            {s.context && <p className="text-xs text-muted-foreground mt-0.5 leading-snug">{s.context}</p>}
          </div>
        ))}
      </div>
    </section>
  );
}

function Headlines({ items, title = "The headlines", takeLabel = "Why it matters" }: { items: Article[]; title?: string; takeLabel?: string }) {
  if (!items?.length) return null;
  return (
    <section className="px-6 md:px-8">
      <Label>{title}</Label>
      <ol className="space-y-5">
        {items.map((a, i) => (
          <li key={a.id ?? i} className="flex gap-3">
            <span className="font-mono text-sm text-muted-foreground pt-0.5 w-6 shrink-0">{String(i + 1).padStart(2, "0")}</span>
            <div className="min-w-0">
              <p className="text-base leading-snug"><Ext href={a.source_url}>{a.title}</Ext></p>
              {a.summary && <p className="text-sm text-foreground/80 leading-relaxed mt-1">{a.summary}</p>}
              {a.why_it_matters && <Take label={takeLabel}>{a.why_it_matters}</Take>}
              <p className="font-mono text-[10px] text-muted-foreground mt-1.5">{a.source}</p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

function Deals({ deals }: { deals: DealRow[] }) {
  if (!deals?.length) return null;
  const verb = (t: DealRow["deal_type"]) => (t === "exit" ? "exits" : t === "add-on" ? "adds on" : t === "recap" ? "recaps" : "acquires");
  return (
    <section className="px-6 md:px-8">
      <Label sub="disclosed figures only">Deal tracker</Label>
      <div className="divide-y divide-border/40">
        {deals.map((d, i) => {
          const facts = [
            d.sector,
            d.enterprise_value_millions ? `EV ${fmtMillions(d.enterprise_value_millions)}` : null,
            d.ebitda_millions ? `EBITDA ${fmtMillions(d.ebitda_millions)}` : null,
            d.ev_ebitda_multiple ? fmtMultiple(d.ev_ebitda_multiple) : null,
            !d.figures_disclosed && !d.enterprise_value_millions ? "terms undisclosed" : null,
          ].filter(Boolean);
          return (
            <div key={d.id ?? i} className="py-3.5 first:pt-0">
              <div className="mb-1.5"><Chip dark={d.featured}>{DEAL_TYPE_LABEL[d.deal_type] ?? "Deal"}</Chip>{d.featured && <Chip dark>Deal of the day</Chip>}</div>
              <p className="text-[15px] leading-snug"><strong>{d.sponsor}</strong> {verb(d.deal_type)} <Ext href={d.source_url}>{d.target}</Ext></p>
              <p className="font-mono text-[11px] text-muted-foreground mt-1">{facts.join("  ·  ")}</p>
              {d.summary && <p className="text-sm text-foreground/80 leading-relaxed mt-1">{d.summary}</p>}
              {d.editor_take && <Take label="Our read">{d.editor_take}</Take>}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function Funds({ funds }: { funds: FundRow[] }) {
  if (!funds?.length) return null;
  return (
    <section className="px-6 md:px-8">
      <Label sub="sub-$1B vehicles">Fund tracker</Label>
      <table className="w-full text-sm">
        <tbody className="divide-y divide-border/40">
          {funds.map((f, i) => {
            const size = f.raised_millions
              ? `${fmtMillions(f.raised_millions)} raised${f.target_millions ? ` / ${fmtMillions(f.target_millions)} target` : ""}`
              : f.target_millions ? `${fmtMillions(f.target_millions)} target` : "size undisclosed";
            return (
              <tr key={f.id ?? i}>
                <td className="py-2.5 pr-4 align-top">
                  <Ext href={f.source_url}>{f.firm} — {f.fund_name}</Ext>
                  <p className="text-xs text-foreground/80 mt-0.5">{[f.strategy, f.headquarters].filter(Boolean).join(" · ")}</p>
                </td>
                <td className="py-2.5 text-right align-top whitespace-nowrap">
                  <p className="font-bold text-[13px]">{size}</p>
                  <p className="font-mono text-[10px] text-muted-foreground">{FUND_STATUS_LABEL[f.status] ?? "Update"}</p>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}

function People({ items }: { items: Article[] }) {
  if (!items?.length) return null;
  return (
    <section className="px-6 md:px-8">
      <Label>People moves</Label>
      <ul className="divide-y divide-border/40 text-sm">
        {items.map((a, i) => {
          const parts = (a.summary ?? "").split(" — ");
          const detail = parts.length > 1 ? parts.slice(1).join(" — ") : a.summary;
          return (
            <li key={a.id ?? i} className="py-2 leading-relaxed">
              <Ext href={a.source_url}>{a.title}</Ext>{detail && <span className="text-foreground/80"> {detail}</span>}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function Items({ title, sub, items, boxed }: { title: string; sub?: string; items: EditorItem[]; boxed?: boolean }) {
  if (!items?.length) return null;
  return (
    <section className="px-6 md:px-8">
      <Label sub={sub}>{title}</Label>
      <div className={cn(boxed ? "space-y-2" : "divide-y divide-border/40")}>
        {items.map((it) => (
          <div key={it.id} className={cn("text-sm leading-relaxed", boxed ? "bg-secondary border border-border/60 px-3.5 py-2.5" : "py-2")}>
            <p><Ext href={it.url}>{it.headline}</Ext></p>
            {it.body && <p className="text-foreground/80 mt-0.5">{it.body}</p>}
            {it.attribution && <p className="font-mono text-[10px] text-muted-foreground mt-1">{it.attribution}</p>}
          </div>
        ))}
      </div>
    </section>
  );
}

export function IssueView({ content: c, issueNumber, date, className, compact }: IssueViewProps) {
  const dateStr = date.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
  return (
    <article className={cn("border-2 border-foreground bg-background shadow-md", className)}>
      <header className="px-6 md:px-8 py-5 border-b-2 border-foreground flex items-end justify-between gap-4">
        <div>
          <p className="text-xl md:text-2xl font-extrabold tracking-tight">THE GP PULSE</p>
          <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">Lower middle market, every weekday</p>
        </div>
        <p className="font-mono text-[11px] text-muted-foreground text-right leading-relaxed">No. {issueNumber}<br />{dateStr}</p>
      </header>

      <Ticker quotes={c.market_data} />

      <div className={cn("space-y-8 py-7", compact && "space-y-6 py-5")}>
        {c.editors_note && (
          <section className="px-6 md:px-8">
            <h2 className="text-2xl md:text-[28px] font-extrabold tracking-tight leading-tight mb-4">{c.editors_note.headline}</h2>
            <div className="space-y-3.5">
              {c.editors_note.paragraphs.map((p, i) => (
                <p key={i} className="font-serif text-[17px] leading-relaxed">{p}</p>
              ))}
            </div>
            <p className="text-sm text-muted-foreground mt-3">— {c.editors_note.byline ?? SITE.editor.name}</p>
          </section>
        )}
        <Numbers stats={c.by_the_numbers} />
        <Headlines items={c.top_headlines} />
        <Deals deals={c.deal_tracker} />
        <Items title="On the market" sub="processes we're hearing about" items={c.on_the_market} boxed />
        <Funds funds={c.fund_tracker} />
        <People items={c.people_moves} />
        <Headlines items={c.market_pulse} title="Macro & credit" takeLabel="For the LMM" />
        <Items title="Overheard" items={c.overheard} />
        {c.the_read && (
          <section className="px-6 md:px-8">
            <Label sub="one piece worth your time">The read</Label>
            <div className="border-2 border-foreground p-4 md:p-5">
              <p className="text-base leading-snug"><Ext href={c.the_read.url}>{c.the_read.title}</Ext></p>
              <p className="font-mono text-[10px] text-muted-foreground mt-1">{c.the_read.source}</p>
              <p className="font-serif text-[15px] leading-relaxed mt-3">{c.the_read.take}</p>
            </div>
          </section>
        )}
        <Items title="Jobs" sub="open seats in the LMM" items={c.jobs} />
        {c.closing_line && (
          <section className="px-6 md:px-8">
            <p className="font-serif text-[15px] leading-relaxed">{c.closing_line}</p>
            <p className="text-sm text-muted-foreground mt-1">— {SITE.editor.name}, {SITE.editor.title}</p>
          </section>
        )}
      </div>
    </article>
  );
}

