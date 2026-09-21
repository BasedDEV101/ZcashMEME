import { useEffect, useMemo, useState } from "react";
import { ConnectionProvider, WalletProvider } from "@solana/wallet-adapter-react";
import { Certificate } from "./components/Certificate.tsx";
import { BurnPanel } from "./components/BurnPanel.tsx";
import { Guilloche, GuillocheBand } from "./components/Guilloche.tsx";
import { CONFIG, PROOF, SOURCE_URL, X_URL, formatTokens } from "./lib/config.ts";
import { CreateCoinPanel } from "./components/CreateCoinPanel.tsx";
import { Registry } from "./components/Registry.tsx";
import { ALLOWANCE_STAMPS, CREATOR_FEE_PERCENT, LAUNCH_FEE_SOL, STAMP_COST_ZEC, type Collection } from "./lib/launchpad.ts";
import { Leaderboard } from "./components/Leaderboard.tsx";
import { Burns } from "./components/Burns.tsx";
import { LatestCoins } from "./components/LatestCoins.tsx";
import { NewVersion } from "./components/NewVersion.tsx";
import { useActivity } from "./lib/activity.ts";

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
  // The register lives on Zcash; the browser cannot speak lightwalletd's gRPC,
  // so the site reads a snapshot the operator exports from chain.
  const [collections, setCollections] = useState<Collection[]>([]);
  const [updated, setUpdated] = useState<string | null>(null);
  const [route, setRoute] = useState(() => (typeof location !== "undefined" ? location.pathname : "/"));
  // One read of both chains, shared by the leaderboard, the burn feed and the
  // home page: three components asking separately would triple the RPC cost
  // for the same answer.
  const activity = useActivity();
  const loading = activity.status === "loading";
  const error = activity.status === "error" ? activity.message : null;
  const data = activity.status === "ready" ? activity.data : null;
  const stale = data?.stale ?? false;

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

  if (route.startsWith("/leaderboard") || route.startsWith("/burns")) {
    return (
      <div className="min-h-dvh bg-paper-deep px-4 py-6 sm:px-6 sm:py-10">
        <main className="mx-auto w-full max-w-5xl space-y-6">
          <Nav route={route} go={go} />
          <NewVersion />
          <section className="paper-lift bg-paper px-6 py-9 sm:px-10 sm:py-12">
            <h1 className="font-display text-[1.9rem] leading-none text-engrave sm:text-[2.4rem]">
              What the pad has done
            </h1>
            <div className="mt-5 text-engrave">
              <GuillocheBand className="h-5 w-full" />
            </div>
            <p className="mt-7 max-w-[64ch] text-[0.98rem] leading-relaxed text-ink-soft">
              Every coin launched here since the register opened, and every burn against one. Both are
              read from Solana, not from a list we keep — so this page can be wrong about presentation,
              never about what happened. A coin created somewhere else and attached afterwards is not
              listed; everything here was made on the pad.
            </p>
          </section>
          <LatestCoins collections={data?.collections ?? []} loading={loading} error={error} limit={8} />
          <Leaderboard collections={data?.collections ?? []} loading={loading} error={error} stale={stale} />
          <Burns burns={data?.burns ?? []} loading={loading} error={error} stale={stale} />
          <Footer />
        </main>
      </div>
    );
  }

  if (route.startsWith("/launch")) {
    return (
      <div className="min-h-dvh bg-paper-deep px-4 py-6 sm:px-6 sm:py-10">
        <main className="mx-auto w-full max-w-5xl space-y-6">
          <Nav route={route} go={go} />
          <NewVersion />
          <section className="paper-lift bg-paper px-6 py-9 sm:px-10 sm:py-12">
            <h1 className="font-display text-[1.9rem] leading-none text-engrave sm:text-[2.4rem]">
              Launch a coin
            </h1>
            <div className="mt-5 text-engrave">
              <GuillocheBand className="h-5 w-full" />
            </div>
            <p className="mt-7 max-w-[64ch] text-[0.98rem] leading-relaxed text-ink-soft">
              Create a coin on pump.fun and its collection is registered on Zcash in the same breath. Its
              holders can then burn and receive a certificate cut with the exact amount they destroyed —
              the same mechanism {CONFIG.ticker} uses, with no special treatment for ours.
            </p>
            <div className="mt-8 grid gap-10 lg:grid-cols-[1.15fr_1fr]">
              <CreateCoinPanel />
              <aside className="space-y-6 border-t border-engrave/20 pt-8 lg:border-t-0 lg:border-l lg:pt-0 lg:pl-10">
                <h3 className="font-display text-xl text-engrave">How it works</h3>
                <Warning title="One signature does everything">
                  It creates the coin on pump.fun, routes its creator fee, pays the {LAUNCH_FEE_SOL} SOL
                  launch fee and registers its collection. You cannot end up with a coin and no
                  collection, or a paid fee and no coin.
                </Warning>
                <Warning title="The coin is yours; the creator fee is the pad's">
                  You create it from your own wallet and you are its creator on pump.fun. Its creator
                  fee — pump's standard {CREATOR_FEE_PERCENT}% of each trade — goes to the pad, which is
                  what pays to inscribe your holders' stamps. You still own every token you buy, and
                  nothing about the coin is held by us. If you want that fee yourself, launch on
                  pump.fun directly instead.
                </Warning>
                <Warning title="Mayhem mode is off">
                  It would double the supply and let pump's agent burn tokens on its own — burns nobody
                  authorised, which would issue stamps and wreck your collection's accounting.
                </Warning>
                <Warning title="Your stamps are already paid for">
                  Each stamp costs about {STAMP_COST_ZEC} ZEC to inscribe, and your {LAUNCH_FEE_SOL} SOL
                  covers the first {ALLOWANCE_STAMPS.toLocaleString("en-US")}. Your collection is topped
                  up automatically — there is no ZEC for you to buy and nothing to fund before your
                  holders start burning. Past that you can top it up yourself, at the address in the
                  register. Nobody else's coin can spend your balance, and yours cannot drain anyone
                  else's.
                </Warning>
                <Warning title="Nobody holds your holders' tokens">
                  Burning destroys them on Solana. There is no escrow, no vault and no custody — for you
                  or for us.
                </Warning>
                <Warning title="It is not private yet">
                  Zcash cannot hold shielded assets today. Stamps are public inscriptions, and convert
                  when shielded assets activate. Do not promise your holders otherwise.
                </Warning>
              </aside>
            </div>
          </section>

          <LatestCoins
            collections={data?.collections ?? []}
            loading={loading}
            error={error}
            onMore={() => go("/leaderboard")}
          />
          <Registry collections={collections} updated={updated} />
          <Footer />
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-paper-deep px-4 py-6 sm:px-6 sm:py-10">
      <main className="mx-auto w-full max-w-5xl space-y-6">
        <Nav route={route} go={go} />
        <NewVersion />
        <Certificate
          serial="000001"
          amount={formatTokens(BigInt(PROOF.mainnetAmount))}
          ticker={CONFIG.ticker}
          cancelled
          recipient={PROOF.mainnetRecipient}
          counterfoil={<Counterfoil />}
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

        <section id="burn" className="paper-lift scroll-mt-6 bg-paper px-6 py-9 sm:px-10 sm:py-12">
          <div className="grid gap-10 lg:grid-cols-[1.15fr_1fr]">
            <div>
              <h2 className="font-display text-[1.7rem] leading-none text-engrave">Issue a certificate</h2>
              <div className="mt-5 text-engrave">
                <GuillocheBand className="h-5 w-full" />
              </div>
              <div className="mt-8">
                <BurnPanel />
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
              <Warning title="Holdings on Zcash are public today">
                Zcash cannot hold private assets yet. When it can, each certificate converts to that many
                shielded tokens. Until then, anyone can see who holds what.
              </Warning>
              <Warning title="There is no market yet">
                No exchange, no pool, no floor price. A certificate is worth what someone will pay for it,
                and today that means selling privately.
              </Warning>
            </aside>
          </div>
        </section>

        <LatestCoins
          collections={data?.collections ?? []}
          loading={loading}
          error={error}
          onMore={() => go("/leaderboard")}
        />

        <Burns
          burns={data?.burns ?? []}
          loading={loading}
          error={error}
          stale={stale}
          limit={8}
          onMore={() => go("/leaderboard")}
        />

        <WhyAStamp />

        <Proof />
        <Footer />
      </main>
    </div>
  );
}

