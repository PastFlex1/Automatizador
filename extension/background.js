/**
 * MetaCloser CRM - Background Service Worker (Manifest V3)
 * 
 * Actúa como proxy entre los content scripts (que están sujetos a la CSP 
 * de WhatsApp/Facebook) y el servidor local en localhost:3000.
 * 
 * Los content scripts NO pueden hacer fetch a localhost directamente porque
 * WhatsApp/Facebook bloquea conexiones externas con su CSP.
 * Este background worker SÍ puede porque corre en contexto de extensión.
 */

const CRM_BASE = 'http://localhost:3000/api';

// Escucha mensajes de los content scripts
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type !== 'CRM_FETCH') return false;

  const { method = 'GET', endpoint, body } = message;
  const url = `${CRM_BASE}${endpoint}`;

  const options = {
    method,
    headers: { 'Content-Type': 'application/json' },
  };
  if (body && method !== 'GET') {
    options.body = JSON.stringify(body);
  }

  fetch(url, options)
    .then(async (res) => {
      let data;
      try { data = await res.json(); } catch { data = { success: false, error: 'Invalid JSON' }; }
      sendResponse({ ok: res.ok, status: res.status, data });
    })
    .catch((err) => {
      // CRM server offline — return graceful fallback
      sendResponse({ ok: false, status: 0, error: err.message, offline: true });
    });

  return true; // Mantener el canal abierto para respuesta asíncrona
});

// Log when service worker activates
self.addEventListener('activate', () => {
  console.log('[MetaCloser BG] Service Worker activado v1.1.0');
});
