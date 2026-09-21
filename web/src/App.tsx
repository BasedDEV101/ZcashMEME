import { useEffect, useMemo, useState } from "react";
import { ConnectionProvider, WalletProvider } from "@solana/wallet-adapter-react";
import { Certificate } from "./components/Certificate.tsx";
import { BurnPanel } from "./components/BurnPanel.tsx";
import { GuillocheBand } from "./components/Guilloche.tsx";
import { CONFIG, DEX_URL, FOMO_URL, PROOF, PUMP_URL, SOURCE_URL, X_URL, formatTokens } from "./lib/config.ts";
import { CreateCoinPanel } from "./components/CreateCoinPanel.tsx";
import { MeteoraLaunchPanel } from "./components/MeteoraLaunchPanel.tsx";
import { Registry } from "./components/Registry.tsx";
import { ALLOWANCE_STAMPS, CREATOR_FEE_PERCENT, LAUNCH_FEE_SOL, STAMP_COST_ZEC, type Collection } from "./lib/launchpad.ts";
import { Leaderboard } from "./components/Leaderboard.tsx";
import { Burns } from "./components/Burns.tsx";
import { LatestCoins } from "./components/LatestCoins.tsx";
import { MarketRecord } from "./components/MarketRecord.tsx";
import { NewVersion } from "./components/NewVersion.tsx";
import { Boundary } from "./components/Boundary.tsx";
import { marketCap, money, toBigInt, tokens, useActivity } from "./lib/activity.ts";
import { MeteoraFeeAdmin } from "./components/MeteoraFeeAdmin.tsx";
import { isFeeAdminRoute } from "./lib/feeAdminRoute.ts";

type LaunchMode = "meteora" | "pump";

export default function App() {
  const wallets = useMemo(() => [], []);
  return (
    <ConnectionProvider endpoint={CONFIG.rpc}>
      <WalletProvider wallets={wallets} autoConnect>
        <Page />
      </WalletProvider>
    </ConnectionProvider>
  );
}

