import { BookOpen, Square } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';

/**
 * Header button that switches between page-by-page and book reading without going to the settings:
 * an open book when the reader is page by page (click for book mode), a single page when it is in
 * book mode (click for page by page).
 */
export function ReadingModeButton({ mode, onClick }: { mode: 'single' | 'book'; onClick: () => void }) {
  const { t } = useTranslation('reader');
  return (
    <Button
      variant="ghost"
      size="icon-sm"
      onClick={onClick}
      title={mode === 'single' ? t('switchToBook') : t('switchToSingle')}
    >
      {mode === 'single' ? <BookOpen /> : <Square />}
    </Button>
  );
}
