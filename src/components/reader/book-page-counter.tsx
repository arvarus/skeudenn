import { useState } from 'react';
import { useTranslation } from 'react-i18next';

interface BookPageCounterProps {
  /** The pages shown, as the counter writes them (`4–5`, `4`). */
  label: string;
  pageCount: number;
  /** Goes to the spread holding a page (0-based). */
  onGoTo: (page: number) => void;
}

/**
 * The header's page counter of the book reader, "4–5 / 14", whose first part can be edited: type a
 * page number and press Enter to go to the spread holding it (Escape or leaving the field cancels).
 */
export function BookPageCounter({ label, pageCount, onGoTo }: BookPageCounterProps) {
  const { t } = useTranslation('reader');
  const [draft, setDraft] = useState<string | null>(null);

  const commit = () => {
    const page = Number.parseInt(draft ?? '', 10);
    if (Number.isFinite(page)) onGoTo(Math.min(Math.max(page, 1), pageCount) - 1);
    setDraft(null);
  };

  const text = draft ?? label;
  return (
    <span className="ml-auto flex items-center gap-1 tabular-nums text-white/60">
      <input
        type="text"
        inputMode="numeric"
        aria-label={t('goToPage')}
        title={t('goToPage')}
        value={text}
        style={{ width: `${Math.max(text.length, 3) + 1}ch` }}
        onFocus={(event) => event.target.select()}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            commit();
            event.currentTarget.blur();
          } else if (event.key === 'Escape') {
            setDraft(null);
            event.currentTarget.blur();
          }
        }}
        onBlur={() => setDraft(null)}
        className="rounded border border-transparent bg-transparent px-1 py-0.5 text-right text-white/80 hover:border-white/20 focus:border-white/40 focus:bg-white/10 focus:outline-none"
      />
      <span>/ {pageCount}</span>
    </span>
  );
}
