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
  RadarItem,
  Scoreboard,
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

const File = ({ lines }: { lines?: string[] }) =>
  lines?.length ? (
    <div className="mt-2 bg-secondary px-2.5 py-1.5">
      <span className="font-mono text-[10px] font-bold uppercase tracking-[0.1em] text-muted-foreground">The file</span>
      {lines.map((l, i) => <p key={i} className="text-[12.5px] leading-snug text-foreground/80 mt-0.5">{l}</p>)}
    </div>
  ) : null;

function BelowRadar({ items }: { items?: RadarItem[] }) {
  if (!items?.length) return null;
  return (
    <section className="px-6 md:px-8">
      <Label sub="deals you won't read anywhere else">Below the radar</Label>
      <div className="divide-y divide-border/40">
        {items.map((r, i) => {
          const take = (r as RadarItem & { take?: string }).take;
          return (
            <div key={i} className="py-3.5 first:pt-0">
              {!r.confirmed && <div className="mb-1.5"><Chip>Unconfirmed</Chip></div>}
              <p className="text-[15.5px] leading-snug font-medium">{r.headline}</p>
              {r.body && <p className="text-sm text-foreground/80 leading-relaxed mt-1">{r.body}</p>}
              {take && <Take label="Our read">{take}</Take>}
              <File lines={r.file} />
            </div>
          );
        })}
      </div>
    </section>
  );
}

