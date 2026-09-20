import { useId } from "react";

/**
 * A search field, drawn as a ruled entry on a form rather than a search box.
 *
 * The magnifier is authored here rather than taken from a glyph: a unicode
 * lens sits on the text baseline at whatever weight the body face happens to
 * have, which reads as a character in a sentence instead of a mark on a
 * document.
 */
export function SearchField({ value, onChange, placeholder, label, count }: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  label: string;
  count?: string;
}) {
  const id = useId();
  return (
    <div className="flex items-baseline gap-3">
      <label htmlFor={id} className="sr-only">{label}</label>
      <span aria-hidden className="translate-y-[3px] text-engrave/70">
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.3">
          <circle cx="6" cy="6" r="4.2" />
          <path d="M9.2 9.2 12.5 12.5" strokeLinecap="round" />
        </svg>
      </span>
      <div className="relative min-w-0 flex-1">
        <input
          id={id}
          type="search"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="field-rule w-full bg-transparent pb-1.5 font-body text-[0.95rem] text-ink outline-none placeholder:text-ink-soft/55 [&::-webkit-search-cancel-button]:appearance-none"
        />
      </div>
      {value && (
        <button
          type="button"
          onClick={() => onChange("")}
          className="shrink-0 font-body text-[0.6rem] font-semibold tracking-[0.16em] text-ink-soft uppercase transition-colors hover:text-stamp-deep"
        >
          Clear
        </button>
      )}
      {count && <span className="tnum shrink-0 font-data text-[0.7rem] text-ink-soft">{count}</span>}
    </div>
  );
}
