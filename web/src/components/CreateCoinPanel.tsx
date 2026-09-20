import { useEffect, useRef, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { Connection } from "@solana/web3.js";
import { buildLaunch, uploadMetadata, type CoinDetails } from "../lib/createCoin.ts";
import { LAUNCH_FEE_SOL, STAMP_COST_ZEC } from "../lib/launchpad.ts";
import { CONFIG } from "../lib/config.ts";

type Stage = "idle" | "uploading" | "signing" | "sending" | "done";

export function CreateCoinPanel() {
  const { publicKey, connected, connecting, connect, disconnect, select, wallet, wallets, sendTransaction } = useWallet();
  const [d, setD] = useState<CoinDetails>({
    name: "", symbol: "", description: "", website: "", twitter: "", minWholeTokens: 1_000_000n,
  });
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [stage, setStage] = useState<Stage>("idle");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ mint: string; signature: string } | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (wallet && !connected && !connecting) connect().catch((e: unknown) => setError((e as Error).message));
  }, [wallet, connected, connecting, connect]);

  useEffect(() => {
    if (!file) { setPreview(null); return; }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const set = <K extends keyof CoinDetails>(k: K, v: CoinDetails[K]) => setD((p) => ({ ...p, [k]: v }));
  const nameOk = d.name.trim().length > 0 && d.name.length <= 32;
  const symbolOk = /^[A-Z0-9]{1,10}$/.test(d.symbol);
  const ready = connected && nameOk && symbolOk && Boolean(file) && stage === "idle";

  async function launch() {
    setError(null);
    if (!publicKey || !file) return;
    try {
      setStage("uploading");
      const { uri } = await uploadMetadata(file, d);

      setStage("signing");
      const { transaction, mint } = await buildLaunch(publicKey, uri, d);

      setStage("sending");
      const conn = new Connection(CONFIG.rpc, "confirmed");
      // The mint is a fresh keypair and must sign its own creation.
      const signature = await sendTransaction(transaction, conn, { signers: [mint] });
      setResult({ mint: mint.publicKey.toBase58(), signature });
      setStage("done");
    } catch (e) {
      const err = e as Error;
      setError(err.message || err.name || "The wallet rejected the transaction.");
      setStage("idle");
    }
  }

  if (stage === "done" && result) {
    return (
      <div className="space-y-5">
        <h3 className="font-display text-2xl text-engrave">{d.symbol} is live</h3>
        <p className="max-w-[58ch] text-[0.95rem] leading-relaxed text-ink-soft">
          Your coin exists on pump.fun and its collection is registered. Holders can burn it for stamps as
          soon as the registration confirms on Zcash, a few minutes from now.
        </p>
        <dl className="space-y-3">
          <Row label="Mint" value={result.mint} />
          <Row label="Transaction" value={result.signature} />
        </dl>
        <p className="max-w-[58ch] border-t border-engrave/25 pt-5 text-sm text-ink-soft">
          One thing left to you: your collection pays for its own stamps, about {STAMP_COST_ZEC} ZEC each.
          Fund it from the register below before your holders start burning, or their stamps queue until
          you do.
        </p>
        <a href={`https://pump.fun/coin/${result.mint}`} target="_blank" rel="noreferrer"
          className="inline-block bg-engrave px-6 py-3 font-display text-base tracking-[0.05em] text-paper uppercase no-underline">
          View on pump.fun
        </a>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <Field n={1} label="Your Solana wallet">
        {connecting ? (
          <p className="text-sm text-ink-soft">Connecting…</p>
        ) : connected && publicKey ? (
          <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
            <p className="tnum font-data text-sm break-all text-ink">{publicKey.toBase58()}</p>
            <button
              type="button"
              onClick={() => { disconnect().catch(() => {}); setError(null); }}
              className="font-body text-[0.62rem] font-semibold tracking-[0.16em] text-ink-soft uppercase underline underline-offset-4 transition-colors hover:text-stamp-deep"
            >
              Disconnect
            </button>
          </div>
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

      <Field n={2} label="The coin">
        <div className="grid gap-5 sm:grid-cols-[1fr_1fr]">
          <label className="block">
            <span className="mb-1.5 block font-body text-[0.62rem] tracking-[0.16em] text-ink-soft uppercase">Name</span>
            <input value={d.name} onChange={(e) => set("name", e.target.value.slice(0, 32))}
              placeholder="Zcash Shielded Assets"
              className="field-rule w-full bg-transparent pb-1.5 font-display text-xl text-ink outline-none placeholder:text-ink-soft/40" />
          </label>
          <label className="block">
            <span className="mb-1.5 block font-body text-[0.62rem] tracking-[0.16em] text-ink-soft uppercase">Ticker</span>
            <input value={d.symbol} onChange={(e) => set("symbol", e.target.value.replace(/[^A-Za-z0-9]/g, "").toUpperCase().slice(0, 10))}
              placeholder="STAMP"
              className="field-rule w-full bg-transparent pb-1.5 font-display text-xl tracking-wide text-ink outline-none placeholder:text-ink-soft/40" />
          </label>
        </div>

        <label className="mt-5 block">
          <span className="mb-1.5 block font-body text-[0.62rem] tracking-[0.16em] text-ink-soft uppercase">Description</span>
          <textarea value={d.description} onChange={(e) => set("description", e.target.value.slice(0, 500))}
            rows={2} placeholder="What it is, in a line."
            className="field-rule w-full resize-none bg-transparent pb-1.5 font-body text-sm text-ink outline-none placeholder:text-ink-soft/40" />
        </label>

        <div className="mt-6 flex flex-wrap items-center gap-5">
          <button type="button" onClick={() => fileInput.current?.click()}
            className="border border-engrave/45 px-4 py-2 font-body text-sm text-engrave transition-colors hover:bg-engrave hover:text-paper">
            {file ? "Change image" : "Choose an image"}
          </button>
          <input ref={fileInput} type="file" accept="image/png,image/jpeg,image/gif,image/webp" className="hidden"
            aria-label="Coin image"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) { setFile(f); setError(null); } }} />
          {preview && <img src={preview} alt="" className="size-16 border border-engrave/25 object-cover" />}
          <span className="text-xs text-ink-soft">PNG, JPEG, GIF or WebP, under 2 MB.</span>
        </div>
      </Field>

      <Field n={3} label="Links, if you have them">
        <div className="grid gap-5 sm:grid-cols-2">
          <input value={d.website} onChange={(e) => set("website", e.target.value.trim())} spellCheck={false}
            placeholder="https://yoursite.com" aria-label="Website"
            className="field-rule w-full bg-transparent pb-1.5 font-data text-sm text-ink outline-none placeholder:text-ink-soft/45" />
          <input value={d.twitter} onChange={(e) => set("twitter", e.target.value.trim())} spellCheck={false}
            placeholder="https://x.com/yourhandle" aria-label="X link"
            className="field-rule w-full bg-transparent pb-1.5 font-data text-sm text-ink outline-none placeholder:text-ink-soft/45" />
        </div>
      </Field>

      <Field n={4} label="Minimum burn for a stamp">
        <input value={d.minWholeTokens.toString()}
          onChange={(e) => { const v = e.target.value.replace(/[^0-9]/g, ""); set("minWholeTokens", BigInt(v || "0")); }}
          inputMode="numeric" aria-label="Minimum burn in whole tokens"
          className="field-rule tnum w-full bg-transparent pb-1.5 font-display text-2xl text-ink outline-none sm:w-64" />
        <p className="mt-2 max-w-[52ch] text-xs text-ink-soft">
          Of a 1,000,000,000 supply. Set it so a stamp is worth more than the {STAMP_COST_ZEC} ZEC it
          costs you to issue one.
        </p>
      </Field>

      <div className="border-t border-engrave/25 pt-6">
        <button type="button" disabled={!ready} onClick={launch}
          className="w-full bg-stamp px-6 py-4 font-display text-lg tracking-[0.06em] text-paper uppercase transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:bg-ink-soft/25 disabled:text-ink-soft sm:w-auto sm:px-12">
          {stage === "uploading" ? "Storing the image…"
            : stage === "signing" ? "Building the launch…"
            : stage === "sending" ? "Confirm in your wallet…"
            : `Launch for ${LAUNCH_FEE_SOL} SOL`}
        </button>
        <p className="mt-3 max-w-[60ch] text-sm text-ink-soft">
          One signature creates the coin on pump.fun, pays the launch fee, and registers its collection.
          Creating a coin also costs the usual pump.fun rent, around 0.02 SOL.
        </p>
        {/* Said again here, next to the button, because this is where the
            decision is actually made and it cannot be undone afterwards. */}
        <p className="mt-2 max-w-[60ch] text-sm text-ink-soft">
          The coin is created under this pad's wallet, so pump.fun's creator fees go to the pad and pay
          for your holders' stamps — not to you. This cannot be changed after launch.
        </p>
        {error && <p className="mt-3 max-w-[58ch] text-sm text-stamp-deep">{error}</p>}
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

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="font-body text-[0.62rem] tracking-[0.16em] text-ink-soft uppercase">{label}</dt>
      <dd className="tnum field-rule pb-1 font-data text-[0.78rem] break-all text-ink">{value}</dd>
    </div>
  );
}
