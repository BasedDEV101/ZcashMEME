import { Component, type ErrorInfo, type ReactNode } from "react";

/**
 * Catch a render that throws, so it costs a section instead of the page.
 *
 * React unmounts the entire tree when a render throws anywhere in it, and the
 * page goes white with nothing to read and nothing to click. That is what one
 * missing field in one collection did: sorting the leaderboard threw
 * converting undefined to a BigInt, and the whole site disappeared.
 *
 * The underlying bug is fixed. This is here because the next one will be a
 * different field, and a page that loses its leaderboard is still a page you
 * can burn on.
 */
interface Props { children: ReactNode; what: string }
interface State { failed: boolean; message: string }

export class Boundary extends Component<Props, State> {
  state: State = { failed: false, message: "" };

  static getDerivedStateFromError(error: unknown): State {
    return { failed: true, message: error instanceof Error ? error.message : String(error) };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Left in the console on purpose: this is the only trace of what broke.
    console.error(`[${this.props.what}]`, error, info.componentStack);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <section className="paper-lift bg-paper px-6 py-9 sm:px-10 sm:py-12">
        <h2 className="font-display text-[1.4rem] leading-none text-engrave">
          The {this.props.what} could not be drawn
        </h2>
        <p className="mt-4 max-w-[60ch] text-[0.95rem] text-ink-soft">
          Something in this section went wrong. The rest of the page still works, and nothing on either
          chain is affected — this is a display fault, not a lost burn or a lost coin.
        </p>
        <p className="tnum mt-3 max-w-[60ch] font-data text-[0.72rem] break-words text-ink-soft">
          {this.state.message}
        </p>
        <button
          type="button"
          onClick={() => location.reload()}
          className="mt-6 font-body text-[0.68rem] font-semibold tracking-[0.18em] text-engrave uppercase underline underline-offset-[6px] transition-colors hover:text-stamp-deep"
        >
          Reload
        </button>
      </section>
    );
  }
}
