import { GuillocheBand } from "./Guilloche.tsx";
import { STAMP_COST_ZEC, type Collection } from "../lib/launchpad.ts";
import type { ActivityCollection } from "../lib/activity.ts";
import { LaunchPlatformPill } from "./LaunchPlatformPill.tsx";

/** The registry, as read from Zcash. A collection with no balance cannot issue. */
export function Registry({ collections, activity = [], updated }: {
  collections: Collection[];
  activity?: ActivityCollection[];
  updated: string | null;
}) {
  const platformByMint = new Map(activity.map((coin) => [coin.mint, coin.launchPlatform]));
  return (
    <section className="paper-lift bg-paper px-6 py-9 sm:px-10 sm:py-12">
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
        <h2 className="font-display text-[1.7rem] leading-none text-engrave">The register</h2>
        {updated && (
          <p className="tnum font-data text-xs text-ink-soft">
            read from Zcash {new Date(updated).toISOString().slice(0, 16).replace("T", " ")} UTC
          </p>
        )}
      </div>
      <div className="mt-5 text-engrave">
        <GuillocheBand className="h-5 w-full" />
      </div>

      {collections.length === 0 ? (
        <p className="mt-8 max-w-[58ch] text-[0.95rem] text-ink-soft">
          No collections registered yet.
        </p>
      ) : (
        <div className="mt-8 overflow-x-auto">
          <table className="w-full min-w-[42rem] border-collapse text-left">
            <thead>
              <tr className="border-b border-engrave/30">
                {["Ticker", "Stamps", "Minimum burn", "Funding", "Registered"].map((h) => (
                  <th key={h} className="pb-2 font-body text-[0.62rem] font-semibold tracking-[0.16em] text-ink-soft uppercase">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {collections.map((c) => {
                const funded = BigInt(c.fundedZat ?? "0");
                const stampsLeft = Number(funded) / 1e8 / STAMP_COST_ZEC;
                return (
                  <tr key={c.mint} className="border-b border-engrave/12 align-top">
                    <td className="py-3.5 pr-6">
                      <span className="flex items-center gap-2">
                        <span className="font-display text-lg text-ink">{c.sym}</span>
                        <LaunchPlatformPill platform={platformByMint.get(c.mint)} />
                      </span>
                      <span className="tnum block font-data text-[0.68rem] break-all text-ink-soft">{c.mint}</span>
                    </td>
                    <td className="tnum py-3.5 pr-6 font-data text-sm text-ink">{c.stamps ?? 0}</td>
                    <td className="tnum py-3.5 pr-6 font-data text-sm text-ink">
                      {(BigInt(c.min) / 10n ** BigInt(c.dec)).toLocaleString("en-US")}
                    </td>
                    <td className="py-3.5 pr-6">
                      {funded === 0n ? (
                        <span className="stamped inline-block px-2 py-0.5 font-display text-[0.65rem] leading-none">EMPTY</span>
                      ) : (
                        <span className="tnum font-data text-sm text-ink">~{Math.floor(stampsLeft)} stamps</span>
                      )}
                      <span className="tnum block font-data text-[0.68rem] break-all text-ink-soft">{c.funding}</span>
                    </td>
                    <td className="tnum py-3.5 font-data text-[0.72rem] text-ink-soft">
                      block {c.height.toLocaleString("en-US")}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <p className="mt-6 max-w-[64ch] text-sm text-ink-soft">
        This table is a snapshot. The register itself lives on Zcash, at a fixed address whose key nobody
        holds — anyone can add a collection, nobody can remove one, including us.
      </p>
      <p className="mt-3 max-w-[64ch] text-sm text-ink-soft">
        Funding is topped up automatically out of each collection's launch fee, so a balance reading empty
        here is usually one whose top-up has not confirmed yet. Anyone can add to any of these addresses;
        only that collection's stamps can ever be paid from it.
      </p>
    </section>
  );
}
