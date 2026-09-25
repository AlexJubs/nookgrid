await globalThis.nookgridReady;

const isLocalPreview = ['http:', 'https:'].includes(location.protocol) && ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);
if (globalThis.nookgridNative || isLocalPreview) {
  const game = document.getElementById('game-content');
  document.body.className = 'game-page';
  document.body.replaceChildren(game.content.cloneNode(true));
  await import('./app.mjs?v=20260925-streak');
} else if (window.self === window.top) {
  location.replace('https://apps.apple.com/app/id6813274587');
}
