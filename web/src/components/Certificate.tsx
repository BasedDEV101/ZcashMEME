import type { ReactNode } from "react";
import { Guilloche, GuillocheBand } from "./Guilloche.tsx";

/**
 * The document itself. Everything on this site is a part of it: the hero is a
 * certificate, the burn control sits on its signature line, and the proof
 * section shows two real ones off the chain.
 */
export function Certificate({
  serial,
  amount,
  ticker,
  cancelled = false,
  recipient,
  children,
  counterfoil,
}: {
  serial: string;
  amount: string;
  ticker: string;
  cancelled?: boolean;
  recipient?: string;
  children?: ReactNode;
  counterfoil?: ReactNode;
}) {
  return (
    <article className="paper-lift relative bg-paper text-ink">
      <div className="grid lg:grid-cols-[1fr_16rem]">
        <div className="relative overflow-hidden px-6 py-8 sm:px-10 sm:py-12">
          <Guilloche
            size={360}
            opacity={0.2}
            className="pointer-events-none absolute -right-28 -bottom-24 text-engrave sm:-right-20"
          />

          {cancelled && (
            <p
              className="stamped strike-in pointer-events-none absolute top-6 right-4 z-10 px-2.5 py-1.5 font-display text-[clamp(0.95rem,3.6vw,1.9rem)] leading-none font-semibold sm:top-10 sm:right-9 sm:px-3"
              style={{ transform: "rotate(-5.5deg)" }}
            >
              CANCELLED
            </p>
          )}

          <header className="relative pr-32 sm:pr-48">
            <h2 className="font-display text-[1.6rem] leading-none tracking-[0.02em] text-engrave sm:text-[2rem]">
              Certificate of Destruction
            </h2>
            <p className="tnum mt-2 font-data text-xs text-ink-soft">No. {serial}</p>
          </header>

          <div className="relative mt-7 text-engrave">
            <GuillocheBand className="h-5 w-full" />
          </div>

          <p className="relative mt-8 max-w-[60ch] text-[0.94rem] leading-relaxed text-ink-soft">
            The quantity below was irreversibly destroyed on Solana. This inscription records it on
            Zcash and cannot be reissued.
          </p>

          <div className="relative mt-6">
            <p className="font-body text-[0.68rem] font-semibold tracking-[0.18em] text-ink-soft uppercase">
              Quantity destroyed
            </p>
            <p className="tnum font-display text-[clamp(2.75rem,11vw,5.5rem)] leading-[0.95] font-semibold text-ink">
              {amount}
            </p>
            <p className="font-display text-xl text-engrave italic">{ticker}</p>


          </div>

          {recipient && (
            <div className="relative mt-9">
              <p className="font-body text-[0.68rem] font-semibold tracking-[0.18em] text-ink-soft uppercase">
                Delivered to
              </p>
              <p className="field-rule tnum mt-1 pb-1.5 font-data text-[0.8rem] break-all text-ink sm:text-sm">
                {recipient}
              </p>
            </div>
          )}

          {children && <div className="relative mt-9">{children}</div>}
        </div>

        {counterfoil && (
          <aside className="perforation relative bg-paper-deep/45 px-6 py-8 sm:px-8 lg:py-12">
            {counterfoil}
          </aside>
        )}
      </div>
    </article>
  );
}
