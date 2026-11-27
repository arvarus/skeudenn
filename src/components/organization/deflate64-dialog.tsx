import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import type { ActionDialogProps } from '@/components/organization/simple-run-dialogs';
import { RunDialog, RunReport } from '@/components/run-dialog';
import { Button } from '@/components/ui/button';
import { useRun } from '@/hooks/use-run';
import type { ConvertDeflate64Result, Deflate64CountResult } from '@/shared/library';

/** Where the dialog is: before the check, after it (with the books found), or at the end of either step. */
type Stage =
  | { name: 'intro' }
  | { name: 'found'; count: number }
  | { name: 'report'; cancelled: boolean; summary: string[]; problems: string[] };

/**
 * "Réparer les CBZ Deflate64", in two runs inside the same {@link RunDialog}: the check (it opens every CBZ
 * of the library) says how many use the Deflate64 compression, then the conversion rewrites them. Both
 * can be stopped; a stopped check offers nothing to convert.
 */
export function Deflate64Dialog({ onClose }: ActionDialogProps) {
  const { t } = useTranslation('settings', { keyPrefix: 'library' });
  const { t: tCommon } = useTranslation('common');
  const run = useRun();
  const [stage, setStage] = useState<Stage>({ name: 'intro' });
  const [running, setRunning] = useState<'check' | 'convert'>('check');
  const [error, setError] = useState<string | null>(null);

  const check = async () => {
    setError(null);
    setRunning('check');
    let answer: Deflate64CountResult;
    try {
      answer = await run.start(() => window.skeudenn.library.countDeflate64());
    } catch {
      setError(tCommon('run.failed'));
      return;
    }
    if (answer.status === 'error') setError(answer.message);
    else if (answer.status === 'cancelled') setStage({ name: 'report', cancelled: true, summary: [t('convertDeflate64CheckStopped')], problems: [] });
    else if (answer.count === 0) setStage({ name: 'report', cancelled: false, summary: [t('convertDeflate64None')], problems: [] });
    else setStage({ name: 'found', count: answer.count });
  };

  const convert = async () => {
    setError(null);
    setRunning('convert');
    let answer: ConvertDeflate64Result;
    try {
      answer = await run.start(() => window.skeudenn.library.convertDeflate64());
    } catch {
      setError(tCommon('run.failed'));
      return;
    }
    if (answer.status === 'error') setError(answer.message);
    else
      setStage({
        name: 'report',
        cancelled: answer.cancelled,
        summary: [t('convertDeflate64Done', { count: answer.converted })],
        problems: answer.failed > 0 ? [t('convertDeflate64Failed', { count: answer.failed })] : [],
      });
  };

  return (
    <RunDialog
      title={t('actions.convertDeflate64.title')}
      description={t('convertDeflate64Hint')}
      run={run}
      progressLabel={running === 'check' ? t('convertDeflate64Checking') : t('convertDeflate64Running')}
      error={error}
      onClose={onClose}
      actions={
        stage.name === 'intro' ? (
          <Button onClick={() => void check()}>{t('convertDeflate64Check')}</Button>
        ) : stage.name === 'found' ? (
          <Button onClick={() => void convert()}>{t('convertDeflate64Action')}</Button>
        ) : undefined
      }
    >
      {stage.name === 'intro' && <p className="text-sm">{t('convertDeflate64CheckIntro')}</p>}
      {stage.name === 'found' && <p className="text-sm">{t('convertDeflate64Found', { count: stage.count })}</p>}
      {stage.name === 'report' && <RunReport cancelled={stage.cancelled} summary={stage.summary} problems={stage.problems} />}
    </RunDialog>
  );
}
