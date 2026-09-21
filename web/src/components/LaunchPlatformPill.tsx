import type { ActivityCollection } from "../lib/activity.ts";

export type LaunchPlatform = NonNullable<ActivityCollection["launchPlatform"]>;

/** A consistent source mark wherever a launched coin is named. */
export function LaunchPlatformPill({ platform = "pump", className = "" }: {
  platform?: LaunchPlatform;
  className?: string;
}) {
  const meteora = platform === "meteora";
  return (
    <span
      className={`inline-flex min-h-5 shrink-0 items-center gap-1.5 rounded-full border border-engrave/15 bg-paper/90 px-2 py-0.5 font-body text-[0.56rem] font-bold tracking-[0.07em] text-ink-soft uppercase shadow-sm backdrop-blur-sm ${className}`}
      title={`Launched on ${meteora ? "Meteora" : "Pump"}`}
    >
      <img
        src={meteora ? "/meteora-mark.png" : "/pump-pill.png"}
        alt=""
        aria-hidden
        className="size-3.5 object-contain"
      />
      {meteora ? "Meteora" : "Pump"}
    </span>
  );
}
