import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import type { Transaction } from "@solana/web3.js";
import type { ActivityCollection } from "../lib/activity.ts";
import {
  buildPartnerFeeClaim,
  formatTokenAmount,
  hasClaimableFees,
  isFeeAuthority,
  meteoraLaunches,
  readMeteoraFeePools,
  type MeteoraFeePool,
} from "../lib/meteoraFees.ts";

type ClaimState =
  | { kind: "idle" }
  | { kind: "building"; message: string }
  | { kind: "signing"; message: string }
  | { kind: "sending"; message: string }
  | { kind: "success"; message: string; confirmedSignatures: string[] }
  | { kind: "error"; message: string; confirmedSignatures: string[]; submittedSignatures: string[] };

interface Props {
  collections: ActivityCollection[];
  activityLoading: boolean;
  activityError: string | null;
  theme: "dark" | "light";
  setTheme: (theme: "dark" | "light") => void;
}

export function MeteoraFeeAdmin({ collections, activityLoading, activityError, theme, setTheme }: Props) {
  const { connection } = useConnection();
  const {
    publicKey,
    connected,
    connecting,
    connect,
    disconnect,
    select,
    wallet,
    wallets,
    sendTransaction,
    signAllTransactions,
  } = useWallet();
  const [pools, setPools] = useState<MeteoraFeePool[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [claim, setClaim] = useState<ClaimState>({ kind: "idle" });
  const announcementRef = useRef<HTMLDivElement>(null);
  const authorized = isFeeAuthority(publicKey);
  const launches = useMemo(() => meteoraLaunches(collections), [collections]);

  useEffect(() => {
    if (wallet && !connected && !connecting) connect().catch(() => {});
  }, [wallet, connected, connecting, connect]);

  const refresh = useCallback(async () => {
    if (!authorized || launches.length === 0) return;
    setLoading(true);
    setLoadError(null);
    try {
      setPools(await readMeteoraFeePools(connection, launches));
    } catch (reason) {
      setLoadError((reason as Error).message || "Could not read Meteora fee accounts.");
    } finally {
      setLoading(false);
    }
  }, [authorized, connection, launches]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (claim.kind === "success" || claim.kind === "error") announcementRef.current?.focus();
  }, [claim]);

  const claimablePools = pools.filter((pool) => !pool.error && hasClaimableFees(pool));
  const totalStampRaw = pools.reduce((total, pool) => total + BigInt(pool.partnerQuoteFeeRaw), 0n);

  async function claimPools(targets: MeteoraFeePool[]) {
    if (!publicKey || !authorized) {
      setClaim({ kind: "error", message: "Connect the configured fee wallet before claiming.", confirmedSignatures: [], submittedSignatures: [] });
      return;
    }
    const currentTargets = targets.filter((pool) => !pool.error && hasClaimableFees(pool));
    if (currentTargets.length === 0) {
      setClaim({ kind: "error", message: "There are no unclaimed partner fees in the selected pools.", confirmedSignatures: [], submittedSignatures: [] });
      return;
    }

    const submittedSignatures: string[] = [];
    const confirmedSignatures: string[] = [];
    try {
      setClaim({ kind: "building", message: `Building ${currentTargets.length} verified claim ${currentTargets.length === 1 ? "transaction" : "transactions"}…` });
      const transactions: Transaction[] = [];
      for (const target of currentTargets) {
        if (!isFeeAuthority(publicKey)) throw new Error("The connected wallet changed. Reconnect the configured fee wallet.");
        transactions.push(await buildPartnerFeeClaim(connection, publicKey, target.pool));
      }

      if (signAllTransactions) {
        // Wallets commonly cap sign-all requests. Eight keeps one-click claiming
        // useful as the launchpad grows without asking an extension to render an
        // unbounded transaction list or relying on one expiring blockhash.
        const chunks: Transaction[][] = [];
        for (let index = 0; index < transactions.length; index += 8) chunks.push(transactions.slice(index, index + 8));
        for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex += 1) {
          const chunk = chunks[chunkIndex];
          const latest = await connection.getLatestBlockhash("confirmed");
          for (const transaction of chunk) {
            transaction.feePayer = publicKey;
            transaction.recentBlockhash = latest.blockhash;
          }
          setClaim({ kind: "signing", message: `Approve claim batch ${chunkIndex + 1} of ${chunks.length} in your wallet.` });
          const signed = await signAllTransactions(chunk);
          setClaim({ kind: "sending", message: `Sending batch ${chunkIndex + 1} of ${chunks.length} to Solana…` });
          const submitted: string[] = [];
          for (const transaction of signed) {
            const signature = await connection.sendRawTransaction(transaction.serialize(), { maxRetries: 3 });
            submittedSignatures.push(signature);
            submitted.push(signature);
          }
          setClaim({ kind: "sending", message: `Confirming ${submittedSignatures.length} of ${transactions.length} submitted claims…` });
          const confirmations = await Promise.allSettled(
            submitted.map(async (signature) => {
              const result = await connection.confirmTransaction({ signature, ...latest }, "confirmed");
              if (result.value.err) throw new Error(`Transaction ${signature.slice(0, 8)}… failed on chain.`);
              confirmedSignatures.push(signature);
            }),
          );
          const failed = confirmations.find((result) => result.status === "rejected");
          if (failed?.status === "rejected") throw failed.reason;
        }
      } else {
        setClaim({ kind: "signing", message: `Your wallet will request ${transactions.length} claim ${transactions.length === 1 ? "approval" : "approvals"}.` });
        for (let index = 0; index < transactions.length; index += 1) {
          const signature = await sendTransaction(transactions[index], connection, { maxRetries: 3 });
          submittedSignatures.push(signature);
          setClaim({ kind: "sending", message: `Confirming claim ${index + 1} of ${transactions.length}…` });
          const result = await connection.confirmTransaction(signature, "confirmed");
          if (result.value.err) throw new Error(`Transaction ${signature.slice(0, 8)}… failed on chain.`);
          confirmedSignatures.push(signature);
        }
      }

      setClaim({
        kind: "success",
        message: `${confirmedSignatures.length} ${confirmedSignatures.length === 1 ? "pool" : "pools"} claimed. The STAMP fees were sent to the connected fee wallet.`,
        confirmedSignatures,
      });
      await refresh();
    } catch (reason) {
      setClaim({
        kind: "error",
        message: confirmedSignatures.length > 0 || submittedSignatures.length > 0
          ? `${confirmedSignatures.length} confirmed; ${submittedSignatures.length - confirmedSignatures.length} submitted but not confirmed. ${(reason as Error).message}`
          : (reason as Error).message || "The wallet rejected the claim.",
        confirmedSignatures,
        submittedSignatures: submittedSignatures.filter((signature) => !confirmedSignatures.includes(signature)),
      });
      await refresh();
    }
  }

  return (
    <div className="site-bg min-h-dvh">
      <header className="site-nav sticky top-0 z-40">
        <div className="site-shell flex min-h-16 items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
          <a href="/" className="brand-mark text-ink no-underline" aria-label="Return to Zcash Shielded Assets">
            <img src="/stamp-mark-transparent.png" alt="" className="brand-stamp" />
            <span className="font-display text-sm font-semibold tracking-[-0.02em] sm:text-base">Fee control</span>
          </a>
          <button
            type="button"
            className="ui-button ui-button-ghost min-w-11 px-3"
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            aria-label={`Use ${theme === "dark" ? "light" : "dark"} theme`}
          >
            {theme === "dark" ? "Light" : "Dark"}
          </button>
        </div>
      </header>

      <main className="site-shell space-y-6 px-4 py-6 sm:px-6 lg:px-8 lg:py-10">
        <section className="paper-lift overflow-hidden bg-paper">
          <div className="grid min-h-[20rem] lg:grid-cols-[minmax(0,1.2fr)_minmax(21rem,0.8fr)]">
            <div className="px-6 py-9 sm:px-10 sm:py-12 lg:px-14">
              <div className="flex items-center gap-3">
                <img src="/meteora-mark.png" alt="" className="meteora-mark" />
                <span className="rounded-md bg-engrave/10 px-2 py-1 text-[0.66rem] font-semibold tracking-[0.12em] text-engrave uppercase">Wallet gated</span>
              </div>
              <h1 className="mt-7 max-w-3xl font-display text-[2.25rem] leading-[1.02] font-semibold tracking-[-0.03em] text-ink sm:text-[3.5rem]">
                Collect every partner fee from one desk.
              </h1>
              <p className="mt-6 max-w-[65ch] text-[0.98rem] leading-relaxed text-ink-soft">
                This console reads every Meteora pool created by the STAMP launchpad, totals its unclaimed partner share, and prepares one wallet-authorized claim per pool. Nothing here can move funds without the configured fee wallet signing.
              </p>
            </div>
            <div className="border-t border-engrave/15 bg-paper-deep/55 p-6 sm:p-8 lg:border-t-0 lg:border-l">
              <WalletGate
                publicKey={publicKey?.toBase58() ?? null}
                connected={connected}
                connecting={connecting}
                authorized={authorized}
                wallets={wallets}
                select={select}
                disconnect={() => disconnect().catch(() => {})}
              />
            </div>
          </div>
        </section>

        {authorized ? (
          <>
            <section className="grid gap-3 sm:grid-cols-3" aria-label="Fee summary">
              <Summary label="Meteora pools" value={activityLoading ? "—" : String(launches.length)} detail="Created from this DBC config" />
              <Summary label="Claimable STAMP" value={loading ? "Reading…" : formatTokenAmount(totalStampRaw.toString())} detail="Partner quote fees on the curve" accent />
              <Summary label="Ready to claim" value={loading ? "—" : String(claimablePools.length)} detail="Pools with a non-zero balance" />
            </section>

            <section className="paper-lift bg-paper px-5 py-6 sm:px-8 sm:py-8 lg:px-10">
              <div className="flex flex-col gap-5 border-b border-engrave/15 pb-6 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <h2 className="font-display text-[2rem] leading-none font-semibold tracking-[-0.03em] text-ink sm:text-[2.6rem]">Partner-fee ledger</h2>
                  <p className="mt-3 max-w-[64ch] text-sm leading-relaxed text-ink-soft">
                    Claims settle to this wallet in STAMP. A separate transaction is built for each pool so one failed pool cannot redirect or contaminate another claim.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button type="button" className="ui-button ui-button-ghost" onClick={() => void refresh()} disabled={loading || claim.kind === "building" || claim.kind === "signing" || claim.kind === "sending"}>
                    {loading ? "Reading mainnet…" : "Refresh"}
                  </button>
                  <button type="button" className="ui-button ui-button-primary" onClick={() => void claimPools(claimablePools)} disabled={loading || claimablePools.length === 0 || claim.kind === "building" || claim.kind === "signing" || claim.kind === "sending"}>
                    {claim.kind === "building" || claim.kind === "signing" || claim.kind === "sending" ? "Claim in progress…" : `Claim all ${claimablePools.length || ""}`.trim()}
                  </button>
                </div>
              </div>

              <StatusBlock state={claim} announcementRef={announcementRef} />
              {(activityError || loadError) && (
                <div role="alert" className="mt-6 rounded-xl bg-stamp/10 px-4 py-3 text-sm text-ink">
                  {activityError || loadError}
                </div>
              )}

              <div className="mt-6 hidden overflow-x-auto md:block">
                <table className="w-full min-w-[48rem] border-collapse text-left">
                  <thead>
                    <tr className="border-b border-engrave/20 text-[0.66rem] tracking-[0.12em] text-ink-soft uppercase">
                      <th className="px-3 py-3 font-semibold">Pool</th>
                      <th className="px-3 py-3 font-semibold">Status</th>
                      <th className="px-3 py-3 text-right font-semibold">STAMP fees</th>
                      <th className="px-3 py-3 text-right font-semibold">Base fees</th>
                      <th className="px-3 py-3 text-right font-semibold">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pools.map((pool) => (
                      <FeeRow key={pool.pool} pool={pool} busy={claim.kind === "building" || claim.kind === "signing" || claim.kind === "sending"} onClaim={() => void claimPools([pool])} />
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="mt-6 divide-y divide-engrave/10 md:hidden">
                {pools.map((pool) => (
                  <FeeCardMobile key={pool.pool} pool={pool} busy={claim.kind === "building" || claim.kind === "signing" || claim.kind === "sending"} onClaim={() => void claimPools([pool])} />
                ))}
              </div>
              {!loading && pools.length === 0 && !activityLoading && !activityError && (
                <p className="px-3 py-10 text-center text-sm text-ink-soft">No Meteora launches were found for this config.</p>
              )}
              {(loading || activityLoading) && pools.length === 0 && (
                <p role="status" className="px-3 py-10 text-center text-sm text-ink-soft">Reading the launch record and on-chain fee vaults…</p>
              )}
            </section>
          </>
        ) : (
          <section className="paper-lift bg-paper px-6 py-8 sm:px-10">
            <h2 className="font-display text-2xl font-semibold tracking-[-0.025em] text-ink">Claims stay sealed</h2>
            <p className="mt-3 max-w-[66ch] text-sm leading-relaxed text-ink-soft">
              Pool balances and claim controls appear only after the configured fee wallet connects. The route alone grants no authority.
            </p>
          </section>
        )}
      </main>
    </div>
  );
}

function WalletGate({
  publicKey,
  connected,
  connecting,
  authorized,
  wallets,
  select,
  disconnect,
}: {
  publicKey: string | null;
  connected: boolean;
  connecting: boolean;
  authorized: boolean;
  wallets: ReturnType<typeof useWallet>["wallets"];
  select: ReturnType<typeof useWallet>["select"];
  disconnect: () => void;
}) {
  return (
    <div className="flex h-full flex-col justify-between gap-8">
      <div>
        <p className="text-[0.66rem] font-semibold tracking-[0.13em] text-engrave uppercase">Signing authority</p>
        <p className="mt-3 font-display text-xl font-semibold tracking-[-0.02em] text-ink">
          {connecting ? "Opening wallet…" : authorized ? "Authorized" : connected ? "Access denied" : "Connect the fee wallet"}
        </p>
        <p className="mt-3 text-sm leading-relaxed text-ink-soft">
          {authorized
            ? "This address matches the fee claimer recorded in the live Meteora config."
            : connected
              ? "The connected address cannot read or submit claims from this console."
              : "Only the configured main wallet can unlock this page and sign partner-fee claims."}
        </p>
      </div>

      {connected && publicKey ? (
        <div>
          <p className="tnum font-data text-xs break-all text-ink">{publicKey}</p>
          <button type="button" onClick={disconnect} className="mt-4 text-[0.68rem] font-semibold tracking-[0.12em] text-ink-soft uppercase underline underline-offset-4 transition-colors hover:text-engrave">
            Disconnect
          </button>
        </div>
      ) : wallets.length === 0 ? (
        <p className="rounded-xl bg-engrave/8 px-4 py-3 text-sm text-ink-soft">Install or enable Phantom or Solflare, then reload this page.</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {wallets.map((candidate) => (
            <button key={candidate.adapter.name} type="button" onClick={() => select(candidate.adapter.name)} className="ui-button ui-button-secondary">
              Connect {candidate.adapter.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function Summary({ label, value, detail, accent = false }: { label: string; value: string; detail: string; accent?: boolean }) {
  return (
    <div className="paper-lift bg-paper px-5 py-5 sm:px-6">
      <p className="text-[0.66rem] font-semibold tracking-[0.12em] text-ink-soft uppercase">{label}</p>
      <p className={`tnum mt-3 font-data text-2xl font-bold tracking-[-0.02em] ${accent ? "text-engrave" : "text-ink"}`}>{value}</p>
      <p className="mt-2 text-xs leading-relaxed text-ink-soft">{detail}</p>
    </div>
  );
}

function FeeRow({ pool, busy, onClaim }: { pool: MeteoraFeePool; busy: boolean; onClaim: () => void }) {
  const claimable = !pool.error && hasClaimableFees(pool);
  return (
    <tr className="border-b border-engrave/10 align-middle last:border-0">
      <td className="px-3 py-4">
        <div className="flex min-w-64 items-center gap-3">
          {pool.image ? (
            <img src={pool.image} alt="" className="size-10 rounded-lg object-cover" />
          ) : (
            <div className="flex size-10 items-center justify-center rounded-lg bg-engrave/10 font-data text-xs text-engrave">{pool.symbol.slice(0, 3)}</div>
          )}
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-display text-sm font-semibold text-ink">{pool.symbol}</span>
              <span className="rounded-md bg-engrave/10 px-1.5 py-0.5 text-[0.6rem] font-semibold tracking-[0.1em] text-engrave uppercase">Meteora</span>
            </div>
            <p className="mt-0.5 text-xs text-ink-soft">{pool.name}</p>
            <a href={`https://solscan.io/account/${pool.pool}`} target="_blank" rel="noreferrer" className="tnum mt-1 inline-block font-data text-[0.66rem] no-underline hover:underline">{pool.pool.slice(0, 5)}…{pool.pool.slice(-5)}</a>
          </div>
        </div>
      </td>
      <td className="max-w-48 px-3 py-4 text-xs text-ink-soft">
        <span>{pool.error ? "Read failed" : pool.migrated ? "Migrated" : "On curve"}</span>
        {pool.error && <span className="mt-1 block text-[0.68rem] leading-relaxed text-stamp">{pool.error}</span>}
      </td>
      <td className="tnum px-3 py-4 text-right font-data text-sm font-bold text-ink">{pool.error ? "—" : formatTokenAmount(pool.partnerQuoteFeeRaw)}</td>
      <td className="tnum px-3 py-4 text-right font-data text-sm text-ink-soft">{pool.error ? "—" : formatTokenAmount(pool.partnerBaseFeeRaw)}</td>
      <td className="px-3 py-4 text-right">
        <button type="button" className="ui-button ui-button-ghost min-w-24" disabled={!claimable || busy} onClick={onClaim} title={pool.error || undefined}>
          {claimable ? "Claim" : pool.error ? "Unavailable" : "Claimed"}
        </button>
      </td>
    </tr>
  );
}

function FeeCardMobile({ pool, busy, onClaim }: { pool: MeteoraFeePool; busy: boolean; onClaim: () => void }) {
  const claimable = !pool.error && hasClaimableFees(pool);
  return (
    <article className="py-5 first:pt-0 last:pb-0">
      <div className="flex items-start gap-3">
        {pool.image ? (
          <img src={pool.image} alt="" className="size-11 shrink-0 rounded-lg object-cover" />
        ) : (
          <div className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-engrave/10 font-data text-xs text-engrave">{pool.symbol.slice(0, 3)}</div>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-display text-base font-semibold text-ink">{pool.symbol}</span>
            <span className="rounded-md bg-engrave/10 px-1.5 py-0.5 text-[0.6rem] font-semibold tracking-[0.1em] text-engrave uppercase">Meteora</span>
          </div>
          <p className="mt-0.5 truncate text-xs text-ink-soft">{pool.name}</p>
          <a href={`https://solscan.io/account/${pool.pool}`} target="_blank" rel="noreferrer" className="tnum mt-1 inline-block font-data text-[0.66rem] no-underline hover:underline">{pool.pool.slice(0, 5)}…{pool.pool.slice(-5)}</a>
        </div>
      </div>
      <dl className="mt-4 grid grid-cols-2 gap-3 rounded-xl bg-paper-deep/55 p-3">
        <div>
          <dt className="text-[0.62rem] font-semibold tracking-[0.1em] text-ink-soft uppercase">STAMP fees</dt>
          <dd className="tnum mt-1 font-data text-sm font-bold text-ink">{pool.error ? "—" : formatTokenAmount(pool.partnerQuoteFeeRaw)}</dd>
        </div>
        <div>
          <dt className="text-[0.62rem] font-semibold tracking-[0.1em] text-ink-soft uppercase">Base fees</dt>
          <dd className="tnum mt-1 font-data text-sm text-ink">{pool.error ? "—" : formatTokenAmount(pool.partnerBaseFeeRaw)}</dd>
        </div>
      </dl>
      <div className="mt-3 flex items-center justify-between gap-3">
        <div className="min-w-0 text-xs text-ink-soft">
          <span>{pool.error ? "Read failed" : pool.migrated ? "Migrated" : "On curve"}</span>
          {pool.error && <span className="mt-1 block break-words text-[0.68rem] leading-relaxed text-stamp">{pool.error}</span>}
        </div>
        <button type="button" className="ui-button ui-button-ghost min-w-24 shrink-0" disabled={!claimable || busy} onClick={onClaim}>
          {claimable ? "Claim" : pool.error ? "Unavailable" : "Claimed"}
        </button>
      </div>
    </article>
  );
}

function StatusBlock({ state, announcementRef }: { state: ClaimState; announcementRef: React.RefObject<HTMLDivElement | null> }) {
  if (state.kind === "idle") return null;
  const isError = state.kind === "error";
  const complete = state.kind === "success";
  const confirmedSignatures = "confirmedSignatures" in state ? state.confirmedSignatures : [];
  const submittedSignatures = state.kind === "error" ? state.submittedSignatures : [];
  return (
    <div
      ref={announcementRef}
      tabIndex={-1}
      role={isError ? "alert" : "status"}
      aria-live={isError ? "assertive" : "polite"}
      className={`mt-6 rounded-xl px-4 py-4 outline-none ${isError ? "bg-stamp/10" : complete ? "bg-engrave/10" : "bg-paper-deep/65"}`}
    >
      <p className="text-sm font-semibold text-ink">{state.message}</p>
      {(confirmedSignatures.length > 0 || submittedSignatures.length > 0) && (
        <div className="mt-3 flex flex-wrap gap-2">
          {confirmedSignatures.map((signature, index) => (
            <a key={signature} href={`https://solscan.io/tx/${signature}`} target="_blank" rel="noreferrer" className="font-data text-xs">Confirmed transaction {index + 1}</a>
          ))}
          {submittedSignatures.map((signature, index) => (
            <a key={signature} href={`https://solscan.io/tx/${signature}`} target="_blank" rel="noreferrer" className="font-data text-xs">Submitted transaction {index + 1}</a>
          ))}
        </div>
      )}
    </div>
  );
}
