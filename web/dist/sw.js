// Service worker: guarda a "casca" do app para abrir na hora — inclusive quando o servidor gratuito está dormindo.
// Dados (/api) nunca ficam em cache aqui: sempre vêm da rede, para não mostrar votação velha como se fosse atual.
const VERSION = 'v2';
const SHELL = `radar-shell-${VERSION}`;
const ASSETS = `radar-assets-${VERSION}`;
// só guarda páginas que vieram do próprio app (e não a página de espera da hospedagem)
const isOurs = (res) => res && res.ok && res.headers.get('x-app') === 'radar-legislativo';

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(SHELL)
      .then(async (c) => {
        const res = await fetch('/', { cache: 'no-cache' });
        if (isOurs(res)) await c.put('/', res);
        await c.addAll(['/manifest.webmanifest', '/icons/icon.svg']).catch(() => {});
      })
      .catch(() => {})
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => ![SHELL, ASSETS].includes(k)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

function refreshShell() {
  return fetch('/', { cache: 'no-cache' }).then((res) => {
    if (isOurs(res)) return caches.open(SHELL).then((c) => c.put('/', res.clone())).then(() => res);
    return res;
  });
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;
  if (url.pathname.startsWith('/api/') || url.pathname === '/healthz') return;

  if (req.mode === 'navigate') {
    // abre na hora com a casca guardada e atualiza em segundo plano
    e.respondWith(
      caches.match('/').then((hit) => {
        const net = refreshShell();
        if (hit) { e.waitUntil(net.catch(() => {})); return hit; }
        return net.catch(() => new Response('Sem conexão.', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } }));
      }),
    );
    return;
  }
  if (url.pathname.startsWith('/assets/') || url.pathname.startsWith('/icons/')) {
    e.respondWith(
      caches.match(req).then((hit) => hit || fetch(req).then((res) => {
        if (res.ok && !(res.headers.get('content-type') || '').includes('text/html')) { const copy = res.clone(); caches.open(ASSETS).then((c) => c.put(req, copy)); }
        return res;
      })),
    );
  }
});