function Page() {
  const [theme, setTheme] = useState<"dark" | "light">(() => {
    if (typeof window === "undefined") return "dark";
    return window.localStorage.getItem("stamp-theme") === "light" ? "light" : "dark";
  });
  // The register lives on Zcash; the browser cannot speak lightwalletd's gRPC,
  // so the site reads a snapshot the operator exports from chain.
  const [collections, setCollections] = useState<Collection[]>([]);
  const [updated, setUpdated] = useState<string | null>(null);
  const [route, setRoute] = useState(() => (typeof location !== "undefined" ? location.pathname : "/"));
  const [launchMode, setLaunchMode] = useState<LaunchMode>("meteora");
  // One read of both chains, shared by the leaderboard, the burn feed and the
  // home page: three components asking separately would triple the RPC cost
  // for the same answer.
  const activity = useActivity();
  const loading = activity.status === "loading";
  const error = activity.status === "error" ? activity.message : null;
  const data = activity.status === "ready" ? activity.data : null;
  const stale = data?.stale ?? false;
  const rates = data?.rates;

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
    window.localStorage.setItem("stamp-theme", theme);
  }, [theme]);

  // The hero used to print one certificate -- 1,500,000 of a single coin --
  // which read as the pad's whole output rather than as the one example it
  // was. It now totals every burn the register knows about.
  const totals = (data?.collections ?? []).reduce(
    (t, c) => {
      const burned = toBigInt(c.burnedTokens) ?? 0n;
      return {
        destroyed: t.destroyed + burned,
        certificates: t.certificates + (c.burnCount ?? 0),
        coins: t.coins + (burned > 0n ? 1 : 0),
      };
    },
    { destroyed: 0n, certificates: 0, coins: 0 },
  );
  const flagship = (data?.collections ?? []).find((collection) => collection.mint === CONFIG.solanaMint);
  const currentMarketCap = money(data?.currentMarketCapUsd ?? null)
    ?? (flagship ? marketCap(flagship.marketCapQuote, flagship.quoteMint, rates) : null)
    ?? "Unavailable";

  useEffect(() => {
    fetch("/collections.json")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d) { setCollections(d.collections ?? []); setUpdated(d.updated ?? null); } })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const onPop = () => setRoute(location.pathname);
    addEventListener("popstate", onPop);
    return () => removeEventListener("popstate", onPop);
  }, []);

  const go = (path: string) => {
    history.pushState({}, "", path);
    setRoute(path);
    scrollTo({ top: 0 });
  };

  if (isFeeAdminRoute(route)) {
    return (
      <MeteoraFeeAdmin
        collections={data?.collections ?? []}
        activityLoading={loading}
        activityError={error}
        theme={theme}
        setTheme={setTheme}
      />
    );
  }

  if (route.startsWith("/leaderboard") || route.startsWith("/burns")) {
    return (
      <div className="site-bg min-h-dvh">
        <Nav route={route} go={go} theme={theme} setTheme={setTheme} />
        <main className="site-shell space-y-6 px-4 py-6 sm:px-6 lg:px-8 lg:py-10">
          <NewVersion />
          <section className="page-heading paper-lift bg-paper px-6 py-9 sm:px-10 sm:py-12 lg:px-14">
            <div className="max-w-4xl">
              <h1 className="font-display text-[2.25rem] leading-[1.02] font-semibold tracking-[-0.03em] text-ink sm:text-[3.5rem]">
                The network, ranked.
              </h1>
            </div>
            <p className="mt-7 max-w-[64ch] text-[0.98rem] leading-relaxed text-ink-soft">
              Every coin launched here since the register opened, and every burn against one. Both are
              read from Solana, not from a list we keep — so this page can be wrong about presentation,
              never about what happened. A coin created somewhere else and attached afterwards is not
              listed; everything here was made on the pad.
            </p>
          </section>
          <StatsStrip
            loading={loading}
            destroyed={totals.destroyed}
            collections={data?.collections.length ?? 0}
            currentMarketCap={currentMarketCap}
          />
          <Boundary what="launch list">
            <LatestCoins collections={data?.collections ?? []} loading={loading} error={error} limit={8} rates={rates} />
          </Boundary>
          <Boundary what="market record">
            <MarketRecord collections={data?.collections ?? []} loading={loading} error={error} rates={rates} theme={theme} />
          </Boundary>
          <Boundary what="leaderboard">
            <Leaderboard collections={data?.collections ?? []} loading={loading} error={error} stale={stale} rates={rates} />
          </Boundary>
          <Boundary what="burn feed">
            <Burns burns={data?.burns ?? []} collections={data?.collections ?? []} loading={loading} error={error} stale={stale} />
          </Boundary>
          <Footer />
        </main>
      </div>
    );
  }

  if (route.startsWith("/launch")) {
    const meteora = launchMode === "meteora";
    return (
      <div className="site-bg min-h-dvh">
        <Nav route={route} go={go} theme={theme} setTheme={setTheme} />
        <main className="site-shell space-y-6 px-4 py-6 sm:px-6 lg:px-8 lg:py-10">
          <NewVersion />
          <section className="page-heading paper-lift bg-paper px-6 py-9 sm:px-10 sm:py-12 lg:px-14">
            <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <h1 className="max-w-4xl font-display text-[2.25rem] leading-[1.02] font-semibold tracking-[-0.03em] text-ink sm:text-[3.5rem]">
                  {meteora ? "Launch into STAMP liquidity." : "Launch on Solana. Register on Zcash."}
                </h1>
                <p className="mt-7 max-w-[64ch] text-[0.98rem] leading-relaxed text-ink-soft">
                  {meteora
                    ? "Create a token on a fixed Meteora bonding curve paired directly to STAMP. The pair, supply, fee, graduation target and liquidity lock are controlled by the pad; launchers provide only the token identity and its burn rule."
                    : `Create a coin on pump.fun and register its collection on Zcash in the same transaction. This legacy route keeps the existing ZEC pair and ${CREATOR_FEE_PERCENT}% creator-fee setup.`}
                </p>
              </div>
              <LaunchModePicker mode={launchMode} onChange={setLaunchMode} />
            </div>
            <div className="mt-10 grid gap-8 xl:grid-cols-[minmax(0,1.35fr)_minmax(22rem,0.65fr)]">
              <div className="rounded-2xl bg-paper-deep/55 p-5 sm:p-7">
                <Boundary what={meteora ? "Meteora launch form" : "launch form"}>
                  {meteora ? <MeteoraLaunchPanel /> : <CreateCoinPanel />}
                </Boundary>
              </div>
              {meteora ? <MeteoraLaunchNotes /> : <PumpLaunchNotes />}
            </div>
          </section>
          <StatsStrip
            loading={loading}
            destroyed={totals.destroyed}
            collections={data?.collections.length ?? 0}
            currentMarketCap={currentMarketCap}
          />

          <Boundary what="launch list">
            <LatestCoins
              collections={data?.collections ?? []}
              loading={loading}
              error={error}
              rates={rates}
              onMore={() => go("/leaderboard")}
            />
          </Boundary>
          <Boundary what="register">
            <Registry collections={collections} activity={data?.collections ?? []} updated={updated} />
          </Boundary>
          <Footer />
        </main>
      </div>
    );
  }

  return (
    <div className="site-bg min-h-dvh">
      <Nav route={route} go={go} theme={theme} setTheme={setTheme} />
      <main className="site-shell space-y-6 px-4 py-6 sm:px-6 lg:px-8 lg:py-10">
        <NewVersion />
        <Hero go={go} loading={loading} destroyed={totals.destroyed} certificates={totals.certificates} />
        <StatsStrip
          loading={loading}
          destroyed={totals.destroyed}
          collections={data?.collections.length ?? 0}
          currentMarketCap={currentMarketCap}
        />

        <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,0.9fr)_minmax(34rem,1.1fr)]">
        <Certificate
          serial={String(totals.certificates).padStart(6, "0")}
          amount={loading ? "—" : formatTokens(totals.destroyed)}
          unit={
            loading
              ? "Counting what the register holds…"
              : totals.certificates === 0
                ? "No tokens destroyed here yet. The first burn is recorded the moment it finalises."
                : `tokens destroyed across ${totals.coins} ${totals.coins === 1 ? "coin" : "coins"}, each one certified on Zcash`
          }
          cancelled
          counterfoil={<Counterfoil certificates={loading ? null : totals.certificates} />}
        >
          <div className="max-w-[62ch]">
            <p className="font-display text-[1.45rem] leading-snug text-ink sm:text-[1.75rem]">
              Burn {CONFIG.ticker} on Solana. Keep a certificate on Zcash stamped with exactly what you
              destroyed.
            </p>
            <p className="mt-3 text-[0.95rem] text-ink-soft">
              One way. No escrow, no custody, nobody holding your funds. The tokens stop existing; the
              certificate is the only thing left.
            </p>
            <p className="tnum mt-5 max-w-[46ch] font-data text-[0.72rem] leading-relaxed break-all text-ink-soft">
              Real, on Zcash mainnet. Inscription {PROOF.mainnetReveal}
            </p>
            <a
              href="#burn"
              className="mt-6 inline-block bg-stamp px-8 py-3.5 font-display text-lg tracking-[0.06em] text-paper uppercase no-underline transition-opacity hover:opacity-90"
            >
              Burn yours
            </a>
          </div>
        </Certificate>

        <section id="burn" className="paper-lift scroll-mt-28 bg-paper px-6 py-9 sm:px-10 sm:py-12">
          <div className="grid gap-10 2xl:grid-cols-[1.15fr_0.85fr]">
            <div>
              <h2 className="font-display text-[1.7rem] leading-none text-engrave">Issue a certificate</h2>
              <div className="mt-5 text-engrave">
                <GuillocheBand className="h-5 w-full" />
              </div>
              <div className="mt-8">
                <Boundary what="burn form"><BurnPanel /></Boundary>
              </div>
            </div>
            <aside className="space-y-6 border-t border-engrave/20 pt-8 lg:border-t-0 lg:border-l lg:pt-0 lg:pl-10">
              <h3 className="font-display text-xl text-engrave">Before you sign</h3>
              <Warning title="Burning is permanent">
                There is no undo, no reversal and no refund. If you burn the wrong amount, it is gone.
              </Warning>
              <Warning title="Never use an exchange address">
                An exchange ZEC deposit address is a valid t1 address. The certificate would be delivered
                to it and lost for good. Use a wallet you hold the keys to.
              </Warning>
              <Warning title="There is no market yet">
                No exchange, no pool, no floor price. A certificate is worth what someone will pay for it,
                and today that means selling privately.
              </Warning>
            </aside>
          </div>
        </section>
        </div>

        <Boundary what="launch list">
          <LatestCoins
            collections={data?.collections ?? []}
            loading={loading}
            error={error}
            rates={rates}
            onMore={() => go("/leaderboard")}
          />
        </Boundary>

        <Boundary what="burn feed">
          <Burns
            burns={data?.burns ?? []}
            collections={data?.collections ?? []}
            loading={loading}
            error={error}
            stale={stale}
            limit={8}
            onMore={() => go("/leaderboard")}
          />
        </Boundary>

        <Proof />
        <Footer />
      </main>
    </div>
  );
}

