export function updatePuzzleLinks(date, view = new URLSearchParams(location.search).get('view')) {
  const hasPuzzleDate = /^(?:practice|\d{4}-\d{2}-\d{2})$/.test(date || '');
  const isTest = new URLSearchParams(location.search).has('test');
  for (const link of document.querySelectorAll('a[href]')) {
    const url = new URL(link.href);
    if (url.origin !== location.origin) continue;
    if (!link.hasAttribute('data-puzzle-return') && !['about.html', 'privacy.html', 'app-privacy.html'].includes(url.pathname.split('/').at(-1))) continue;
    if (hasPuzzleDate) url.searchParams.set('date', date);
    else url.searchParams.delete('date');
    if (view === 'home') url.searchParams.set('view', 'home');
    else url.searchParams.delete('view');
    if (isTest) url.searchParams.set('test', '1');
    link.href = url.href;
  }
}

updatePuzzleLinks(new URLSearchParams(location.search).get('date'));