function Nav({ route, go }: { route: string; go: (p: string) => void }) {
  const here = route.startsWith("/launch")
    ? "/launch"
    : route.startsWith("/leaderboard") || route.startsWith("/burns")
      ? "/leaderboard"
      : "/";
  return (
    <nav className="flex flex-wrap items-baseline gap-x-6 gap-y-2 px-2">
      {[["/", "Burn"], ["/launch", "Launch a coin"], ["/leaderboard", "Leaderboard"]].map(([path, label]) => (
        <button
          key={path}
          type="button"
          onClick={() => go(path)}
          className={`font-body text-[0.68rem] font-semibold tracking-[0.18em] uppercase transition-colors ${
            here === path ? "text-engrave underline underline-offset-[6px]" : "text-ink-soft hover:text-engrave"
          }`}
        >
          {label}
        </button>
      ))}
      <a
        href={X_URL}
        target="_blank"
        rel="noreferrer"
        className="font-body text-[0.68rem] font-semibold tracking-[0.18em] text-ink-soft uppercase no-underline transition-colors hover:text-engrave"
      >
        Follow
      </a>
    </nav>
  );
}

function Footer() {
  return (
    <footer className="flex flex-wrap items-baseline justify-between gap-x-8 gap-y-4 px-2 py-8 text-sm text-ink-soft">
      <p className="max-w-[72ch]">
        ${CONFIG.ticker} takes its name from Zcash Shielded Assets, the protocol feature specified in ZIP
        227. It is an independent project: not affiliated with, endorsed by, or issued by the Zcash
        Foundation or Electric Coin Co., and not the shielded asset the specification describes.
      </p>
      <div className="flex flex-wrap items-baseline gap-x-6 gap-y-2">
        <a
          href={X_URL}
          target="_blank"
          rel="noreferrer"
          className="font-body text-[0.68rem] font-semibold tracking-[0.18em] text-engrave uppercase no-underline hover:underline hover:underline-offset-[6px]"
        >
          @Zip227
        </a>
        <a
          href={SOURCE_URL}
          target="_blank"
          rel="noreferrer"
          className="font-body text-[0.68rem] font-semibold tracking-[0.18em] text-engrave uppercase no-underline hover:underline hover:underline-offset-[6px]"
        >
          Source on GitHub
        </a>
      </div>
    </footer>
  );
}

