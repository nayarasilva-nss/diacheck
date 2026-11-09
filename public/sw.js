// Service worker mínimo: deixa o app instalável e mostra um aviso quando
// não há internet. Não guarda dados de checklists (são da sessão de cada pessoa).
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));
self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.mode !== "navigate") return;
  event.respondWith(
    fetch(req).catch(
      () =>
        new Response(
          '<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>DiaCheck</title><body style="margin:0;min-height:100vh;display:grid;place-items:center;background:#0d1b2a;color:#fff;font-family:system-ui,sans-serif;text-align:center;padding:24px"><div><h1 style="font-size:22px">Sem internet</h1><p style="opacity:.8">Conecte-se e abra o DiaCheck de novo.</p></div></body></html>',
          { headers: { "Content-Type": "text/html; charset=utf-8" } },
        ),
    ),
  );
});
