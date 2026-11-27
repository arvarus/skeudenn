import { Plus, X } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { LanguageFlag } from '@/components/language-flag';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { BOOK_LANGUAGES, type CreditRow, newCreditRow } from '@/lib/book-edit';
import {
  BULK_FIELDS,
  type BulkCurrent,
  type BulkField,
  type BulkForm,
  bulkCurrent,
  bulkToUpdate,
  emptyBulkForm,
  validateBulkForm,
} from '@/lib/book-bulk-edit';
import { creditRoleLabel, reviewFieldLabel } from '@/lib/metadata-review';
import { cn, formatLanguage } from '@/lib/utils';
import { CREDIT_ROLES, type CreditRole, type LibraryEntry } from '@/shared/library';

const INPUT_CLASS =
  'h-8 rounded-md border bg-background px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 aria-invalid:border-destructive disabled:opacity-50';

/**
 * Edits several books at once: for each field, the value the books hold now, a box to change it and
 * the new value. Only the ticked fields are written, the same way on every book.
 */
export function BookBulkEditDialog({ entries, onClose }: { entries: readonly LibraryEntry[]; onClose: () => void }) {
  const { t } = useTranslation(['bookEdit', 'common']);
  const [current] = useState(() => bulkCurrent(entries));
  const [form, setForm] = useState<BulkForm>(() => emptyBulkForm(current));
  const [submitted, setSubmitted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);
  const errors = validateBulkForm(form);
  const shown = submitted ? errors : {};
  const values = form.values;

  const setValues = (patch: Partial<BulkForm['values']>) => setForm({ ...form, values: { ...values, ...patch } });
  const toggle = (field: BulkField) => {
    const enabled = new Set(form.enabled);
    if (!enabled.delete(field)) enabled.add(field);
    setForm({ ...form, enabled });
  };
  const setCredit = (key: string, patch: Partial<CreditRow>) =>
    setValues({
      credits: values.credits.map((row) => (row.key === key ? { ...row, ...patch } : row)),
    });

  const languages =
    values.language && !BOOK_LANGUAGES.includes(values.language)
      ? [values.language, ...BOOK_LANGUAGES]
      : BOOK_LANGUAGES;

  const save = async () => {
    setSubmitted(true);
    if (Object.keys(errors).length > 0 || form.enabled.size === 0) return;
    setSaving(true);
    setSaveFailed(false);
    try {
      await window.skeudenn.library.updateMetadataMany(
        entries.map((entry) => entry.id),
        bulkToUpdate(form),
      );
    } catch {
      // Refused or failed: the dialog stays open with what was typed, and says so.
      setSaveFailed(true);
      setSaving(false);
      return;
    }
    setSaving(false);
    onClose();
  };

  const text = (field: 'series' | 'volume' | 'releaseDate', className: string, placeholder?: string) => (
    <input
      aria-label={t('bulk.newValue', { field: reviewFieldLabel(field) })}
      aria-invalid={shown[field as 'releaseDate'] ? true : undefined}
      placeholder={placeholder}
      disabled={!form.enabled.has(field)}
      className={cn(INPUT_CLASS, className)}
      value={values[field]}
      onChange={(event) => setValues({ [field]: event.target.value })}
    />
  );

  const row = (
    field: BulkField,
    content: {
      current: React.ReactNode;
      next: React.ReactNode;
      error?: string;
    },
  ) => (
    <tr key={field} className="border-t align-top">
      <td className="py-2 pr-3">
        <label className="flex cursor-pointer items-center gap-2 whitespace-nowrap">
          <input type="checkbox" className="size-4" checked={form.enabled.has(field)} onChange={() => toggle(field)} />
          {field === 'credits' ? t('authors') : reviewFieldLabel(field)}
        </label>
      </td>
      <td className="py-2 pr-3 text-muted-foreground">{content.current}</td>
      <td className="py-2">
        {content.next}
        {content.error && <p className="text-xs text-destructive">{content.error}</p>}
      </td>
    </tr>
  );

  return (
    <Dialog
      open
      onOpenChange={(open) => !open && onClose()}
      title={t('bulk.title')}
      description={t('bulk.description', { count: entries.length })}
      className="max-w-3xl"
    >
      <form
        id="book-bulk-edit-form"
        className="flex min-h-0 flex-1 flex-col overflow-y-auto"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
      >
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-muted-foreground">
              <th className="pb-1 font-medium">{t('bulk.field')}</th>
              <th className="pb-1 font-medium">{t('bulk.current')}</th>
              <th className="pb-1 font-medium">{t('bulk.after')}</th>
            </tr>
          </thead>
          <tbody>
            {BULK_FIELDS.map((field) => {
              switch (field) {
                case 'series':
                case 'volume':
                  return row(field, {
                    current: currentText(current[field], t('bulk.mixed')),
                    next: text(
                      field,
                      field === 'volume' ? 'w-32' : 'w-full',
                      field === 'volume' ? t('volumePlaceholder') : undefined,
                    ),
                  });
                case 'releaseDate':
                  return row(field, {
                    current: currentText(current.releaseDate, t('bulk.mixed')),
                    next: text('releaseDate', 'w-56', t('datePlaceholder')),
                    error: shown.releaseDate,
                  });
                case 'language':
                  return row(field, {
                    current: current.language.mixed
                      ? t('bulk.mixed')
                      : current.language.value
                        ? formatLanguage(current.language.value)
                        : '—',
                    next: (
                      <div className="flex items-center gap-2">
                        <LanguageFlag code={values.language} className="h-4" />
                        <select
                          aria-label={t('bulk.newValue', {
                            field: reviewFieldLabel('language'),
                          })}
                          disabled={!form.enabled.has('language')}
                          className={cn(INPUT_CLASS, 'w-56')}
                          value={values.language}
                          onChange={(event) => setValues({ language: event.target.value })}
                        >
                          <option value="">—</option>
                          {languages.map((code) => (
                            <option key={code} value={code}>
                              {formatLanguage(code)} ({code})
                            </option>
                          ))}
                        </select>
                      </div>
                    ),
                  });
                case 'credits':
                  return row(field, {
                    current: creditsText(current, t('bulk.mixed')),
                    next: (
                      <CreditsEditor
                        rows={values.credits}
                        disabled={!form.enabled.has('credits')}
                        errors={shown.credits}
                        onChange={setCredit}
                        onRemove={(key) =>
                          setValues({
                            credits: values.credits.filter((r) => r.key !== key),
                          })
                        }
                        onAdd={() =>
                          setValues({
                            credits: [...values.credits, newCreditRow()],
                          })
                        }
                      />
                    ),
                  });
              }
            })}
          </tbody>
        </table>
        <p className="mt-3 text-xs text-muted-foreground">{t('bulk.hint')}</p>
      </form>
      {saveFailed && (
        <p role="alert" className="text-sm text-destructive">
          {t('bulk.saveFailed')}
        </p>
      )}

      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" size="sm" onClick={onClose}>
          {t('common:cancel')}
        </Button>
        <Button type="submit" form="book-bulk-edit-form" size="sm" disabled={saving || form.enabled.size === 0}>
          {t('bulk.apply', { count: entries.length })}
        </Button>
      </div>
    </Dialog>
  );
}