function ScoreboardView({ sb, weekly }: { sb?: Scoreboard | null; weekly?: boolean }) {
  if (!sb) return null;
  const cols: { title: string; rows: { k: React.ReactNode; v: React.ReactNode }[] }[] = [
    { title: "Busiest sponsors", rows: sb.sponsors.map((s) => ({ k: s.sponsor, v: s.n })) },
    { title: "Banks posting closings", rows: sb.banks.map((b) => ({ k: b.name, v: b.n })) },
    { title: "Platforms stacking add-ons", rows: sb.platforms.map((p) => ({ k: <>{p.platform} <span className="text-muted-foreground">({p.sponsor})</span></>, v: p.n })) },
    ...(weekly ? [{ title: "Sector pace: week vs 4-wk avg", rows: sb.sectors.filter((s) => s.this_week || s.weekly_avg).map((s) => ({ k: s.sector, v: <><b>{s.this_week}</b> vs {s.weekly_avg}</> })) }] : []),
  ].filter((c) => c.rows.length);
  if (!cols.length) return null;
  const sub = sb.radar?.total ? `last ${sb.window_days} days · ${sb.radar.total} deals tracked · ${sb.radar.below} reported only here` : `last ${sb.window_days} days`;
  return (
    <section className="px-6 md:px-8">
      <Label sub={sub}>The scoreboard</Label>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4">
        {cols.map((c) => (
          <div key={c.title}>
            <p className="font-mono text-[10px] font-bold uppercase tracking-[0.1em] text-muted-foreground mb-1">{c.title}</p>
            <ul className="divide-y divide-border/40 text-[13px]">
              {c.rows.map((r, i) => <li key={i} className="flex justify-between gap-3 py-1"><span>{r.k}</span><span className="font-mono font-bold">{r.v}</span></li>)}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}

function Ticker({ quotes }: { quotes: MarketQuote[] }) {
  if (!quotes?.length) return null;
  return (
    <div className="grid grid-cols-3 sm:grid-cols-6 border-b-2 border-foreground bg-secondary divide-x divide-border/40">
      {quotes.slice(0, 6).map((q) => {
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

function Deals({ deals, weekly }: { deals: DealRow[]; weekly?: boolean }) {
  if (!deals?.length) return null;
  const verb = (t: DealRow["deal_type"]) => (t === "exit" ? "exits" : t === "add-on" ? "adds on" : t === "recap" ? "recaps" : t === "growth" ? "invests in" : "acquires");
  return (
    <section className="px-6 md:px-8">
      <Label sub={weekly ? `${deals.length} tracked · ${deals.filter((d) => d.ev_ebitda_multiple).length} with disclosed multiples` : "announced today, with our file on each"}>{weekly ? "This week's deals" : "Deal tracker"}</Label>
      <div className="divide-y divide-border/40">
        {deals.map((d, i) => {
          const facts = [
            d.sector,
            d.enterprise_value_millions ? `EV ${fmtMillions(d.enterprise_value_millions)}` : null,
            d.ebitda_millions ? `EBITDA ${fmtMillions(d.ebitda_millions)}` : null,
            d.ev_ebitda_multiple ? fmtMultiple(d.ev_ebitda_multiple) : null,
            d.hq_state,
            d.seller_type && d.seller_type !== "unknown" ? (d.seller_type === "sponsor" ? "sponsor seller" : d.seller_type === "corporate" ? "corporate carve-out" : `${d.seller_type}-owned seller`) : null,
          ].filter(Boolean);
          const parties = [d.advisors ? `Advisors: ${d.advisors}` : "", d.lender ? `Debt: ${d.lender}` : ""].filter(Boolean).join("  ·  ");
          return (
            <div key={d.id ?? i} className="py-3.5 first:pt-0">
              <div className="mb-1.5"><Chip dark={d.featured}>{DEAL_TYPE_LABEL[d.deal_type] ?? "Deal"}</Chip>{d.featured && <Chip dark>Deal of the day</Chip>}{d.first_seen && <Chip dark>First here {new Date(`${d.first_seen}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })}</Chip>}</div>
              <p className="text-[15px] leading-snug"><strong>{d.sponsor}</strong> {verb(d.deal_type)} <Ext href={d.source_url}>{d.target}</Ext>{d.platform && d.deal_type === "add-on" && <span className="text-muted-foreground"> via {d.platform}</span>}</p>
              <p className="font-mono text-[11px] text-muted-foreground mt-1">{facts.join("  ·  ")}</p>
              {d.summary && <p className="text-sm text-foreground/80 leading-relaxed mt-1">{d.summary}</p>}
              {parties && <p className="text-[12.5px] text-foreground/80 mt-1">{parties}</p>}
              {d.editor_take && <Take label="Our read">{d.editor_take}</Take>}
              <File lines={d.file} />
            </div>
          );
        })}
      </div>
    </section>
  );
}

function Funds({ funds, weekly }: { funds: FundRow[]; weekly?: boolean }) {
  if (!funds?.length) return null;
  return (
    <section className="px-6 md:px-8">
      <Label sub="sub-$1B vehicles">{weekly ? "This week's funds" : "Fund tracker"}</Label>
      <table className="w-full text-sm">
        <tbody className="divide-y divide-border/40">
          {funds.map((f, i) => {
            const size = f.raised_millions
              ? `${fmtMillions(f.raised_millions)} raised${f.target_millions ? ` / ${fmtMillions(f.target_millions)} target` : ""}`
              : f.target_millions ? `${fmtMillions(f.target_millions)} target` : "size undisclosed";
            return (
              <tr key={f.id ?? i}>
                <td className="py-2.5 pr-4 align-top">
                  {/sec form d/i.test(f.source) && <Chip>SEC filing</Chip>}<Ext href={f.source_url}>{f.firm} — {f.fund_name}</Ext>
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
          {c.edition === "weekly"
            ? <p className="font-mono text-[10px] uppercase tracking-[0.12em] inline-block bg-foreground text-background px-1.5 py-0.5 mt-0.5">Week in review</p>
            : <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">The LMM deals nobody announced</p>}
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
        <BelowRadar items={c.below_radar} />
        <Deals deals={c.deal_tracker} weekly={c.edition === "weekly"} />
        <Items title="On the market" sub="processes we're hearing about" items={c.on_the_market} boxed />
        <ScoreboardView sb={c.scoreboard} weekly={c.edition === "weekly"} />
        <Funds funds={c.fund_tracker} weekly={c.edition === "weekly"} />
        <Headlines items={c.top_headlines} />
        <People items={c.people_moves} />
        <Headlines items={c.market_pulse} title="Macro & credit" takeLabel="For the LMM" />
        <Items title="Overheard" items={c.overheard} />
        {(c.weekend_reads ?? []).length > 0 && (
          <section className="px-6 md:px-8">
            <Label sub="the week's best long reads, picked by the desk">Weekend reading</Label>
            <ol className="divide-y divide-border/40">
              {(c.weekend_reads ?? []).map((r, i) => (
                <li key={r.url} className="py-4 first:pt-0">
                  <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground mb-1">{String(i + 1).padStart(2, "0")} · {r.publisher}{r.minutes ? ` · ${r.minutes} min` : ""}</p>
                  <p className="text-base leading-snug font-semibold"><Ext href={r.url}>{r.title}</Ext></p>
                  <p className="font-serif text-[15px] leading-relaxed mt-1.5">{r.note}</p>
                </li>
              ))}
            </ol>
          </section>
        )}
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

