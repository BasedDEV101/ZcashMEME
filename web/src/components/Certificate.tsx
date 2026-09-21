import type { ReactNode } from "react";
import { GuillocheBand } from "./Guilloche.tsx";

/**
 * The document itself. Everything on this site is a part of it: the hero is a
 * certificate, the burn control sits on its signature line, and the proof
 * section shows two real ones off the chain.
 */
export function Certificate({
  serial,
  amount,
  ticker,
  unit,
  cancelled = false,
  recipient,
  children,
  counterfoil,
}: {
  serial: string;
  amount: string;
  /** The ticker, when the figure belongs to one coin. */
  ticker?: string;
  /** What the figure counts, when it spans more than one coin. */
  unit?: ReactNode;
  cancelled?: boolean;
  recipient?: string;
  children?: ReactNode;
  counterfoil?: ReactNode;
}) {
  return (
    <article className="certificate-shell paper-lift relative overflow-hidden bg-paper text-ink">
      <div className="certificate-grid">
        <div className="certificate-main relative overflow-hidden px-6 py-8 sm:px-10 sm:py-12">
          <div className="certificate-stamp-watermark" aria-hidden="true">
            <img src="/stamp-mark.png" alt="" width="500" height="500" />
          </div>

          <header className="certificate-header relative">
            <div>
              <h2 className="font-display text-[1.65rem] leading-[1.02] tracking-[-0.02em] text-engrave sm:text-[2rem]">
                Certificate of Destruction
              </h2>
              <p className="tnum mt-2 font-data text-xs text-ink-soft">No. {serial}</p>
            </div>
            {cancelled && (
              <p
                className="certificate-stamp stamped strike-in pointer-events-none px-2.5 py-1.5 font-display text-base leading-none font-semibold sm:px-3 sm:text-lg"
                style={{ transform: "rotate(-5.5deg)" }}
              >
                CANCELLED
              </p>
            )}
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
            {ticker && <p className="font-display text-xl text-engrave italic">{ticker}</p>}
            {unit && <p className="mt-1 max-w-[42ch] text-[0.92rem] text-ink-soft">{unit}</p>}
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
          <aside className="certificate-counterfoil perforation relative bg-paper-deep/45 px-6 py-8 sm:px-8">
            {counterfoil}
          </aside>
        )}
      </div>
    </article>
  );
}
