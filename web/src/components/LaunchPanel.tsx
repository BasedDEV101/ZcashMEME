import { useEffect, useMemo, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { Connection, PublicKey, Transaction } from "@solana/web3.js";
import { parseDeployRequest, encodeDeployRequest } from "@protocol/core/deploy-request.ts";
import { buildDeployRequest, LAUNCH_FEE_SOL, STAMP_COST_ZEC, type Collection } from "../lib/launchpad.ts";
import { CONFIG, formatTokens } from "../lib/config.ts";

interface MintFacts { program: string; decimals: number; supply: bigint }

export function LaunchPanel({ collections }: { collections: Collection[] }) {
  const { publicKey, connected, connecting, connect, select, wallet, wallets, sendTransaction } = useWallet();
  const [mint, setMint] = useState("");
  const [symbol, setSymbol] = useState("");
  const [minimum, setMinimum] = useState("1000000");
  const [facts, setFacts] = useState<MintFacts | null>(null);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [signature, setSignature] = useState<string | null>(null);

  useEffect(() => {
    if (wallet && !connected && !connecting) {
      connect().catch((e: unknown) => setError((e as Error).message));
    }
  }, [wallet, connected, connecting, connect]);

  const already = useMemo(
    () => collections.find((c) => c.mint === mint.trim()),
    [collections, mint],
  );

  // Read the mint from chain rather than trusting what was typed.
  useEffect(() => {
    const address = mint.trim();
    setFacts(null);
    if (address.length < 32) return;
    let cancelled = false;
    setChecking(true);
    (async () => {
      try {
        const conn = new Connection(CONFIG.rpc, "confirmed");
        const info = await conn.getParsedAccountInfo(new PublicKey(address));
        const parsed = (info.value?.data as { parsed?: { type?: string; info?: { decimals?: number; supply?: string } } })?.parsed;
        if (cancelled) return;
        if (parsed?.type !== "mint" || typeof parsed.info?.decimals !== "number") {
          setError("That address is not a token mint.");
          return;
        }
        setError(null);
        setFacts({
          program: info.value!.owner.toBase58(),
          decimals: parsed.info.decimals,
          supply: BigInt(parsed.info.supply ?? "0"),
        });
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      } finally {
        if (!cancelled) setChecking(false);
      }
    })();
    return () => { cancelled = true; };
  }, [mint]);

  const symbolOk = /^[A-Za-z0-9]{1,10}$/.test(symbol);
  const minOk = /^[1-9][0-9]*$/.test(minimum);
  const ready = connected && Boolean(facts) && symbolOk && minOk && !already && !busy;

  async function submit() {
    setError(null);
    if (!publicKey) { setError("Connect a wallet first."); return; }
    setBusy(true);
    try {
      const request = { mint: mint.trim(), symbol: symbol.toUpperCase(), minWholeTokens: BigInt(minimum) };
      if (!parseDeployRequest(encodeDeployRequest(request))) throw new Error("Those details cannot be encoded into a request.");
      const conn = new Connection(CONFIG.rpc, "confirmed");
      const tx = new Transaction().add(...buildDeployRequest(publicKey.toBase58(), request.mint, request.symbol, request.minWholeTokens));
      setSignature(await sendTransaction(tx, conn));
    } catch (e) {
      const err = e as Error;
      setError(err.message || err.name || "The wallet rejected the transaction.");
    } finally {
      setBusy(false);
    }
  }

  if (signature) {
    return (
      <div className="space-y-4">
        <h3 className="font-display text-xl text-engrave">Request filed</h3>
        <p className="max-w-[58ch] text-[0.95rem] text-ink-soft">
          Your collection is registered on Zcash within a few minutes. After that, holders of{" "}
          {symbol.toUpperCase()} can burn and receive stamps.
        </p>
        <p className="tnum field-rule pb-1 font-data text-[0.78rem] break-all text-ink">{signature}</p>
        <p className="max-w-[58ch] text-sm text-ink-soft">
          One more step: your collection pays for its own stamps. Fund its balance before your holders
          start burning, or their stamps queue until you do. The address appears in the registry below
          once the deploy confirms.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <Field n={1} label="Your Solana wallet">
        {connecting ? (
          <p className="text-sm text-ink-soft">Connecting…</p>
        ) : connected && publicKey ? (
          <p className="tnum font-data text-sm break-all text-ink">{publicKey.toBase58()}</p>
        ) : wallets.length === 0 ? (
          <p className="text-sm text-ink-soft">No Solana wallet detected. Install Phantom or Solflare, then reload.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {wallets.map((w) => (
              <button key={w.adapter.name} type="button"
                onClick={() => { setError(null); select(w.adapter.name); }}
                className="border border-engrave/45 px-4 py-2 font-body text-sm text-engrave transition-colors hover:bg-engrave hover:text-paper">
                {w.adapter.name}
              </button>
            ))}
          </div>
        )}
      </Field>

      <Field n={2} label="The coin to register">
        <input
          value={mint} onChange={(e) => setMint(e.target.value)} spellCheck={false}
          placeholder="its mint address on Solana" aria-label="Solana mint address"
          className="field-rule tnum w-full bg-transparent pb-1.5 font-data text-sm text-ink outline-none placeholder:text-ink-soft/55"
        />
        {checking && <p className="mt-2 text-sm text-ink-soft">Reading it from chain…</p>}
        {facts && (
          <dl className="mt-4 grid grid-cols-2 gap-x-8 gap-y-3 sm:grid-cols-3">
            <Fact label="Supply" value={formatTokens(facts.supply / 10n ** BigInt(facts.decimals))} />
            <Fact label="Decimals" value={String(facts.decimals)} />
            <Fact label="Token program" value={facts.program.slice(0, 10) + "…"} />
          </dl>
        )}
        {already && (
          <p className="mt-2 text-sm text-stamp-deep">
            {already.sym} is already registered. A mint can only be deployed once.
          </p>
        )}
      </Field>

      <Field n={3} label="Ticker and minimum burn">
        <div className="grid gap-5 sm:grid-cols-2">
          <div>
            <input
              value={symbol} onChange={(e) => setSymbol(e.target.value.replace(/[^A-Za-z0-9]/g, "").slice(0, 10))}
              placeholder="TICKER" aria-label="Collection ticker"
              className="field-rule w-full bg-transparent pb-1.5 font-display text-2xl tracking-wide text-ink uppercase outline-none placeholder:text-ink-soft/40"
            />
            <p className="mt-2 text-xs text-ink-soft">Up to 10 letters or digits.</p>
          </div>
          <div>
            <input
              value={minimum} onChange={(e) => setMinimum(e.target.value.replace(/[^0-9]/g, ""))}
              inputMode="numeric" aria-label="Minimum burn in whole tokens"
              className="field-rule tnum w-full bg-transparent pb-1.5 font-display text-2xl text-ink outline-none"
            />
            <p className="mt-2 text-xs text-ink-soft">
              Smallest burn that earns a stamp. Set it so a stamp is worth more than the{" "}
              {STAMP_COST_ZEC} ZEC it costs you to issue.
            </p>
          </div>
        </div>
      </Field>

      <div className="border-t border-engrave/25 pt-6">
        <button type="button" disabled={!ready} onClick={submit}
          className="w-full bg-stamp px-6 py-4 font-display text-lg tracking-[0.06em] text-paper uppercase transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:bg-ink-soft/25 disabled:text-ink-soft sm:w-auto sm:px-12">
          {busy ? "Confirm in your wallet…" : `Register for ${LAUNCH_FEE_SOL} SOL`}
        </button>
        <p className="mt-3 max-w-[58ch] text-sm text-ink-soft">
          The fee registers your collection permanently on Zcash. Your holders' stamps are paid from your
          collection's own balance, which you fund separately — about {STAMP_COST_ZEC} ZEC per stamp.
        </p>
        {error && <p className="mt-3 text-sm text-stamp-deep">{error}</p>}
      </div>
    </div>
  );
}

function Field({ n, label, children }: { n: number; label: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="mb-3 flex items-baseline gap-3 font-body text-[0.68rem] font-semibold tracking-[0.18em] text-ink-soft uppercase">
        <span className="tnum font-data text-engrave">{n}</span>
        {label}
      </h3>
      {children}
    </section>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="font-body text-[0.62rem] tracking-[0.16em] text-ink-soft uppercase">{label}</dt>
      <dd className="tnum font-data text-[0.82rem] text-ink">{value}</dd>
    </div>
  );
}
