import { Link } from "@tanstack/react-router";
import { Activity, Database, History } from "lucide-react";

const sections = [
  { title: "Data Generator", to: "/generator", icon: Database, hint: "Generate market data" },
  { title: "Backtester", to: "/backtest", icon: History, hint: "Replay strategy performance" },
  { title: "Live Analyser", to: "/analysis", icon: Activity, hint: "Open the strategy analyser" },
];

export default function Home() {
  return (
    <main className="app-shell min-h-screen bg-background px-4 py-6 sm:px-8 sm:py-10">
      <div className="mx-auto flex min-h-[calc(100vh-3rem)] max-w-5xl flex-col justify-center gap-8 sm:min-h-[calc(100vh-5rem)]">
        <header className="flex items-baseline justify-between border-b border-border/60 pb-4">
          <div>
            <p className="num text-xs uppercase tracking-[0.28em] text-primary">Signal Finder Pro</p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">Control Panel</h1>
          </div>
        </header>

        <nav aria-label="Primary application sections" className="grid gap-3 sm:grid-cols-3">
          {sections.map(({ title, to, icon: Icon, hint }) => (
            <Link
              key={to}
              to={to}
              className="group flex min-h-40 flex-col justify-between border border-border/70 bg-card/40 p-5 transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/60 hover:bg-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/70"
            >
              <Icon size={24} className="text-primary transition-transform duration-200 group-hover:scale-110" aria-hidden />
              <div>
                <div className="text-lg font-semibold tracking-tight text-foreground">{title}</div>
                <div className="mt-1 text-xs text-muted-foreground">{hint}</div>
              </div>
            </Link>
          ))}
        </nav>
      </div>
    </main>
  );
}
