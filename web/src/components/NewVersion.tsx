import { useEffect, useState } from "react";

/**
 * Tell a long-open page that it is out of date.
 *
 * This matters more here than on most sites: what the page builds is a
 * transaction, and a tab opened an hour ago goes on building the old one. When
 * coins moved from being quoted in SOL to being quoted in ZEC, every launch
 * from an already-open tab kept pairing to SOL — correct code, shipped and
 * live, and still not what those launches did.
 *
 * No build step to keep in sync: the page asks the server for the document it
 * was itself served from and compares the script it names with the script this
 * page is running. Different file, different build.
 */
const CHECK_EVERY_MS = 2 * 60 * 1000;

function currentScript(): string | null {
  const el = document.querySelector<HTMLScriptElement>('script[type="module"][src]');
  return el ? new URL(el.src, location.href).pathname : null;
}

async function servedScript(): Promise<string | null> {
  const res = await fetch("/", { cache: "no-store" });
  if (!res.ok) return null;
  const html = await res.text();
  return /src="(\/assets\/[^"]+\.js)"/.exec(html)?.[1] ?? null;
}

export function NewVersion() {
  const [stale, setStale] = useState(false);

  useEffect(() => {
    const mine = currentScript();
    if (!mine) return;
    let live = true;

    const check = async () => {
      try {
        const served = await servedScript();
        if (live && served && served !== mine) setStale(true);
      } catch {
        // Offline, or the server had a bad moment. Ask again later.
      }
    };

    const timer = setInterval(check, CHECK_EVERY_MS);
    // Checked on return too: a tab left in the background for hours is exactly
    // the one most likely to be out of date.
    // On document, which is where visibilitychange is dispatched.
    const onVisible = () => document.visibilityState === "visible" && check();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      live = false;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  if (!stale) return null;

  return (
    <div className="paper-lift flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2 border-l-0 bg-paper px-6 py-4 sm:px-10">
      <p className="max-w-[60ch] text-[0.92rem] text-ink">
        This page has been open since before the last update, and would launch a coin the old way.
      </p>
      <button
        type="button"
        onClick={() => location.reload()}
        className="font-body text-[0.66rem] font-semibold tracking-[0.16em] text-stamp-deep uppercase underline underline-offset-[5px] transition-opacity hover:opacity-70"
      >
        Reload
      </button>
    </div>
  );
}
