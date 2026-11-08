/**
 * The "Step 2/5: looking through Comics" label of a resynchronization, shown by the sidebar and by
 * Paramètres › Organisation. Pure, so it can be tested without either.
 * @module
 */
import { t } from '@/shared/i18n';
import type { ResyncStep } from '@/shared/library';

/** The last segment of a path, `/data/Comics/` giving `Comics`, either separator. */
export function folderName(folder: string): string {
  const segments = folder.split(/[\\/]/).filter((segment) => segment !== '');
  return segments.at(-1) ?? folder;
}

/** The step's label, with its place among the run's steps: `Step 2/5: looking through Comics`. */
export function resyncStepLabel(step: ResyncStep): string {
  const name = t(`nav:syncSteps.${step.name}`, { folder: folderName(step.folder) });
  return t('nav:syncStep', { index: step.index, count: step.count, name });
}
