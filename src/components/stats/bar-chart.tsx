import { useTranslation } from 'react-i18next';

/** One kind of statistic drawn by the chart: a legend entry and a bar color. */
export interface BarChartSeries {
  key: string;
  /** Name shown in the legend and in the tooltips. */
  label: string;
  /** Tailwind `fill-*` class of the series' bars and legend swatch. */
  fillClass: string;
}

/** The value of one series for one period. */
export interface BarChartValue {
  value: number;
  /** Shown in the tooltip of the bar, e.g. "3 books" or "2 h 10 min". */
  valueLabel: string;
}

/** One group of bars: a period, with its label under the axis and one value per series. */
export interface BarChartDatum {
  key: string;
  label: string;
  /** Values by series key; a series without an entry counts as nothing. */
  values: Record<string, BarChartValue>;
}

/** Height of the bars' area; the tallest bar of each series fills it. */
const PLOT_HEIGHT = 120;
/** Width of one bar, and of the gap left around a group. */
const BAR_WIDTH = 14;
const GROUP_PADDING = 8;

/**
 * A grouped bar chart drawn in SVG: one group of bars per period, one bar per series. The series
 * don't share a unit (books, seconds), so each is scaled to its own tallest bar and the exact
 * values are in the tooltips. A period with nothing keeps its slot so the time axis has no gaps.
 * `ariaLabel` describes the chart as a whole.
 */
export function BarChart({
  data,
  series,
  ariaLabel,
}: {
  data: BarChartDatum[];
  series: BarChartSeries[];
  ariaLabel: string;
}) {
  const { t } = useTranslation('stats');
  const maxima = new Map(
    series.map((entry) => [entry.key, Math.max(...data.map((datum) => datum.values[entry.key]?.value ?? 0), 0)]),
  );
  const hasData = [...maxima.values()].some((max) => max > 0);

  const slot = series.length * BAR_WIDTH + 2 * GROUP_PADDING;
  const width = data.length * slot;
  const height = PLOT_HEIGHT + 30;
  return (
    <div className="flex flex-col gap-2">
      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        {series.map((entry) => (
          <li key={entry.key} className="flex items-center gap-1.5">
            <svg width={10} height={10} aria-hidden="true">
              <rect width={10} height={10} rx={2} className={entry.fillClass} />
            </svg>
            {entry.label}
          </li>
        ))}
      </ul>
      {!hasData ? (
        <p className="py-6 text-sm text-muted-foreground">{t('charts.empty')}</p>
      ) : (
        <div className="overflow-x-auto">
          <svg role="img" aria-label={ariaLabel} viewBox={`0 0 ${width} ${height}`} className="h-auto w-full min-w-[480px]">
            {data.map((datum, index) => {
              const x = index * slot;
              return (
                <g key={datum.key}>
                  <title>
                    {[datum.label, ...series.map((entry) => `${entry.label}: ${datum.values[entry.key]?.valueLabel ?? '0'}`)].join(
                      '\n',
                    )}
                  </title>
                  {series.map((entry, seriesIndex) => {
                    const value = datum.values[entry.key]?.value ?? 0;
                    const max = maxima.get(entry.key) ?? 0;
                    if (value <= 0 || max <= 0) return null;
                    const barHeight = Math.max((value / max) * PLOT_HEIGHT, 1);
                    return (
                      <rect
                        key={entry.key}
                        x={x + GROUP_PADDING + seriesIndex * BAR_WIDTH + 1}
                        y={10 + PLOT_HEIGHT - barHeight}
                        width={BAR_WIDTH - 2}
                        height={barHeight}
                        rx={2}
                        className={entry.fillClass}
                      />
                    );
                  })}
                  <text x={x + slot / 2} y={height - 6} textAnchor="middle" className="fill-muted-foreground text-[9px]">
                    {datum.label}
                  </text>
                </g>
              );
            })}
            <line x1={0} x2={width} y1={10 + PLOT_HEIGHT} y2={10 + PLOT_HEIGHT} className="stroke-border" />
          </svg>
        </div>
      )}
    </div>
  );
}
