// Monta el panel de administración dentro de la vista previa, aislado en un Shadow DOM
// para que sus estilos no se mezclen con los de la tienda.
const host = document.createElement('div');
host.id = 'adminHost';
host.hidden = true;
host.setAttribute('role', 'dialog');
host.setAttribute('aria-label', 'Panel de administración');
document.body.appendChild(host);
const root = host.attachShadow({ mode: 'open' });
root.innerHTML = `<style>${window.__ADMIN_CSS}
:host { position: fixed; inset: 0; z-index: 300; overflow: auto; background: var(--bg); padding-top: env(safe-area-inset-top, 0px); }
.demo-flag { position: fixed; z-index: 40; left: 50%; transform: translateX(-50%); bottom: calc(14px + env(safe-area-inset-bottom, 0px)); display: flex; gap: 10px; align-items: center; background: var(--ink); color: var(--panel); padding: 7px 8px 7px 14px; border-radius: 999px; font-size: 12px; box-shadow: 0 6px 20px rgba(0,0,0,.18); white-space: nowrap; }
.demo-flag button { background: color-mix(in srgb, var(--panel) 18%, transparent); color: var(--panel); border-radius: 999px; padding: 4px 10px; font-size: 12px; }
</style><div class="admin-shell">${window.__ADMIN_HTML}</div>
<div class="demo-flag">Vista previa · datos de ejemplo <button id="demoBack">Volver a la tienda</button><button id="demoReset">Reiniciar datos</button></div>`;

function close(logout) {
  host.hidden = true;
  document.body.style.overflow = '';
  if (logout) window.__SAMADHI_API('/api/auth/logout', { method: 'POST', body: {} }).then(() => window.dispatchEvent(new Event('samadhi-session')));
}
root.getElementById('demoBack').onclick = () => close(false);
root.getElementById('demoReset').onclick = () => { window.__SAMADHI_RESET(); location.reload(); };

window.__ADMIN_EMBED = {
  root,
  manualBoot: true,
  api: (path, opts) => window.__SAMADHI_ADMIN_API(path, opts),
  exit: (logout) => close(logout),
  scrollTop: () => { host.scrollTop = 0; },
  link(href) {
    if (href === '/' || href.startsWith('/#tienda')) { close(false); return ''; }
    if (href.startsWith('/#p/')) { close(false); window.dispatchEvent(new CustomEvent('samadhi-open', { detail: { slug: href.slice(4) } })); return ''; }
    if (href.includes('/label')) return 'Vista previa: en la tienda publicada se abre la etiqueta de Andreani en PDF para imprimir.';
    if (href.includes('orders.csv')) return 'Vista previa: en la tienda publicada se descarga la planilla de pedidos.';
    return '';
  },
};
window.__SAMADHI_OPEN_ADMIN = () => {
  host.hidden = false;
  host.scrollTop = 0;
  document.body.style.overflow = 'hidden';
  window.__adminBoot();
};
