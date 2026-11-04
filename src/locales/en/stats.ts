// The statistics page: library totals and reading history by week, month or year.
export default {
  title: 'Statistics',
  intro: 'Your library and your reading. Books finished and time spent reading are recorded from now on.',
  loadFailed: 'The statistics could not be loaded.',
  totals: {
    books: 'Books',
    size: 'Library size',
    read: 'Books read',
    time: 'Reading time',
  },
  period: {
    label: 'Group by',
    week: 'Week',
    month: 'Month',
    year: 'Year',
  },
  charts: {
    title: 'Statistics by period',
    aria: 'Books read, books in the library and reading time per {{period}}',
    scaleNote: 'Each statistic is scaled to its own tallest bar; hover a group of bars for the exact values.',
    booksRead: 'Books read',
    time: 'Reading time',
    libraryGrowth: 'Books in the library',
    libraryGrowthNote: 'Counted from the date each book was added; books removed since are not included.',
    empty: 'Nothing recorded for this period yet.',
    periodWeek: 'week',
    periodMonth: 'month',
    periodYear: 'year',
  },
  duration: {
    minutes: '{{count}} min',
    hours: '{{count}} h',
    hoursMinutes: '{{hours}} h {{minutes}} min',
  },
  barBooks_one: '{{count}} book',
  barBooks_other: '{{count}} books',
};
