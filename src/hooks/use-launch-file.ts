/**
 * Opening the comic the operating system asked for.
 * @module
 */
import { useNavigate } from '@tanstack/react-router';
import { useEffect } from 'react';

/**
 * Opens in the reader the comic the operating system asked for (a double click in the file
 * explorer, "Open with…", a second launch with a file). The main process offers it as a token: the
 * hook takes it at start-up, for a launch that began with the file, and whenever the main process
 * says another is waiting.
 */
export function useLaunchFile(): void {
  const navigate = useNavigate();
  useEffect(() => {
    const open = () => {
      void window.skeudenn.app.takeLaunchFile().then((token) => {
        if (token) void navigate({ to: '/reader', search: { book: token } });
      });
    };
    open();
    return window.skeudenn.app.onLaunchFile(open);
  }, [navigate]);
}
