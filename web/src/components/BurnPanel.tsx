import { useEffect, useMemo, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { PublicKey, Transaction } from "@solana/web3.js";
import { getAssociatedTokenAddress } from "@solana/spl-token";
import { Connection } from "@solana/web3.js";
import { createWallet, type GeneratedWallet } from "@protocol/zcash/hd.ts";
import { parseTransparentAddress } from "@protocol/core/zcash-address.ts";
import { buildBurnInstructions, checkBurnRequest } from "@protocol/solana/burn-tx.ts";
import { CONFIG, formatTokens } from "../lib/config.ts";

type Destination = { kind: "generated"; wallet: GeneratedWallet } | { kind: "own"; address: string };

export function BurnPanel() {
  const { publicKey, connected, connecting, connect, disconnect, select, wallet, wallets, sendTransaction } = useWallet();
  const [dest, setDest] = useState<Destination | null>(null);
  const [saved, setSaved] = useState(false);
  const [own, setOwn] = useState("");
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [signature, setSignature] = useState<string | null>(null);

  // select() only records the choice; the provider needs a render to adopt it.
  // Calling connect() in the same tick connects an adapter the provider has
  // not adopted yet, so the UI reports connected while sendTransaction throws
  // WalletNotSelectedError -- the failure lands on the burn click, not the
  // connect click. Connect once the provider actually holds the wallet.
  useEffect(() => {
    if (wallet && !connected && !connecting) {
      connect().catch((e: unknown) => setError((e as Error).message));
    }
  }, [wallet, connected, connecting, connect]);

  const address = dest?.kind === "generated" ? dest.wallet.address : dest?.kind === "own" ? own.trim() : "";
  const addressOk = useMemo(() => {
    const p = parseTransparentAddress(address);
    return Boolean(p && p.network === CONFIG.zcashNetwork);
  }, [address]);

  const amountRaw = useMemo(() => {
    const digits = amount.replace(/[^0-9]/g, "");
    return digits ? BigInt(digits) : 0n;
  }, [amount]);
  const belowMinimum = amountRaw > 0n && amountRaw < CONFIG.minBurnTokens;
  const destinationReady = addressOk && (dest?.kind !== "generated" || saved);
  const ready = CONFIG.launched && connected && destinationReady && amountRaw >= CONFIG.minBurnTokens && !busy;

  async function burn() {
    setError(null);
    // Never fail silently on the button that destroys someone's tokens.
    if (!publicKey) { setError("Wallet is not connected. Connect it in step 1 and try again."); return; }
    if (!CONFIG.solanaMint) { setError("No mint is configured for this site yet."); return; }
    setBusy(true);
    try {
      const mint = new PublicKey(CONFIG.solanaMint);
      const programId = new PublicKey(CONFIG.tokenProgramId);
      const ata = await getAssociatedTokenAddress(mint, publicKey, false, programId);
      const request = {
        mint: CONFIG.solanaMint,
        tokenProgramId: CONFIG.tokenProgramId,
        tokenAccount: ata.toBase58(),
        owner: publicKey.toBase58(),
        amountRaw: amountRaw * 10n ** BigInt(CONFIG.decimals),
        decimals: CONFIG.decimals,
        zcashAddress: address,
        zcashNetwork: CONFIG.zcashNetwork,
        minBurnRaw: CONFIG.minBurnTokens * 10n ** BigInt(CONFIG.decimals),
      };
      checkBurnRequest(request);
      const connection = new Connection(CONFIG.rpc, "confirmed");
      const tx = new Transaction().add(...buildBurnInstructions(request));
      setSignature(await sendTransaction(tx, connection));
    } catch (e) {
      // Some wallet and token errors carry an empty message (TokenOwnerOffCurveError
      // is one). A blank red line tells the user nothing, so fall back to the
      // error's name.
      const err = e as Error;
      setError(err.message || err.name || "The wallet rejected the transaction.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-8">
      <Step n={1} label="Your Solana wallet">
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
          <p className="text-sm text-ink-soft">
            No Solana wallet detected in this browser. Install Phantom or Solflare, then reload.
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {wallets.map((w) => (
              <button
                key={w.adapter.name}
                type="button"
                onClick={() => {
                  setError(null);
                  select(w.adapter.name);
                }}
                className="border border-engrave/45 px-4 py-2 font-body text-sm text-engrave transition-colors hover:bg-engrave hover:text-paper"
              >
                {w.adapter.name}
              </button>
            ))}
          </div>
        )}
      </Step>

      <Step n={2} label="Where the certificate goes">
        {!dest && (
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setDest({ kind: "generated", wallet: createWallet(CONFIG.zcashNetwork) })}
              className="bg-engrave px-4 py-2 font-body text-sm text-paper transition-opacity hover:opacity-88"
            >
              Create a Zcash address for me
            </button>
            <button
              type="button"
              onClick={() => setDest({ kind: "own", address: "" })}
              className="border border-engrave/45 px-4 py-2 font-body text-sm text-engrave transition-colors hover:bg-engrave hover:text-paper"
            >
              I already have one
            </button>
          </div>
        )}

        {dest?.kind === "generated" && (
          <div className="space-y-4">
            <p className="field-rule tnum pb-1.5 font-data text-sm break-all">{dest.wallet.address}</p>
            <div className="border border-stamp/55 bg-stamp/6 p-4">
              <p className="font-body text-[0.68rem] font-semibold tracking-[0.18em] text-stamp-deep uppercase">
                Write these twelve words down
              </p>
              <p className="mt-2 font-data text-[0.9rem] leading-relaxed break-words text-ink select-all">
                {dest.wallet.mnemonic}
              </p>
              <p className="mt-3 text-sm text-ink-soft">
                They are the only way to reach your certificate. Nobody, including us, can recover them.
                They import into Ywallet whenever you want a full wallet.
              </p>
              <label className="mt-4 flex items-start gap-2.5 text-sm text-ink">
                <input
                  type="checkbox"
                  checked={saved}
                  onChange={(e) => setSaved(e.target.checked)}
                  className="mt-1 size-4"
                />
                I have saved them somewhere I will still have next year.
              </label>
            </div>
          </div>
        )}

        {dest?.kind === "own" && (
          <div className="space-y-3">
            <input
              value={own}
              onChange={(e) => setOwn(e.target.value)}
              spellCheck={false}
              autoCapitalize="none"
              placeholder="t1…"
              aria-label="Your Zcash transparent address"
              className="field-rule tnum w-full bg-transparent pb-1.5 font-data text-sm text-ink outline-none placeholder:text-ink-soft/55"
            />
            {own.trim() !== "" && !addressOk && (
              <p className="text-sm text-stamp-deep">
                That is not a Zcash transparent address for this network. It must begin with t1 and be one
                you control.
              </p>
            )}
            <p className="text-sm text-ink-soft">
              Never use an exchange deposit address. It is a valid t1 address, the certificate will be
              delivered to it, and it will be lost for good.
            </p>
          </div>
        )}
      </Step>

      <Step n={3} label={`How much ${CONFIG.ticker} to destroy`}>
        <input
          value={amount}
          onChange={(e) => setAmount(e.target.value.replace(/[^0-9,]/g, ""))}
          inputMode="numeric"
          placeholder={formatTokens(CONFIG.minBurnTokens)}
          aria-label={`Amount of ${CONFIG.ticker} to burn`}
          className="field-rule tnum w-full bg-transparent pb-2 font-display text-4xl text-ink outline-none placeholder:text-ink-soft/40"
        />
        <p className="mt-2 text-sm text-ink-soft">
          Minimum {formatTokens(CONFIG.minBurnTokens)}. The certificate records this number exactly.
        </p>
        {belowMinimum && (
          <p className="mt-1 text-sm text-stamp-deep">
            Below the minimum of {formatTokens(CONFIG.minBurnTokens)}.
          </p>
        )}
      </Step>

      <div className="border-t border-engrave/25 pt-6">
        {!CONFIG.launched && (
          <p className="mb-4 text-sm text-ink-soft">
            {CONFIG.ticker} has not launched yet. Burning opens when the mint address is published here.
          </p>
        )}
        <button
          type="button"
          disabled={!ready}
          onClick={burn}
          className="w-full bg-stamp px-6 py-4 font-display text-lg tracking-[0.06em] text-paper uppercase transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:bg-ink-soft/25 disabled:text-ink-soft sm:w-auto sm:px-12"
        >
          {busy ? "Confirm in your wallet…" : `Destroy ${amountRaw > 0n ? formatTokens(amountRaw) : ""} ${CONFIG.ticker}`.trim()}
        </button>
        <p className="mt-3 max-w-[58ch] text-sm text-ink-soft">
          This cannot be undone, reversed or refunded. Your tokens stop existing the moment you sign.
        </p>
        {error && <p className="mt-3 text-sm text-stamp-deep">{error}</p>}
        {signature && (
          <p className="tnum mt-3 font-data text-sm break-all text-engrave">
            Burned. Signature {signature}
          </p>
        )}
      </div>
    </div>
  );
}

function Step({ n, label, children }: { n: number; label: string; children: React.ReactNode }) {
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