function Hero({ go, loading, destroyed, certificates }: {
  go: (path: string) => void;
  loading: boolean;
  destroyed: bigint;
  certificates: number;
}) {
  const [copied, setCopied] = useState(false);
  const copyContract = async () => {
    if (!CONFIG.solanaMint) return;
    await navigator.clipboard.writeText(CONFIG.solanaMint);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  };

  return (
    <section className="hero-surface relative isolate overflow-hidden rounded-2xl">
      <div className="hero-art absolute inset-0" aria-hidden />
      <div className="hero-shade absolute inset-0" aria-hidden />
      <div className="relative grid min-h-[36rem] items-end px-6 py-8 sm:px-10 sm:py-12 lg:min-h-[42rem] lg:grid-cols-[minmax(0,0.9fr)_minmax(24rem,1.1fr)] lg:px-14 lg:py-14">
        <div className="max-w-3xl">
          <h1 className="text-balance font-display text-[clamp(3rem,7.5vw,6rem)] leading-[0.9] font-semibold tracking-[-0.04em] text-white">
            Burn the token.<br />Keep the proof.
          </h1>
          <p className="mt-6 max-w-[62ch] text-base leading-relaxed text-[#eadbc6] sm:text-lg">
            Destroy {CONFIG.ticker} on Solana and receive a permanent Zcash stamp cut with the exact
            amount you burned. One-way, verifiable, and held by nobody but you.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <a href="#burn" className="ui-button ui-button-primary no-underline">Burn {CONFIG.ticker}</a>
            <button type="button" onClick={() => go("/launch")} className="ui-button ui-button-secondary">
              Launch a coin
            </button>
            <a href={FOMO_URL} target="_blank" rel="noreferrer" className="ui-button ui-button-ghost no-underline">
              Trade on Fomo <FomoMark className="fomo-eyes" />
            </a>
          </div>
          <div className="mt-8 flex max-w-2xl flex-col items-start gap-3 border-t border-white/15 pt-5">
            <p className="font-data text-xs text-[#c9b79f]">
              {loading ? "Reading both chains…" : `${tokens(destroyed)} burned · ${certificates.toLocaleString("en-US")} stamps`}
            </p>
            <button type="button" onClick={copyContract} className="contract-chip" aria-label="Copy contract address">
              <span>CA</span>
              <span className="truncate">{CONFIG.solanaMint}</span>
              <span>{copied ? "Copied" : "Copy"}</span>
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}

function StatsStrip({ loading, destroyed, collections, currentMarketCap }: {
  loading: boolean;
  destroyed: bigint;
  collections: number;
  currentMarketCap: string;
}) {
  const stats = [
    ["Current market cap", loading ? "—" : currentMarketCap],
    ["Burn volume", loading ? "—" : tokens(destroyed)],
    ["Tokens launched", loading ? "—" : collections.toLocaleString("en-US")],
  ];
  return (
    <section className="stats-strip paper-lift bg-paper" aria-label="Live network statistics">
      {stats.map(([label, value]) => (
        <div key={label} className="min-w-0 px-5 py-5 sm:px-6">
          <p className="font-body text-[0.68rem] font-semibold tracking-[0.12em] text-ink-soft uppercase">{label}</p>
          <p className="tnum mt-1 break-words font-display text-[1.35rem] leading-tight font-semibold tracking-[-0.025em] text-ink sm:text-[1.55rem]">
            {value}
          </p>
        </div>
      ))}
    </section>
  );
}

function Nav({ route, go, theme, setTheme }: {
  route: string;
  go: (p: string) => void;
  theme: "dark" | "light";
  setTheme: (theme: "dark" | "light") => void;
}) {
  const here = route.startsWith("/launch")
    ? "/launch"
    : route.startsWith("/leaderboard") || route.startsWith("/burns")
      ? "/leaderboard"
      : "/";
  return (
    <nav className="site-nav sticky top-0 z-50">
      <div className="site-shell flex min-h-16 items-center gap-5 px-4 sm:px-6 lg:px-8">
        <button type="button" onClick={() => go("/")} className="brand-mark shrink-0" aria-label="Zcash Shielded Assets home">
          <img src="/stamp-mark-transparent.png" alt="" width="1254" height="1254" className="brand-stamp" />
          <span className="font-display text-sm font-semibold tracking-[-0.02em] text-ink sm:text-base">STAMP</span>
        </button>
        <div className="nav-scroll flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
          {[["/", "Burn"], ["/launch", "Launchpad"], ["/leaderboard", "Leaderboard"]].map(([path, label]) => (
            <button
              key={path}
              type="button"
              onClick={() => go(path)}
              aria-current={here === path ? "page" : undefined}
              className={`nav-link ${here === path ? "nav-link-active" : ""}`}
            >
              {label}
              {path === "/launch" && <span className="nav-new-badge">New</span>}
            </button>
          ))}
        </div>
        <div className="hidden items-center gap-2 md:flex">
          <a href={DEX_URL} target="_blank" rel="noreferrer" className="nav-market-link no-underline">
            <img src="/dex-mark.png" alt="" aria-hidden className="dex-mark" />
            <span>DEX</span>
          </a>
          <a href={FOMO_URL} target="_blank" rel="noreferrer" className="nav-market-link no-underline">
            <FomoMark className="fomo-eyes fomo-eyes-nav" />
            <span>Fomo</span>
          </a>
          <a href={X_URL} target="_blank" rel="noreferrer" className="nav-market-link no-underline">
            <XMark />
            <span>X</span>
          </a>
        </div>
        <button
          type="button"
          onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
          className="theme-toggle shrink-0"
          aria-label={`Use ${theme === "dark" ? "light" : "dark"} theme`}
        >
          <ThemeIcon theme={theme} />
        </button>
      </div>
    </nav>
  );
}

function LaunchModePicker({ mode, onChange }: { mode: LaunchMode; onChange: (mode: LaunchMode) => void }) {
  return (
    <div className="launch-mode-switch" aria-label="Launch market">
      <button
        type="button"
        aria-pressed={mode === "meteora"}
        onClick={() => onChange("meteora")}
        className={`launch-mode-option ${mode === "meteora" ? "launch-mode-option-active" : ""}`}
      >
        <MeteoraMark className="meteora-mark" />
        <span>
          <strong>STAMP Pair</strong>
          <small>Meteora DBC</small>
        </span>
        <span className="nav-new-badge">New</span>
      </button>
      <button
        type="button"
        aria-pressed={mode === "pump"}
        onClick={() => onChange("pump")}
        className={`launch-mode-option ${mode === "pump" ? "launch-mode-option-active" : ""}`}
      >
        <PumpMark />
        <span>
          <strong>Pump</strong>
          <small>ZEC Pair</small>
        </span>
      </button>
    </div>
  );
}

function MeteoraLaunchNotes() {
  return (
    <aside className="space-y-6 rounded-2xl bg-paper-deep/55 p-5 sm:p-7">
      <div className="flex items-center gap-2.5">
        <MeteoraMark className="meteora-mark" />
        <h2 className="font-display text-xl font-semibold text-engrave">The STAMP market</h2>
      </div>
      <Warning title="STAMP is the quote">
        Every buy adds STAMP to the curve and every sell returns STAMP. Launchers cannot replace the pair,
        alter the curve, change the supply, or enable a variable tax.
      </Warning>
      <Warning title="1.5% total — never stacked">
        Traders pay 1.5% total. Meteora receives 0.3% and the remaining 1.2% accrues to the launchpad partner.
        Fees are collected in STAMP and claimed to the configured receiving wallet.
      </Warning>
      <Warning title="Pump-shaped, owned by this pad">
        The curve carries a 1B supply, sells 793.1M before graduation, targets 2.48M STAMP, and moves 206.9M
        tokens into DAMM v2. Those parameters are fixed for every launch.
      </Warning>
      <Warning title="Liquidity stays locked">
        On graduation, 100% of migrated liquidity is permanently locked. There is no launcher-controlled LP
        withdrawal and no editable migration fee.
      </Warning>
      <Warning title="Verified from mainnet">
        Before the launch button enables, the browser confirms that the public DBC config still matches this pair,
        fee receiver, supply, graduation target, and liquidity lock. Its private key is never loaded by this page.
      </Warning>
    </aside>
  );
}

function PumpLaunchNotes() {
  return (
    <aside className="space-y-6 rounded-2xl bg-paper-deep/55 p-5 sm:p-7">
      <h2 className="font-display text-xl font-semibold text-engrave">How the legacy route works</h2>
      <Warning title="One signature does everything">
        It creates the coin on pump.fun, routes its creator fee, pays the {LAUNCH_FEE_SOL} SOL launch fee and
        registers its collection. You cannot end up with a coin and no collection, or a paid fee and no coin.
      </Warning>
      <Warning title="Paired to ZEC, and the pad takes the creator fee">
        Your coin trades against ZEC, not SOL. It carries a {CREATOR_FEE_PERCENT}% creator fee which goes to
        the pad. You launch from your own wallet, pay for it, and own every token you buy.
      </Warning>
      <Warning title="Your stamps are already paid for">
        Each stamp costs about {STAMP_COST_ZEC} ZEC to inscribe, and your {LAUNCH_FEE_SOL} SOL covers the first
        {` ${ALLOWANCE_STAMPS.toLocaleString("en-US")} stamps`}. Past that, top up the collection from the register.
      </Warning>
      <Warning title="Nobody holds your holders' tokens">
        Burning destroys them on Solana. There is no escrow, vault, or custody—for you or for us.
      </Warning>
    </aside>
  );
}

function MeteoraMark({ className }: { className?: string }) {
  return <img src="/meteora-mark.png" alt="" aria-hidden className={className} />;
}

function PumpMark() {
  return <img src="/pump-pill.png" alt="" aria-hidden className="pump-pill-mark" />;
}

function FomoMark({ className }: { className?: string }) {
  return <img src="/fomo-eyes.png" alt="" aria-hidden className={className} />;
}

function XMark() {
  return (
    <svg viewBox="0 0 18 18" aria-hidden className="nav-market-icon" fill="currentColor">
      <path d="M3.2 2.5h3.3l3.1 4.15 3.62-4.15h1.55L10.32 7.6l4.48 5.9h-3.3L8.12 9.04 4.22 13.5H2.68l4.72-5.4L3.2 2.5Zm2.45 1.12 6.4 8.76h1.1L6.75 3.62h-1.1Z" />
    </svg>
  );
}

function ExternalIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden className="size-3.5" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M6 3h7v7M13 3 5.5 10.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M11 8.5V13H3V5h4.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ThemeIcon({ theme }: { theme: "dark" | "light" }) {
  return theme === "dark" ? (
    <svg viewBox="0 0 20 20" aria-hidden className="size-4" fill="none" stroke="currentColor" strokeWidth="1.5">
      <circle cx="10" cy="10" r="3.25" />
      <path d="M10 1.5v2M10 16.5v2M1.5 10h2M16.5 10h2M4 4l1.4 1.4M14.6 14.6 16 16M16 4l-1.4 1.4M5.4 14.6 4 16" strokeLinecap="round" />
    </svg>
  ) : (
    <svg viewBox="0 0 20 20" aria-hidden className="size-4" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M16.7 12.3A7 7 0 0 1 7.7 3.3 7 7 0 1 0 16.7 12.3Z" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function Footer() {
  return (
    <footer className="footer-shell mt-10 rounded-2xl bg-paper px-6 py-9 sm:px-10 sm:py-12">
      <div className="grid gap-10 lg:grid-cols-[1.4fr_0.6fr_0.6fr]">
        <div className="min-w-0">
          <div className="flex items-center gap-3">
            <img src="/stamp-mark-transparent.png" alt="" width="1254" height="1254" className="footer-stamp" />
            <p className="font-display text-xl font-semibold tracking-[-0.025em] text-ink">Zcash Shielded Assets</p>
          </div>
          <p className="mt-4 max-w-[66ch] text-sm leading-relaxed text-ink-soft">
            ${CONFIG.ticker} takes its name from the protocol feature specified in ZIP 227. It is an
            independent project: not affiliated with, endorsed by, or issued by the Zcash Foundation or
            Electric Coin Co., and not the shielded asset the specification describes.
          </p>
          <p className="tnum mt-5 max-w-[66ch] truncate font-data text-xs text-ink-soft">CA · {CONFIG.solanaMint}</p>
        </div>
        <div>
          <p className="footer-heading">Market</p>
          <div className="mt-4 flex flex-col items-start gap-3">
            <a href={FOMO_URL} target="_blank" rel="noreferrer" className="footer-link">Fomo <ExternalIcon /></a>
            <a href={DEX_URL} target="_blank" rel="noreferrer" className="footer-link">DexScreener <ExternalIcon /></a>
            <a href={PUMP_URL} target="_blank" rel="noreferrer" className="footer-link">pump.fun <ExternalIcon /></a>
          </div>
        </div>
        <div>
          <p className="footer-heading">Project</p>
          <div className="mt-4 flex flex-col items-start gap-3">
            <a href={X_URL} target="_blank" rel="noreferrer" className="footer-link">X / @Zip227 <ExternalIcon /></a>
            <a href={SOURCE_URL} target="_blank" rel="noreferrer" className="footer-link">Source <ExternalIcon /></a>
          </div>
        </div>
      </div>
      <div className="mt-10 flex flex-wrap items-center justify-between gap-3 border-t border-engrave/15 pt-5 font-data text-[0.68rem] text-ink-soft">
        <span>One-way burn · No escrow · Public on-chain proof</span>
        <span>Mainnet</span>
      </div>
    </footer>
  );
}

function Counterfoil({ certificates }: { certificates: number | null }) {
  return (
    <div className="flex h-full flex-col justify-between gap-8">
      <div>
        <p className="font-body text-[0.62rem] font-semibold tracking-[0.2em] text-ink-soft uppercase">
          Counterfoil
        </p>
        <dl className="mt-4 space-y-3.5">
          <Row label="Certificates" value={certificates === null ? "—" : String(certificates)} />
          <Row label="Issued on" value="Mainnet" />
          <Row label="Destroyed on" value="Solana" />
          <Row label="Reissuable" value="No" />
          <Row label="Held by us" value="Nothing" />
        </dl>
      </div>
      <div className="counterfoil-stamp" aria-hidden="true">
        <img src="/stamp-mark-transparent.png" alt="" width="1254" height="1254" />
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="font-body text-[0.62rem] tracking-[0.14em] text-ink-soft uppercase">{label}</dt>
      <dd className="font-data text-[0.82rem] text-ink">{value}</dd>
    </div>
  );
}

function Warning({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h4 className="font-body text-[0.95rem] font-semibold text-ink">{title}</h4>
      <p className="mt-1 text-[0.9rem] leading-relaxed text-ink-soft">{children}</p>
    </div>
  );
}

function Proof() {
  return (
    <section className="paper-lift bg-paper px-6 py-9 sm:px-10 sm:py-12">
      <h2 className="font-display text-[1.7rem] leading-none text-engrave">Check it yourself</h2>
      <p className="mt-4 max-w-[64ch] text-[0.95rem] text-ink-soft">
        A certificate counts only if it names a real burn that has not already been claimed, and is
        delivered to the address that burner chose. Anyone can rebuild the whole set from public data on
        both chains and get the same answer we do.
      </p>

      <div className="mt-8 grid gap-8 lg:grid-cols-2">
        <Record
          heading="A certificate on Zcash mainnet"
          body={`${formatTokens(1_500_000n)} destroyed on Solana, recorded on Zcash, delivered to the address that burned it.`}
          rows={[
            ["Inscription", PROOF.mainnetReveal],
            ["Burn", PROOF.mainnetBurn],
          ]}
        />
        <Record
          heading="A forgery the chain accepted"
          stamp="REFUSED"
          body="Signed with our own key, claiming ten times the amount, citing a burn that never happened. Zcash accepted it. The rule does not: it names no real burn, so it is not a certificate and never counts."
          rows={[["Inscription", PROOF.forgedReveal]]}
        />
      </div>
    </section>
  );
}

function Record({
  heading,
  body,
  rows,
  stamp,
}: {
  heading: string;
  body: string;
  rows: [string, string][];
  stamp?: string;
}) {
  return (
    <div className="relative">
      <div className="flex items-baseline justify-between gap-4">
        <h3 className="font-display text-xl text-ink">{heading}</h3>
        {stamp && (
          <span className="stamped shrink-0 px-2.5 py-1 font-display text-[0.7rem] leading-none font-semibold">
            {stamp}
          </span>
        )}
      </div>
      <p className="mt-2 max-w-[54ch] text-[0.9rem] leading-relaxed text-ink-soft">{body}</p>
      <dl className="mt-5 space-y-3">
        {rows.map(([label, value]) => (
          <div key={label}>
            <dt className="font-body text-[0.62rem] tracking-[0.16em] text-ink-soft uppercase">{label}</dt>
            <dd className="tnum field-rule pb-1 font-data text-[0.78rem] break-all text-ink">{value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
