import { Plus, X } from 'lucide-react';
import { type ReactNode, useId, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { BookCover } from '@/components/book-cover';
import { CoverEditorDialog } from '@/components/cover-editor-dialog';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import {
  BOOK_LANGUAGES,
  type BookForm,
  type CreditRow,
  entryToForm,
  formToUpdate,
  isValidForm,
  newCreditRow,
  validateForm,
} from '@/lib/book-edit';
import { creditRoleLabel, reviewFieldLabel } from '@/lib/metadata-review';
import { LanguageFlag } from '@/components/language-flag';
import { cn, formatLanguage } from '@/lib/utils';
import { CREDIT_ROLES, type CreditRole, type LibraryEntry } from '@/shared/library';

const INPUT_CLASS =
  'h-8 rounded-md border bg-background px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 aria-invalid:border-destructive';

/**
 * Edits a library entry's information by hand (title, series, volume, release date, language and
 * credits), with no lookup: the same fields as "Look up details", typed by the user.
 */
export function BookEditDialog({
  entry,
  onClose,
  onSaved,
}: {
  entry: LibraryEntry;
  onClose: () => void;
  onSaved: (entry: LibraryEntry) => void;
}) {
  const { t } = useTranslation(['bookEdit', 'common']);
  const [form, setForm] = useState<BookForm>(() => entryToForm(entry));
  // Errors only show once the user tried to save, not while the first value is being typed.
  const [submitted, setSubmitted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [coverOpen, setCoverOpen] = useState(false);
  const errors = validateForm(form);
  const shown = submitted ? errors : {};

  const save = async () => {
    setSubmitted(true);
    if (!isValidForm(errors)) return;
    const update = formToUpdate(entry, form);
    if (Object.keys(update).length === 0) {
      onClose();
      return;
    }
    setSaving(true);
    const updated = await window.skeudenn.library.updateMetadata(entry.id, update);
    setSaving(false);
    if (updated) onSaved(updated);
    onClose();
  };

  const setCredit = (key: string, patch: Partial<CreditRow>) =>
    setForm({
      ...form,
      credits: form.credits.map((row) => (row.key === key ? { ...row, ...patch } : row)),
    });

  // A code typed elsewhere (a lookup, an import) stays selectable even when it isn't in the list.
  const languages =
    form.language && !BOOK_LANGUAGES.includes(form.language) ? [form.language, ...BOOK_LANGUAGES] : BOOK_LANGUAGES;

  return (
    <Dialog
      open
      onOpenChange={(open) => !open && onClose()}
      title={t('title')}
      description={entry.path}
      className="max-w-2xl"
    >
      <form
        id="book-edit-form"
        className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
      >
        <div className="flex items-center gap-3">
          <BookCover entryId={entry.id} title={entry.title} className="h-24 w-16" />
          <Button type="button" variant="outline" size="sm" onClick={() => setCoverOpen(true)}>
            {t('changeCover')}
          </Button>
        </div>

        <div className="grid grid-cols-[auto_1fr] items-center gap-x-3 gap-y-2 text-sm">
          <Field label={reviewFieldLabel('title')} error={shown.title}>
            {(props) => (
              <input
                {...props}
                className={cn(INPUT_CLASS, 'w-full')}
                value={form.title}
                onChange={(event) => setForm({ ...form, title: event.target.value })}
              />
            )}
          </Field>
          <Field label={reviewFieldLabel('series')}>
            {(props) => (
              <input
                {...props}
                className={cn(INPUT_CLASS, 'w-full')}
                value={form.series}
                onChange={(event) => setForm({ ...form, series: event.target.value })}
              />
            )}
          </Field>
          <Field label={reviewFieldLabel('volume')}>
            {(props) => (
              <input
                {...props}
                placeholder={t('volumePlaceholder')}
                className={cn(INPUT_CLASS, 'w-32')}
                value={form.volume}
                onChange={(event) => setForm({ ...form, volume: event.target.value })}
              />
            )}
          </Field>
          <Field label={reviewFieldLabel('releaseDate')} error={shown.releaseDate}>
            {(props) => (
              <input
                {...props}
                placeholder={t('datePlaceholder')}
                className={cn(INPUT_CLASS, 'w-56')}
                value={form.releaseDate}
                onChange={(event) => setForm({ ...form, releaseDate: event.target.value })}
              />
            )}
          </Field>
          <Field label={reviewFieldLabel('language')}>
            {(props) => (
              <div className="flex items-center gap-2">
<LanguageFlag code={form.language} className="h-4" />
<select
                {...props}
                className={cn(INPUT_CLASS, 'w-56')}
                value={form.language}
                onChange={(event) => setForm({ ...form, language: event.target.value })}
              >
                <option value="">—</option>
                {languages.map((code) => (
                  <option key={code} value={code}>
                    {formatLanguage(code)} ({code})
                  </option>
                ))}
              </select>
</div>
            )}
          </Field>
        </div>

        <div className="flex flex-col gap-2">
          <h3 className="text-sm font-medium">{t('authors')}</h3>
          {form.credits.length === 0 && <p className="text-sm text-muted-foreground">{t('noAuthors')}</p>}
          <ul className="flex flex-col gap-1">
            {form.credits.map((credit) => {
              const error = shown.credits?.[credit.key];
              return (
                <li key={credit.key} className="flex flex-col gap-0.5">
                  <div className="flex items-center gap-2">
                    <input
                      aria-label={t('firstName')}
                      placeholder={t('firstName')}
                      className={cn(INPUT_CLASS, 'w-36')}
                      value={credit.firstName}
                      onChange={(event) => setCredit(credit.key, { firstName: event.target.value })}
                    />
                    <input
                      aria-label={t('lastName')}
                      placeholder={t('lastNamePlaceholder')}
                      aria-invalid={error ? true : undefined}
                      className={cn(INPUT_CLASS, 'w-44')}
                      value={credit.lastName}
                      onChange={(event) => setCredit(credit.key, { lastName: event.target.value })}
                    />
                    <select
                      aria-label={t('role')}
                      className={cn(INPUT_CLASS, 'w-32')}
                      value={credit.role}
                      onChange={(event) =>
                        setCredit(credit.key, {
                          role: event.target.value as CreditRole,
                        })
                      }
                    >
                      {CREDIT_ROLES.map((role) => (
                        <option key={role} value={role}>
                          {creditRoleLabel(role)}
                        </option>
                      ))}
                    </select>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      title={t('removeAuthor')}
                      aria-label={t('removeAuthor')}
                      onClick={() =>
                        setForm({
                          ...form,
                          credits: form.credits.filter((row) => row.key !== credit.key),
                        })
                      }
                    >
                      <X />
                    </Button>
                  </div>
                  {error && <p className="text-xs text-destructive">{error}</p>}
                </li>
              );
            })}
          </ul>
          <div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setForm({ ...form, credits: [...form.credits, newCreditRow()] })}
            >
              <Plus />
              {t('addAuthor')}
            </Button>
          </div>
        </div>
      </form>

      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" size="sm" onClick={onClose}>
          {t('common:cancel')}
        </Button>
        <Button type="submit" form="book-edit-form" size="sm" disabled={saving}>
          {t('common:save')}
        </Button>
      </div>
      {coverOpen && <CoverEditorDialog entry={entry} onClose={() => setCoverOpen(false)} />}
    </Dialog>
  );
}

/** A labelled row of the form's grid, with its error message underneath. */
function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: (props: { id: string; 'aria-invalid'?: true }) => ReactNode;
}) {
  const id = useId();
  return (
    <>
      <label htmlFor={id} className="whitespace-nowrap">
        {label}
      </label>
      <div className="flex flex-col gap-0.5">
        {children({ id, ...(error ? { 'aria-invalid': true } : {}) })}
        {error && <p className="text-xs text-destructive">{error}</p>}
      </div>
    </>
  );
}
