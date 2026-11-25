import { useId } from 'react';

/**
 * The checkbox of a boolean setting on the settings pages: a checkbox with its label beside it and,
 * when given, a `hint` underneath (the checkbox's accessible description). Controlled: it shows
 * `checked` and reports the new value through `onChange`, which the page writes with `useSettings()`.
 */
export function SettingCheckbox({
  label,
  hint,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
}) {
  const id = useId();
  const hintId = `${id}-hint`;
  const box = (
    <div className="flex items-center gap-2">
      <input
        id={id}
        type="checkbox"
        checked={checked}
        disabled={disabled}
        aria-describedby={hint ? hintId : undefined}
        onChange={(event) => onChange(event.target.checked)}
      />
      <label htmlFor={id} className="text-sm">
        {label}
      </label>
    </div>
  );
  if (!hint) return box;
  return (
    <div className="flex flex-col gap-1">
      {box}
      <p id={hintId} className="text-sm text-muted-foreground">
        {hint}
      </p>
    </div>
  );
}
