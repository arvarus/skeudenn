// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { SettingCheckbox } from './setting-checkbox';

afterEach(cleanup);

describe('SettingCheckbox', () => {
  it('names the checkbox by its label and reflects the value', () => {
    render(<SettingCheckbox label="Write the .nfo" checked onChange={() => undefined} />);
    const box = screen.getByRole('checkbox', { name: 'Write the .nfo' });
    expect(box).toHaveProperty('checked', true);
    expect(box.getAttribute('aria-describedby')).toBeNull();
  });

  it('links the hint as the description', () => {
    render(<SettingCheckbox label="Covers" hint="Beside the comic" checked={false} onChange={() => undefined} />);
    const box = screen.getByRole('checkbox', { name: 'Covers' });
    const hintId = box.getAttribute('aria-describedby');
    expect(hintId).toBeTruthy();
    expect(document.getElementById(hintId!)?.textContent).toBe('Beside the comic');
  });

  it('calls onChange with the new value', () => {
    const onChange = vi.fn();
    const { rerender } = render(<SettingCheckbox label="Stats" checked={false} onChange={onChange} />);
    fireEvent.click(screen.getByRole('checkbox', { name: 'Stats' }));
    expect(onChange).toHaveBeenLastCalledWith(true);
    rerender(<SettingCheckbox label="Stats" checked onChange={onChange} />);
    fireEvent.click(screen.getByRole('checkbox', { name: 'Stats' }));
    expect(onChange).toHaveBeenLastCalledWith(false);
  });

  it('can be disabled', () => {
    render(<SettingCheckbox label="Empty the trash" checked={false} disabled onChange={() => undefined} />);
    // jsdom still dispatches a click on a disabled input, so only the property is checked.
    expect(screen.getByRole('checkbox', { name: 'Empty the trash' })).toHaveProperty('disabled', true);
  });
});
