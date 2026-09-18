export function updatePuzzleLinks(date) {
  const hasPuzzleDate = /^(?:practice|\d{4}-\d{2}-\d{2})$/.test(date || '');
  const isTest = new URLSearchParams(location.search).has('test');
  if (!hasPuzzleDate && !isTest) return;
  for (const link of document.querySelectorAll('a[href]')) {
    const url = new URL(link.href);
    if (url.origin !== location.origin) continue;
    if (!link.hasAttribute('data-puzzle-return') && !['about.html', 'privacy.html', 'app-privacy.html'].includes(url.pathname.split('/').at(-1))) continue;
    if (hasPuzzleDate) url.searchParams.set('date', date);
    if (isTest) url.searchParams.set('test', '1');
    link.href = url.href;
  }
}

updatePuzzleLinks(new URLSearchParams(location.search).get('date'));
