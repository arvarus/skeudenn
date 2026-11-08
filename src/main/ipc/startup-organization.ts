import type { OrganizationOutcome } from '../../shared/library';

/**
 * What the library organization did with the comics of the resynchronization started at launch, kept
 * until a window takes it: no window asked for that run, so none awaits its result to offer the move
 * (`ask` mode) or say what was moved. The main process announces it; the sidebar of the first window to
 * take it asks the user, and a window still loading takes it when it starts. Only the latest is kept.
 */
export class StartupOrganization {
  private pending: OrganizationOutcome | null = null;

  /** `notify` tells the windows an outcome is waiting. */
  constructor(private readonly notify: () => void) {}

  /** Keeps `outcome` for a window, unless there is nothing to offer nor to say. */
  offer(outcome: OrganizationOutcome): void {
    if (outcome.pending === null && outcome.moved === 0 && outcome.failed === 0) return;
    this.pending = outcome;
    this.notify();
  }

  /** The waiting outcome, if any; it is handed out once, so a single window asks. */
  take(): OrganizationOutcome | null {
    const outcome = this.pending;
    this.pending = null;
    return outcome;
  }
}
