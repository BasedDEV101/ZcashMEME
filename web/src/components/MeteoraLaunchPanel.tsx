import { useCallback, useEffect, useRef, useState } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import {
  METEORA_DBC_CONFIG,
  METEORA_DBC_CONFIG_KEY,
  PARTNER_FEE_RECEIVER,
} from "@protocol/solana/meteora-launchpad.ts";
import { uploadMetadata, type CoinDetails } from "../lib/createCoin.ts";
import {
  buildMeteoraLaunch,
  inspectMeteoraConfig,
  type MeteoraConfigStatus,
} from "../lib/createMeteoraCoin.ts";

type Stage = "idle" | "checking" | "uploading" | "building" | "sending" | "done";

export function MeteoraLaunchPanel() {
  const { connection } = useConnection();
  const { publicKey, connected, connecting, connect, disconnect, select, wallet, wallets, sendTransaction } = useWallet();
  const [details, setDetails] = useState<CoinDetails>({
    name: "",
    symbol: "",
    description: "",
    website: "",
    twitter: "",
    minWholeTokens: 1_000_000n,
  });
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [stage, setStage] = useState<Stage>("checking");
  const [configStatus, setConfigStatus] = useState<MeteoraConfigStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ mint: string; pool: string; signature: string } | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const announcementRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (wallet && !connected && !connecting) connect().catch((reason: unknown) => setError((reason as Error).message));
  }, [wallet, connected, connecting, connect]);

  useEffect(() => {
    if (!file) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  useEffect(() => {
    if (error || result) announcementRef.current?.focus();
  }, [error, result]);

  const checkConfig = useCallback(async () => {
    setStage("checking");
    setError(null);
    try {
      const status = await inspectMeteoraConfig(connection);
      setConfigStatus(status);
    } catch (reason) {
      setConfigStatus({ state: "invalid", message: `Could not check mainnet: ${(reason as Error).message}` });
    } finally {
      setStage("idle");
    }
  }, [connection]);

  useEffect(() => {
    void checkConfig();
  }, [checkConfig]);

  const set = <K extends keyof CoinDetails>(key: K, value: CoinDetails[K]) => {
    setDetails((current) => ({ ...current, [key]: value }));
  };
  const nameOk = details.name.trim().length > 0 && details.name.length <= 32;
  const symbolOk = /^[A-Z0-9]{1,10}$/.test(details.symbol);
  const configReady = configStatus?.state === "ready";
  const ready = connected && configReady && nameOk && symbolOk && Boolean(file) && stage === "idle";

  function chooseFile(next: File | undefined) {
    if (!next) return;
    if (next.size > 2 * 1024 * 1024) {
      setError("Use an image under 2 MB.");
      return;
    }
    setFile(next);
    setError(null);
  }

  async function launch() {
    if (!publicKey || !file || !ready) return;
    setError(null);
    try {
      setStage("checking");
      const currentConfig = await inspectMeteoraConfig(connection);
      setConfigStatus(currentConfig);
      if (currentConfig.state !== "ready") throw new Error(currentConfig.message);

      setStage("uploading");
      const { uri } = await uploadMetadata(file, details);

      setStage("building");
      const { transaction, mint, pool } = await buildMeteoraLaunch(publicKey, uri, details, connection);

      setStage("sending");
      const signature = await sendTransaction(transaction, connection, { maxRetries: 3 });
      setResult({ mint: mint.publicKey.toBase58(), pool: pool.toBase58(), signature });
      setStage("done");
    } catch (reason) {
      const failure = reason as Error;
      setError(failure.message || failure.name || "The wallet rejected the transaction.");
      setStage("idle");
    }
  }

  if (stage === "done" && result) {
    return (
      <div ref={announcementRef} tabIndex={-1} role="status" aria-live="polite" className="space-y-6 outline-none">
        <div className="flex items-start gap-4">
          {previewUrl && <img src={previewUrl} alt="" className="size-20 rounded-xl object-cover" />}
          <div>
            <p className="text-[0.68rem] font-semibold tracking-[0.14em] text-engrave uppercase">Meteora DBC</p>
            <h2 className="mt-1 font-display text-3xl font-semibold tracking-[-0.03em] text-ink">
              {details.symbol} / STAMP is live
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-ink-soft">
              The token and its STAMP bonding curve were created by your wallet, and its burn rule was registered.
            </p>
          </div>
        </div>
        <dl className="space-y-3">
          <ResultRow label="Mint" value={result.mint} />
          <ResultRow label="Pool" value={result.pool} />
          <ResultRow label="Transaction" value={result.signature} />
        </dl>
        <div className="flex flex-wrap gap-3">
          <a href={`https://solscan.io/token/${result.mint}`} target="_blank" rel="noreferrer" className="ui-button ui-button-primary no-underline">
            View token
          </a>
          <a href={`https://solscan.io/tx/${result.signature}`} target="_blank" rel="noreferrer" className="ui-button ui-button-secondary no-underline">
            View transaction
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 border-b border-engrave/15 pb-6 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2.5">
            <img src="/meteora-mark.png" alt="" className="meteora-mark" />
            <h2 className="font-display text-2xl font-semibold tracking-[-0.025em] text-ink">STAMP launch</h2>
          </div>
          <p className="mt-2 max-w-[56ch] text-sm leading-relaxed text-ink-soft">
            Your wallet creates the token. The pad fixes its STAMP pair, curve, fees, migration, and liquidity lock.
          </p>
        </div>
        <ConfigBadge status={configStatus} checking={stage === "checking"} />
      </div>

      <LaunchField number="1" label="Your Solana wallet">
        {connecting ? (
          <p className="text-sm text-ink-soft">Connecting…</p>
        ) : connected && publicKey ? (
          <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
            <p className="tnum font-data text-sm break-all text-ink">{publicKey.toBase58()}</p>
            <button type="button" onClick={() => { disconnect().catch(() => {}); setError(null); }} className="text-[0.68rem] font-semibold tracking-[0.12em] text-ink-soft uppercase underline underline-offset-4 transition-colors hover:text-engrave">
              Disconnect
            </button>
          </div>
        ) : wallets.length === 0 ? (
          <p className="text-sm text-ink-soft">No browser wallet detected. Install Phantom or Solflare, then reload.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {wallets.map((candidate) => (
              <button key={candidate.adapter.name} type="button" onClick={() => { setError(null); select(candidate.adapter.name); }} className="ui-button border border-engrave/25 text-sm text-ink hover:border-engrave/45">
                {candidate.adapter.name}
              </button>
            ))}
          </div>
        )}
      </LaunchField>

      <LaunchField number="2" label="Token identity">
        <div className="grid gap-5 sm:grid-cols-2">
          <label>
            <span className="mb-1.5 block text-[0.68rem] font-semibold tracking-[0.12em] text-ink-soft uppercase">Name</span>
            <input value={details.name} onChange={(event) => set("name", event.target.value.slice(0, 32))} placeholder="Your token name" className="field-rule w-full font-display text-lg text-ink outline-none placeholder:text-ink-soft/45" />
          </label>
          <label>
            <span className="mb-1.5 block text-[0.68rem] font-semibold tracking-[0.12em] text-ink-soft uppercase">Ticker</span>
            <input value={details.symbol} onChange={(event) => set("symbol", event.target.value.replace(/[^A-Za-z0-9]/g, "").toUpperCase().slice(0, 10))} placeholder="TOKEN" className="field-rule w-full font-display text-lg tracking-wide text-ink outline-none placeholder:text-ink-soft/45" />
          </label>
        </div>
        <label className="mt-5 block">
          <span className="mb-1.5 block text-[0.68rem] font-semibold tracking-[0.12em] text-ink-soft uppercase">Description</span>
          <textarea value={details.description} onChange={(event) => set("description", event.target.value.slice(0, 500))} rows={3} placeholder="What is it? Keep it direct." className="field-rule w-full resize-none text-sm text-ink outline-none placeholder:text-ink-soft/45" />
        </label>
        <div className="mt-5 flex flex-wrap items-center gap-4">
          <button type="button" onClick={() => fileInput.current?.click()} className="ui-button ui-button-secondary">
            {file ? "Change image" : "Choose token image"}
          </button>
          <input ref={fileInput} type="file" accept="image/png,image/jpeg,image/gif,image/webp" className="hidden" aria-label="Token image" onChange={(event) => chooseFile(event.target.files?.[0])} />
          {previewUrl && <img src={previewUrl} alt="" className="size-16 rounded-xl object-cover" />}
          <span className="text-xs text-ink-soft">PNG, JPEG, GIF or WebP · 2 MB max</span>
        </div>
      </LaunchField>

      <LaunchField number="3" label="Links and burn rule">
        <div className="grid gap-5 sm:grid-cols-2">
          <input value={details.website} onChange={(event) => set("website", event.target.value.trim())} placeholder="https://yoursite.com" aria-label="Website" spellCheck={false} className="field-rule w-full font-data text-sm text-ink outline-none placeholder:text-ink-soft/45" />
          <input value={details.twitter} onChange={(event) => set("twitter", event.target.value.trim())} placeholder="https://x.com/yourhandle" aria-label="X link" spellCheck={false} className="field-rule w-full font-data text-sm text-ink outline-none placeholder:text-ink-soft/45" />
        </div>
        <label className="mt-5 block max-w-sm">
          <span className="mb-1.5 block text-[0.68rem] font-semibold tracking-[0.12em] text-ink-soft uppercase">Minimum burn for one stamp</span>
          <input value={details.minWholeTokens.toString()} onChange={(event) => { const value = event.target.value.replace(/[^0-9]/g, ""); set("minWholeTokens", BigInt(value || "0")); }} inputMode="numeric" className="field-rule tnum w-full font-display text-xl text-ink outline-none" />
        </label>
      </LaunchField>

      <section aria-labelledby="fixed-launch-settings">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h3 id="fixed-launch-settings" className="text-[0.68rem] font-semibold tracking-[0.14em] text-ink-soft uppercase">Fixed by this launchpad</h3>
          <span className="text-[0.68rem] font-semibold tracking-[0.1em] text-engrave uppercase">Not editable</span>
        </div>
        <div className="grid overflow-hidden rounded-xl border border-engrave/15 sm:grid-cols-2 xl:grid-cols-4">
          <ConfigMetric label="Pair" value="TOKEN / STAMP" note="Quote locked" />
          <ConfigMetric label="Supply" value="1B" note="793.1M on curve" />
          <ConfigMetric label="Trading fee" value="1.5%" note="1.2% to receiver" />
          <ConfigMetric label="Graduation" value="2.48M STAMP" note="DAMM v2 · LP locked" />
        </div>
        <div className="mt-3 rounded-xl border border-engrave/15 bg-paper/55 px-4 py-3 sm:flex sm:items-center sm:justify-between sm:gap-5">
          <div>
            <p className="text-[0.62rem] font-semibold tracking-[0.11em] text-ink-soft uppercase">Partner fee receiver</p>
            <p className="mt-1 text-xs leading-relaxed text-ink-soft">Authorizes claims and receives the launchpad's 1.2% share.</p>
          </div>
          <p className="tnum mt-2 break-all font-data text-xs text-ink sm:mt-0 sm:text-right">{PARTNER_FEE_RECEIVER}</p>
        </div>
      </section>

      <div className="border-t border-engrave/15 pt-6">
        <button type="button" disabled={!ready} onClick={() => void launch()} className="ui-button ui-button-primary w-full sm:w-auto sm:px-10">
          {stage === "checking" ? "Checking mainnet…"
            : stage === "uploading" ? "Storing the image…"
            : stage === "building" ? "Building the launch…"
            : stage === "sending" ? "Confirm in your wallet…"
            : !configReady ? "Config not live yet"
            : `Launch for ${METEORA_DBC_CONFIG.fees.launchFeeSol} SOL`}
        </button>
        <p className="mt-3 max-w-[62ch] text-sm leading-relaxed text-ink-soft">
          One wallet approval creates the token and STAMP pool, pays the {METEORA_DBC_CONFIG.fees.launchFeeSol} SOL launch fee, and registers the burn rule. The config key never enters this browser.
        </p>
        {configStatus && configStatus.state !== "ready" && (
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <p className="max-w-[58ch] text-sm text-stamp-deep">{configStatus.message}</p>
            <button type="button" onClick={() => void checkConfig()} disabled={stage !== "idle"} className="text-[0.68rem] font-semibold tracking-[0.12em] text-engrave uppercase underline underline-offset-4 disabled:opacity-40">
              Check again
            </button>
          </div>
        )}
        {configStatus?.state === "ready" && (
          <p className="mt-2 text-xs font-semibold tracking-[0.08em] text-engrave uppercase">Mainnet config verified · {METEORA_DBC_CONFIG_KEY}</p>
        )}
        <div ref={announcementRef} tabIndex={-1} role={error ? "alert" : "status"} aria-live={error ? "assertive" : "polite"} aria-atomic="true" className="outline-none">
          {error && <p className="mt-3 max-w-[58ch] text-sm text-stamp-deep">{error}</p>}
        </div>
      </div>
    </div>
  );
}

function ConfigBadge({ status, checking }: { status: MeteoraConfigStatus | null; checking: boolean }) {
  const ready = status?.state === "ready";
  return (
    <span className={`w-fit rounded-md px-2.5 py-1.5 text-[0.62rem] font-semibold tracking-[0.12em] uppercase ${ready ? "bg-engrave/12 text-engrave" : "bg-stamp/12 text-stamp-deep"}`}>
      {checking ? "Checking mainnet" : ready ? "Ready to launch" : "Setup required"}
    </span>
  );
}

function LaunchField({ number, label, children }: { number: string; label: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="mb-3 flex items-baseline gap-3 text-[0.68rem] font-semibold tracking-[0.14em] text-ink-soft uppercase">
        <span className="tnum font-data text-engrave">{number}</span>
        {label}
      </h3>
      {children}
    </section>
  );
}

function ConfigMetric({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="border-b border-engrave/15 p-4 last:border-b-0 sm:border-r sm:odd:border-r sm:[&:nth-child(n+3)]:border-b-0 xl:border-b-0 xl:last:border-r-0">
      <p className="text-[0.62rem] font-semibold tracking-[0.11em] text-ink-soft uppercase">{label}</p>
      <p className="tnum mt-1 font-data text-sm text-ink">{value}</p>
      <p className="mt-1 text-xs text-ink-soft">{note}</p>
    </div>
  );
}

function ResultRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[0.62rem] font-semibold tracking-[0.12em] text-ink-soft uppercase">{label}</dt>
      <dd className="tnum field-rule mt-1 pb-1 font-data text-xs break-all text-ink">{value}</dd>
    </div>
  );
}