function Counterfoil() {
  return (
    <div className="flex h-full flex-col justify-between gap-8">
      <div>
        <p className="font-body text-[0.62rem] font-semibold tracking-[0.2em] text-ink-soft uppercase">
          Counterfoil
        </p>
        <dl className="mt-4 space-y-3.5">
          <Row label="Issued on" value="Zcash mainnet" />
          <Row label="Destroyed on" value="Solana" />
          <Row label="Reissuable" value="No" />
          <Row label="Held by us" value="Nothing" />
        </dl>
      </div>
      <Guilloche size={140} opacity={0.42} className="self-center text-engrave" />
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

function WhyAStamp() {
  return (
    <section className="paper-lift bg-paper px-6 py-9 sm:px-10 sm:py-12">
      <h2 className="font-display text-[1.7rem] leading-none text-engrave">Why a stamp, and not a token</h2>
      <div className="mt-5 text-engrave">
        <GuillocheBand className="h-5 w-full" />
      </div>

      <div className="mt-8 grid gap-x-12 gap-y-8 lg:grid-cols-2">
        <Clause title="Zcash cannot hold assets yet">
          Shielded assets are specified — ZIP 226 and ZIP 227 — but they are drafts. They are not on
          mainnet, and the next network upgrade does not include the transaction format they need.
        </Clause>
        <Clause title="Zcash can hold inscriptions today">
          An inscription needs no new consensus rules. It is an ordinary transparent transaction carrying
          data, which Zcash has accepted since the beginning. Around 113,000 already exist on mainnet.
        </Clause>
        <Clause title="So the stamp is the asset, in the only form Zcash accepts today">
          Not a placeholder image. A record of one specific destruction, written to the chain the asset
          will eventually live on.
        </Clause>
        <Clause title="Uniqueness is doing real work">
          Each stamp maps to exactly one burn and can be claimed once. A balance cannot say that this
          destruction happened, on this date, for this amount, to this person. Only a unique record can.
        </Clause>
      </div>

      <p className="mt-10 max-w-[64ch] border-t border-engrave/25 pt-6 font-display text-[1.2rem] leading-snug text-ink sm:text-[1.4rem]">
        When shielded assets activate, each stamp converts to the amount cut into it. The stamp is the
        claim that survives until then.
      </p>
    </section>
  );
}

function Clause({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="font-display text-[1.15rem] leading-snug text-ink">{title}</h3>
      <p className="mt-2 max-w-[58ch] text-[0.92rem] leading-relaxed text-ink-soft">{children}</p>
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