function currentText(value: { mixed: true } | { mixed: false; value: string }, mixed: string): string {
  if (value.mixed) return mixed;
  return value.value || '—';
}

function creditsText(current: BulkCurrent, mixed: string): string {
  if (current.credits.mixed) return mixed;
  if (current.credits.value.length === 0) return '—';
  return current.credits.value.map((c) => `${c.firstName} ${c.lastName}`.trim()).join(', ');
}

function CreditsEditor({
  rows,
  disabled,
  errors,
  onChange,
  onRemove,
  onAdd,
}: {
  rows: CreditRow[];
  disabled: boolean;
  errors?: Record<string, string>;
  onChange: (key: string, patch: Partial<CreditRow>) => void;
  onRemove: (key: string) => void;
  onAdd: () => void;
}) {
  const { t } = useTranslation('bookEdit');
  return (
    <div className="flex flex-col gap-1">
      {rows.map((credit) => (
        <div key={credit.key} className="flex flex-col gap-0.5">
          <div className="flex items-center gap-2">
            <input
              aria-label={t('firstName')}
              placeholder={t('firstName')}
              disabled={disabled}
              className={cn(INPUT_CLASS, 'w-32')}
              value={credit.firstName}
              onChange={(event) => onChange(credit.key, { firstName: event.target.value })}
            />
            <input
              aria-label={t('lastName')}
              placeholder={t('lastNamePlaceholder')}
              aria-invalid={errors?.[credit.key] ? true : undefined}
              disabled={disabled}
              className={cn(INPUT_CLASS, 'w-40')}
              value={credit.lastName}
              onChange={(event) => onChange(credit.key, { lastName: event.target.value })}
            />
            <select
              aria-label={t('role')}
              disabled={disabled}
              className={cn(INPUT_CLASS, 'w-28')}
              value={credit.role}
              onChange={(event) => onChange(credit.key, { role: event.target.value as CreditRole })}
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
              disabled={disabled}
              title={t('removeAuthor')}
              aria-label={t('removeAuthor')}
              onClick={() => onRemove(credit.key)}
            >
              <X />
            </Button>
          </div>
          {errors?.[credit.key] && <p className="text-xs text-destructive">{errors[credit.key]}</p>}
        </div>
      ))}
      <div>
        <Button type="button" variant="outline" size="sm" disabled={disabled} onClick={onAdd}>
          <Plus />
          {t('addAuthor')}
        </Button>
      </div>
    </div>
  );
}
