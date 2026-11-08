console.log('[MetaCloser CRM] Facebook Content Script v2 Loaded');

const CRM_API_BASE = 'http://localhost:3000/api';
const LS_KEY = 'mc_crm_state';
let activeAdProduct = '';


// ─── CSP-Safe Network Fetcher (Proxy through background.js or direct fetch) ───
function crmFetch(endpoint, method = 'GET', body = null) {
  return new Promise((resolve) => {
    try {
      if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
        chrome.runtime.sendMessage(
          { type: 'CRM_FETCH', endpoint, method, body },
          (response) => {
            if (chrome.runtime.lastError || !response) {
              directFetch(endpoint, method, body).then(resolve);
            } else {
              resolve(response);
            }
          }
        );
        return;
      }
    } catch (e) {}

    directFetch(endpoint, method, body).then(resolve);
  });
}

async function directFetch(endpoint, method = 'GET', body = null) {
  const url = `${CRM_API_BASE}${endpoint}`;
  const options = {
    method,
    headers: { 'Content-Type': 'application/json' }
  };
  if (body && method !== 'GET') {
    options.body = typeof body === 'string' ? body : JSON.stringify(body);
  }
  try {
    const res = await fetch(url, options);
    let data;
    try { data = await res.json(); } catch { data = null; }
    return { ok: res.ok, status: res.status, data };
  } catch (err) {
    return { ok: false, status: 0, error: err.message, offline: true };
  }
}

// ─── LocalStorage helpers ───────────────────────────────────────────────────
function lsGet(key, fallback) {
  try {
    const raw = localStorage.getItem(LS_KEY);
    const obj = raw ? JSON.parse(raw) : {};
    return key in obj ? obj[key] : fallback;
  } catch { return fallback; }
}
function lsSet(key, value) {
  try {
    const raw = localStorage.getItem(LS_KEY);
    const obj = raw ? JSON.parse(raw) : {};
    obj[key] = value;
    localStorage.setItem(LS_KEY, JSON.stringify(obj));
  } catch {}
}

// Default catalog (always present as base - amecocinas.com & APM Inox)
const DEFAULT_CATALOG = [
  { name: 'Cocina Industrial 2 Quemadores', price: '200', img: 'https://images.unsplash.com/photo-1556911220-e15b29be8c8f?auto=format&fit=crop&w=900&q=80', emoji: '🍳' },
  { name: 'Cocina Industrial 3 Quemadores', price: '295', img: 'https://images.unsplash.com/photo-1556911220-e15b29be8c8f?auto=format&fit=crop&w=900&q=80', emoji: '🔥' },
  { name: 'Estufa 4 Quemadores c/ Horno', price: '750', img: 'https://images.unsplash.com/photo-1556911220-e15b29be8c8f?auto=format&fit=crop&w=900&q=80', emoji: '🥘' },
  { name: 'Freidora 2 Canastas (20L Gas)', price: '450', img: 'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?auto=format&fit=crop&w=900&q=80', emoji: '🍟' },
  { name: 'Mesa de Trabajo Inox 1.5m', price: '150', img: 'https://images.unsplash.com/photo-1590794056226-79ef3a8147e1?auto=format&fit=crop&w=900&q=80', emoji: '🔪' },
  { name: 'Campana Extractora Pared 2m', price: '600', img: 'https://images.unsplash.com/photo-1584622650111-993a426fbf0a?auto=format&fit=crop&w=900&q=80', emoji: '💨' },
  { name: 'Horno Convección 4 Charolas', price: '1200', img: 'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?auto=format&fit=crop&w=900&q=80', emoji: '🥐' },
  { name: 'Plancha Gas Cold Rolled 1m', price: '390', img: 'https://images.unsplash.com/photo-1544025162-d76694265947?auto=format&fit=crop&w=900&q=80', emoji: '🍔' },
  { name: 'Asador en Acero Inoxidable c/ Tapa', price: '150', img: 'https://images.unsplash.com/photo-1544025162-d76694265947?auto=format&fit=crop&w=900&q=80', emoji: '🥩' },
  { name: 'Lavabo Inox 1 y 2 Pozos', price: 'Cotizar 09920350548', img: 'https://images.unsplash.com/photo-1584622650111-993a426fbf0a?auto=format&fit=crop&w=900&q=80', emoji: '🚰' },
  { name: 'Self Service 2, 3 y 4 Pozos', price: 'Cotizar 09920350548', img: 'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?auto=format&fit=crop&w=900&q=80', emoji: '🍲' },
];

function getCatalog() {
  const saved = lsGet('catalog', null);
  if (!saved || !Array.isArray(saved)) return [...DEFAULT_CATALOG];
  return saved;
}

function saveCatalog(cat) {
  lsSet('catalog', cat);
  try {
    fetch('http://localhost:3000/api/crm/products', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        products: cat.map((c, idx) => ({
          id: c.id || `prod_ext_${idx}`,
          name: c.name,
          price: parseFloat(c.price) || 0,
          currency: 'USD',
          category: c.category || 'Equipos Gastronómicos',
          imageUrl: c.img || '',
          tagline: c.emoji || '📦',
          description: c.name,
          features: ['Acero inoxidable de alta resistencia', 'Garantía de fábrica'],
          checkoutUrl: ''
        }))
      })
    }).catch(() => {});
  } catch (_) {}
}
function isSystemNoise(str) {
  const s = (str || '').toLowerCase().trim();
  return (
    !s ||
    s.includes('elegir un emoji') ||
    s.includes('elige un emoji') ||
    s.includes('mark as sold') ||
    s.includes('marcar como vendido') ||
    s.includes('marcar como agotado') ||
    s.includes('view buyer') ||
    s.includes('ver comprador') ||
    s.includes('more options') ||
    s.includes('más opciones') ||
    s.includes('enviar un me gusta') ||
    s.includes('send a like') ||
    s.includes('abrir chat con el título') ||
    s.includes('chat con el título') ||
    s.includes('abrir chat') ||
    s.includes('comentar como') ||
    s.includes('estás comentando') ||
    s.includes('estas comentando') ||
    s.includes('cambiar de cuenta') ||
    s.includes('cambiar a tu perfil') ||
    s.includes('toca una respuesta') ||
    s.includes('envía una respuesta') ||
    s.includes('respuesta rápida') ||
    s.includes('¿te interesa?') ||
    s.includes('lo estoy mirando') ||
    s.includes('lo siento, no') ||
    s.includes('esperando tu respuesta') ||
    s.includes('administrar página') ||
    s.includes('panel profesional') ||
    s.includes('datos personales') ||
    s.includes('estadísticas') ||
    s.includes('planificador') ||
    s.includes('monetización') ||
    s.includes('centro de anuncios') ||
    s.includes('meta one') ||
    s.includes('centro de clientes') ||
    s.includes('apm inox') ||
    s === 'marketplace' ||
    s === 'facebook' ||
    // Notification noise:
    s.includes('te etiquetó') ||
    s.includes('te etiqueto') ||
    s.includes('etiquetó a') ||
    s.includes('etiqueto a') ||
    s.includes('visualizaciones nuevas') ||
    s.includes('en un comentario') ||
    s.includes('en una foto') ||
    s.includes('en un video') ||
    s.includes('aprobaron tu solicitud') ||
    s.includes('solicitud para unirte') ||
    s.includes('dio la bienvenida') ||
    s.includes('le gustó tu') ||
    s.includes('reaccionó a tu') ||
    s.includes('compartió tu') ||
    s.includes('notificaciones anteriores') ||
    s.includes('marcar como leídas') ||
    s.includes('configuración de notificaciones') ||
    // Meta Business Suite noise phrases:
    s.includes('todos los mensajes') ||
    s.includes('comentarios de facebook') ||
    s.includes('comentarios de instagram') ||
    s.includes('conectar con instagram') ||
    s.includes('conectar con') ||
    s.includes('respuestas de anuncios') ||
    s.includes('asignar esta conversación') ||
    s.includes('asignar conversación') ||
    s.includes('assign this conversation') ||
    s.includes('este chat contiene una respuesta') ||
    s.includes('this chat contains a response') ||
    s.includes('respondió a un anuncio') ||
    s.includes('replied to an ad') ||
    s.includes('ver anuncio') ||
    s.includes('view ad') ||
    s.includes('responde en messenger') ||
    s.includes('responde en instagram') ||
    s.includes('reply in messenger') ||
    s.includes('reply in instagram') ||
    s.includes('escribe un mensaje') ||
    s.includes('escribe una respuesta') ||
    s.includes('type a message') ||
    s.includes('mensajes que esperan respuesta') ||
    s.includes('chats de este anuncio necesitan respuesta') ||
    s.startsWith('ad_id') ||
    s === 'no leídos' ||
    s === 'prioridad' ||
    s === 'administrar' ||
    s === 'buscar' ||
    s === 'messenger' ||
    s === 'instagram' ||
    s === 'whatsapp' ||
    /^\d{1,2}:\d{2}\s*(?:am|pm)?$/i.test(s)
  );
}

function isValidLeadName(name) {
  if (!name || typeof name !== 'string') return false;
  const clean = name.trim();
  if (clean.length < 2 || clean.length > 35) return false;
  const lower = clean.toLowerCase();
  const banned = [
    'elegir un emoji', 'elige un emoji', 'emoji',
    'mark as sold', 'marcar como vendido', 'marcar como agotado',
    'view buyer', 'ver comprador', 'more options', 'más opciones',
    'abrir chat con el título', 'chat con el título', 'abrir chat',
    'buenos días', 'buenas tardes', 'buenas noches', 'hola',
    'sí. ¿te interesa?', 'lo estoy mirando', 'lo siento',
    'tú:', 'you:', 'enviar', 'presiona enter', 'escribe',
    'marketplace', 'facebook', 'cliente', 'burbuja'
  ];
  if (banned.some(b => lower.includes(b))) return false;
  return true;
}

function isValidProductName(prod) {
  if (!prod || typeof prod !== 'string') return false;
  const clean = prod.trim();
  if (clean.length < 3) return false;
  const lower = clean.toLowerCase();
  const banned = [
    'mark as sold', 'marcar como vendido', 'marcar como agotado',
    'view buyer', 'ver comprador', 'more options', 'más opciones',
    'elegir un emoji', 'elige un emoji', 'enviar un me gusta', 'send a like'
  ];
  if (banned.some(b => lower === b || lower.includes(b))) return false;
  return true;
}

function cleanLeadName(name) {
  if (!name) return 'Cliente';
  let cleaned = name
    .replace(/^(?:abrir\s+chat\s+con\s+el\s+t[íi]tulo|el\s+t[íi]tulo|t[íi]tulo|cambiar\s+el\s+t[íi]tulo|chat\s+con|conversaci[oó]n\s+con|mensaje\s+de)\s+/i, '')
    .replace(/[\u00B7\u2022\u2013\u2014\-\|]\s*(?:en l[ií]nea|activo|hace|\d+\s*(?:min|h|d|sem)).*$/i, '')
    .replace(/\s+(?:est[aá]\s+esperando|respondi[oó]|envi[oó]).*$/i, '')
    .trim();

  if (!isValidLeadName(cleaned)) return 'Cliente';
  return cleaned || 'Cliente';
}

function extractChatHeader(container) {
  if (!container) return { buyer: '', product: '' };

  // 1. Look for explicit header elements: h2, [role="heading"], links inside top bar
  const headerCandidates = Array.from(container.querySelectorAll(
    'h2, [role="heading"], a[role="link"][href*="/messages/"], a[role="link"][href*="/marketplace/"], a[href*="/messages/t/"], a[href*="/marketplace/t/"], div[aria-label*="Chat con"], div[aria-label*="Conversación con"]'
  ));

  for (const h of headerCandidates) {
    const raw = (h.innerText || h.getAttribute('aria-label') || '').trim();
    if (!raw || isSystemNoise(raw)) continue;
    const cleanRaw = raw.replace(/^(?:Chat\s+con|Conversación\s+con)\s+/i, '');
    const sep = /[\u00B7\u2022\u2014\|]/; // Note: NOT '-' to prevent splitting product names like T-304
    if (sep.test(cleanRaw) && !cleanRaw.includes('$')) {
      const parts = cleanRaw.split(sep).map(p => p.trim()).filter(Boolean);
      if (parts.length >= 2) {
        const b = cleanLeadName(parts[0]);
        const p = parts.slice(1).join(' - ').trim();
        if (isValidLeadName(b) && isValidProductName(p)) {
          return { buyer: b, product: p };
        }
      }
    }
  }

  // 2. Scan top 10 lines of dialog container text
  const lines = (container.innerText || '').split('\n').map(l => l.trim()).filter(Boolean);
  for (const line of lines.slice(0, 10)) {
    if (isSystemNoise(line) || line.includes('$') || line.includes('· min') || /^\d{1,2}:\d{2}/.test(line)) continue;
    const sep = /[\u00B7\u2022\u2014\|]/;
    if (sep.test(line)) {
      const parts = line.split(sep).map(p => p.trim()).filter(Boolean);
      if (parts.length >= 2) {
        const b = cleanLeadName(parts[0]);
        const p = parts.slice(1).join(' - ').trim();
        if (isValidLeadName(b) && isValidProductName(p)) {
          return { buyer: b, product: p };
        }
      }
    }
  }

  // 3. Fallback: Marketplace price card: "$280 - Freidora importada 28 litros" or "$1 · Góndolas especiales"
  let prod = '';
  for (const line of lines.slice(0, 15)) {
    const m = line.match(/\$\s*\d+[\d.,]*\s*[·•\-\|]\s*([^\n\r]+)/);
    if (m && m[1]) {
      const cand = m[1].trim();
      if (isValidProductName(cand)) {
        prod = cand;
        break;
      }
    }
  }

  let buyer = '';
  for (const line of lines.slice(0, 8)) {
    if (
      !isSystemNoise(line) &&
      !line.includes('$') &&
      isValidLeadName(line)
    ) {
      buyer = cleanLeadName(line);
      if (buyer && buyer !== 'Cliente') break;
    }
  }

  return { buyer, product: prod };
}


// ─── Chat-only DOM helpers (never touch Marketplace listings) ───────────────
// Only conversation rows / inbox links. Marketplace item links & nav tabs are excluded
// because clicking them navigates to the listing instead of opening the chat.
// ─── Chat-only DOM helpers (never touch Marketplace listings) ───────────────
// Only conversation rows / inbox links. Marketplace item links, publication management,
// notification panels, and nav tabs are strictly excluded so Auto-Pilot never navigates to listings.
const CHAT_LIST_SELECTOR = [
  'a[href*="/latest/inbox/"]',
  'a[href*="/inbox/"]',
  'a[href*="/messages/t/"]',
  'a[href*="/marketplace/t/"]',
  'div[aria-label*="Chats"] div[role="row"]',
  'div[aria-label*="Conversaciones"] div[role="row"]',
  'div[aria-label*="Bandeja de entrada"] div[role="row"]',
  'div[aria-label*="Inbox"] div[role="row"]'
].join(', ');

function isListingOrNavNode(el) {
  if (!el) return true;

  // 1. Direct link or ancestor link inspection
  const link = el.tagName === 'A' ? el : el.closest('a[href]');
  const href = (link && link.getAttribute('href')) || '';
  if (href) {
    if (/\/marketplace\/(item|category|you|create|search|notifications|profile|buying|selling)/i.test(href)) return true;
    if (/\/marketplace\/?(\?|$)/i.test(href)) return true;
    if (/\/(groups|watch|events|gaming|pages|posts|photo|reel|stories)\//i.test(href)) return true;
  }

  // 2. Contains any publication / listing link inside (marketplace cards, product grids)
  if (el.querySelector && el.querySelector('a[href*="/marketplace/item/"], a[href*="/marketplace/you/"], a[href*="/marketplace/selling/"]')) {
    // Only allow if it's an active chat dialog with an editable textbox
    if (!el.querySelector('div[contenteditable="true"], div[role="textbox"]')) return true;
  }

  // 3. Notifications, Feed, or Publication Management containers
  if (el.closest('*[aria-label*="Notificaciones"], *[aria-label*="Notifications"], div[data-pagelet*="Notifications"]')) {
    return true;
  }

  // 4. Texts characteristic of seller publications / item management (never chats!)
  const text = (el.innerText || '').toLowerCase();
  if (
    text.includes('mis anuncios') ||
    text.includes('tus publicaciones') ||
    text.includes('marcar como agotado') ||
    text.includes('editar publicación') ||
    text.includes('renovar en marketplace') ||
    text.includes('promocionar publicación') ||
    text.includes('detalles del vendedor') ||
    text.includes('visualizaciones nuevas') ||
    text.includes('ver notificaciones') ||
    text.includes('crear publicación') ||
    text.includes('administrar publicaciones') ||
    text.includes('panel para vendedores') ||
    text.includes('retiro en la puerta')
  ) {
    return true;
  }

  // 5. Navigation bars (unless explicitly within an inbox or conversation list)
  if (!href.includes('/marketplace/t/') && !href.includes('/messages/t/') && !href.includes('/latest/inbox/')) {
    if (el.closest('div[role="navigation"]') && !el.closest('*[aria-label*="Chats"], *[aria-label*="Mensajes"], *[aria-label*="Messenger"], *[aria-label*="Bandeja de entrada"]')) {
      return true;
    }
  }

  return false;
}

// Minimized Messenger chat heads ("burbujitas") stacked at the bottom-right of facebook.com
// Minimized Messenger chat heads ("burbujitas") stacked at the bottom-right of facebook.com
function findChatBubbles() {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const seen = new Set();
  const bubbles = [];

  // ─── STRATEGY 1: Detect via Red Badges (Direct hit for unread messages like '6', '5') ───
  const allBadges = Array.from(document.querySelectorAll('span, div')).filter(el => {
    if (el.closest('#metacloser-crm-sidebar, #mc-fb-floating-bar')) return false;
    const txt = (el.innerText || '').trim();
    if (!/^\d{1,3}$/.test(txt)) return false;
    if (el.children.length > 0) return false;
    const r = el.getBoundingClientRect();
    if (r.width > 42 || r.height > 42) return false;
    if (r.right < vw - 140 || r.top < vh * 0.15 || r.bottom > vh) return false;
    return true;
  });

  allBadges.forEach(badge => {
    let container = badge.closest('div[role="button"], div[role="tab"], div[role="dialog"], a, div[tabindex="0"]') || 
                    badge.parentElement?.parentElement || badge.parentElement;
    if (!container) return;

    const r = container.getBoundingClientRect();
    const key = `${Math.round(r.left / 15)}_${Math.round(r.top / 15)}`;
    if (seen.has(key)) return;
    seen.add(key);

    const unread = parseInt(badge.innerText.trim(), 10) || 1;
    const label = (
      container.getAttribute('aria-label') ||
      container.getAttribute('title') ||
      container.parentElement?.getAttribute('aria-label') ||
      container.querySelector('img, image')?.getAttribute('alt') ||
      ''
    ).trim();

    let name = label, product = '';
    const sepRegex = /[\u00B7\u2022\u2013\u2014\-\|]/;
    if (sepRegex.test(label)) {
      const parts = label.split(sepRegex).map(p => p.trim()).filter(Boolean);
      if (parts.length >= 2) {
        name = parts[0];
        product = parts.slice(1).join(' - ');
      }
    }
    name = name.replace(/^Chat\s+con\s+/i, '').replace(/\s*\(\d+\)$/, '').trim();
    if (name.includes('no leídos') || name.includes('unread')) {
      name = name.replace(/\d+\s*(mensajes?\s*no\s*le[íi]dos?|unread\s*messages?)/i, '').trim();
    }

    bubbles.push({
      el: container,
      name: cleanLeadName(name || `Cliente Burbuja ${bubbles.length + 1}`),
      product: product || activeAdProduct || 'Equipo Inox Marketplace',
      unread,
      top: r.top,
      right: r.right
    });
  });

  // ─── STRATEGY 2: Detect circular chat heads / avatar buttons near the right edge ───
  const candidateSelectors = [
    'div[data-pagelet*="ChatTab"]',
    'div[data-pagelet*="Chat"]',
    'div[data-pagelet*="Dock"]',
    'div[role="tab"]',
    'div[role="button"][aria-label*="Chat"]',
    'div[role="button"][aria-label*="Conversación"]'
  ].join(', ');

  const nodes = Array.from(document.querySelectorAll(candidateSelectors));

  const edgeMedia = Array.from(document.querySelectorAll('img, image')).filter(m => {
    if (m.closest('#metacloser-crm-sidebar, #mc-fb-floating-bar')) return false;
    const r = m.getBoundingClientRect();
    return (r.width >= 32 && r.width <= 70 && r.height >= 32 && r.height <= 70 && r.right >= vw - 140 && r.top >= vh * 0.15 && r.bottom <= vh - 15);
  });

  edgeMedia.forEach(m => {
    const clickable = m.closest('div[role="button"], div[role="tab"], a[role="link"]') || m.parentElement;
    if (clickable && !nodes.includes(clickable)) nodes.push(clickable);
  });

  nodes.forEach(el => {
    if (el.closest('#metacloser-crm-sidebar, #mc-fb-floating-bar')) return;

    const r = el.getBoundingClientRect();
    if (r.right < vw - 140) return;
    if (r.top < vh * 0.15 || r.bottom > vh - 15) return;
    if (r.width < 28 || r.width > 90 || r.height < 28 || r.height > 90) return;

    // Ignore the "new message / pencil" button
    const aria = (el.getAttribute('aria-label') || '').toLowerCase();
    if (aria.includes('nuevo mensaje') || aria.includes('new message') || aria.includes('escribir mensaje')) return;
    if (el.querySelector('svg path[d*="M16.5 2.5"]') && !el.querySelector('img, image')) return;

    const key = `${Math.round(r.left / 15)}_${Math.round(r.top / 15)}`;
    if (seen.has(key)) return;
    seen.add(key);

    const label = (
      el.getAttribute('aria-label') ||
      el.getAttribute('title') ||
      el.parentElement?.getAttribute('aria-label') ||
      el.querySelector('img, image')?.getAttribute('alt') ||
      ''
    ).trim();

    let unread = 0;
    const badgeEl = Array.from(el.parentElement ? el.parentElement.querySelectorAll('span, div') : el.querySelectorAll('span, div')).find(child => {
      const t = (child.innerText || '').trim();
      return /^\d{1,3}$/.test(t) && child.children.length === 0;
    });
    if (badgeEl) {
      unread = parseInt(badgeEl.innerText.trim(), 10) || 0;
    }

    let name = label, product = '';
    const sepRegex = /[\u00B7\u2022\u2013\u2014\-\|]/;
    if (sepRegex.test(label)) {
      const parts = label.split(sepRegex).map(p => p.trim()).filter(Boolean);
      if (parts.length >= 2) {
        name = parts[0];
        product = parts.slice(1).join(' - ');
      }
    }
    name = name.replace(/^Chat\s+con\s+/i, '').replace(/\s*\(\d+\)$/, '').trim();
    if (name.includes('no leídos') || name.includes('unread')) {
      name = name.replace(/\d+\s*(mensajes?\s*no\s*le[íi]dos?|unread\s*messages?)/i, '').trim();
    }

    const cleanedN = cleanLeadName(name);
    // Ignore random divs that have 0 unread messages and no valid customer name
    if (unread <= 0 && (!isValidLeadName(cleanedN) || cleanedN === 'Cliente')) return;

    bubbles.push({
      el,
      name: cleanedN,
      product: product || activeAdProduct || 'Equipo Inox Marketplace',
      unread,
      top: r.top,
      right: r.right
    });
  });

  return bubbles.sort((a, b) => a.top - b.top);
}

// ─── Sidebar HTML ────────────────────────────────────────────────────────────
function buildCatalogHTML(catalog) {
  if (!catalog || catalog.length === 0) {
    return `<div style="text-align:center;padding:24px 10px;color:#94a3b8;font-size:0.75rem;">No tienes productos guardados. ¡Agrega uno con el formulario arriba o restaura el catálogo!</div>`;
  }
  return catalog.map((item, i) => `
    <div class="mc-cat-item" style="display:flex;align-items:center;gap:7px;background:linear-gradient(145deg, rgba(22,30,50,0.85), rgba(12,18,32,0.95));border:1px solid rgba(255,255,255,0.1);border-radius:10px;padding:8px 10px;margin-bottom:7px;box-shadow:0 3px 10px rgba(0,0,0,0.3);">
      <img src="${item.img}" style="width:40px;height:40px;border-radius:8px;object-fit:cover;flex-shrink:0;border:1px solid rgba(255,255,255,0.15);" onerror="this.style.display='none'">
      <div style="flex:1;min-width:0;">
        <div style="font-size:0.78rem;font-weight:700;color:#f8fafc;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;" title="${item.name}">${item.emoji || '📦'} ${item.name}</div>
        <div style="font-size:0.75rem;color:#10b981;font-weight:800;margin-top:2px;">$${item.price}</div>
      </div>
      <button type="button" class="mc-cat-select-btn mc-action-btn" data-index="${i}" style="padding:6px 9px;background:linear-gradient(135deg,#1d4ed8,#2563eb);color:#fff;border:none;border-radius:7px;font-size:0.72rem;font-weight:700;cursor:pointer;box-shadow:0 2px 8px rgba(37,99,235,0.35);">Usar</button>
      <button type="button" class="mc-cat-edit-btn mc-action-btn" data-index="${i}" style="padding:6px 9px;background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.18);color:#93c5fd;border-radius:7px;font-size:0.72rem;cursor:pointer;font-weight:700;" title="Editar nombre, precio, emoji o foto">✏️</button>
      <button type="button" class="mc-cat-delete-btn mc-action-btn" data-index="${i}" style="padding:6px 8px;background:rgba(239,68,68,0.15);border:1px solid rgba(239,68,68,0.3);color:#fca5a5;border-radius:7px;font-size:0.72rem;cursor:pointer;" title="Eliminar producto">✕</button>
    </div>
  `).join('');
}

// ─── Modal Positioning Anchored to Button ────────────────────────────────────
function positionModalNearButton(sidebar) {
  if (!sidebar) return;
  const bar = document.getElementById('mc-fb-floating-bar');
  if (!bar) return;

  const barRect = bar.getBoundingClientRect();
  const modalW = 490;
  const modalH = Math.min(730, window.innerHeight - 28);

  sidebar.style.width = `${modalW}px`;
  sidebar.style.height = `${modalH}px`;

  let targetLeft, targetTop;

  // Horizontal Alignment:
  // If button center is on the right half of the window, anchor right edges so modal flows leftwards
  if (barRect.left + barRect.width / 2 > window.innerWidth / 2) {
    targetLeft = barRect.right - modalW;
  } else {
    // If on left half, anchor left edges so modal flows rightwards
    targetLeft = barRect.left;
  }

  // Vertical Alignment:
  // If button is in bottom half of screen, pop modal ABOVE button
  if (barRect.top > window.innerHeight / 2) {
    targetTop = barRect.top - modalH - 12;
    if (targetTop < 12) targetTop = 12;
  } else {
    // If in top half of screen, pop modal BELOW button
    targetTop = barRect.bottom + 12;
    if (targetTop + modalH > window.innerHeight - 12) {
      targetTop = window.innerHeight - modalH - 12;
    }
  }

  // Safe clamping to screen viewport
  const minX = 12;
  const maxX = Math.max(12, window.innerWidth - modalW - 12);
  const minY = 12;
  const maxY = Math.max(12, window.innerHeight - modalH - 12);

  targetLeft = Math.max(minX, Math.min(targetLeft, maxX));
  targetTop = Math.max(minY, Math.min(targetTop, maxY));

  sidebar.style.left = `${Math.round(targetLeft)}px`;
  sidebar.style.top = `${Math.round(targetTop)}px`;
  sidebar.style.right = 'auto';
  sidebar.style.bottom = 'auto';
}

function injectSidebar() {
  if (document.getElementById('metacloser-crm-sidebar')) return;

  // Restore persisted values
  const savedProduct   = lsGet('product', 'Cocina Industrial 2 Quemadores');
  const savedPrice     = lsGet('price', '200');
  const savedCity      = lsGet('city', 'Quito');
  const savedImgUrl    = lsGet('activeImgUrl', 'https://images.unsplash.com/photo-1556911220-e15b29be8c8f?auto=format&fit=crop&w=900&q=80');
  const savedImgBadge  = lsGet('activeImgBadge', '✓ Foto Lista para Marketplace');
  const savedTab       = lsGet('activeTab', 'chat');
  const catalog        = getCatalog();
  const savedCampLeads = lsGet('camp_leads', 'Anaa | Góndolas especiales T-304');
  const savedCampDelay = lsGet('camp_delay', '12');
  const savedCampMsg   = lsGet('camp_message', 'Buenas tardes, estimada {nombre}. Mucho gusto en saludarle. Es un verdadero placer atenderle respecto a nuestras góndolas especiales en acero inoxidable T‑304, fabricadas con la más alta calidad y garantía de fábrica. Como somos fabricantes directos, cada cotización se elabora con precisión de taller según las medidas y especificaciones exactas que requiera su respetable negocio. Con el mayor agrado le invito a apreciar más modelos en nuestra página web: https://amecocinas.com/ . Para brindarle una propuesta ajustada, le agradecería nos indique sus dimensiones y número de unidades. También puede comunicarse directamente al 09920350548. Nuestro taller se encuentra en Calle 25 de Mayo 226, sector Cotocollao, frente al Club de Leones, donde con gusto le atenderemos. Quedo a su entera y grata disposición.');

  // Inject Theme Styles once
  // Inject Theme Styles once
  if (!document.getElementById('mc-luxury-styles')) {
    const styleEl = document.createElement('style');
    styleEl.id = 'mc-luxury-styles';
    styleEl.textContent = `
      @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@500;600;700;800;900&family=Plus+Jakarta+Sans:wght@400;500;600;700;800;900&display=swap');

      @keyframes mcModalIn {
        0% { opacity: 0; transform: scale(0.96) translateY(12px); }
        100% { opacity: 1; transform: scale(1) translateY(0); }
      }
      @keyframes mcPulseGreen {
        0% { box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.7); }
        70% { box-shadow: 0 0 0 9px rgba(16, 185, 129, 0); }
        100% { box-shadow: 0 0 0 0 rgba(16, 185, 129, 0); }
      }
      @keyframes mcPulseAmber {
        0% { box-shadow: 0 0 0 0 rgba(245, 158, 11, 0.7); }
        70% { box-shadow: 0 0 0 9px rgba(245, 158, 11, 0); }
        100% { box-shadow: 0 0 0 0 rgba(245, 158, 11, 0); }
      }

      #metacloser-crm-sidebar * {
        box-sizing: border-box;
        font-family: 'Plus Jakarta Sans', system-ui, -apple-system, sans-serif;
      }
      #metacloser-crm-sidebar ::-webkit-scrollbar {
        width: 6px;
        height: 6px;
      }
      #metacloser-crm-sidebar ::-webkit-scrollbar-track {
        background: transparent;
      }
      #metacloser-crm-sidebar ::-webkit-scrollbar-thumb {
        background: rgba(255, 255, 255, 0.16);
        border-radius: 10px;
      }
      #metacloser-crm-sidebar ::-webkit-scrollbar-thumb:hover {
        background: rgba(255, 255, 255, 0.32);
      }

      .mc-input-field {
        transition: border-color 0.2s ease, box-shadow 0.2s ease, background 0.2s ease;
      }
      .mc-input-field:focus {
        outline: none !important;
        border-color: #3b82f6 !important;
        box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.3) !important;
        background: rgba(15, 23, 42, 0.98) !important;
      }

      .mc-action-btn {
        transition: transform 0.15s cubic-bezier(0.16, 1, 0.3, 1), filter 0.15s ease, box-shadow 0.15s ease;
      }
      .mc-action-btn:hover {
        filter: brightness(1.08);
        transform: translateY(-1.5px);
      }
      .mc-action-btn:active {
        transform: translateY(0);
        filter: brightness(0.96);
      }

      .mc-nav-btn {
        flex: 1;
        padding: 8px 4px;
        background: transparent;
        color: #94a3b8;
        border: 1px solid transparent;
        border-radius: 10px;
        font-size: 0.72rem;
        font-weight: 700;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 3px;
        transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
        user-select: none;
        white-space: nowrap;
      }
      .mc-nav-btn:hover {
        color: #f8fafc;
        background: rgba(255, 255, 255, 0.06);
      }
      .mc-nav-btn.active {
        background: linear-gradient(135deg, rgba(37, 99, 235, 0.32), rgba(30, 64, 175, 0.45)) !important;
        color: #ffffff !important;
        border: 1px solid rgba(59, 130, 246, 0.55) !important;
        box-shadow: 0 4px 14px rgba(37, 99, 235, 0.3) !important;
      }

      .mc-tab-badge {
        background: rgba(37, 99, 235, 0.4);
        border: 1px solid rgba(96, 165, 250, 0.5);
        padding: 2px 7px;
        border-radius: 12px;
        font-size: 0.68rem;
        color: #dbeafe;
        font-weight: 800;
        line-height: 1;
      }

      .mc-header-icon-btn {
        width: 32px;
        height: 32px;
        border-radius: 9px;
        background: rgba(255, 255, 255, 0.06);
        border: 1px solid rgba(255, 255, 255, 0.1);
        color: #cbd5e1;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 0.95rem;
        cursor: pointer;
        text-decoration: none;
        transition: all 0.15s ease;
      }
      .mc-header-icon-btn:hover {
        background: rgba(37, 99, 235, 0.3);
        border-color: rgba(59, 130, 246, 0.5);
        color: #ffffff;
        transform: translateY(-1px);
      }
    `;
    document.head.appendChild(styleEl);
  }

  const sidebar = document.createElement('div');
  sidebar.id = 'metacloser-crm-sidebar';
  Object.assign(sidebar.style, {
    position: 'fixed',
    width: '490px',
    height: `${Math.min(730, window.innerHeight - 28)}px`,
    background: 'linear-gradient(180deg, rgba(15, 23, 42, 0.98) 0%, rgba(9, 13, 24, 0.99) 100%)',
    backdropFilter: 'blur(32px) saturate(200%)',
    webkitBackdropFilter: 'blur(32px) saturate(200%)',
    color: '#fff',
    zIndex: '999999',
    border: '1px solid rgba(255, 255, 255, 0.12)',
    borderRadius: '22px',
    boxShadow: '0 35px 90px -15px rgba(0, 0, 0, 0.92), inset 0 1px 0 rgba(255, 255, 255, 0.15), 0 0 40px rgba(37, 99, 235, 0.14)',
    display: 'flex',
    flexDirection: 'column',
    fontFamily: "'Plus Jakarta Sans', system-ui, -apple-system, sans-serif",
    fontSize: '14px',
    overflow: 'hidden',
    animation: 'mcModalIn 0.25s cubic-bezier(0.16, 1, 0.3, 1) forwards'
  });

  sidebar.innerHTML = `
    <!-- HEADER (DRAGGABLE) -->
    <div id="mc-sidebar-header" style="padding:16px 20px;background:linear-gradient(180deg,rgba(22,30,49,0.98) 0%,rgba(15,21,37,0.95) 100%);border-bottom:1px solid rgba(255,255,255,0.08);display:flex;justify-content:space-between;align-items:center;flex-shrink:0;cursor:grab;user-select:none;">
      <div style="display:flex;align-items:center;gap:12px;">
        <span style="color:#64748b;font-size:16px;opacity:0.75;" title="Arrastrar ventana">⠿</span>
        <div style="display:flex;align-items:center;gap:12px;">
          <div style="width:40px;height:40px;border-radius:12px;background:linear-gradient(135deg,#1d4ed8,#2563eb);display:flex;align-items:center;justify-content:center;box-shadow:0 4px 16px rgba(37,99,235,0.45);border:1px solid rgba(255,255,255,0.25);">
            <span style="font-size:1.2rem;">⚡</span>
          </div>
          <div>
            <div style="font-weight:900;font-size:1.02rem;color:#ffffff;display:flex;align-items:center;gap:8px;letter-spacing:-0.01em;">
              <span>MetaCloser AI</span>
              <span style="font-size:0.6rem;background:linear-gradient(135deg,rgba(37,99,235,0.35),rgba(30,64,175,0.45));color:#bfdbfe;border:1px solid rgba(59,130,246,0.55);padding:2px 7px;border-radius:20px;font-weight:800;letter-spacing:0.04em;">PRO</span>
            </div>
            <div style="font-size:0.7rem;color:#94a3b8;font-weight:600;margin-top:2px;">Sales Copilot · APM Inox</div>
          </div>
        </div>
      </div>
      
      <!-- HEADER SHORTCUTS & CLOSE -->
      <div style="display:flex;align-items:center;gap:8px;">
        <a href="https://www.facebook.com/marketplace/inbox" target="_blank" class="mc-header-icon-btn mc-action-btn" title="Abrir Bandeja Marketplace en Facebook">
          <span>🛒</span>
        </a>
        <a href="https://www.facebook.com/messages" target="_blank" class="mc-header-icon-btn mc-action-btn" title="Abrir Messenger">
          <span>💬</span>
        </a>
        <button id="mc-close-sidebar" class="mc-header-icon-btn mc-action-btn" style="background:rgba(239,68,68,0.14);border-color:rgba(239,68,68,0.3);color:#fca5a5;" title="Cerrar ventana">✕</button>
      </div>
    </div>

    <!-- UNIFIED SEGMENTED NAVIGATION BAR -->
    <div style="padding:12px 18px 6px;flex-shrink:0;">
      <div style="display:flex;background:rgba(10,14,26,0.85);border:1px solid rgba(255,255,255,0.08);border-radius:14px;padding:4px;gap:4px;box-shadow:inset 0 1px 3px rgba(0,0,0,0.4);">
        <button id="mc-tab-chat" class="mc-nav-btn ${savedTab==='chat'?'active':''}">💬 Chat IA</button>
        <button id="mc-tab-campaigns" class="mc-nav-btn ${savedTab==='campaigns'?'active':''}">🚀 Campañas</button>
        <button id="mc-tab-crm" class="mc-nav-btn ${savedTab==='crm'?'active':''}">🗂️ CRM <span id="mc-crm-lead-count" class="mc-tab-badge">...</span></button>
        <button id="mc-tab-post" class="mc-nav-btn ${savedTab==='post'?'active':''}">📢 Publicar</button>
        <button id="mc-tab-catalog" class="mc-nav-btn ${savedTab==='catalog'?'active':''}">📦 Catálogo</button>
      </div>
    </div>

    <!-- PESTAÑA 1: CHAT IA (DETECCIÓN Y RESPUESTAS EN PANTALLA) -->
    <div id="mc-view-chat" style="display:${savedTab==='chat'?'flex':'none'};flex-direction:column;flex:1;overflow:hidden;padding:10px 18px 18px;">
      
      <!-- TOP STATUS & AUTO-PILOT CONTROL -->
      <div style="background:rgba(20,28,48,0.65);border:1px solid rgba(255,255,255,0.07);border-radius:14px;padding:11px 16px;margin-bottom:12px;display:flex;justify-content:space-between;align-items:center;">
        <div style="display:flex;align-items:center;gap:8px;">
          <span style="width:9px;height:9px;border-radius:50%;background:#10b981;box-shadow:0 0 10px rgba(16,185,129,0.8);animation:mcPulseGreen 2s infinite;"></span>
          <span style="font-size:0.72rem;font-weight:800;color:#e2e8f0;letter-spacing:0.04em;text-transform:uppercase;">Prospectos en Pantalla</span>
        </div>
        
        <!-- AUTO-PILOT COMPACT SWITCH -->
        <label style="display:flex;align-items:center;gap:8px;cursor:pointer;background:rgba(37,99,235,0.15);padding:5px 12px;border-radius:20px;border:1px solid rgba(37,99,235,0.35);user-select:none;transition:all 0.2s;">
          <span style="font-size:0.72rem;font-weight:800;color:#93c5fd;">⚡ Auto-Pilot</span>
          <input type="checkbox" id="mc-fb-auto-pilot-check" style="cursor:pointer;width:16px;height:16px;accent-color:#2563eb;margin:0;">
        </label>
      </div>

      <!-- SELECTOR DE CHAT DETECTADO -->
      <div style="display:flex;gap:8px;margin-bottom:12px;">
        <select id="mc-fb-chat-select" class="mc-input-field" style="flex:1;padding:10px 14px;border-radius:12px;border:1px solid rgba(255,255,255,0.12);background:rgba(15,21,37,0.95);color:#f8fafc;font-size:0.82rem;font-weight:700;box-sizing:border-box;box-shadow:0 2px 8px rgba(0,0,0,0.35);cursor:pointer;">
          <option value="">(Cargando chats detectados...)</option>
        </select>
        <button id="mc-fb-rescan-btn" type="button" class="mc-action-btn" style="width:42px;height:42px;background:rgba(37,99,235,0.18);border:1px solid rgba(37,99,235,0.4);color:#93c5fd;border-radius:12px;font-size:1.1rem;cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0;" title="Actualizar chats en pantalla">
          <span>🔄</span>
        </button>
      </div>

      <!-- EXECUTIVE LEAD DOSSIER CARD -->
      <div id="mc-lead-card" style="background:linear-gradient(145deg,rgba(22,31,52,0.75),rgba(13,18,32,0.9));border:1px solid rgba(255,255,255,0.1);border-radius:16px;padding:16px 18px;margin-bottom:12px;box-shadow:0 10px 30px -5px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.1);">
        
        <!-- LEAD HEADER ROW -->
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">
          <div style="display:flex;align-items:center;gap:12px;">
            <div id="mc-lead-avatar" style="width:44px;height:44px;border-radius:12px;background:linear-gradient(135deg,#1d4ed8,#2563eb);display:flex;align-items:center;justify-content:center;font-weight:900;font-size:1.15rem;color:#ffffff;box-shadow:0 4px 14px rgba(37,99,235,0.4);border:1px solid rgba(255,255,255,0.25);">
              C
            </div>
            <div>
              <div id="mc-lead-display-name" style="font-weight:800;font-size:1rem;color:#ffffff;display:flex;align-items:center;gap:8px;">
                <span>Cliente</span>
                <span id="mc-lead-badge-live" style="font-size:0.62rem;padding:3px 8px;border-radius:14px;background:rgba(16,185,129,0.18);color:#34d399;font-weight:800;border:1px solid rgba(16,185,129,0.35);">🟢 Detectado</span>
              </div>
              <div id="mc-lead-display-meta" style="font-size:0.75rem;color:#94a3b8;margin-top:3px;">
                📦 <span id="mc-lead-display-product" style="color:#93c5fd;font-weight:700;">Equipo Inox</span> · <span id="mc-lead-display-price" style="color:#34d399;font-weight:900;">$200</span>
              </div>
            </div>
          </div>
          <button id="mc-toggle-edit-btn" type="button" class="mc-action-btn" style="font-size:0.72rem;color:#93c5fd;background:rgba(37,99,235,0.15);border:1px solid rgba(37,99,235,0.35);border-radius:8px;cursor:pointer;padding:6px 11px;font-weight:700;">
            ✏️ Ajustar
          </button>
        </div>

        <!-- CUSTOMER SPEECH BUBBLE -->
        <div id="mc-lead-bubble" style="margin-top:12px;background:rgba(10,14,25,0.85);border-left:3px solid #2563eb;border-radius:10px;padding:12px 16px;font-size:0.82rem;color:#e2e8f0;line-height:1.5;">
          <span style="color:#60a5fa;font-weight:800;margin-right:6px;">Consulta:</span>
          <span id="mc-lead-display-msg">"¿Sigue disponible este artículo?"</span>
        </div>

        <!-- COLLAPSIBLE FORM FIELDS (FOR MANUAL ADJUSTMENT) -->
        <div id="mc-lead-edit-fields" style="display:none;margin-top:12px;padding-top:12px;border-top:1px dashed rgba(255,255,255,0.1);">
          <div style="display:flex;gap:8px;margin-bottom:8px;">
            <div style="flex:1;">
              <label style="font-size:0.65rem;color:#94a3b8;font-weight:700;text-transform:uppercase;margin-bottom:3px;display:block;">Nombre del Cliente</label>
              <input type="text" id="mc-fb-lead-name" class="mc-input-field" placeholder="Nombre..." style="width:100%;padding:8px 11px;border-radius:8px;border:1px solid rgba(255,255,255,0.12);background:rgba(15,23,42,0.9);color:#fff;font-size:0.8rem;box-sizing:border-box;">
            </div>
            <div style="width:90px;">
              <label style="font-size:0.65rem;color:#94a3b8;font-weight:700;text-transform:uppercase;margin-bottom:3px;display:block;">Precio</label>
              <input type="text" id="mc-fb-product-price" class="mc-input-field" placeholder="$1" style="width:100%;padding:8px 11px;border-radius:8px;border:1px solid rgba(255,255,255,0.12);background:rgba(15,23,42,0.9);color:#34d399;font-weight:800;font-size:0.8rem;box-sizing:border-box;">
            </div>
          </div>
          <div style="margin-bottom:8px;">
            <label style="font-size:0.65rem;color:#94a3b8;font-weight:700;text-transform:uppercase;margin-bottom:3px;display:block;">Producto o Anuncio</label>
            <input type="text" id="mc-fb-product-name" class="mc-input-field" placeholder="Góndolas, cocina, asador..." style="width:100%;padding:8px 11px;border-radius:8px;border:1px solid rgba(255,255,255,0.12);background:rgba(15,23,42,0.9);color:#fff;font-size:0.8rem;box-sizing:border-box;">
          </div>
          <div>
            <label style="font-size:0.65rem;color:#94a3b8;font-weight:700;text-transform:uppercase;margin-bottom:3px;display:block;">Mensaje recibido</label>
            <input type="text" id="mc-fb-client-msg" class="mc-input-field" placeholder="¿Sigue disponible?" value="¿Sigue disponible?" style="width:100%;padding:8px 11px;border-radius:8px;border:1px solid rgba(255,255,255,0.12);background:rgba(15,23,42,0.9);color:#e2e8f0;font-size:0.8rem;box-sizing:border-box;">
          </div>
        </div>
      </div>

      <!-- HERO ACTION BUTTON -->
      <div style="display:flex;gap:8px;margin-bottom:12px;">
        <button id="mc-fb-open-chat-btn" class="mc-action-btn" style="display:none;flex:1;padding:13px;background:linear-gradient(135deg,#1d4ed8,#2563eb);color:#fff;border:none;border-radius:13px;font-weight:800;cursor:pointer;font-size:0.84rem;align-items:center;justify-content:center;gap:6px;box-shadow:0 4px 16px rgba(37,99,235,0.35);">
          <span>📂 Abrir Chat</span>
        </button>
        <button id="mc-fb-analyze" class="mc-action-btn" style="flex:2;padding:14px 20px;background:linear-gradient(135deg,#059669 0%,#10b981 100%);color:#fff;border:none;border-radius:14px;font-weight:800;cursor:pointer;font-size:0.92rem;display:flex;align-items:center;justify-content:center;gap:8px;box-shadow:0 6px 22px rgba(16,185,129,0.4), inset 0 1px 0 rgba(255,255,255,0.35);letter-spacing:0.02em;">
          <span>✨ Redactar Respuesta con IA</span>
        </button>
      </div>

      <!-- AI RESULTS CONTAINER -->
      <div id="mc-fb-ai-results" style="padding:14px 16px;flex:1;overflow-y:auto;background:rgba(11,16,28,0.75);border:1px solid rgba(255,255,255,0.08);border-radius:14px;">
        <div style="text-align:center;padding:26px 10px;color:#64748b;">
          <div style="font-size:2rem;margin-bottom:8px;opacity:0.8;">🤖</div>
          <div style="font-size:0.86rem;color:#cbd5e1;font-weight:700;">Listo para redactar</div>
          <div style="font-size:0.75rem;color:#64748b;margin-top:4px;">Haz clic en "Redactar Respuesta con IA" para responder educadamente y cerrar la venta.</div>
        </div>
      </div>
    </div>

    <!-- PESTAÑA: CAMPAÑAS & SEGUIMIENTO (DIFUSIÓN, DRIP Y REMARKETING EN FACEBOOK) -->
    <div id="mc-view-campaigns" style="display:${savedTab==='campaigns'?'flex':'none'};flex-direction:column;flex:1;overflow:hidden;background:rgba(11,15,25,0.95);">
      <div style="padding:14px 18px;overflow-y:auto;flex:1;display:flex;flex-direction:column;gap:12px;">
        
        <!-- Header Banner -->
        <div style="background:linear-gradient(135deg,rgba(37,99,235,0.18),rgba(147,51,234,0.18));border:1px solid rgba(59,130,246,0.35);border-radius:14px;padding:12px 14px;display:flex;align-items:center;justify-content:space-between;">
          <div style="display:flex;align-items:center;gap:10px;">
            <div style="width:36px;height:36px;border-radius:10px;background:linear-gradient(135deg,#3b82f6,#8b5cf6);display:flex;align-items:center;justify-content:center;font-size:1.1rem;box-shadow:0 3px 10px rgba(59,130,246,0.4);">
              🚀
            </div>
            <div>
              <div style="font-weight:800;font-size:0.86rem;color:#f8fafc;letter-spacing:-0.01em;">Campañas en Facebook</div>
              <div style="font-size:0.68rem;color:#94a3b8;">Marketplace · Messenger · Remarketing</div>
            </div>
          </div>
          <span id="mc-campaign-status-pill" style="font-size:0.65rem;font-weight:800;padding:3px 9px;border-radius:12px;background:rgba(16,185,129,0.15);color:#34d399;border:1px solid rgba(16,185,129,0.35);">🟢 Listo</span>
        </div>

        <!-- Audiencia / Destinatarios -->
        <div style="background:rgba(20,28,48,0.65);border:1px solid rgba(255,255,255,0.08);border-radius:14px;padding:12px 14px;">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
            <div style="font-size:0.75rem;font-weight:800;color:#93c5fd;display:flex;align-items:center;gap:6px;">
              <span>👥 Destinatarios</span>
              <span id="mc-camp-count-badge" style="background:rgba(37,99,235,0.35);color:#bfdbfe;font-size:0.62rem;padding:2px 6px;border-radius:10px;font-weight:800;">1 seleccionado</span>
            </div>
            <div style="display:flex;gap:6px;">
              <button type="button" id="mc-camp-extract-btn" class="mc-action-btn" style="padding:5px 10px;background:linear-gradient(135deg,#8b5cf6,#7c3aed);color:#fff;border:none;border-radius:8px;font-size:0.7rem;font-weight:700;cursor:pointer;display:flex;align-items:center;gap:4px;box-shadow:0 2px 8px rgba(139,92,246,0.35);" title="Extraer prospectos detectados en pantalla y del CRM">
                ⚡ Extraer Prospectos
              </button>
              <button type="button" id="mc-camp-clear-leads-btn" class="mc-action-btn" style="padding:5px 8px;background:rgba(239,68,68,0.15);border:1px solid rgba(239,68,68,0.3);color:#fca5a5;border-radius:8px;font-size:0.7rem;cursor:pointer;" title="Limpiar lista">✕</button>
            </div>
          </div>
          <p style="font-size:0.68rem;color:#94a3b8;margin:0 0 8px 0;line-height:1.4;">
            Ingresa un prospecto por línea (o extrae automáticamente con el botón morado). Formato: <code>Nombre | Producto</code>
          </p>
          <textarea id="mc-camp-leads-input" class="mc-input-field" rows="3" placeholder="Anaa | Góndolas especiales T-304&#10;Monica | Cocina Industrial 3 Quemadores&#10;Carlos | Freidora 20L" style="width:100%;padding:8px 10px;border-radius:10px;border:1px solid rgba(255,255,255,0.12);background:rgba(15,23,42,0.95);color:#f8fafc;font-size:0.74rem;resize:vertical;box-sizing:border-box;font-family:inherit;line-height:1.4;">${savedCampLeads}</textarea>
        </div>

        <!-- Plantillas Rápidas de Campaña (1-Click) -->
        <div style="background:rgba(20,28,48,0.65);border:1px solid rgba(255,255,255,0.08);border-radius:14px;padding:12px 14px;">
          <div style="font-size:0.75rem;font-weight:800;color:#fbbf24;margin-bottom:8px;display:flex;align-items:center;gap:6px;">
            <span>📋 Cargar Plantilla de Campaña:</span>
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;">
            <button type="button" class="mc-camp-preset-btn mc-action-btn" data-preset="gondolas" style="padding:7px 9px;background:rgba(15,23,42,0.9);border:1px solid rgba(245,158,11,0.35);border-radius:8px;color:#fde68a;font-size:0.7rem;font-weight:700;cursor:pointer;text-align:left;display:flex;align-items:center;gap:6px;">
              <span>🌟</span> <span style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">Góndolas Inox T-304</span>
            </button>
            <button type="button" class="mc-camp-preset-btn mc-action-btn" data-preset="cocinas" style="padding:7px 9px;background:rgba(15,23,42,0.9);border:1px solid rgba(59,130,246,0.35);border-radius:8px;color:#bfdbfe;font-size:0.7rem;font-weight:700;cursor:pointer;text-align:left;display:flex;align-items:center;gap:6px;">
              <span>🔥</span> <span style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">Cocinas Precio Directo</span>
            </button>
            <button type="button" class="mc-camp-preset-btn mc-action-btn" data-preset="taller" style="padding:7px 9px;background:rgba(15,23,42,0.9);border:1px solid rgba(16,185,129,0.35);border-radius:8px;color:#a7f3d0;font-size:0.7rem;font-weight:700;cursor:pointer;text-align:left;display:flex;align-items:center;gap:6px;">
              <span>📍</span> <span style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">Visita Taller Cotocollao</span>
            </button>
            <button type="button" class="mc-camp-preset-btn mc-action-btn" data-preset="cierre" style="padding:7px 9px;background:rgba(15,23,42,0.9);border:1px solid rgba(239,68,68,0.35);border-radius:8px;color:#fecaca;font-size:0.7rem;font-weight:700;cursor:pointer;text-align:left;display:flex;align-items:center;gap:6px;">
              <span>⚡</span> <span style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">Cierre de Semana</span>
            </button>
          </div>
        </div>

        <!-- MIS CAMPAÑAS PERSONALIZADAS (GUARDADAS) -->
        <div style="background:rgba(20,28,48,0.65);border:1px solid rgba(255,255,255,0.08);border-radius:14px;padding:12px 14px;">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
            <div style="font-size:0.75rem;font-weight:800;color:#38bdf8;display:flex;align-items:center;gap:6px;">
              <span>⭐ Mis Campañas Personalizadas</span>
              <span id="mc-custom-camp-count-badge" style="background:rgba(56,189,248,0.2);color:#bae6fd;font-size:0.62rem;padding:2px 6px;border-radius:10px;font-weight:800;">...</span>
            </div>
            <span style="font-size:0.64rem;color:#94a3b8;">1-Clic para Cargar o Automatizar</span>
          </div>
          
          <div id="mc-custom-campaigns-list" style="display:flex;flex-direction:column;gap:6px;max-height:160px;overflow-y:auto;">
            <!-- Rendered dynamically -->
          </div>
        </div>

        <!-- AUTO-PILOT VINCULADO A CAMPAÑA -->
        <div style="background:rgba(15,23,42,0.85);border:1px solid rgba(59,130,246,0.3);border-radius:12px;padding:10px 14px;display:flex;align-items:center;justify-content:space-between;">
          <div>
            <div style="font-size:0.73rem;font-weight:800;color:#93c5fd;display:flex;align-items:center;gap:6px;">
              <span>🤖 Automatización de Respuestas:</span>
            </div>
            <div id="mc-autopilot-camp-status" style="font-size:0.66rem;color:#cbd5e1;margin-top:2px;">
              Modo: <b style="color:#93c5fd;">IA Adaptativa (Gente Fina)</b>
            </div>
          </div>
          <button type="button" id="mc-unlink-camp-btn" class="mc-action-btn" style="padding:4px 9px;background:rgba(239,68,68,0.15);border:1px solid rgba(239,68,68,0.3);color:#fca5a5;border-radius:7px;font-size:0.66rem;font-weight:700;cursor:pointer;display:none;">
            ✕ Usar IA Libre
          </button>
        </div>

        <!-- Redactor de Mensaje de Campaña -->
        <div style="background:rgba(20,28,48,0.65);border:1px solid rgba(255,255,255,0.08);border-radius:14px;padding:12px 14px;">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
            <span style="font-size:0.75rem;font-weight:800;color:#93c5fd;">✉️ Mensaje de la Campaña:</span>
            <div style="display:flex;gap:6px;">
              <button type="button" id="mc-save-as-custom-camp-btn" class="mc-action-btn" style="padding:4px 9px;background:linear-gradient(135deg,#0284c7,#0369a1);color:#fff;border:none;border-radius:7px;font-size:0.68rem;font-weight:700;cursor:pointer;display:flex;align-items:center;gap:4px;" title="Guardar este mensaje para automatizarlo después">
                💾 Guardar como Mi Campaña
              </button>
              <button type="button" id="mc-camp-ai-refine-btn" class="mc-action-btn" style="padding:4px 9px;background:linear-gradient(135deg,#3b82f6,#2563eb);color:#fff;border:none;border-radius:7px;font-size:0.68rem;font-weight:700;cursor:pointer;display:flex;align-items:center;gap:4px;">
                🧠 Pulir con IA
              </button>
            </div>
          </div>

          <!-- Variable chips -->
          <div style="display:flex;flex-wrap:wrap;gap:4px;margin-bottom:8px;">
            <span style="font-size:0.65rem;color:#64748b;margin-right:2px;align-self:center;">Insertar:</span>
            <button type="button" class="mc-var-chip mc-action-btn" data-var="{nombre}" style="background:rgba(59,130,246,0.18);border:1px solid rgba(59,130,246,0.35);color:#93c5fd;font-size:0.65rem;padding:2px 7px;border-radius:6px;cursor:pointer;">{nombre}</button>
            <button type="button" class="mc-var-chip mc-action-btn" data-var="{producto}" style="background:rgba(59,130,246,0.18);border:1px solid rgba(59,130,246,0.35);color:#93c5fd;font-size:0.65rem;padding:2px 7px;border-radius:6px;cursor:pointer;">{producto}</button>
            <button type="button" class="mc-var-chip mc-action-btn" data-var="https://amecocinas.com/" style="background:rgba(16,185,129,0.18);border:1px solid rgba(16,185,129,0.35);color:#6ee7b7;font-size:0.65rem;padding:2px 7px;border-radius:6px;cursor:pointer;">web</button>
            <button type="button" class="mc-var-chip mc-action-btn" data-var="09920350548" style="background:rgba(16,185,129,0.18);border:1px solid rgba(16,185,129,0.35);color:#6ee7b7;font-size:0.65rem;padding:2px 7px;border-radius:6px;cursor:pointer;">09920350548</button>
            <button type="button" class="mc-var-chip mc-action-btn" data-var="Calle 25 de Mayo 226, sector Cotocollao, frente al Club de Leones" style="background:rgba(245,158,11,0.18);border:1px solid rgba(245,158,11,0.35);color:#fde68a;font-size:0.65rem;padding:2px 7px;border-radius:6px;cursor:pointer;">taller</button>
          </div>

          <textarea id="mc-camp-message-input" class="mc-input-field" rows="5" placeholder="Escribe el mensaje de la campaña aquí..." style="width:100%;padding:10px 12px;border-radius:10px;border:1px solid rgba(255,255,255,0.12);background:rgba(15,23,42,0.95);color:#f8fafc;font-size:0.74rem;resize:vertical;box-sizing:border-box;font-family:inherit;line-height:1.5;">${savedCampMsg}</textarea>
        </div>

        <!-- Ajustes de Seguridad Anti-Bloqueo -->
        <div style="background:rgba(20,28,48,0.65);border:1px solid rgba(255,255,255,0.08);border-radius:14px;padding:12px 14px;display:flex;align-items:center;justify-content:space-between;gap:12px;">
          <div>
            <div style="font-size:0.74rem;font-weight:800;color:#e2e8f0;display:flex;align-items:center;gap:6px;">
              <span>🛡️ Pausa Anti-Bloqueo:</span>
            </div>
            <div style="font-size:0.66rem;color:#94a3b8;margin-top:2px;">Intervalo humano seguro entre cada mensaje enviado.</div>
          </div>
          <div style="display:flex;align-items:center;gap:6px;">
            <input type="number" id="mc-camp-delay-input" class="mc-input-field" value="${savedCampDelay}" min="6" max="60" style="width:55px;padding:6px 8px;border-radius:8px;border:1px solid rgba(255,255,255,0.15);background:rgba(15,23,42,0.95);color:#34d399;font-weight:800;font-size:0.8rem;text-align:center;">
            <span style="font-size:0.72rem;color:#cbd5e1;font-weight:700;">seg</span>
          </div>
        </div>

        <!-- Barra de Progreso y Estado de Campaña -->
        <div id="mc-camp-progress-container" style="display:none;background:rgba(15,23,42,0.9);border:1px solid rgba(37,99,235,0.3);border-radius:12px;padding:12px;">
          <div style="display:flex;justify-content:space-between;font-size:0.72rem;margin-bottom:6px;">
            <span id="mc-camp-progress-label" style="color:#93c5fd;font-weight:700;">Progreso del envío</span>
            <span id="mc-camp-progress-pct" style="color:#34d399;font-weight:800;">0%</span>
          </div>
          <div style="width:100%;height:8px;background:rgba(255,255,255,0.08);border-radius:4px;overflow:hidden;margin-bottom:8px;">
            <div id="mc-camp-progress-bar" style="width:0%;height:100%;background:linear-gradient(90deg,#3b82f6,#10b981);transition:width 0.3s ease;"></div>
          </div>
          <div id="mc-camp-status-detail" style="font-size:0.68rem;color:#cbd5e1;line-height:1.4;"></div>
        </div>

        <!-- Botones de Acción: Iniciar / Detener -->
        <div style="display:flex;gap:8px;margin-top:4px;">
          <button type="button" id="mc-camp-start-btn" class="mc-action-btn" style="flex:1;padding:12px;background:linear-gradient(135deg,#059669,#10b981);color:#fff;border:none;border-radius:12px;font-size:0.82rem;font-weight:800;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px;box-shadow:0 4px 18px rgba(16,185,129,0.35);">
            <span>🚀 Iniciar Campaña en Facebook</span>
          </button>
          <button type="button" id="mc-camp-stop-btn" class="mc-action-btn" style="display:none;flex:1;padding:12px;background:linear-gradient(135deg,#dc2626,#ef4444);color:#fff;border:none;border-radius:12px;font-size:0.82rem;font-weight:800;cursor:pointer;align-items:center;justify-content:center;gap:8px;box-shadow:0 4px 18px rgba(239,68,68,0.35);">
            <span>🛑 Detener Campaña</span>
          </button>
        </div>

        <!-- Historial / Log de Envíos en Vivo -->
        <div style="background:rgba(10,14,25,0.7);border:1px solid rgba(255,255,255,0.06);border-radius:12px;padding:10px 12px;max-height:140px;overflow-y:auto;" id="mc-camp-log-box">
          <div style="font-size:0.68rem;font-weight:800;color:#64748b;margin-bottom:4px;text-transform:uppercase;">Registro de envíos:</div>
          <div id="mc-camp-log-list" style="display:flex;flex-direction:column;gap:3px;font-size:0.68rem;color:#94a3b8;">
            <span>Listo para comenzar campaña. Carga tus destinatarios y presiona "Iniciar".</span>
          </div>
        </div>

      </div>
    </div>

    <!-- PESTAÑA 2: BANDEJA CRM (LEADS SINCRONIZADOS DE GRAPH API / DB) -->
    <div id="mc-view-crm" style="display:${savedTab==='crm'?'flex':'none'};flex-direction:column;flex:1;overflow:hidden;background:rgba(11,15,25,0.95);">
      <div style="padding:12px 16px;border-bottom:1px solid rgba(255,255,255,0.08);background:rgba(18,24,44,0.7);flex-shrink:0;">
        <div style="display:flex;gap:8px;margin-bottom:8px;">
          <input type="text" id="mc-crm-search-input" class="mc-input-field" placeholder="🔍 Buscar prospecto o mensaje..." style="flex:1;padding:9px 12px;border-radius:10px;border:1px solid rgba(255,255,255,0.1);background:rgba(15,23,42,0.9);color:#fff;font-size:0.8rem;box-sizing:border-box;">
          <button id="mc-crm-sync-btn" type="button" class="mc-action-btn" style="padding:9px 14px;background:linear-gradient(135deg,#1d4ed8,#2563eb);color:#fff;border:none;border-radius:10px;font-size:0.78rem;font-weight:800;cursor:pointer;display:flex;align-items:center;gap:6px;box-shadow:0 3px 12px rgba(37,99,235,0.4);" title="Sincronizar con Meta Graph API">
            <span>🔄 Sincronizar</span>
          </button>
        </div>
        <div style="font-size:0.7rem;color:#94a3b8;font-weight:500;">
          Bandeja unificada de prospectos recibidos en tu página de Facebook, Marketplace y Messenger.
        </div>
      </div>

      <div id="mc-crm-leads-list" style="padding:12px 16px;flex:1;overflow-y:auto;">
        <p style="color:#64748b;text-align:center;margin-top:20px;font-size:0.8rem;">Cargando chats del CRM...</p>
      </div>
    </div>

    <!-- PESTAÑA 3: PUBLICAR (CREAR POSTS AUTOMÁTICOS CON FOTOS) -->
    <div id="mc-view-post" style="display:${savedTab==='post'?'flex':'none'};flex-direction:column;flex:1;overflow:hidden;background:rgba(11,15,25,0.95);">
      <div style="padding:14px 18px;border-bottom:1px solid rgba(255,255,255,0.08);overflow-y:auto;flex:1;">
        <div style="font-size:0.8rem;font-weight:900;color:#fbbf24;margin-bottom:12px;letter-spacing:0.04em;display:flex;align-items:center;gap:6px;">
          <span>📢 GENERADOR CON FOTOS & FLYERS</span>
        </div>

        <!-- FOTO ACTIVA -->
        <div style="background:rgba(20,27,45,0.7);border:1px solid rgba(255,255,255,0.1);border-radius:14px;padding:12px;margin-bottom:12px;">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
            <span style="font-size:0.75rem;font-weight:700;color:#93c5fd;">📸 Foto / Flyer del Anuncio:</span>
            <label for="mc-post-file-input" class="mc-action-btn" style="font-size:0.72rem;background:linear-gradient(135deg,#1d4ed8,#2563eb);color:#fff;padding:4px 10px;border-radius:7px;cursor:pointer;font-weight:700;box-shadow:0 2px 8px rgba(37,99,235,0.35);">+ Subir PC</label>
            <input type="file" id="mc-post-file-input" accept="image/*" style="display:none;">
          </div>
          <div style="position:relative;width:100%;height:110px;border-radius:10px;overflow:hidden;border:2px solid rgba(245,158,11,0.5);cursor:pointer;" id="mc-img-preview-wrap">
            <img id="mc-post-img-preview" src="${savedImgUrl}" style="width:100%;height:100%;object-fit:cover;">
            <span id="mc-post-img-badge" style="position:absolute;bottom:6px;left:6px;background:rgba(11,15,25,0.92);color:#34d399;font-size:0.68rem;padding:3px 8px;border-radius:6px;font-weight:bold;border:1px solid rgba(16,185,129,0.3);">${savedImgBadge}</span>
            <div style="position:absolute;inset:0;background:rgba(11,15,25,0.6);display:flex;align-items:center;justify-content:center;opacity:0;transition:0.2s;" id="mc-img-hover-overlay">
              <span style="color:#fff;font-size:0.78rem;font-weight:bold;">📁 Cambiar foto</span>
            </div>
          </div>
          <div style="display:flex;gap:6px;margin-top:10px;">
            <button type="button" id="mc-fb-attach-photo-btn" class="mc-action-btn" style="flex:1;padding:8px;background:linear-gradient(135deg,#059669,#10b981);color:#fff;border:none;border-radius:8px;font-size:0.75rem;font-weight:bold;cursor:pointer;box-shadow:0 2px 8px rgba(16,185,129,0.3);">📷 Cargar a Marketplace</button>
            <button type="button" id="mc-fb-download-photo-btn" class="mc-action-btn" style="padding:8px 12px;background:rgba(30,41,59,0.8);color:#cbd5e1;border:1px solid rgba(255,255,255,0.1);border-radius:8px;font-size:0.75rem;font-weight:bold;cursor:pointer;" title="Descargar">📥</button>
          </div>
        </div>

        <!-- DATOS DEL ANUNCIO -->
        <input type="text" id="mc-post-product" class="mc-input-field" placeholder="Nombre del Producto..." value="${savedProduct}" style="width:100%;padding:8px 10px;margin-bottom:7px;border-radius:8px;border:1px solid rgba(255,255,255,0.12);background:rgba(15,23,42,0.85);color:#fff;box-sizing:border-box;font-size:0.82rem;">
        <div style="display:flex;gap:6px;margin-bottom:8px;">
          <input type="text" id="mc-post-price" class="mc-input-field" placeholder="Precio $" value="${savedPrice}" style="flex:1;padding:8px 10px;border-radius:8px;border:1px solid rgba(255,255,255,0.12);background:rgba(15,23,42,0.85);color:#34d399;font-weight:bold;box-sizing:border-box;font-size:0.82rem;">
          <input type="text" id="mc-post-city" class="mc-input-field" placeholder="Ciudad" value="${savedCity}" style="flex:1;padding:8px 10px;border-radius:8px;border:1px solid rgba(255,255,255,0.12);background:rgba(15,23,42,0.85);color:#fff;box-sizing:border-box;font-size:0.82rem;">
        </div>
        <button id="mc-fb-generate-post" class="mc-action-btn" style="width:100%;padding:10px;background:linear-gradient(135deg,#f59e0b,#d97706);color:#fff;border:none;border-radius:8px;font-weight:bold;cursor:pointer;font-size:0.82rem;box-shadow:0 4px 16px rgba(245,158,11,0.35);">✨ Generar Texto con IA + Foto</button>
      </div>
      <div id="mc-post-results" style="padding:14px;flex:1;overflow-y:auto;border-top:1px solid rgba(255,255,255,0.08);">
        <p style="color:#64748b;text-align:center;margin-top:16px;font-size:0.8rem;">Genera el texto y rellenará Marketplace con foto incluida.</p>
      </div>
    </div>

    <!-- PESTAÑA 4: CATÁLOGO -->
    <div id="mc-view-catalog" style="display:${savedTab==='catalog'?'flex':'none'};flex-direction:column;flex:1;overflow:hidden;background:rgba(11,15,25,0.95);">
      <div style="padding:14px 16px;border-bottom:1px solid rgba(255,255,255,0.08);flex-shrink:0;">
        <div style="font-size:0.78rem;font-weight:900;color:#34d399;margin-bottom:10px;">📦 MI CATÁLOGO DE PRODUCTOS</div>
        <!-- Agregar nuevo producto -->
        <div style="background:rgba(20,27,45,0.7);border:1px solid rgba(255,255,255,0.1);border-radius:10px;padding:10px;margin-bottom:8px;">
          <div style="font-size:0.7rem;color:#94a3b8;font-weight:bold;margin-bottom:6px;">➕ AGREGAR PRODUCTO AL CATÁLOGO:</div>
          <input type="text" id="mc-cat-new-name" class="mc-input-field" placeholder="Nombre del producto..." style="width:100%;padding:7px 9px;margin-bottom:5px;border-radius:7px;border:1px solid rgba(255,255,255,0.12);background:rgba(15,23,42,0.85);color:#fff;box-sizing:border-box;font-size:0.78rem;">
          <div style="display:flex;gap:5px;margin-bottom:5px;">
            <input type="text" id="mc-cat-new-price" class="mc-input-field" placeholder="Precio $" style="flex:1;padding:7px 9px;border-radius:7px;border:1px solid rgba(255,255,255,0.12);background:rgba(15,23,42,0.85);color:#34d399;font-weight:bold;box-sizing:border-box;font-size:0.78rem;">
            <input type="text" id="mc-cat-new-emoji" class="mc-input-field" placeholder="Emoji" value="📦" style="width:60px;padding:7px 9px;border-radius:7px;border:1px solid rgba(255,255,255,0.12);background:rgba(15,23,42,0.85);color:#fff;box-sizing:border-box;font-size:0.78rem;text-align:center;">
          </div>
          <div style="display:flex;gap:5px;">
            <label for="mc-cat-new-img-file" class="mc-action-btn" style="flex:1;padding:7px;background:rgba(15,23,42,0.85);border:1px dashed rgba(255,255,255,0.2);border-radius:7px;color:#94a3b8;font-size:0.72rem;cursor:pointer;text-align:center;box-sizing:border-box;">📁 Foto desde PC</label>
            <input type="file" id="mc-cat-new-img-file" accept="image/*" style="display:none;">
            <button type="button" id="mc-cat-add-btn" class="mc-action-btn" style="flex:1;padding:7px;background:linear-gradient(135deg,#059669,#10b981);color:#fff;border:none;border-radius:7px;font-size:0.72rem;font-weight:bold;cursor:pointer;box-shadow:0 2px 8px rgba(16,185,129,0.3);">✅ Guardar</button>
          </div>
          <div id="mc-cat-new-img-preview" style="margin-top:6px;display:none;">
            <img id="mc-cat-new-img-thumb" src="" style="width:100%;height:60px;object-fit:cover;border-radius:6px;border:1px solid rgba(255,255,255,0.15);">
            <span id="mc-cat-new-img-name" style="font-size:0.65rem;color:#94a3b8;display:block;margin-top:2px;"></span>
          </div>
        </div>

        <!-- Formulario para Editar Producto (oculto por defecto) -->
        <div id="mc-cat-edit-box" style="display:none;background:linear-gradient(145deg, rgba(30,41,59,0.95), rgba(15,23,42,0.95));border:1px solid #3b82f6;border-radius:10px;padding:10px;margin-bottom:8px;box-shadow:0 4px 15px rgba(0,0,0,0.5);">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;">
            <div style="font-size:0.72rem;color:#60a5fa;font-weight:bold;">✏️ EDITAR EQUIPO DEL CATÁLOGO:</div>
            <button type="button" id="mc-cat-edit-cancel-x" style="background:none;border:none;color:#94a3b8;cursor:pointer;font-size:0.85rem;padding:0 4px;">✕</button>
          </div>
          <input type="hidden" id="mc-cat-edit-index" value="-1">
          <input type="text" id="mc-cat-edit-name" class="mc-input-field" placeholder="Nombre del producto..." style="width:100%;padding:7px 9px;margin-bottom:5px;border-radius:7px;border:1px solid rgba(255,255,255,0.15);background:rgba(15,23,42,0.9);color:#fff;box-sizing:border-box;font-size:0.78rem;">
          <div style="display:flex;gap:5px;margin-bottom:5px;">
            <input type="text" id="mc-cat-edit-price" class="mc-input-field" placeholder="Precio $" style="flex:1;padding:7px 9px;border-radius:7px;border:1px solid rgba(255,255,255,0.15);background:rgba(15,23,42,0.9);color:#34d399;font-weight:bold;box-sizing:border-box;font-size:0.78rem;">
            <input type="text" id="mc-cat-edit-emoji" class="mc-input-field" placeholder="Emoji" style="width:60px;padding:7px 9px;border-radius:7px;border:1px solid rgba(255,255,255,0.15);background:rgba(15,23,42,0.9);color:#fff;box-sizing:border-box;font-size:0.78rem;text-align:center;">
          </div>
          <div style="display:flex;gap:5px;margin-bottom:6px;">
            <label for="mc-cat-edit-img-file" class="mc-action-btn" style="flex:1;padding:7px;background:rgba(15,23,42,0.85);border:1px dashed rgba(255,255,255,0.25);border-radius:7px;color:#93c5fd;font-size:0.72rem;cursor:pointer;text-align:center;box-sizing:border-box;">📁 Cambiar Foto desde PC</label>
            <input type="file" id="mc-cat-edit-img-file" accept="image/*" style="display:none;">
          </div>
          <div id="mc-cat-edit-img-preview" style="margin-bottom:6px;display:none;">
            <img id="mc-cat-edit-img-thumb" src="" style="width:100%;height:60px;object-fit:cover;border-radius:6px;border:1px solid rgba(255,255,255,0.15);">
          </div>
          <div style="display:flex;gap:5px;">
            <button type="button" id="mc-cat-edit-save-btn" class="mc-action-btn" style="flex:2;padding:7px;background:linear-gradient(135deg,#2563eb,#1d4ed8);color:#fff;border:none;border-radius:7px;font-size:0.72rem;font-weight:bold;cursor:pointer;box-shadow:0 2px 8px rgba(37,99,235,0.35);">💾 Guardar Cambios</button>
            <button type="button" id="mc-cat-edit-cancel-btn" class="mc-action-btn" style="flex:1;padding:7px;background:rgba(51,65,85,0.8);color:#cbd5e1;border:none;border-radius:7px;font-size:0.72rem;cursor:pointer;">Cancelar</button>
          </div>
        </div>
      </div>

      <!-- Lista de productos guardados -->
      <div id="mc-catalog-list" style="padding:14px;flex:1;overflow-y:auto;">
        ${buildCatalogHTML(catalog)}
        <button type="button" id="mc-cat-reset-btn" class="mc-action-btn" style="width:100%;margin-top:8px;padding:8px;background:rgba(30,41,59,0.7);border:1px solid rgba(255,255,255,0.08);color:#94a3b8;border-radius:8px;font-size:0.72rem;cursor:pointer;">↺ Restaurar catálogo por defecto</button>
      </div>
    </div>
  `;

  document.body.appendChild(sidebar);

  // Draggable by header
  const sidebarHeader = document.getElementById('mc-sidebar-header');
  if (sidebarHeader) {
    makeDraggable(sidebar, 'mc_sidebar_pos', sidebarHeader, null, () => {
      sidebar._manuallyRepositioned = true;
    });
  }

  // Anchor modal dynamically to wherever the floating button is
  positionModalNearButton(sidebar);

  // Wire collapsible manual adjustments button
  const toggleEditBtn = document.getElementById('mc-toggle-edit-btn');
  const editFields = document.getElementById('mc-lead-edit-fields');
  if (toggleEditBtn && editFields) {
    toggleEditBtn.addEventListener('click', () => {
      const isHidden = editFields.style.display === 'none';
      editFields.style.display = isHidden ? 'block' : 'none';
      toggleEditBtn.innerText = isHidden ? '✕ Cerrar' : '✏️ Ajustar';
    });
  }

  // Live synchronizer from manual inputs to dossier card display
  ['mc-fb-lead-name', 'mc-fb-product-name', 'mc-fb-product-price', 'mc-fb-client-msg'].forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener('input', () => {
        const name = document.getElementById('mc-fb-lead-name').value.trim() || 'Prospecto';
        const prod = document.getElementById('mc-fb-product-name').value.trim() || 'Equipo Inox';
        const price = document.getElementById('mc-fb-product-price').value.trim() || '$1';
        const msg = document.getElementById('mc-fb-client-msg').value.trim() || '¿Sigue disponible este artículo?';

        const nameEl = document.getElementById('mc-lead-display-name');
        const prodEl = document.getElementById('mc-lead-display-product');
        const priceEl = document.getElementById('mc-lead-display-price');
        const msgEl = document.getElementById('mc-lead-display-msg');
        const avatarEl = document.getElementById('mc-lead-avatar');

        if (nameEl) nameEl.innerHTML = `<span>${name}</span> <span id="mc-lead-badge-live" style="font-size:0.58rem;padding:2px 6px;border-radius:12px;background:rgba(16,185,129,0.18);color:#34d399;font-weight:800;border:1px solid rgba(16,185,129,0.3);">🟢 Detectado</span>`;
        if (avatarEl) avatarEl.innerText = (name[0] || 'C').toUpperCase();
        if (prodEl) prodEl.innerText = prod;
        if (priceEl) priceEl.innerText = price;
        if (msgEl) msgEl.innerText = `"${msg}"`;
      });
    }
  });

  // ─── Media state ────────────────────────────────────────────────────────────
  let mcActiveFile   = null;
  let mcActiveImgUrl = lsGet('activeImgUrl', 'https://images.unsplash.com/photo-1556911220-e15b29be8c8f?auto=format&fit=crop&w=900&q=80');
  let mcCatNewImgDataUrl = null;
  let mcCatEditImgDataUrl = null;

  // ─── Unified 5-Tab switching ─────────────────────────────────────────────────
  function switchTab(tab) {
    ['chat','campaigns','crm','post','catalog'].forEach(t => {
      const btn  = document.getElementById(`mc-tab-${t}`);
      const view = document.getElementById(`mc-view-${t}`);
      const isActive = t === tab;
      if (btn) {
        if (isActive) {
          btn.classList.add('active');
        } else {
          btn.classList.remove('active');
        }
      }
      if (view) {
        view.style.display = isActive ? 'flex' : 'none';
      }
    });
    if (tab === 'crm') {
      loadCrmPendingChats();
    }
    if (tab === 'campaigns') {
      updateCampaignLeadCounter();
      renderCustomCampaigns();
    }
    lsSet('activeTab', tab);
  }

  document.getElementById('mc-tab-chat').addEventListener('click',      () => switchTab('chat'));
  document.getElementById('mc-tab-campaigns').addEventListener('click', () => switchTab('campaigns'));
  document.getElementById('mc-tab-crm').addEventListener('click',       () => switchTab('crm'));
  document.getElementById('mc-tab-post').addEventListener('click',      () => switchTab('post'));
  document.getElementById('mc-tab-catalog').addEventListener('click',   () => switchTab('catalog'));

  // ─── Close ───────────────────────────────────────────────────────────────────
  document.getElementById('mc-close-sidebar').addEventListener('click', () => {
    sidebar.style.display = 'none';
  });

  // ─── Save inputs to localStorage on change ───────────────────────────────────
  document.getElementById('mc-post-product').addEventListener('input', e => lsSet('product', e.target.value));
  document.getElementById('mc-post-price').addEventListener('input',   e => lsSet('price', e.target.value));
  document.getElementById('mc-post-city').addEventListener('input',    e => lsSet('city', e.target.value));

  // ─── Img preview hover ───────────────────────────────────────────────────────
  const imgWrap    = document.getElementById('mc-img-preview-wrap');
  const imgOverlay = document.getElementById('mc-img-hover-overlay');
  imgWrap.addEventListener('mouseenter', () => { imgOverlay.style.opacity = '1'; });
  imgWrap.addEventListener('mouseleave', () => { imgOverlay.style.opacity = '0'; });
  imgWrap.addEventListener('click', () => document.getElementById('mc-post-file-input').click());

  // ─── Upload from PC ──────────────────────────────────────────────────────────
  function setActiveImage(url, badgeText, file = null) {
    mcActiveFile   = file;
    mcActiveImgUrl = url;
    const previewImg = document.getElementById('mc-post-img-preview');
    const badge      = document.getElementById('mc-post-img-badge');
    if (previewImg) previewImg.src = url;
    if (badge) { badge.innerText = badgeText; badge.style.color = '#34d399'; }
    // Only save URL to localStorage if it's not a huge base64 (>500KB skip to avoid quota)
    if (url && url.length < 500000) {
      lsSet('activeImgUrl', url);
      lsSet('activeImgBadge', badgeText);
    }
  }

  const fileInputEl = document.getElementById('mc-post-file-input');
  fileInputEl.addEventListener('change', (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      setActiveImage(ev.target.result, `✓ ${file.name.substring(0, 22)}`, file);
    };
    reader.readAsDataURL(file);
  });

  // ─── Attach photo to Marketplace ────────────────────────────────────────────
  async function attachPhotoToFacebook() {
    try {
      let fileToAttach = null;
      if (mcActiveFile) {
        fileToAttach = mcActiveFile;
      } else if (mcActiveImgUrl && !mcActiveImgUrl.startsWith('data:')) {
        const res  = await fetch(mcActiveImgUrl);
        const blob = await res.blob();
        fileToAttach = new File([blob], 'foto-apm-inox.jpg', { type: blob.type || 'image/jpeg' });
      } else if (mcActiveImgUrl && mcActiveImgUrl.startsWith('data:')) {
        const res  = await fetch(mcActiveImgUrl);
        const blob = await res.blob();
        fileToAttach = new File([blob], 'flyer-apm.jpg', { type: 'image/jpeg' });
      }
      if (!fileToAttach) return false;
      const fbFileInputs = document.querySelectorAll('input[type="file"][accept*="image"]');
      if (fbFileInputs.length > 0) {
        const dt = new DataTransfer();
        dt.items.add(fileToAttach);
        for (const input of fbFileInputs) {
          input.files = dt.files;
          input.dispatchEvent(new Event('input', { bubbles: true }));
          input.dispatchEvent(new Event('change', { bubbles: true }));
        }
        return true;
      }
      return false;
    } catch (err) {
      console.warn('[MetaCloser] attachPhotoToFacebook error:', err);
      return false;
    }
  }

  document.getElementById('mc-fb-attach-photo-btn').addEventListener('click', async () => {
    const btn = document.getElementById('mc-fb-attach-photo-btn');
    btn.innerText = '⏳ Adjuntando...';
    const ok = await attachPhotoToFacebook();
    btn.innerText = ok ? '✅ Foto Cargada' : '⚠️ Abre Crear Publicación';
    if (!ok) alert('⚠️ Ve a Marketplace → "Crear publicación" para que pueda adjuntar la foto automáticamente. También puedes descargarla y arrastrarla.');
    setTimeout(() => { btn.innerText = '📷 Cargar a Marketplace'; }, 3500);
  });

  document.getElementById('mc-fb-download-photo-btn').addEventListener('click', async () => {
    try {
      let url = mcActiveImgUrl;
      if (mcActiveFile) url = URL.createObjectURL(mcActiveFile);
      if (!url) return;
      const a = document.createElement('a');
      a.href = url; a.download = `foto-${Date.now()}.jpg`;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
    } catch { alert('Error al descargar'); }
  });

  // ─── CATALOG TAB logic ───────────────────────────────────────────────────────
  function renderCatalog() {
    const cat  = getCatalog();
    const list = document.getElementById('mc-catalog-list');
    if (!list) return;
    list.innerHTML = buildCatalogHTML(cat) + `<button type="button" id="mc-cat-reset-btn" style="width:100%;margin-top:8px;padding:7px;background:#1e293b;border:1px solid #334155;color:#475569;border-radius:6px;font-size:0.7rem;cursor:pointer;">↺ Restaurar catálogo por defecto</button>`;

    // Select buttons (Usar en Marketplace)
    list.querySelectorAll('.mc-cat-select-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx  = parseInt(btn.getAttribute('data-index'));
        const item = getCatalog()[idx];
        if (!item) return;
        setActiveImage(item.img, `✓ Catálogo: ${item.name.substring(0,20)}...`);
        const prodInp  = document.getElementById('mc-post-product');
        const priceInp = document.getElementById('mc-post-price');
        if (prodInp)  { prodInp.value  = item.name;  lsSet('product', item.name); }
        if (priceInp) { priceInp.value = item.price; lsSet('price', item.price); }
        switchTab('post');
      });
    });

    // Edit buttons (Abrir caja de edición)
    list.querySelectorAll('.mc-cat-edit-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx  = parseInt(btn.getAttribute('data-index'));
        const item = getCatalog()[idx];
        if (!item) return;

        const editBox   = document.getElementById('mc-cat-edit-box');
        const idxInp    = document.getElementById('mc-cat-edit-index');
        const nameInp   = document.getElementById('mc-cat-edit-name');
        const priceInp  = document.getElementById('mc-cat-edit-price');
        const emojiInp  = document.getElementById('mc-cat-edit-emoji');
        const preview   = document.getElementById('mc-cat-edit-img-preview');
        const thumb     = document.getElementById('mc-cat-edit-img-thumb');

        if (!editBox || !idxInp || !nameInp || !priceInp) return;

        idxInp.value   = idx;
        nameInp.value  = item.name || '';
        priceInp.value = item.price || '';
        emojiInp.value = item.emoji || '📦';
        mcCatEditImgDataUrl = item.img || null;

        if (item.img && thumb && preview) {
          thumb.src = item.img;
          preview.style.display = 'block';
        } else if (preview) {
          preview.style.display = 'none';
        }

        editBox.style.display = 'block';
        editBox.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      });
    });

    // Delete buttons (Con confirmación y persistencia inmediata)
    list.querySelectorAll('.mc-cat-delete-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.getAttribute('data-index'));
        const cat = getCatalog();
        const item = cat[idx];
        if (!item) return;
        if (!confirm(`¿Estás seguro de eliminar "${item.name}" del catálogo?`)) return;

        cat.splice(idx, 1);
        saveCatalog(cat);
        renderCatalog();

        // Ocultar caja de edición si se estaba editando este mismo
        const editBox = document.getElementById('mc-cat-edit-box');
        const idxInp  = document.getElementById('mc-cat-edit-index');
        if (editBox && idxInp && parseInt(idxInp.value) === idx) {
          editBox.style.display = 'none';
        }
      });
    });

    // Reset button
    const resetBtn = document.getElementById('mc-cat-reset-btn');
    if (resetBtn) {
      resetBtn.addEventListener('click', () => {
        if (!confirm('¿Restaurar el catálogo completo de APM Inox / Amecocinas por defecto?')) return;
        saveCatalog([...DEFAULT_CATALOG]);
        renderCatalog();
      });
    }
  }
  renderCatalog();

  // New catalog item photo from PC
  const catNewImgFile = document.getElementById('mc-cat-new-img-file');
  if (catNewImgFile) {
    catNewImgFile.addEventListener('change', (e) => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        mcCatNewImgDataUrl = ev.target.result;
        const preview = document.getElementById('mc-cat-new-img-preview');
        const thumb   = document.getElementById('mc-cat-new-img-thumb');
        const name    = document.getElementById('mc-cat-new-img-name');
        if (preview) preview.style.display = 'block';
        if (thumb)   thumb.src = ev.target.result;
        if (name)    name.innerText = file.name;
      };
      reader.readAsDataURL(file);
    });
  }

  // Edit catalog image from PC
  const catEditImgFile = document.getElementById('mc-cat-edit-img-file');
  if (catEditImgFile) {
    catEditImgFile.addEventListener('change', (e) => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        mcCatEditImgDataUrl = ev.target.result;
        const preview = document.getElementById('mc-cat-edit-img-preview');
        const thumb   = document.getElementById('mc-cat-edit-img-thumb');
        if (preview) preview.style.display = 'block';
        if (thumb)   thumb.src = ev.target.result;
      };
      reader.readAsDataURL(file);
    });
  }

  // Edit save button
  const editSaveBtn = document.getElementById('mc-cat-edit-save-btn');
  if (editSaveBtn) {
    editSaveBtn.addEventListener('click', () => {
      const idxInp   = document.getElementById('mc-cat-edit-index');
      const nameInp  = document.getElementById('mc-cat-edit-name');
      const priceInp = document.getElementById('mc-cat-edit-price');
      const emojiInp = document.getElementById('mc-cat-edit-emoji');

      const idx   = parseInt(idxInp?.value || '-1');
      const name  = (nameInp?.value || '').trim();
      const price = (priceInp?.value || '').trim();
      const emoji = (emojiInp?.value || '').trim() || '📦';

      if (idx < 0) return;
      if (!name) { alert('El nombre del producto no puede estar vacío.'); return; }

      const cat = getCatalog();
      if (!cat[idx]) return;

      cat[idx].name  = name;
      cat[idx].price = price || '0';
      cat[idx].emoji = emoji;
      if (mcCatEditImgDataUrl) {
        cat[idx].img = mcCatEditImgDataUrl;
      }

      saveCatalog(cat);
      renderCatalog();

      const editBox = document.getElementById('mc-cat-edit-box');
      if (editBox) editBox.style.display = 'none';
      mcCatEditImgDataUrl = null;
      if (catEditImgFile) catEditImgFile.value = '';
    });
  }

  const cancelCatEdit = () => {
    const editBox = document.getElementById('mc-cat-edit-box');
    if (editBox) editBox.style.display = 'none';
    mcCatEditImgDataUrl = null;
    if (catEditImgFile) catEditImgFile.value = '';
  };

  const editCancelBtn = document.getElementById('mc-cat-edit-cancel-btn');
  if (editCancelBtn) editCancelBtn.addEventListener('click', cancelCatEdit);

  const editCancelX = document.getElementById('mc-cat-edit-cancel-x');
  if (editCancelX) editCancelX.addEventListener('click', cancelCatEdit);

  // Add new catalog item
  const catAddBtn = document.getElementById('mc-cat-add-btn');
  if (catAddBtn) {
    catAddBtn.addEventListener('click', () => {
      const name  = document.getElementById('mc-cat-new-name').value.trim();
      const price = document.getElementById('mc-cat-new-price').value.trim();
      const emoji = document.getElementById('mc-cat-new-emoji').value.trim() || '📦';

      if (!name) { alert('Ingresa el nombre del producto.'); return; }

      const imgUrl = mcCatNewImgDataUrl || 'https://images.unsplash.com/photo-1556911220-e15b29be8c8f?auto=format&fit=crop&w=900&q=80';

      const cat = getCatalog();
      cat.unshift({ name, price: price || '0', img: imgUrl, emoji });
      saveCatalog(cat);
      renderCatalog();

      // Reset form
      document.getElementById('mc-cat-new-name').value  = '';
      document.getElementById('mc-cat-new-price').value = '';
      document.getElementById('mc-cat-new-emoji').value = '📦';
      mcCatNewImgDataUrl = null;
      if (catNewImgFile) catNewImgFile.value = '';
      const preview = document.getElementById('mc-cat-new-img-preview');
      if (preview) preview.style.display = 'none';

      // Flash success
      catAddBtn.innerText = '✅ Guardado!';
      catAddBtn.style.background = '#065f46';
      setTimeout(() => {
        catAddBtn.innerText = '✅ Guardar';
        catAddBtn.style.background = 'linear-gradient(135deg,#059669,#047857)';
      }, 2000);
    });
  }

  // ─── CAMPAIGNS & BROADCAST SUITE (FACEBOOK MARKETPLACE & MESSENGER) ───────────
  let isCampaignRunning = false;
  let campaignAborted = false;

  const campPresets = {
    gondolas: `Buenas tardes, estimada {nombre}. Mucho gusto en saludarle. Es un verdadero placer atenderle respecto a nuestras góndolas especiales en acero inoxidable T‑304, fabricadas con la más alta calidad y garantía de fábrica. Como somos fabricantes directos, cada cotización se elabora con precisión de taller según las medidas y especificaciones exactas que requiera su respetable negocio. Con el mayor agrado le invito a apreciar más modelos en nuestra página web: https://amecocinas.com/ . Para brindarle una propuesta ajustada, le agradecería nos indique sus dimensiones y número de unidades. También puede comunicarse directamente al 09920350548. Nuestro taller se encuentra en Calle 25 de Mayo 226, sector Cotocollao, frente al Club de Leones, donde con gusto le atenderemos. Quedo a su entera y grata disposición.`,
    cocinas: `Buenas tardes, estimado/a {nombre}. Un gusto saludarle de parte de APM Inox. Respecto a su interés en {producto}, le comento que tenemos unidades listas para entrega inmediata con precio directo de taller sin intermediarios. Nuestros equipos son fabricados íntegramente en acero inoxidable sanitario con quemadores de alta potencia y garantía de fábrica. ¿Desea que le enviemos fotos de las medidas disponibles o prefiere coordinar entrega hoy? También puede comunicarse al 09920350548 o ver nuestro catálogo en https://amecocinas.com/ . Quedo a sus órdenes.`,
    taller: `Estimado/a {nombre}, un cordial saludo de parte de APM Inox. Le extendemos una cordial invitación a visitar nuestra fábrica y sala de exhibición en Calle 25 de Mayo 226, sector Cotocollao, frente al Club de Leones. Aquí podrá revisar personalmente los acabados en acero inoxidable sanitario, probar la potencia de los quemadores y llevarse su equipo de inmediato. Atendemos de lunes a sábado. ¿Le gustaría coordinar una visita para hoy? Con gusto le esperamos o puede comunicarse directamente al 09920350548.`,
    cierre: `Buenas tardes, estimado/a {nombre}. Le escribo de parte de APM Inox. Justo esta semana estamos cerrando lote de fabricación de taller para {producto} con precio especial directo de fábrica. Si aún tiene previsto equipar su negocio, con el mayor agrado le reservamos su unidad con prioridad de entrega. Puede revisar más detalles en https://amecocinas.com/ o comunicarse al 09920350548. Quedamos a su entera y grata disposición.`
  };

  const DEFAULT_CUSTOM_CAMPAIGNS = [
    {
      id: 'camp-gondolas-ame',
      name: '🌟 Góndolas Inox T-304 & Amecocinas',
      product: 'Góndolas Inox T-304',
      message: `Buenas tardes, estimada {nombre}. Mucho gusto en saludarle. Es un verdadero placer atenderle respecto a nuestras góndolas especiales en acero inoxidable T‑304, fabricadas con la más alta calidad y garantía de fábrica. Como somos fabricantes directos, cada cotización se elabora con precisión de taller según las medidas y especificaciones exactas que requiera su respetable negocio. Con el mayor agrado le invito a apreciar más modelos en nuestra página web: https://amecocinas.com/ . Para brindarle una propuesta ajustada, le agradecería nos indique sus dimensiones y número de unidades. También puede comunicarse directamente al 09920350548. Nuestro taller se encuentra en Calle 25 de Mayo 226, sector Cotocollao, frente al Club de Leones, donde con gusto le atenderemos. Quedo a su entera y grata disposición.`
    },
    {
      id: 'camp-cocinas-fabrica',
      name: '🔥 Cocinas Industriales Precio Directo',
      product: 'Cocina Industrial',
      message: `Buenas tardes, estimado/a {nombre}. Un gusto saludarle de parte de APM Inox. Respecto a su interés en {producto}, le comento que tenemos unidades listas para entrega inmediata con precio directo de taller sin intermediarios. Nuestros equipos son fabricados íntegramente en acero inoxidable sanitario con quemadores de alta potencia y garantía de fábrica. ¿Desea que le enviemos fotos de las medidas disponibles o prefiere coordinar entrega hoy? También puede comunicarse al 09920350548 o ver nuestro catálogo en https://amecocinas.com/ . Quedo a sus órdenes.`
    },
    {
      id: 'camp-visita-cotocollao',
      name: '📍 Visita y Exhibición Cotocollao',
      product: 'Equipos Inox',
      message: `Estimado/a {nombre}, un cordial saludo de parte de APM Inox. Le extendemos una cordial invitación a visitar nuestra fábrica y sala de exhibición en Calle 25 de Mayo 226, sector Cotocollao, frente al Club de Leones. Aquí podrá revisar personalmente los acabados en acero inoxidable sanitario, probar la potencia de los quemadores y llevarse su equipo de inmediato. Atendemos de lunes a sábado. ¿Le gustaría coordinar una visita para hoy? Con gusto le esperamos o puede comunicarse directamente al 09920350548.`
    }
  ];

  function getCustomCampaigns() {
    const saved = lsGet('mc_custom_campaigns', null);
    if (!saved || !Array.isArray(saved) || saved.length === 0) {
      return [...DEFAULT_CUSTOM_CAMPAIGNS];
    }
    return saved;
  }

  function saveCustomCampaigns(list) {
    lsSet('mc_custom_campaigns', list);
  }

  function renderCustomCampaigns() {
    const container = document.getElementById('mc-custom-campaigns-list');
    const badge = document.getElementById('mc-custom-camp-count-badge');
    const autopilotStatus = document.getElementById('mc-autopilot-camp-status');
    const unlinkBtn = document.getElementById('mc-unlink-camp-btn');
    if (!container) return;

    const list = getCustomCampaigns();
    if (badge) badge.innerText = `${list.length} guardada${list.length === 1 ? '' : 's'}`;

    const activeCampId = lsGet('active_autopilot_campaign_id', '');
    const activeCamp = list.find(c => c.id === activeCampId);

    if (autopilotStatus) {
      if (activeCamp) {
        autopilotStatus.innerHTML = `Auto-Pilot enviando: <b style="color:#34d399;">${activeCamp.name}</b>`;
        if (unlinkBtn) unlinkBtn.style.display = 'block';
      } else {
        autopilotStatus.innerHTML = `Modo: <b style="color:#93c5fd;">IA Adaptativa (Gente Fina)</b>`;
        if (unlinkBtn) unlinkBtn.style.display = 'none';
      }
    }

    if (list.length === 0) {
      container.innerHTML = `<div style="text-align:center;padding:12px;color:#64748b;font-size:0.7rem;">No tienes campañas personalizadas guardadas. Redacta una y haz clic en "💾 Guardar como Mi Campaña".</div>`;
      return;
    }

    container.innerHTML = list.map(camp => {
      const isLinked = activeCampId === camp.id;
      const cleanSnippet = (camp.message || '').replace(/[\r\n]+/g, ' ').substring(0, 75);
      return `
        <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;background:linear-gradient(145deg, rgba(22,30,50,0.85), rgba(12,18,32,0.95));border:1px solid ${isLinked ? 'rgba(16,185,129,0.5)' : 'rgba(255,255,255,0.08)'};border-radius:10px;padding:8px 12px;box-shadow:0 2px 6px rgba(0,0,0,0.3);">
          <div style="flex:1;min-width:0;">
            <div style="font-size:0.75rem;font-weight:800;color:#f8fafc;display:flex;align-items:center;gap:6px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
              <span>${camp.name}</span>
              ${isLinked ? '<span style="background:rgba(16,185,129,0.2);color:#34d399;font-size:0.58rem;padding:2px 6px;border-radius:8px;border:1px solid rgba(16,185,129,0.4);font-weight:800;">✓ Auto-Pilot</span>' : ''}
            </div>
            <div style="font-size:0.65rem;color:#94a3b8;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:2px;">
              ${cleanSnippet}...
            </div>
          </div>
          <div style="display:flex;gap:4px;flex-shrink:0;">
            <button type="button" class="mc-load-custom-camp-btn mc-action-btn" data-id="${camp.id}" style="padding:4px 8px;background:linear-gradient(135deg,#2563eb,#1d4ed8);color:#fff;border:none;border-radius:6px;font-size:0.66rem;font-weight:700;cursor:pointer;" title="Cargar mensaje en el redactor">⚡ Cargar</button>
            <button type="button" class="mc-autopilot-custom-camp-btn mc-action-btn" data-id="${camp.id}" style="padding:4px 7px;background:${isLinked ? 'rgba(16,185,129,0.25)' : 'rgba(59,130,246,0.15)'};border:1px solid ${isLinked ? '#10b981' : 'rgba(59,130,246,0.35)'};color:${isLinked ? '#34d399' : '#93c5fd'};border-radius:6px;font-size:0.66rem;font-weight:700;cursor:pointer;" title="Vincular a Auto-Pilot para responder automáticamente">${isLinked ? '✓ Activa' : '📌 Auto-Pilot'}</button>
            <button type="button" class="mc-delete-custom-camp-btn mc-action-btn" data-id="${camp.id}" style="padding:4px 6px;background:rgba(239,68,68,0.15);border:1px solid rgba(239,68,68,0.3);color:#fca5a5;border-radius:6px;font-size:0.66rem;cursor:pointer;" title="Eliminar">✕</button>
          </div>
        </div>
      `;
    }).join('');

    // Attach button events
    container.querySelectorAll('.mc-load-custom-camp-btn').forEach(b => {
      b.addEventListener('click', () => {
        const id = b.getAttribute('data-id');
        const c = getCustomCampaigns().find(item => item.id === id);
        if (c) {
          const msgInput = document.getElementById('mc-camp-message-input');
          if (msgInput) {
            msgInput.value = c.message;
            lsSet('camp_message', c.message);
          }
          showToast(`📋 Campaña "${c.name}" cargada en el redactor`);
        }
      });
    });

    container.querySelectorAll('.mc-autopilot-custom-camp-btn').forEach(b => {
      b.addEventListener('click', () => {
        const id = b.getAttribute('data-id');
        const currentActive = lsGet('active_autopilot_campaign_id', '');
        if (currentActive === id) {
          lsSet('active_autopilot_campaign_id', '');
          renderCustomCampaigns();
          showToast('🤖 Auto-Pilot volvió a modo IA Adaptativa');
        } else {
          lsSet('active_autopilot_campaign_id', id);
          const c = getCustomCampaigns().find(item => item.id === id);
          renderCustomCampaigns();
          showToast(`🤖 ¡Auto-Pilot automatizado con "${c ? c.name : 'tu campaña'}"!`);
        }
      });
    });

    container.querySelectorAll('.mc-delete-custom-camp-btn').forEach(b => {
      b.addEventListener('click', () => {
        const id = b.getAttribute('data-id');
        let list = getCustomCampaigns().filter(item => item.id !== id);
        saveCustomCampaigns(list);
        if (lsGet('active_autopilot_campaign_id', '') === id) {
          lsSet('active_autopilot_campaign_id', '');
        }
        renderCustomCampaigns();
        showToast('🗑️ Campaña personalizada eliminada');
      });
    });
  }

  function updateCampaignLeadCounter() {
    const input = document.getElementById('mc-camp-leads-input');
    const badge = document.getElementById('mc-camp-count-badge');
    if (!input || !badge) return;
    const lines = input.value.split('\n').map(l => l.trim()).filter(Boolean);
    badge.innerText = `${lines.length} seleccionado${lines.length === 1 ? '' : 's'}`;
  }

  function appendCampaignLog(htmlText) {
    const list = document.getElementById('mc-camp-log-list');
    if (!list) return;
    const row = document.createElement('div');
    row.innerHTML = htmlText;
    list.appendChild(row);
    const box = document.getElementById('mc-camp-log-box');
    if (box) box.scrollTop = box.scrollHeight;
  }

  function insertTagIntoCampaignMsg(tag) {
    const msgInput = document.getElementById('mc-camp-message-input');
    if (!msgInput) return;
    const start = msgInput.selectionStart || 0;
    const end = msgInput.selectionEnd || 0;
    const val = msgInput.value;
    msgInput.value = val.substring(0, start) + tag + val.substring(end);
    msgInput.selectionStart = msgInput.selectionEnd = start + tag.length;
    msgInput.focus();
    lsSet('camp_message', msgInput.value);
  }

  // Preset Buttons
  document.querySelectorAll('.mc-camp-preset-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const presetKey = btn.getAttribute('data-preset');
      const text = campPresets[presetKey];
      const msgInput = document.getElementById('mc-camp-message-input');
      if (text && msgInput) {
        msgInput.value = text;
        lsSet('camp_message', text);
        showToast('📋 Plantilla de campaña cargada');
      }
    });
  });

  // Variable Chips
  document.querySelectorAll('.mc-var-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      const tag = chip.getAttribute('data-var');
      if (tag) insertTagIntoCampaignMsg(tag);
    });
  });

  // Lead inputs live save
  const campLeadsInput = document.getElementById('mc-camp-leads-input');
  if (campLeadsInput) {
    campLeadsInput.addEventListener('input', () => {
      updateCampaignLeadCounter();
      lsSet('camp_leads', campLeadsInput.value);
    });
  }

  const campMsgInput = document.getElementById('mc-camp-message-input');
  if (campMsgInput) {
    campMsgInput.addEventListener('input', () => {
      lsSet('camp_message', campMsgInput.value);
    });
  }

  const campDelayInput = document.getElementById('mc-camp-delay-input');
  if (campDelayInput) {
    campDelayInput.addEventListener('input', () => {
      lsSet('camp_delay', campDelayInput.value);
    });
  }

  // Clear leads button
  const clearLeadsBtn = document.getElementById('mc-camp-clear-leads-btn');
  if (clearLeadsBtn && campLeadsInput) {
    clearLeadsBtn.addEventListener('click', () => {
      campLeadsInput.value = '';
      updateCampaignLeadCounter();
      lsSet('camp_leads', '');
      showToast('🗑️ Lista de prospectos limpiada');
    });
  }

  // Extract Leads Button
  const extractLeadsBtn = document.getElementById('mc-camp-extract-btn');
  if (extractLeadsBtn && campLeadsInput) {
    extractLeadsBtn.addEventListener('click', async () => {
      extractLeadsBtn.innerText = '⏳ Extrayendo...';
      const extractedSet = new Set();
      const extractedList = [];

      const addLead = (name, product) => {
        const cleanN = cleanLeadName(name);
        if (!cleanN || cleanN === 'Cliente' || !isValidLeadName(cleanN)) return;
        const cleanP = (product || '').trim();
        const norm = cleanN.toLowerCase();
        if (extractedSet.has(norm)) return;
        extractedSet.add(norm);
        extractedList.push({ name: cleanN, product: cleanP });
      };

      // 1. From live chat bubbles on screen
      try {
        const bubbles = findChatBubbles();
        bubbles.forEach(b => addLead(b.name, b.product));
      } catch (e) {}

      // 2. From pending Facebook customer chats
      try {
        const pending = findPendingCustomerChats();
        pending.forEach(p => addLead(p.leadName, p.productName));
      } catch (e) {}

      // 3. From cached CRM leads
      if (Array.isArray(crmLeadsCache) && crmLeadsCache.length > 0) {
        crmLeadsCache.forEach(l => addLead(l.name || l.buyerName, l.product || l.productInterest));
      }

      if (extractedList.length === 0) {
        showToast('⚠️ No se encontraron prospectos nuevos en pantalla.');
        extractLeadsBtn.innerText = '⚡ Extraer Prospectos';
        return;
      }

      const formatted = extractedList.map(item => item.product ? `${item.name} | ${item.product}` : item.name).join('\n');
      campLeadsInput.value = formatted;
      updateCampaignLeadCounter();
      lsSet('camp_leads', formatted);
      extractLeadsBtn.innerText = '⚡ Extraer Prospectos';
      showToast(`🎉 ¡${extractedList.length} prospectos extraídos para la campaña!`);
    });
  }

  // AI Refine Campaign Message
  const aiRefineBtn = document.getElementById('mc-camp-ai-refine-btn');
  if (aiRefineBtn && campMsgInput) {
    aiRefineBtn.addEventListener('click', async () => {
      const currentText = campMsgInput.value.trim();
      if (!currentText) {
        alert('Por favor escribe un borrador de mensaje primero.');
        return;
      }
      aiRefineBtn.innerText = '⏳ Pulir con IA...';
      try {
        const prompt = `Actúa como asesor comercial de élite de APM Inox / amecocinas.com.
Reescribe y perfecciona este mensaje de campaña para que suene con máxima cortesía, formalidad, respeto (gente fina) y persuasión comercial.
Conserva intactas las variables {nombre}, {producto}, https://amecocinas.com/, 09920350548, y la referencia a nuestro taller en Cotocollao frente al Club de Leones.
Mensaje original:
"${currentText}"

Devuelve únicamente el texto final sin etiquetas, sin markdown, sin comillas adicionales.`;

        const res = await crmFetch('/ai/chat', 'POST', {
          messages: [{ role: 'user', content: prompt }]
        });
        if (res.ok && res.data?.reply) {
          const polished = cleanReplyForChat(res.data.reply);
          campMsgInput.value = polished;
          lsSet('camp_message', polished);
          showToast('✨ Mensaje de campaña perfeccionado con IA');
        } else {
          showToast('⚠️ No se pudo conectar con la IA. Manteniendo borrador.');
        }
      } catch (err) {
        showToast('⚠️ Error al consultar IA');
      } finally {
        aiRefineBtn.innerText = '🧠 Pulir con IA';
      }
    });
  }

  // Save current message as custom campaign
  const saveCustomCampBtn = document.getElementById('mc-save-as-custom-camp-btn');
  if (saveCustomCampBtn) {
    saveCustomCampBtn.addEventListener('click', () => {
      const msg = (campMsgInput ? campMsgInput.value : '').trim();
      if (!msg) {
        alert('⚠️ Por favor redacta primero el mensaje de tu campaña en la caja de texto.');
        return;
      }
      const title = prompt('Ingresa un título para tu campaña personalizada (ej: "Góndolas Modelo Central", "Oferta Freidoras 20L"):');
      if (!title || !title.trim()) return;

      const cleanTitle = title.trim();
      const newCamp = {
        id: `camp-${Date.now()}`,
        name: cleanTitle,
        product: '',
        message: msg
      };

      const list = getCustomCampaigns();
      list.unshift(newCamp);
      saveCustomCampaigns(list);
      renderCustomCampaigns();

      // Sincronizar también con backend templates
      try {
        crmFetch('/automations/templates', 'POST', {
          title: newCamp.name,
          category: 'Campaña Personalizada',
          channel: 'messenger',
          content: newCamp.message
        });
      } catch (e) {}

      showToast(`⭐ ¡Campaña "${cleanTitle}" guardada con éxito!`);
    });
  }

  // Unlink active campaign from Auto-Pilot (return to adaptive AI mode)
  const unlinkCampBtn = document.getElementById('mc-unlink-camp-btn');
  if (unlinkCampBtn) {
    unlinkCampBtn.addEventListener('click', () => {
      lsSet('active_autopilot_campaign_id', '');
      renderCustomCampaigns();
      showToast('🤖 Auto-Pilot volvió a modo IA Adaptativa');
    });
  }

  // Initial render of saved custom campaigns
  renderCustomCampaigns();

  // Campaign Runner Engine
  const campStartBtn = document.getElementById('mc-camp-start-btn');
  const campStopBtn  = document.getElementById('mc-camp-stop-btn');
  const campProgContainer = document.getElementById('mc-camp-progress-container');
  const campProgBar = document.getElementById('mc-camp-progress-bar');
  const campProgPct = document.getElementById('mc-camp-progress-pct');
  const campProgLabel = document.getElementById('mc-camp-progress-label');
  const campStatusDetail = document.getElementById('mc-camp-status-detail');
  const campStatusPill = document.getElementById('mc-campaign-status-pill');

  if (campStartBtn && campStopBtn) {
    campStartBtn.addEventListener('click', async () => {
      const rawLeads = (campLeadsInput ? campLeadsInput.value : '').split('\n').map(l => l.trim()).filter(Boolean);
      const rawTemplate = (campMsgInput ? campMsgInput.value : '').trim();
      const delaySeconds = Math.max(6, parseInt(campDelayInput ? campDelayInput.value : '12', 10) || 12);

      if (rawLeads.length === 0) {
        alert('⚠️ Por favor agrega al menos un destinatario o haz clic en "⚡ Extraer Prospectos".');
        return;
      }
      if (!rawTemplate) {
        alert('⚠️ Por favor redacta o selecciona un mensaje para la campaña.');
        return;
      }

      // Parse recipients
      const recipients = rawLeads.map(line => {
        let name = line;
        let product = '';
        if (line.includes('|')) {
          const parts = line.split('|').map(p => p.trim());
          name = parts[0];
          product = parts.slice(1).join(' - ');
        } else if (line.includes('-') && !line.includes('T-304')) {
          const parts = line.split('-').map(p => p.trim());
          name = parts[0];
          product = parts.slice(1).join(' - ');
        }
        return { name: cleanLeadName(name), product };
      }).filter(r => isValidLeadName(r.name) && r.name !== 'Cliente');

      if (recipients.length === 0) {
        alert('⚠️ No se detectaron nombres de prospectos válidos en la lista.');
        return;
      }

      isCampaignRunning = true;
      campaignAborted = false;

      campStartBtn.style.display = 'none';
      campStopBtn.style.display = 'flex';
      if (campProgContainer) campProgContainer.style.display = 'block';
      if (campStatusPill) {
        campStatusPill.innerText = '⚡ En Ejecución';
        campStatusPill.style.background = 'rgba(37,99,235,0.25)';
        campStatusPill.style.color = '#93c5fd';
      }

      appendCampaignLog(`<b>🚀 Campaña Iniciada:</b> ${recipients.length} prospectos · Pausa: ${delaySeconds}s anti-bloqueo.`);

      // Notify backend broadcast endpoint
      try {
        crmFetch('/automations/broadcast/start', 'POST', {
          title: `Campaña Facebook: ${recipients.length} Prospectos`,
          targetAudience: 'facebook_marketplace',
          delaySeconds,
          message: rawTemplate,
          sentCount: recipients.length
        });
      } catch (e) {}

      let successCount = 0;
      let skippedCount = 0;

      for (let i = 0; i < recipients.length; i++) {
        if (campaignAborted || !isCampaignRunning) {
          appendCampaignLog(`<span style="color:#ef4444;">🛑 Campaña detenida por el usuario.</span>`);
          break;
        }

        const recipient = recipients[i];
        const progressPct = Math.round(((i) / recipients.length) * 100);
        if (campProgBar) campProgBar.style.width = `${progressPct}%`;
        if (campProgPct) campProgPct.innerText = `${progressPct}%`;
        if (campProgLabel) campProgLabel.innerText = `Enviando ${i + 1} de ${recipients.length}...`;
        if (campStatusDetail) campStatusDetail.innerHTML = `⏳ Preparando envío para <b>${recipient.name}</b>...`;

        // Personalize message
        let personalized = rawTemplate
          .replace(/\{nombre\}|\{cliente\}/gi, recipient.name)
          .replace(/\{producto\}|\{equipo\}/gi, recipient.product || 'equipos gastronómicos en acero inoxidable')
          .replace(/\{web\}/gi, 'https://amecocinas.com/')
          .replace(/\{telefono\}|\{whatsapp\}/gi, '09920350548')
          .replace(/\{taller\}|\{ubicacion\}/gi, 'Calle 25 de Mayo 226, sector Cotocollao, frente al Club de Leones');

        personalized = cleanReplyForChat(personalized);

        // Find or open chat in Facebook
        const normName = cleanLeadName(recipient.name).toLowerCase();
        let targetBox = findOpenChatForLead(recipient.name, recipient.product);

        if (!targetBox || !targetBox.textbox) {
          // Search in live bubbles
          const bubbles = findChatBubbles();
          const matchBubble = bubbles.find(b => {
            const bNorm = cleanLeadName(b.name).toLowerCase();
            return bNorm.includes(normName) || normName.includes(bNorm);
          });

          if (matchBubble && matchBubble.el) {
            openFacebookChatItem(matchBubble.el, true);
            await new Promise(r => setTimeout(r, 700));
          } else {
            // Search in pending chat rows
            const pendingChats = findPendingCustomerChats();
            const matchChat = pendingChats.find(c => {
              const cNorm = cleanLeadName(c.leadName).toLowerCase();
              return cNorm.includes(normName) || normName.includes(cNorm);
            });
            if (matchChat && matchChat.domElement) {
              openFacebookChatItem(matchChat.domElement, false);
              await new Promise(r => setTimeout(r, 600));
            }
          }

          // Poll for textbox
          for (let attempt = 0; attempt < 8; attempt++) {
            targetBox = findOpenChatForLead(recipient.name, recipient.product);
            if (targetBox && targetBox.textbox) break;
            await new Promise(r => setTimeout(r, 350));
          }
        }

        if (targetBox && targetBox.textbox) {
          // Insert text cleanly
          insertTextIntoTextbox(targetBox.textbox, personalized);
          await new Promise(r => setTimeout(r, 400));

          // Send message
          await sendChatMessageNow(targetBox.textbox, targetBox.container);
          successCount++;
          appendCampaignLog(`<span style="color:#34d399;">✅ [${new Date().toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}] Enviado a <b>${recipient.name}</b> (${recipient.product || 'Equipo Inox'})</span>`);
          showToast(`🚀 Mensaje de campaña enviado a <b>${recipient.name}</b>`);
        } else {
          skippedCount++;
          appendCampaignLog(`<span style="color:#fbbf24;">⚠️ [${new Date().toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}] Ventana no visible para <b>${recipient.name}</b> (mantén la pestaña de chat abierta).</span>`);
        }

        // Wait safe interval before next recipient
        if (i < recipients.length - 1 && !campaignAborted && isCampaignRunning) {
          const jitter = Math.floor(Math.random() * 4) - 1;
          const waitTime = Math.max(5, delaySeconds + jitter);
          for (let s = waitTime; s > 0; s--) {
            if (campaignAborted || !isCampaignRunning) break;
            if (campStatusDetail) campStatusDetail.innerHTML = `🛡️ Pausa anti-bloqueo: próximo envío en <b>${s}s</b>...`;
            await new Promise(r => setTimeout(r, 1000));
          }
        }
      }

      // Finish Campaign
      isCampaignRunning = false;
      campStartBtn.style.display = 'flex';
      campStopBtn.style.display = 'none';

      if (campProgBar) campProgBar.style.width = '100%';
      if (campProgPct) campProgPct.innerText = '100%';
      if (campProgLabel) campProgLabel.innerText = 'Campaña completada';
      if (campStatusDetail) campStatusDetail.innerHTML = `🎉 <b>Finalizado:</b> ${successCount} enviados${skippedCount > 0 ? `, ${skippedCount} omitidos` : ''}.`;
      if (campStatusPill) {
        campStatusPill.innerText = '🟢 Finalizado';
        campStatusPill.style.background = 'rgba(16,185,129,0.15)';
        campStatusPill.style.color = '#34d399';
      }

      appendCampaignLog(`<b>🎉 Fin de Campaña:</b> ${successCount} mensajes enviados exitosamente.`);
      showToast(`🎉 ¡Campaña de Facebook finalizada! (${successCount} enviados)`);
    });

    campStopBtn.addEventListener('click', () => {
      campaignAborted = true;
      isCampaignRunning = false;
      campStartBtn.style.display = 'flex';
      campStopBtn.style.display = 'none';
      if (campStatusDetail) campStatusDetail.innerHTML = `⏸️ <b>Campaña detenida</b> por el usuario.`;
      if (campStatusPill) {
        campStatusPill.innerText = '⏸️ Detenida';
        campStatusPill.style.background = 'rgba(239,68,68,0.15)';
        campStatusPill.style.color = '#fca5a5';
      }
      showToast('🛑 Campaña detenida inmediatamente.');
    });
  }

  // ─── AI Chat & Auto-Detection ────────────────────────────────────────────────
  let detectedChats = [];
  let currentActiveChat = null;
  let crmLeadsCache = [];

  // Legacy sub-tabs delegation
  function switchChatSubtab(tab) {
    if (tab === 'crm') {
      switchTab('crm');
    } else {
      switchTab('chat');
    }
  }

  function openFacebookChatItem(el, isBubble = false) {
    if (!el) return false;
    if (!isBubble && isListingOrNavNode(el)) {
      console.warn('[MetaCloser] Click bloqueado: el elemento es una publicación/navegación, no un chat.');
      return false;
    }
    if (isBubble) {
      console.log('[MetaCloser] Abriendo burbuja de chat...');
      const opts = { bubbles: true, cancelable: true, view: window, button: 0 };
      try {
        try { el.scrollIntoView({ block: 'nearest', behavior: 'instant' }); } catch(e) {}
        el.dispatchEvent(new PointerEvent('pointerdown', opts));
        el.dispatchEvent(new MouseEvent('mousedown', opts));
        el.dispatchEvent(new PointerEvent('pointerup', opts));
        el.dispatchEvent(new MouseEvent('mouseup', opts));
        el.click();

        // Also trigger on interactive wrapper or child if present
        const btn = el.closest('div[role="button"], a[role="link"], div[role="link"], div[tabindex="0"]') || el.querySelector('div[role="button"], a');
        if (btn && btn !== el) {
          btn.dispatchEvent(new MouseEvent('mousedown', opts));
          btn.dispatchEvent(new MouseEvent('mouseup', opts));
          btn.click();
        }
      } catch (e) { console.warn('[bubble click error]', e); }
      return true;
    }
    try { el.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); } catch(e) {}

    // Auto-expand accordion in Meta Business Suite if collapsed
    const accordionBtn = el.closest('div[role="region"]')?.previousElementSibling ||
      document.querySelector('div[role="button"][aria-expanded="false"]');
    if (accordionBtn && (accordionBtn.innerText || '').includes('chats de este anuncio')) {
      try { accordionBtn.click(); } catch(e) {}
    }

    // 1. Direct link detection (only real conversation links, never listings)
    let directLink = (el.tagName === 'A' && el.href) ? el : el.querySelector('a[href*="/messages/t/"], a[href*="/inbox/"], a[href*="/marketplace/t/"]');
    if (directLink && isListingOrNavNode(directLink)) directLink = null;

    // 2. Identify optimal target element: avoid action buttons (star, dots, checkbox)
    let target = directLink;
    if (!target) {
      // Find main text cell or container
      const textCell = Array.from(el.querySelectorAll('div, span')).find(child => {
        const aria = (child.getAttribute('aria-label') || '').toLowerCase();
        const role = (child.getAttribute('role') || '').toLowerCase();
        if (role === 'button' && (aria.includes('más') || aria.includes('star') || aria.includes('destacar') || aria.includes('marcar'))) return false;
        return child.innerText && child.innerText.length >= 2 && child.children.length === 0;
      });
      target = textCell || el.querySelector('div[role="gridcell"], div[tabindex="0"]') || el;
    }

    const mouseOpts = {
      bubbles: true,
      cancelable: true,
      view: window,
      clientX: 0,
      clientY: 0,
      button: 0,
      buttons: 1
    };

    const rect = target.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) {
      mouseOpts.clientX = rect.left + Math.max(5, rect.width / 2);
      mouseOpts.clientY = rect.top + Math.max(5, rect.height / 2);
    }

    try { target.focus(); } catch(e) {}
    target.dispatchEvent(new PointerEvent('pointerdown', mouseOpts));
    target.dispatchEvent(new MouseEvent('mousedown', mouseOpts));
    target.dispatchEvent(new PointerEvent('pointerup', mouseOpts));
    target.dispatchEvent(new MouseEvent('mouseup', mouseOpts));
    target.dispatchEvent(new MouseEvent('click', mouseOpts));
    if (typeof target.click === 'function') {
      try { target.click(); } catch(e) {}
    }

    // Also trigger on el itself if different from target, to ensure React row click listener catches it
    if (el !== target) {
      try {
        el.dispatchEvent(new MouseEvent('click', mouseOpts));
        if (typeof el.click === 'function') el.click();
      } catch(e) {}
    }

    if (directLink && directLink !== target) {
      try { directLink.click(); } catch(e) {}
    }

    return true;
  }

  function scanFacebookChats() {
    detectedChats = [];
    const select = document.getElementById('mc-fb-chat-select');
    if (!select) return;

    activeAdProduct = '';

    // 1. Scan active/open chat boxes (contenteditable or textbox)
    const allInputs = Array.from(document.querySelectorAll('div[contenteditable="true"], div[role="textbox"], textarea'))
      .filter(el => !el.closest('#metacloser-crm-sidebar'));

    allInputs.forEach((tb, idx) => {
      // Find top-level container (supports BOTH Meta Business Suite full inbox AND floating Messenger popups)
      let container = null;
      let cur = tb;
      while (cur && cur !== document.body) {
        // Check for Meta Business Suite conversation panel
        const isSuitePanel = (
          cur.querySelector && (
            cur.querySelector('*[aria-label*="Asignar esta conversación"], *[aria-label*="Assign this conversation"]') ||
            (cur.innerText && cur.innerText.includes('Asignar esta conversación')) ||
            (cur.innerText && cur.innerText.includes('Este chat contiene una respuesta a tu anuncio'))
          )
        );
        if (isSuitePanel) {
          container = cur;
          break;
        }

        // Check for floating Messenger popup (width 260 - 480)
        const r = cur.getBoundingClientRect();
        if (r.width >= 260 && r.width <= 480 && r.height >= 220) {
          container = cur;
        }
        cur = cur.parentElement;
      }
      if (!container) {
        container = tb.closest('div[role="main"], div[role="region"], div[role="dialog"]') || tb.parentElement?.parentElement || tb.parentElement;
      }

      const text = container ? (container.innerText || '') : '';
      const fullDocText = (text + '\n' + (document.body.innerText || ''));
      const lines = text.split('\n').map(l => l.trim()).filter(Boolean);

      let leadName = '';
      let productName = '';
      let price = '';
      let customerMessage = '';

      // 0. High-accuracy extraction from chat header / dialog
      const headerInfo = extractChatHeader(container);
      if (headerInfo.buyer && isValidLeadName(headerInfo.buyer)) {
        leadName = headerInfo.buyer;
      }
      if (headerInfo.product && isValidProductName(headerInfo.product)) {
        productName = headerInfo.product;
        activeAdProduct = headerInfo.product;
      }

      // --- META BUSINESS SUITE SPECIFIC DETECTION ---
      // 1. Lead name from Meta Business Suite header (next to "Asignar esta conversación")
      const assignEl = document.querySelector('*[aria-label*="Asignar esta conversación"], *[aria-label*="Assign this conversation"]') ||
        Array.from(document.querySelectorAll('div, span, button')).find(el => {
          const t = (el.innerText || '').trim();
          return t === 'Asignar esta conversación' || t.startsWith('Asignar esta conversación');
        });
      if (assignEl) {
        const headerBox = assignEl.closest('div[role="banner"]') || assignEl.parentElement?.parentElement || assignEl.parentElement;
        if (headerBox) {
          const hLines = (headerBox.innerText || '').split('\n').map(l => l.trim()).filter(Boolean);
          const cand = hLines.find(l => 
            !l.toLowerCase().includes('asignar') && 
            l.length >= 2 && l.length <= 40 && 
            !isSystemNoise(l)
          );
          if (cand) leadName = cand;
        }
      }

      // 2. Lead name from notice: "Paty Vásquez respondió a un anuncio."
      if (!leadName) {
        const noticeMatch = fullDocText.match(/([A-Za-zÀ-ÿ0-9_ -]{2,35})\s+respondió a un anuncio/i);
        if (noticeMatch && !isSystemNoise(noticeMatch[1])) {
          leadName = noticeMatch[1].trim();
        }
      }

      // 3. Product name from Meta Business Suite Ad Banner:
      // "Este chat contiene una respuesta a tu anuncio.\nCocinas con parrilla de hierro fundido de 1,2,3,4,5 quemadores Ver anuncio"
      const suiteBannerMatch = fullDocText.match(/(?:Este chat contiene una respuesta a tu anuncio|This chat contains a response to your ad)[\s\S]*?\n\s*([^\n]+?)(?:\s*(?:Ver anuncio|View ad)|\n|$)/i);
      if (suiteBannerMatch && suiteBannerMatch[1]) {
        const candProd = suiteBannerMatch[1].trim();
        if (candProd.length >= 3 && !isSystemNoise(candProd) && candProd !== 'Ver anuncio') {
          productName = candProd;
          activeAdProduct = candProd;
        }
      }

      // 4. Product name from Group Card Banner:
      // "Mensajes que esperan respuesta hace más de 3 horas\n19 chats de este anuncio necesitan respuesta"
      if (!productName) {
        const groupEl = Array.from(document.querySelectorAll('div, span')).find(el => (el.innerText || '').includes('chats de este anuncio necesitan respuesta'));
        if (groupEl) {
          const groupCard = groupEl.closest('div[role="button"], div[tabindex="0"], div[role="region"]') || groupEl.parentElement;
          if (groupCard) {
            const gLines = (groupCard.innerText || '').split('\n').map(l => l.trim()).filter(Boolean);
            const cand = gLines.find(l => !l.includes('chats de este anuncio') && !l.includes('Mensajes que esperan') && l.length >= 4 && !isSystemNoise(l));
            if (cand) {
              productName = cand;
              activeAdProduct = cand;
            }
          }
        }
      }

      // --- STANDARD FACEBOOK MARKETPLACE DETECTION ---
      // 5. Marketplace item link
      if (!productName) {
        const mktLink = container.querySelector('a[href*="/marketplace/item/"], a[href*="/marketplace/message/"], a[href*="/marketplace/"]');
        if (mktLink) {
          const mktText = (mktLink.innerText || mktLink.getAttribute('aria-label') || '').trim();
          if (mktText && !isSystemNoise(mktText)) {
            const mktLines = mktText.split('\n').map(l => l.trim()).filter(Boolean);
            const candidateTitle = mktLines.find(l => !l.includes('$') && l.length >= 3 && !isSystemNoise(l));
            if (candidateTitle) productName = candidateTitle;
            const candidatePrice = mktLines.find(l => l.includes('$'));
            if (candidatePrice && !price) {
              const pm = candidatePrice.match(/\$\s*(\d+[\d.,]*)/);
              if (pm) price = `$${pm[1]}`;
            }
          }
        }
      }

      // 6. Profile image alt text
      if (!leadName) {
        const profileImg = container.querySelector('img[alt*="Foto de"], img[alt*="Foto del"], img[alt*="perfil"], img[alt*="profile"]');
        if (profileImg) {
          const alt = profileImg.getAttribute('alt') || '';
          const imgMatch = alt.match(/(?:foto\s+(?:del\s+|de\s+)?perfil\s+de|profile picture of)\s+([A-Za-zÀ-ÿ0-9_ -]+)/i);
          if (imgMatch) {
            const cand = imgMatch[1].trim();
            if (!isSystemNoise(cand) && cand.length >= 2 && cand.length <= 35) {
              leadName = cand;
            }
          }
        }
      }

      // 7. Dialog header aria-label
      if (!leadName) {
        const dialogHeader = container.querySelector('div[aria-label*="Chat con"], div[aria-label*="Conversación con"], div[aria-label*="Chat with"]');
        if (dialogHeader) {
          const aria = dialogHeader.getAttribute('aria-label') || '';
          const ariaMatch = aria.match(/(?:Chat\s+con|Conversación\s+con|Chat\s+with)\s+([A-Za-zÀ-ÿ0-9_ -]+)/i);
          if (ariaMatch && !isSystemNoise(ariaMatch[1])) leadName = ariaMatch[1].trim();
        }
      }

      // 8. "X está esperando tu respuesta"
      if (!leadName) {
        const waitingMatch = text.match(/([A-Za-zÀ-ÿ0-9_ -]{2,30})\s+(?:está esperando tu respuesta|is waiting for your (?:reply|response))/i);
        if (waitingMatch && !isSystemNoise(waitingMatch[1])) {
          leadName = waitingMatch[1].trim();
        }
      }

      // 9. Line separator checks "[Buyer] · [Product]"
      const sepRegex = /[\u00B7\u2022\u2013\u2014\-\|]/;
      for (const line of lines) {
        if (isSystemNoise(line)) continue;
        if (sepRegex.test(line)) {
          const parts = line.split(sepRegex).map(p => p.trim()).filter(Boolean);
          if (parts.length >= 2) {
            if (parts[0].includes('$') || parts[1].includes('$')) {
              const pPart = parts[0].includes('$') ? parts[0] : parts[1];
              const prodPart = parts[0].includes('$') ? parts[1] : parts[0];
              const pm = pPart.match(/\$\s*(\d+[\d.,]*)/);
              if (pm && !price) price = `$${pm[1]}`;
              if (!productName && prodPart.length >= 3 && !isSystemNoise(prodPart)) {
                productName = prodPart;
              }
            } else {
              if (!leadName && parts[0].length >= 2 && parts[0].length <= 30 && !isSystemNoise(parts[0])) {
                leadName = parts[0];
              }
              if (!productName && parts[1].length >= 3 && !isSystemNoise(parts[1])) {
                productName = parts[1];
              }
            }
          }
        }
      }

      // Price fallback
      if (!price) {
        for (const line of lines) {
          const pm = line.match(/\$\s*(\d+[\d.,]*)/);
          if (pm) { price = `$${pm[1]}`; break; }
        }
      }

      // Final cleanup for leadName
      if (leadName) {
        leadName = cleanLeadName(leadName);
      }
      if (!leadName || isSystemNoise(leadName)) {
        leadName = '';
      }

      // Customer message extraction (filter noise, timestamps, placeholders, agent messages)
      const hasQuickPrompt = lines.some(l => 
        l.toLowerCase().includes('esperando tu respuesta') || 
        l.toLowerCase().includes('toca una respuesta') || 
        l.toLowerCase().includes('¿te interesa?') ||
        l.toLowerCase().includes('lo estoy mirando')
      );

      if (hasQuickPrompt && productName) {
        customerMessage = `Hola, ¿sigue disponible ${productName}?`;
      } else {
        const cleanMsgLines = lines.filter(l => {
          if (isSystemNoise(l)) return false;
          if (l.includes('$')) return false;
          if (/^\d{1,2}:\d{2}\s*(?:am|pm)?$/i.test(l)) return false;
          if (l.toLowerCase().startsWith('tú:') || l.toLowerCase().startsWith('you:')) return false;
          if (l.toLowerCase().includes('¿cómo podemos ayudarte?')) return false;
          if (leadName && l.toLowerCase() === leadName.toLowerCase()) return false;
          if (productName && l.toLowerCase() === productName.toLowerCase()) return false;
          return l.length > 2;
        });

        if (cleanMsgLines.length > 0) {
          customerMessage = cleanMsgLines[cleanMsgLines.length - 1];
        }
      }

      if (!customerMessage) {
        customerMessage = productName ? `Hola, ¿cuál es el precio de ${productName}?` : '¿Sigue disponible este artículo?';
      }

      detectedChats.push({
        id: `open-${idx}`,
        leadName: leadName || 'Cliente',
        productName: productName || activeAdProduct || 'Cocina / Asador en Acero Inoxidable',
        price: price || '',
        customerMessage,
        textbox: tb,
        container,
        isOpen: true,
        hasQuickPrompt,
      });
    });

    // 1.5. Scan Minimized Messenger Chat Bubbles ("burbujitas") on the right edge
    const bubbles = findChatBubbles();
    bubbles.forEach((b, bIdx) => {
      const cName = cleanLeadName(b.name || `Cliente Burbuja ${bIdx + 1}`);
      const cProd = b.product || activeAdProduct || 'Equipo Inox Marketplace';
      detectedChats.push({
        id: `bubble-${bIdx}`,
        leadName: cName,
        productName: cProd,
        price: '',
        customerMessage: `Consulta de cliente (Burbuja Messenger${b.unread > 0 ? ` · ${b.unread} sin leer` : ''})`,
        textbox: null,
        container: b.el,
        domElement: b.el,
        isOpen: false,
        isBubble: true,
        unread: b.unread,
        hasBlueDot: b.unread > 0
      });
    });

    // 2. Scan chats list in left column ONLY if on an actual Inbox page
    const isInboxPage = (
      window.location.pathname.includes('/messages') ||
      window.location.pathname.includes('/marketplace/inbox') ||
      window.location.pathname.includes('/latest/inbox') ||
      !!document.querySelector('div[data-pagelet*="MWInbox"], div[aria-label*="Bandeja de entrada"], div[aria-label*="Inbox"]')
    );

    if (isInboxPage) {
      const listItems = Array.from(document.querySelectorAll(
        CHAT_LIST_SELECTOR
      )).filter(el => {
        if (el.closest('#metacloser-crm-sidebar, #mc-fb-floating-bar')) return false;
        if (isListingOrNavNode(el)) return false;
        return true;
      });

      const seenLeads = new Set(detectedChats.map(c => (c.leadName || '').toLowerCase()));

      listItems.forEach((el, idx) => {
        const raw = (el.innerText || '').trim();
        if (!raw || raw.length < 5 || raw.length > 400) return;
        if (isListingOrNavNode(el)) return;

        const rawLower = raw.toLowerCase();
        if (
          rawLower.includes('te etiquetó') ||
          rawLower.includes('te etiqueto') ||
          rawLower.includes('visualizaciones nuevas') ||
          rawLower.includes('en un comentario') ||
          rawLower.includes('en una foto') ||
          rawLower.includes('en un video') ||
          rawLower.includes('notificaciones anteriores')
        ) return;

        const lines = raw.split('\n').map(l => l.trim()).filter(Boolean);
        if (lines.length < 1) return;

        let potentialBuyer = '';
        let potentialProd = '';
        let customerMessage = '';

        // Format 1: Separator [Buyer] · [Product] (Personal Marketplace)
        const sepRegex = /[\u00B7\u2022\u2013\u2014\-\|]/;
        let headerLine = lines.find(l => sepRegex.test(l) && !l.includes('· min') && !l.includes('· h') && !l.includes('· d') && !l.includes('· sem') && !/^\d{1,2}:\d{2}/.test(l));

        if (headerLine) {
          const parts = headerLine.split(sepRegex).map(p => p.trim()).filter(Boolean);
          if (parts.length >= 2) {
            potentialBuyer = parts[0];
            potentialProd = parts.slice(1).join(' - ');
          }
        }

        // Format 2: Meta Business Suite Inbox row (no separator, Name is line 1)
        if (!potentialBuyer) {
          const nameCandidate = lines.find(l => 
            !isSystemNoise(l) &&
            !/^\d{1,2}:\d{2}\s*(?:am|pm)?$/i.test(l) &&
            !l.startsWith('Tú:') && !l.startsWith('You:') &&
            !l.startsWith('ad_id') &&
            !l.includes('Mensajes que esperan') &&
            !l.includes('Conectar con') &&
            l.length >= 2 && l.length <= 40
          );

          if (nameCandidate) {
            potentialBuyer = nameCandidate;
            potentialProd = activeAdProduct || 'Cocina / Asador en Acero Inoxidable';
            
            const msgCandidate = lines.find(l => 
              l !== nameCandidate &&
              !/^\d{1,2}:\d{2}\s*(?:am|pm)?$/i.test(l) &&
              !l.startsWith('ad_id') &&
              !isSystemNoise(l) &&
              l.length >= 2
            );
            if (msgCandidate) {
              customerMessage = msgCandidate;
            }
          }
        }

        if (!potentialBuyer) return;
        potentialBuyer = cleanLeadName(potentialBuyer);

        // Filter personal purchases (Mazda, Tucson, APM asking someone else, etc.)
        const buyerLower = potentialBuyer.toLowerCase();
        const prodLower = (potentialProd || '').toLowerCase();
        const isPersonalPurchase = (
          buyerLower === 'apm' ||
          buyerLower.startsWith('apm ') ||
          buyerLower.includes('apm inox') ||
          buyerLower === 'alex' ||
          buyerLower.startsWith('alex ') ||
          prodLower.includes('mazda') ||
          prodLower.includes('tucson') ||
          prodLower.includes('d-max') ||
          prodLower.includes('salas en oferta')
        );
        if (isPersonalPurchase) return;

        if (seenLeads.has(potentialBuyer.toLowerCase())) return;
        seenLeads.add(potentialBuyer.toLowerCase());

        if (!customerMessage) {
          customerMessage = potentialProd ? `Hola, ¿sigue disponible ${potentialProd}?` : '¿Sigue disponible este artículo?';
        }

        const hasBlueDot = !!el.querySelector('div[aria-label*="No leído"], div[aria-label*="Unread"], span[class*="x14yjl9h"], div[class*="x14yjl9h"], div[class*="x1vjfegm"], circle, [style*="rgb(0, 100, 224)"], [style*="rgb(49, 162, 76)"]');

        detectedChats.push({
          id: `unopened-${idx}`,
          leadName: potentialBuyer,
          productName: potentialProd || activeAdProduct || 'Cocina / Asador en Acero Inoxidable',
          price: '',
          customerMessage,
          textbox: null,
          domElement: el,
          isOpen: false,
          isBubble: false,
          hasBlueDot
        });
      });
    }

    // Populate select
    if (detectedChats.length === 0) {
      select.innerHTML = '<option value="">(No se detectaron prospectos de venta en pantalla)</option>';
    } else {
      select.innerHTML = detectedChats.map((c, i) => `
        <option value="${i}">${c.isBubble ? '🫧 [Burbuja]' : (c.isOpen ? '🟢 [Abierto]' : '📩 [Bandeja]')} ${c.leadName || 'Prospecto'} — ${c.productName} ${c.unread > 0 ? `(${c.unread} sin leer)` : (c.hasBlueDot ? '🔵' : '')}</option>
      `).join('');
      applyChatToForm(0);
    }
  }

  function applyChatToForm(index) {
    const chat = detectedChats[index];
    if (!chat) return;
    currentActiveChat = chat;

    const leadName = chat.leadName || 'Cliente';
    const productName = chat.productName || 'Equipo Inox Marketplace';
    const price = chat.price || '';
    const customerMsg = chat.customerMessage || '¿Sigue disponible este artículo?';

    // Update form input values (used by AI prompt submitter)
    const elName = document.getElementById('mc-fb-lead-name');
    const elProd = document.getElementById('mc-fb-product-name');
    const elPrice = document.getElementById('mc-fb-product-price');
    const elMsg = document.getElementById('mc-fb-client-msg');
    if (elName) elName.value = leadName;
    if (elProd) elProd.value = productName;
    if (elPrice) elPrice.value = price;
    if (elMsg) elMsg.value = customerMsg;

    // Update Executive Lead Dossier Card elements
    const nameEl = document.getElementById('mc-lead-display-name');
    const avatarEl = document.getElementById('mc-lead-avatar');
    const prodEl = document.getElementById('mc-lead-display-product');
    const priceEl = document.getElementById('mc-lead-display-price');
    const msgEl = document.getElementById('mc-lead-display-msg');

    if (nameEl) {
      const badgeHtml = chat.isBubble
        ? `<span id="mc-lead-badge-live" style="font-size:0.58rem;padding:2px 7px;border-radius:12px;background:rgba(234,88,12,0.22);color:#fdba74;font-weight:800;border:1px solid rgba(234,88,12,0.4);">🫧 Burbuja Messenger</span>`
        : (chat.isOpen 
          ? `<span id="mc-lead-badge-live" style="font-size:0.58rem;padding:2px 7px;border-radius:12px;background:rgba(16,185,129,0.18);color:#34d399;font-weight:800;border:1px solid rgba(16,185,129,0.3);">🟢 Chat Abierto</span>`
          : `<span id="mc-lead-badge-live" style="font-size:0.58rem;padding:2px 7px;border-radius:12px;background:rgba(37,99,235,0.22);color:#93c5fd;font-weight:800;border:1px solid rgba(59,130,246,0.45);">📩 En Bandeja</span>`);
      nameEl.innerHTML = `<span>${leadName}</span> ${badgeHtml}`;
    }
    if (avatarEl) {
      avatarEl.innerText = (leadName[0] || 'C').toUpperCase();
    }
    if (prodEl) {
      prodEl.innerText = productName;
    }
    if (priceEl) {
      priceEl.innerText = price || 'Consultar';
    }
    if (msgEl) {
      msgEl.innerText = `"${customerMsg}"`;
    }

    const openBtn = document.getElementById('mc-fb-open-chat-btn');
    if (openBtn) {
      if (!chat.isOpen) {
        openBtn.style.display = 'flex';
        openBtn.innerHTML = `<span>📂 Abrir Chat</span>`;
      } else {
        openBtn.style.display = 'none';
      }
    }

    // Automatically click to open the chat tab on Facebook if unopened
    if (!chat.isOpen && chat.domElement) {
      openFacebookChatItem(chat.domElement, chat.isBubble);
      setTimeout(() => {
        scanFacebookChats();
        if (autoPilotCheck && autoPilotCheck.checked) {
          triggerAutoPilotTick();
        } else {
          const analyzeBtn = document.getElementById('mc-fb-analyze');
          if (analyzeBtn) analyzeBtn.click();
        }
      }, 1000);
    } else {
      if (autoPilotCheck && autoPilotCheck.checked) {
        triggerAutoPilotTick();
      } else {
        const analyzeBtn = document.getElementById('mc-fb-analyze');
        if (analyzeBtn) analyzeBtn.click();
      }
    }
  }

  const openChatBtn = document.getElementById('mc-fb-open-chat-btn');
  if (openChatBtn) {
    openChatBtn.addEventListener('click', () => {
      if (currentActiveChat && currentActiveChat.domElement) {
        openChatBtn.innerText = '⏳ Abriendo...';
        openFacebookChatItem(currentActiveChat.domElement, currentActiveChat.isBubble);
        setTimeout(() => {
          scanFacebookChats();
          openChatBtn.innerText = '✅ Abierto';
          setTimeout(() => { openChatBtn.style.display = 'none'; }, 1000);
        }, 1200);
      }
    });
  }

  const chatSelect = document.getElementById('mc-fb-chat-select');
  if (chatSelect) {
    chatSelect.addEventListener('change', (e) => {
      const idx = parseInt(e.target.value);
      if (!isNaN(idx)) applyChatToForm(idx);
    });
  }

  const rescanBtn = document.getElementById('mc-fb-rescan-btn');
  if (rescanBtn) {
    rescanBtn.addEventListener('click', () => {
      scanFacebookChats();
      rescanBtn.innerHTML = '<span>✅</span>';
      setTimeout(() => { rescanBtn.innerHTML = '<span>🔄</span>'; }, 1500);
    });
  }

  // ─── CRM Pending Leads Tray ──────────────────────────────────────────────────
  async function loadCrmPendingChats() {
    const listEl = document.getElementById('mc-crm-leads-list');
    const badgeEl = document.getElementById('mc-crm-lead-count');
    if (listEl) {
      listEl.innerHTML = `<p style="color:#fbbf24;text-align:center;padding:24px 10px;font-size:0.75rem;">⏳ Cargando chats sincronizados de Messenger y Marketplace...</p>`;
    }

    try {
      let rawLeads = [];
      const res1 = await crmFetch('/crm/messenger/leads');
      if (res1.ok && res1.data?.data) {
        rawLeads = res1.data.data;
      } else {
        const res2 = await crmFetch('/crm/state');
        if (res2.ok && res2.data?.data?.leads) {
          rawLeads = res2.data.data.leads;
        }
      }

      crmLeadsCache = Array.isArray(rawLeads) ? rawLeads : [];
      if (badgeEl) {
        badgeEl.innerText = crmLeadsCache.length;
      }
      renderCrmLeadsList(crmLeadsCache);
    } catch (err) {
      console.warn('Error loading CRM leads:', err);
      if (listEl) {
        listEl.innerHTML = `
          <div style="text-align:center;padding:16px;color:#ef4444;font-size:0.75rem;">
            <p>⚠️ No se pudo conectar al CRM local.</p>
            <p style="color:#94a3b8;font-size:0.7rem;margin-top:6px;">Verifica que el servidor esté corriendo en http://localhost:3000</p>
          </div>
        `;
      }
    }
  }

  function renderCrmLeadsList(leads) {
    const listEl = document.getElementById('mc-crm-leads-list');
    if (!listEl) return;

    if (!leads || leads.length === 0) {
      listEl.innerHTML = `
        <div style="text-align:center;padding:24px;color:#64748b;font-size:0.75rem;">
          <p style="margin-bottom:8px;">No hay chats registrados en la bandeja todavía.</p>
          <p style="font-size:0.7rem;color:#475569;">Haz clic en <strong>"🔄 Sincronizar"</strong> arriba para importar conversaciones de tu página.</p>
        </div>
      `;
      return;
    }

    listEl.innerHTML = leads.map((lead, idx) => {
      const name = lead.name || 'Cliente Potencial';
      const snippet = lead.lastMessage || 'Consulta de Marketplace';
      const time = lead.lastActivity || '';
      const fbId = lead.externalUserId || (lead.email ? lead.email.replace('@facebook.com', '') : '');
      const unreadBadge = lead.unreadCount > 0 ? `<span style="background:#ef4444;color:#fff;font-size:0.6rem;padding:1px 5px;border-radius:10px;font-weight:bold;">${lead.unreadCount} nuevo</span>` : '';
      
      return `
        <div style="background:rgba(20,27,45,0.7);border:1px solid rgba(255,255,255,0.1);border-radius:10px;padding:10px;margin-bottom:8px;transition:border-color 0.2s;" class="mc-crm-lead-card" data-idx="${idx}">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:5px;">
            <div style="font-weight:bold;color:#f8fafc;font-size:0.82rem;display:flex;align-items:center;gap:6px;">
              <span>👤 ${name}</span>
              ${unreadBadge}
            </div>
            <span style="font-size:0.65rem;color:#94a3b8;">${time}</span>
          </div>
          <div style="font-size:0.72rem;color:#cbd5e1;margin-bottom:8px;background:rgba(11,15,25,0.75);padding:7px 9px;border-radius:6px;border-left:3px solid #2563eb;line-height:1.35;max-height:44px;overflow:hidden;text-overflow:ellipsis;">
            "${snippet}"
          </div>
          <div style="display:flex;gap:6px;">
            <button type="button" class="mc-crm-reply-ai-btn mc-action-btn" data-idx="${idx}" style="flex:1;padding:7px;background:linear-gradient(135deg,#059669,#10b981);color:#fff;border:none;border-radius:6px;font-size:0.72rem;font-weight:bold;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:4px;box-shadow:0 2px 8px rgba(16,185,129,0.3);">
              <span>🧠 Responder con IA</span>
            </button>
            ${fbId ? `<a href="https://www.facebook.com/messages/t/${fbId}" target="_blank" class="mc-action-btn" style="padding:7px 11px;background:linear-gradient(135deg,#1d4ed8,#2563eb);color:#fff;border-radius:6px;font-size:0.72rem;font-weight:bold;text-decoration:none;display:flex;align-items:center;gap:4px;box-shadow:0 2px 8px rgba(37,99,235,0.35);" title="Abrir chat directo en Facebook"><span>💬 Abrir</span></a>` : ''}
          </div>
        </div>
      `;
    }).join('');

    // Wire "Responder con IA" buttons
    listEl.querySelectorAll('.mc-crm-reply-ai-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.getAttribute('data-idx'));
        const lead = leads[idx];
        if (!lead) return;

        // Switch to screen view tab
        switchChatSubtab('screen');

        // Fill form fields
        document.getElementById('mc-fb-lead-name').value = lead.name || '';
        document.getElementById('mc-fb-product-name').value = lead.interestProductId || 'Cocina / Asador en Acero Inoxidable';
        document.getElementById('mc-fb-product-price').value = lead.estimatedValue ? `$${lead.estimatedValue}` : '$200';
        document.getElementById('mc-fb-client-msg').value = lead.lastMessage || '¿Sigue disponible este artículo?';

        // Auto-trigger AI Analysis
        document.getElementById('mc-fb-analyze').click();
      });
    });
  }

  // Search input filter
  const searchInput = document.getElementById('mc-crm-search-input');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      const q = e.target.value.toLowerCase().trim();
      if (!q) {
        renderCrmLeadsList(crmLeadsCache);
        return;
      }
      const filtered = crmLeadsCache.filter(l => 
        (l.name && l.name.toLowerCase().includes(q)) || 
        (l.lastMessage && l.lastMessage.toLowerCase().includes(q))
      );
      renderCrmLeadsList(filtered);
    });
  }

  // Sync button
  const syncBtn = document.getElementById('mc-crm-sync-btn');
  if (syncBtn) {
    syncBtn.addEventListener('click', async () => {
      syncBtn.innerText = '⏳ Sincronizando...';
      const syncRes = await crmFetch('/crm/messenger/sync', 'POST');
      if (syncRes.ok) {
        await loadCrmPendingChats();
        syncBtn.innerText = '✅ Listo';
      } else {
        syncBtn.innerText = '⚠️ Error';
      }
      setTimeout(() => { syncBtn.innerText = '🔄 Sincronizar'; }, 2000);
    });
  }

  // Initial scan and CRM load after DOM renders
  setTimeout(() => {
    scanFacebookChats();
    loadCrmPendingChats();
  }, 800);

  // ─── Messaging Engine (Single-Send Protection & Anti-Duplicate Guarantee) ────
  let isMessageDispatching = false;

  function cleanReplyForChat(text) {
    if (!text) return '';
    return text
      // Clean Facebook redirect tracking links
      .replace(/https?:\/\/l\.facebook\.com\/l\.php\?u=([^&\s\)]+)[^\s\)]*/gi, (m, u) => {
        try { return decodeURIComponent(u); } catch(e) { return u; }
      })
      // Strip markdown link syntax: [https://amecocinas.com/](url) -> https://amecocinas.com/
      .replace(/\[([^\]]+)\]\([^\)]+\)/g, '$1')
      // Strip markdown asterisks / underscores for bold and italics
      .replace(/\*{1,3}([^*]+)\*{1,3}/g, '$1')
      .replace(/_{1,3}([^_]+)_{1,3}/g, '$1')
      .trim();
  }

  function insertTextIntoTextbox(tb, text) {
    if (!tb) return false;
    try { tb.focus(); } catch (e) {}

    const clean = cleanReplyForChat(text);

    // 1. Explicitly clear any existing text from the input so we NEVER concatenate
    try {
      const sel = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(tb);
      sel.removeAllRanges();
      sel.addRange(range);
      document.execCommand('delete', false, null);
    } catch (e) {}

    try {
      tb.innerHTML = '';
      tb.innerText = '';
    } catch (e) {}

    // 2. Insert clean text
    let success = false;
    try {
      success = document.execCommand('insertText', false, clean);
      if (!success) {
        tb.innerText = clean;
      }
    } catch (e) {
      tb.innerText = clean;
    }

    try {
      tb.dispatchEvent(new InputEvent('beforeinput', { bubbles: true, cancelable: true, inputType: 'insertText', data: clean }));
      tb.dispatchEvent(new InputEvent('input', { bubbles: true, cancelable: true, inputType: 'insertText', data: clean }));
    } catch (e) {
      tb.dispatchEvent(new Event('input', { bubbles: true }));
    }
    tb.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }

  async function sendChatMessageNow(tb, container) {
    if (!tb || isMessageDispatching) return false;
    isMessageDispatching = true;

    try {
      try { tb.focus(); } catch(e) {}
      await new Promise(r => setTimeout(r, 150));

      const content = (tb.innerText || tb.textContent || '').trim();
      if (!content) return false;

      // 1. Search for explicit Facebook Send Button in container and nearby dialog
      let sendButton = null;
      const searchRoots = [
        container,
        tb.closest('div[role="dialog"]'),
        tb.closest('div[data-pagelet*="ChatTab"]'),
        tb.closest('div[role="main"]'),
        tb.parentElement?.parentElement?.parentElement
      ].filter(Boolean);

      const sendSelectors = [
        'div[aria-label="Presiona Enter para enviar"]',
        'div[aria-label="Press Enter to send"]',
        'div[aria-label="Enviar"]',
        'div[aria-label="Send"]',
        'div[aria-label*="Enviar mensaje"]',
        'div[aria-label*="Send message"]',
        'div[aria-label="Enviar respuesta rápida"]',
        'button[type="submit"]',
        'svg[aria-label="Enviar"]',
        'svg[aria-label="Send"]'
      ];

      for (const root of searchRoots) {
        for (const sel of sendSelectors) {
          const match = root.querySelector(sel);
          if (match) {
            sendButton = match.closest('div[role="button"]') || match.closest('button') || match;
            if (sendButton) break;
          }
        }
        if (sendButton) break;
      }

      if (sendButton) {
        const mouseOpts = { bubbles: true, cancelable: true, view: window, button: 0, buttons: 1 };
        try { sendButton.dispatchEvent(new PointerEvent('pointerdown', mouseOpts)); } catch(e) {}
        try { sendButton.dispatchEvent(new MouseEvent('mousedown', mouseOpts)); } catch(e) {}
        try { sendButton.dispatchEvent(new PointerEvent('pointerup', mouseOpts)); } catch(e) {}
        try { sendButton.dispatchEvent(new MouseEvent('mouseup', mouseOpts)); } catch(e) {}
        try { sendButton.click(); } catch(e) {}
        await new Promise(r => setTimeout(r, 350));
      }

      // 2. Dispatch Enter key if text still present in textbox
      if ((tb.innerText || tb.textContent || '').trim().length > 0) {
        try { tb.focus(); } catch(e) {}
        const keyOpts = {
          key: 'Enter', code: 'Enter', keyCode: 13, which: 13, charCode: 13, bubbles: true, cancelable: true, composed: true
        };
        tb.dispatchEvent(new KeyboardEvent('keydown', keyOpts));
        tb.dispatchEvent(new KeyboardEvent('keypress', keyOpts));
        tb.dispatchEvent(new KeyboardEvent('keyup', keyOpts));
        await new Promise(r => setTimeout(r, 350));
      }

      return true;
    } catch (e) {
      console.warn('[sendChatMessageNow error]', e);
      return false;
    } finally {
      setTimeout(() => {
        isMessageDispatching = false;
      }, 500);
    }
  }

  function resolveActiveTextbox(leadName, productName) {
    if (currentActiveChat && currentActiveChat.textbox && document.body.contains(currentActiveChat.textbox)) {
      return { textbox: currentActiveChat.textbox, container: currentActiveChat.container || currentActiveChat.textbox.parentElement };
    }
    const resolved = findOpenChatForLead(leadName, productName, currentActiveChat);
    if (resolved && resolved.textbox) {
      if (currentActiveChat) {
        currentActiveChat.textbox = resolved.textbox;
        currentActiveChat.container = resolved.container;
        currentActiveChat.isOpen = true;
      }
      return resolved;
    }
    return null;
  }

  // ─── AI Chat Analyze ──────────────────────────────────────────────────────────
  document.getElementById('mc-fb-analyze').addEventListener('click', async () => {
    const leadName   = document.getElementById('mc-fb-lead-name').value.trim() || 'Cliente';
    const prodName   = document.getElementById('mc-fb-product-name').value.trim();
    const prodPrice  = document.getElementById('mc-fb-product-price').value.trim();
    const clientMsg  = document.getElementById('mc-fb-client-msg').value.trim() || '¿Sigue disponible?';
    const resultsDiv = document.getElementById('mc-fb-ai-results');

    resultsDiv.innerHTML = `<p style="color:#fbbf24;text-align:center;padding:12px;">⏳ Consultando IA con datos del anuncio...</p>`;

    try {
      const aiRes = await crmFetch('/ai/live-chat', 'POST', {
        lead: { name: leadName, channel: 'Facebook Marketplace' },
        product: { name: prodName, price: prodPrice },
        products: getCatalog(),
        userMessage: `${prodName ? `[Anuncio: ${prodName} ${prodPrice ? `a ${prodPrice}` : ''}] ` : ''}${clientMsg}`,
        conversationHistory: [],
        mode: 'customer_reply'
      });

      const aiData = aiRes.data;
      if (aiRes.ok && aiData && aiData.success && aiData.data) {
        resultsDiv.innerHTML = `
          <div style="background:linear-gradient(145deg,rgba(22,31,52,0.85),rgba(13,18,32,0.95));padding:12px 14px;border-radius:12px;margin-bottom:12px;border-left:3px solid #2563eb;border:1px solid rgba(255,255,255,0.08);box-shadow:0 4px 14px rgba(0,0,0,0.3);">
            <div style="font-size:0.68rem;color:#94a3b8;margin-bottom:4px;font-weight:bold;letter-spacing:0.04em;">ANÁLISIS IA · ${prodName || 'Marketplace'}</div>
            <strong style="color:#60a5fa;font-size:0.75rem;">Intención:</strong> <span style="font-size:0.75rem;color:#e2e8f0;">${aiData.data.intencion || 'solicita_disponibilidad'}</span> · 
            <strong style="color:#34d399;font-size:0.75rem;">Temperatura:</strong> <span style="font-size:0.75rem;color:#34d399;font-weight:bold;">${aiData.data.temperatura || 'caliente'}</span>
          </div>
          <label style="font-size:0.75rem;color:#cbd5e1;display:block;margin-bottom:6px;font-weight:700;">Respuesta sugerida para ${leadName}:</label>
          <textarea id="mc-fb-reply-text" class="mc-input-field" style="width:100%;height:120px;background:rgba(15,23,42,0.95);color:#f8fafc;border:1px solid rgba(255,255,255,0.12);border-radius:10px;padding:12px;resize:vertical;font-family:inherit;font-size:0.84rem;box-sizing:border-box;line-height:1.5;">${aiData.data.replyText}</textarea>
          
          <div style="display:flex;gap:8px;margin-top:12px;">
            <button id="mc-fb-copy" class="mc-action-btn" style="flex:1;padding:10px 8px;background:rgba(30,41,59,0.85);border:1px solid rgba(255,255,255,0.15);color:#cbd5e1;border-radius:10px;cursor:pointer;font-weight:700;font-size:0.78rem;">📋 Copiar</button>
            <button id="mc-fb-paste-btn" class="mc-action-btn" style="flex:1;padding:10px 8px;background:linear-gradient(135deg,#059669,#10b981);color:#fff;border:none;border-radius:10px;cursor:pointer;font-weight:700;font-size:0.78rem;box-shadow:0 3px 10px rgba(16,185,129,0.35);">✍️ Pegar</button>
            <button id="mc-fb-send-btn" class="mc-action-btn" style="flex:1.2;padding:10px 8px;background:linear-gradient(135deg,#1d4ed8,#2563eb);color:#fff;border:none;border-radius:10px;cursor:pointer;font-weight:800;font-size:0.78rem;box-shadow:0 3px 12px rgba(37,99,235,0.4);">🚀 Pegar y Enviar</button>
          </div>
        `;

        document.getElementById('mc-fb-copy').addEventListener('click', () => {
          navigator.clipboard.writeText(document.getElementById('mc-fb-reply-text').value);
          document.getElementById('mc-fb-copy').innerText = '✅ ¡Copiado!';
          setTimeout(() => { document.getElementById('mc-fb-copy').innerText = '📋 Copiar'; }, 2000);
        });

        document.getElementById('mc-fb-paste-btn').addEventListener('click', () => {
          const replyText = document.getElementById('mc-fb-reply-text').value;
          const box = resolveActiveTextbox(leadName, prodName);
          if (box && box.textbox && insertTextIntoTextbox(box.textbox, replyText)) {
            document.getElementById('mc-fb-paste-btn').innerText = '✅ ¡Pegado!';
            showToast(`✍️ Mensaje pegado en el chat de <b>${leadName}</b>`);
            setTimeout(() => { document.getElementById('mc-fb-paste-btn').innerText = '✍️ Pegar'; }, 2000);
          } else {
            navigator.clipboard.writeText(replyText);
            showToast('📋 Copiado al portapapeles. Haz clic en el chat de Facebook y presiona Ctrl + V.');
          }
        });

        const sendBtn = document.getElementById('mc-fb-send-btn');
        sendBtn.addEventListener('click', async () => {
          if (sendBtn.disabled) return;
          const replyText = document.getElementById('mc-fb-reply-text').value;
          const box = resolveActiveTextbox(leadName, prodName);

          if (box && box.textbox) {
            sendBtn.disabled = true;
            sendBtn.innerText = '⏳ Enviando...';
            insertTextIntoTextbox(box.textbox, replyText);
            await new Promise(r => setTimeout(r, 250));
            const sent = await sendChatMessageNow(box.textbox, box.container);
            if (sent) {
              sendBtn.innerText = '✅ ¡Enviado!';
              showToast(`🚀 ¡Mensaje enviado con éxito a <b>${leadName}</b>!`);
            } else {
              sendBtn.innerText = '⚠️ Presiona Enter';
              showToast(`⚠️ Mensaje escrito en el chat de <b>${leadName}</b>. Presiona Enter en el chat para confirmar el envío.`, false);
            }
            setTimeout(() => {
              sendBtn.disabled = false;
              sendBtn.innerText = '🚀 Pegar y Enviar';
            }, 2500);
          } else {
            navigator.clipboard.writeText(replyText);
            showToast('📋 Copiado al portapapeles. Haz clic en el chat de Facebook y presiona Ctrl + V y Enter.');
          }
        });
      } else {
        const errorDesc = aiRes.error || (aiRes.offline ? 'Servidor local desconectado (localhost:3000)' : 'No se pudo generar respuesta');
        resultsDiv.innerHTML = `<p style="color:#ef4444;padding:8px;">❌ Error: ${errorDesc}</p>`;
      }
    } catch (err) {
      resultsDiv.innerHTML = `<p style="color:#ef4444;padding:8px;">❌ Error: ${err.message}</p>`;
    }
  });

  // ─── ⚡ AUTO-PILOT ENGINE (Auto-detect & reply in real time) ─────────────────
  const autoPilotCheck = document.getElementById('mc-fb-auto-pilot-check');
  let autoPilotBusy = false;
  const autoRepliedKeys = new Set(lsGet('autoRepliedKeys', []));

  function saveAutoRepliedKeys() {
    lsSet('autoRepliedKeys', Array.from(autoRepliedKeys).slice(-100));
  }

  function showToast(msg, isSuccess = true) {
    let toast = document.getElementById('mc-safe-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'mc-safe-toast';
      Object.assign(toast.style, {
        position: 'fixed',
        bottom: '80px',
        right: '20px',
        zIndex: '9999999',
        color: '#fff',
        padding: '12px 16px',
        borderRadius: '10px',
        boxShadow: '0 8px 24px rgba(0,0,0,0.6)',
        fontFamily: 'system-ui, -apple-system, sans-serif',
        fontSize: '13px',
        maxWidth: '350px',
        lineHeight: '1.5',
        transition: 'opacity 0.3s ease'
      });
      document.body.appendChild(toast);
    }
    toast.style.background = isSuccess ? '#064e3b' : '#7f1d1d';
    toast.style.border = isSuccess ? '2px solid #10b981' : '2px solid #ef4444';
    toast.innerHTML = msg;
    toast.style.display = 'block';
    toast.style.opacity = '1';
    clearTimeout(toast._timeout);
    toast._timeout = setTimeout(() => {
      toast.style.opacity = '0';
      setTimeout(() => { toast.style.display = 'none'; }, 300);
    }, 6000);
  }

  let autoPilotAborted = false;

  function isAutoPilotActive() {
    if (autoPilotCheck && !autoPilotCheck.checked) return false;
    return !!lsGet('autoPilotEnabled', false);
  }

  if (autoPilotCheck) {
    autoPilotCheck.checked = lsGet('autoPilotEnabled', false);
    autoPilotCheck.addEventListener('change', (e) => {
      const active = !!e.target.checked;
      lsSet('autoPilotEnabled', active);
      if (active) {
        autoPilotAborted = false;
        showToast('⚡ <b>Auto-Pilot Activado:</b> Responderá automáticamente los mensajes.');
        triggerAutoPilotTick();
      } else {
        autoPilotAborted = true;
        queueRunning = false;
        showToast('⏸️ <b>Auto-Pilot Pausado:</b> Proceso detenido por completo.');
        updateFloatingPill('⏸️ Auto-Pilot Pausado');
      }
    });
  }

  // ─── AUTONOMOUS PENDING QUEUE RUNNER ──────────────────────────────────────────
  let queueRunning = false;
  const answeredLeads = new Set(lsGet('mc_answered_leads', []));
  const answeredLeadMessages = lsGet('mc_answered_lead_msgs', {});

  function saveAnsweredLeads() {
    lsSet('mc_answered_leads', Array.from(answeredLeads).slice(-200));
    lsSet('mc_answered_lead_msgs', answeredLeadMessages);
  }

  function findPendingCustomerChats() {
    const pending = [];
    const seenLeadNames = new Set();

    // 1. FIRST PRIORITY: Already open / docked chat windows waiting for response
    detectedChats.forEach(chat => {
      if (chat.isOpen && chat.textbox && document.body.contains(chat.textbox)) {
        const cName = cleanLeadName(chat.leadName);
        if (!cName || cName === 'Cliente' || !isValidLeadName(cName)) return;
        const normName = cName.toLowerCase();
        if (seenLeadNames.has(normName)) return;

        const cProd = chat.productName || 'Cocina / Asador en Acero Inoxidable';
        const leadKey = `${normName}_${cProd.toLowerCase()}`;
        const lastMsgClean = (chat.customerMessage || '').toLowerCase().trim();
        const prevMsg = answeredLeadMessages[leadKey] || '';

        const isNewMessage = !prevMsg || (lastMsgClean && prevMsg !== lastMsgClean);

        if (isNewMessage) {
          seenLeadNames.add(normName);
          pending.push({
            leadName: cName,
            productName: cProd,
            customerMessage: chat.customerMessage || `Hola, ¿sigue disponible ${cProd}?`,
            domElement: chat.domElement || null,
            textbox: chat.textbox,
            container: chat.container,
            leadKey,
            alreadyOpen: true,
            isBubble: false
          });
        }
      }
    });

    // 2. SECOND PRIORITY: Minimized Messenger Chat Bubbles with unread messages
    const bubbles = findChatBubbles();
    bubbles.forEach((b) => {
      if (b.unread <= 0) return;
      const bName = cleanLeadName(b.name || '');
      if (!bName || bName === 'Cliente' || !isValidLeadName(bName)) return;
      const normName = bName.toLowerCase();
      if (seenLeadNames.has(normName)) return;

      const bProd = b.product || activeAdProduct || 'Equipo Inox Marketplace';
      const bKey = `bubble_${normName}_${b.unread}`;

      seenLeadNames.add(normName);
      pending.push({
        leadName: bName,
        productName: bProd,
        customerMessage: `Consulta de cliente (Burbuja Messenger · ${b.unread} sin leer)`,
        domElement: b.el,
        textbox: null,
        container: null,
        leadKey: bKey,
        alreadyOpen: false,
        isBubble: true,
        unread: b.unread
      });
    });

    // 3. THIRD PRIORITY: Inbox conversation items (ONLY if on an actual Inbox page)
    const isInboxPage = (
      window.location.pathname.includes('/messages') ||
      window.location.pathname.includes('/marketplace/inbox') ||
      window.location.pathname.includes('/latest/inbox') ||
      !!document.querySelector('div[data-pagelet*="MWInbox"], div[aria-label*="Bandeja de entrada"], div[aria-label*="Inbox"]')
    );

    if (isInboxPage) {
      const candidateNodes = Array.from(document.querySelectorAll(
        CHAT_LIST_SELECTOR
      )).filter(el => {
        if (el.closest('#metacloser-crm-sidebar, #mc-fb-floating-bar')) return false;
        if (isListingOrNavNode(el)) return false;
        return true;
      });

      candidateNodes.forEach((el) => {
        const raw = (el.innerText || '').trim();
        if (!raw || raw.length < 5 || raw.length > 400) return;
        if (isListingOrNavNode(el)) return;

        const rawLower = raw.toLowerCase();
        if (
          rawLower.includes('te etiquetó') ||
          rawLower.includes('te etiqueto') ||
          rawLower.includes('visualizaciones nuevas') ||
          rawLower.includes('en un comentario') ||
          rawLower.includes('en una foto') ||
          rawLower.includes('en un video') ||
          rawLower.includes('notificaciones anteriores')
        ) return;

        const lines = raw.split('\n').map(l => l.trim()).filter(Boolean);
        if (lines.length < 1) return;

        let potentialBuyer = '';
        let potentialProd = '';
        let customerMessage = '';

        // Format 1: Separator [Buyer] · [Product] (Marketplace)
        const sepRegex = /[\u00B7\u2022\u2013\u2014\-\|]/;
        let headerLine = lines.find(l => sepRegex.test(l) && !l.includes('· min') && !l.includes('· h') && !l.includes('· d') && !l.includes('· sem') && !/^\d{1,2}:\d{2}/.test(l));

        if (headerLine) {
          const parts = headerLine.split(sepRegex).map(p => p.trim()).filter(Boolean);
          if (parts.length >= 2) {
            potentialBuyer = parts[0];
            potentialProd = parts.slice(1).join(' - ');
          }
        }

        // Format 2: Meta Business Suite Inbox row (no separator, Name is line 1)
        if (!potentialBuyer) {
          const nameCandidate = lines.find(l => 
            !isSystemNoise(l) &&
            !/^\d{1,2}:\d{2}\s*(?:am|pm)?$/i.test(l) &&
            !l.startsWith('Tú:') && !l.startsWith('You:') &&
            !l.startsWith('ad_id') &&
            !l.includes('Mensajes que esperan') &&
            !l.includes('Conectar con') &&
            l.length >= 2 && l.length <= 40
          );

          if (nameCandidate) {
            potentialBuyer = nameCandidate;
            potentialProd = activeAdProduct || 'Cocina / Asador en Acero Inoxidable';
            
            const msgCandidate = lines.find(l => 
              l !== nameCandidate &&
              !/^\d{1,2}:\d{2}\s*(?:am|pm)?$/i.test(l) &&
              !l.startsWith('ad_id') &&
              !isSystemNoise(l) &&
              l.length >= 2
            );
            if (msgCandidate) {
              customerMessage = msgCandidate;
            }
          }
        }

        if (!potentialBuyer) return;
        potentialBuyer = cleanLeadName(potentialBuyer);

        // Filter personal purchases (Mazda, Hyundai, etc. or buyer is APM)
        const buyerLower = potentialBuyer.toLowerCase();
        const prodLower = (potentialProd || '').toLowerCase();
        const isPersonalPurchase = (
          buyerLower === 'apm' ||
          buyerLower.startsWith('apm ') ||
          buyerLower.includes('apm inox') ||
          buyerLower === 'alex' ||
          buyerLower.startsWith('alex ') ||
          prodLower.includes('mazda') ||
          prodLower.includes('tucson') ||
          prodLower.includes('d-max') ||
          prodLower.includes('salas en oferta')
        );
        if (isPersonalPurchase) return;

        const leadKey = `${buyerLower}_${prodLower}`;
        if (answeredLeads.has(leadKey) || seenKeys.has(leadKey) || seenKeys.has(buyerLower)) return;
        seenKeys.add(leadKey);
        seenKeys.add(buyerLower);

        // Check if pending response:
        const hasBlueDot = !!el.querySelector('div[aria-label*="No leído"], div[aria-label*="Unread"], span[class*="x14yjl9h"], div[class*="x14yjl9h"], div[class*="x1vjfegm"], circle, [style*="rgb(0, 100, 224)"], [style*="rgb(49, 162, 76)"]');
        const hasWaiting = raw.toLowerCase().includes('esperando tu respuesta') || raw.toLowerCase().includes('is waiting');
        const isNotMe = !lines.some(l => l.toLowerCase().startsWith('tú:') || l.toLowerCase().startsWith('you:'));

        if (hasBlueDot || hasWaiting || isNotMe) {
          if (!customerMessage) {
            customerMessage = `Hola, ¿sigue disponible ${potentialProd || 'este artículo'}?`;
          }

          pending.push({
            leadName: potentialBuyer,
            productName: potentialProd || 'Cocina / Asador en Acero Inoxidable',
            customerMessage,
            domElement: el,
            textbox: null,
            container: null,
            leadKey,
            alreadyOpen: false,
            isBubble: false
          });
        }
      });
    }

    return pending;
  }

  function findOpenChatForLead(leadName, productName, item = null) {
    // 1. Direct object references if still valid in DOM
    if (item && item.textbox && document.body.contains(item.textbox)) {
      return { textbox: item.textbox, container: item.container || item.textbox.parentElement, isFloating: true };
    }
    if (currentActiveChat && currentActiveChat.textbox && document.body.contains(currentActiveChat.textbox)) {
      return { textbox: currentActiveChat.textbox, container: currentActiveChat.container || currentActiveChat.textbox.parentElement, isFloating: true };
    }

    const cleanN = cleanLeadName(leadName).toLowerCase();
    const cleanP = (productName || '').toLowerCase().trim();
    const tokens = cleanN.split(/\s+/).filter(t => t.length >= 3 && !['título','titulo','chat','para','con','cliente','burbuja'].includes(t));

    // 2. Find all contenteditable inputs
    const allInputs = Array.from(document.querySelectorAll(
      'div[contenteditable="true"], div[role="textbox"], div[data-lexical-editor="true"], textarea'
    )).filter(el => !el.closest('#metacloser-crm-sidebar'));

    // Gather all floating chat windows / docked tabs
    const floatingBoxes = [];
    for (const tb of allInputs) {
      let container = tb.closest('div[role="dialog"], div[data-pagelet*="ChatTab"], div[class*="fbDockChatTabFlyout"]') || null;
      if (!container) {
        let cur = tb;
        while (cur && cur !== document.body) {
          const r = cur.getBoundingClientRect();
          if (r.width >= 240 && r.width <= 560 && r.height >= 200) {
            container = cur;
          }
          cur = cur.parentElement;
        }
      }
      if (container) {
        floatingBoxes.push({ tb, container });
      }
    }

    // 3. Match against floating containers
    for (const { tb, container } of floatingBoxes) {
      const text = (container.innerText || '').toLowerCase();
      if (cleanN && !cleanN.includes('burbuja') && text.includes(cleanN)) return { textbox: tb, container, isFloating: true };
      if (tokens.length > 0 && tokens.some(tok => text.includes(tok))) return { textbox: tb, container, isFloating: true };
      if (cleanP && !cleanP.includes('marketplace') && text.includes(cleanP)) return { textbox: tb, container, isFloating: true };
    }

    // 4. CRITICAL: If exactly ONE floating chat window is open on screen, THAT IS IT!
    if (floatingBoxes.length === 1) {
      return { textbox: floatingBoxes[0].tb, container: floatingBoxes[0].container, isFloating: true };
    }

    // 4.5. If multiple floating boxes, return the last one (most recently opened dialog)
    if (floatingBoxes.length > 1) {
      return { textbox: floatingBoxes[floatingBoxes.length - 1].tb, container: floatingBoxes[floatingBoxes.length - 1].container, isFloating: true };
    }

    // 5. Meta Business Suite Center Panel
    for (const tb of allInputs) {
      const main = tb.closest('div[role="main"], div[role="region"]') || tb.parentElement;
      const text = (main ? main.innerText || '' : '').toLowerCase();
      if ((cleanN && text.includes(cleanN)) || tokens.some(tok => text.includes(tok)) || (cleanP && text.includes(cleanP))) {
        return { textbox: tb, container: main, isFloating: false };
      }
    }

    // 6. Generic single non-search input fallback
    const nonSearch = allInputs.filter(tb => {
      const aria = (tb.getAttribute('aria-label') || '').toLowerCase();
      return !aria.includes('buscar') && !aria.includes('search');
    });
    if (nonSearch.length === 1) {
      const tb = nonSearch[0];
      const cont = tb.closest('div[role="dialog"], div[role="main"]') || tb.parentElement;
      return { textbox: tb, container: cont, isFloating: true };
    }

    return null;
  }

  function closeFloatingChat(container) {
    if (!container) return;
    const selectors = [
      'div[aria-label="Minimizar chat"]',
      'div[aria-label="Minimize chat"]',
      'div[aria-label="Cerrar chat"]',
      'div[aria-label="Close chat"]',
      'div[aria-label="Cerrar pestaña"]',
      'div[aria-label="Cerrar"]',
      'div[aria-label="Close"]',
      'svg[aria-label="Cerrar"]',
      'svg[aria-label="Close"]'
    ];
    for (const sel of selectors) {
      const el = container.querySelector(sel);
      if (el) {
        const btn = el.closest('div[role="button"]') || el;
        try { btn.click(); return; } catch(e) {}
      }
    }
  }

  async function runPendingQueue() {
    if (queueRunning) return;
    if (!isAutoPilotActive() || autoPilotAborted) {
      updateFloatingPill('⏸️ Auto-Pilot Pausado');
      return;
    }
    queueRunning = true;
    updateFloatingPill('⏳ Revisando clientes pendientes...');

    try {
      try { scanFacebookChats(); } catch (scanErr) { console.warn('[scan]', scanErr); }
      const pending = findPendingCustomerChats();
      if (pending.length === 0) {
        updateFloatingPill('✅ 0 pendientes (Al día)');
        setTimeout(() => updateFloatingPill(), 3000);
        return;
      }

      updateFloatingPill(`⚡ Respondiendo ${pending.length} cliente${pending.length > 1 ? 's' : ''}...`);

      let successCount = 0;
      let failureCount = 0;

      for (let i = 0; i < pending.length; i++) {
        // INSTANT EMERGENCY STOP: User paused the auto-responder
        if (!isAutoPilotActive() || autoPilotAborted) {
          console.log('[Auto-Pilot] Detenido inmediatamente por el usuario.');
          showToast('⏸️ Auto-Pilot pausado por el usuario.', false);
          updateFloatingPill('⏸️ Pausado');
          break;
        }

        const item = pending[i];
        if (answeredLeads.has(item.leadKey)) continue;

        try {
          showToast(`🤖 <b>Auto-Pilot (${i+1}/${pending.length}):</b> Atendiendo chat de <b>${item.leadName}</b>...`);
          updateFloatingPill(`⚡ (${i+1}/${pending.length}) ${item.leadName}...`);

          // 1. Open the chat if not already opened
          if (!item.alreadyOpen && item.domElement) {
            console.log(`[Auto-Pilot] Abriendo item (${item.isBubble ? 'Burbuja' : 'Chat'}): ${item.leadName}`);
            openFacebookChatItem(item.domElement, item.isBubble);
            // Give Facebook time to animate open the chat window
            await new Promise(r => setTimeout(r, item.isBubble ? 700 : 400));
          }

          // 2. Poll for textbox (up to 5s)
          let activeBox = null;
          for (let attempt = 0; attempt < 12; attempt++) {
            activeBox = findOpenChatForLead(item.leadName, item.productName, item);
            if (activeBox && activeBox.textbox) break;
            await new Promise(r => setTimeout(r, 400));
          }

          if (!activeBox || !activeBox.textbox) {
            console.warn(`[Auto-Pilot] No se pudo abrir la caja de texto para ${item.leadName}`);
            showToast(`⚠️ No se pudo localizar la ventana de chat para <b>${item.leadName}</b>`, false);
            failureCount++;
            continue;
          }

          // 2.1 Enrich leadName and productName from the newly opened dialog header
          let resolvedLeadName = item.leadName;
          let resolvedProdName = item.productName;
          let resolvedMsg = item.customerMessage;

          if (activeBox.container) {
            const hInfo = extractChatHeader(activeBox.container);
            if (hInfo.buyer && isValidLeadName(hInfo.buyer)) {
              resolvedLeadName = hInfo.buyer;
            }
            if (hInfo.product && isValidProductName(hInfo.product)) {
              resolvedProdName = hInfo.product;
            }

            const contText = (activeBox.container.innerText || '');
            const lines = contText.split('\n').map(l => l.trim()).filter(Boolean);

            // Extract last customer message
            const cleanMsgLines = lines.filter(l => {
              if (isSystemNoise(l)) return false;
              if (l.includes('$')) return false;
              if (/^\d{1,2}:\d{2}\s*(?:am|pm)?$/i.test(l)) return false;
              if (l.toLowerCase().startsWith('tú:') || l.toLowerCase().startsWith('you:')) return false;
              if (resolvedLeadName && l.toLowerCase() === resolvedLeadName.toLowerCase()) return false;
              if (resolvedProdName && l.toLowerCase() === resolvedProdName.toLowerCase()) return false;
              return l.length >= 2;
            });
            if (cleanMsgLines.length > 0) {
              resolvedMsg = cleanMsgLines[cleanMsgLines.length - 1];
            }
          }

          resolvedLeadName = cleanLeadName(resolvedLeadName || 'Estimado/a Cliente');
          resolvedProdName = resolvedProdName || 'Cocina / Asador en Acero Inoxidable';
          resolvedMsg = resolvedMsg || `Hola, ¿sigue disponible ${resolvedProdName}?`;

          // 3. Check if user configured an active custom campaign for Auto-Pilot
          const activeCampId = lsGet('active_autopilot_campaign_id', '');
          const customCamps = getCustomCampaigns();
          const activeCamp = activeCampId ? customCamps.find(c => c.id === activeCampId) : null;

          let replyText = '';
          if (activeCamp && activeCamp.message) {
            showToast(`🚀 <b>Auto-Pilot:</b> Aplicando tu campaña <b>${activeCamp.name}</b> para <b>${resolvedLeadName}</b>...`);
            let personalized = activeCamp.message
              .replace(/\{nombre\}|\{cliente\}/gi, resolvedLeadName)
              .replace(/\{producto\}|\{equipo\}/gi, resolvedProdName || 'equipos gastronómicos en acero inoxidable')
              .replace(/\{web\}/gi, 'https://amecocinas.com/')
              .replace(/\{telefono\}|\{whatsapp\}/gi, '09920350548')
              .replace(/\{taller\}|\{ubicacion\}/gi, 'Calle 25 de Mayo 226, sector Cotocollao, frente al Club de Leones');
            replyText = cleanReplyForChat(personalized);
          } else {
            // Default: Consult AI using robust crmFetch with polite Gente Fina tone
            showToast(`🧠 <b>IA:</b> Redactando respuesta para <b>${resolvedLeadName}</b> (${resolvedProdName})...`);

            const aiRes = await crmFetch('/ai/live-chat', 'POST', {
              lead: { name: resolvedLeadName, channel: 'Facebook Marketplace' },
              product: { name: resolvedProdName, price: '$1' },
              products: getCatalog(),
              userMessage: `[Anuncio: ${resolvedProdName}] ${resolvedMsg}`,
              conversationHistory: [],
              mode: 'customer_reply'
            });

            if (!aiRes.ok || !aiRes.data?.data?.replyText) {
              const reason = aiRes.error || (aiRes.offline ? 'Servidor local desconectado (localhost:3000)' : 'Error generando respuesta IA');
              showToast(`⚠️ <b>${resolvedLeadName}:</b> ${reason}`, false);
              failureCount++;
              continue;
            }

            replyText = aiRes.data.data.replyText;
          }

          if (replyText) {
            showToast(`✍️ <b>Auto-Pilot:</b> Escribiendo mensaje a <b>${resolvedLeadName}</b>...`);
            // 4. Paste text
            insertTextIntoTextbox(activeBox.textbox, replyText);
            await new Promise(r => setTimeout(r, 350));
            // 5. Send message
            const sent = await sendChatMessageNow(activeBox.textbox, activeBox.container);

            if (sent) {
              // 6. Record as answered for this specific customer message
              answeredLeads.add(item.leadKey);
              const resolvedKey = `${resolvedLeadName.toLowerCase()}_${resolvedProdName.toLowerCase()}`;
              answeredLeads.add(resolvedKey);
              const snippet = (resolvedMsg || item.customerMessage || '').toLowerCase().trim();
              if (snippet) {
                answeredLeadMessages[item.leadKey] = snippet;
                answeredLeadMessages[resolvedKey] = snippet;
              }
              saveAnsweredLeads();
              successCount++;
              showToast(`✅ <b>Auto-Pilot:</b> ¡Enviado con éxito a <b>${resolvedLeadName}</b>!`);

              // 7. Small pause and close the floating window ONLY if it's a floating dialog
              await new Promise(r => setTimeout(r, 1200));
              if (activeBox.isFloating) {
                closeFloatingChat(activeBox.container);
              }
            } else {
              showToast(`⚠️ <b>${resolvedLeadName}:</b> El texto se escribió en el chat. Por favor presiona Enter para confirmar el envío.`, false);
              failureCount++;
            }
          }

          // Natural pause between chats (2s)
          await new Promise(r => setTimeout(r, 2000));
        } catch (itemErr) {
          console.error(`[Auto-Pilot Error en item ${item.leadName}]`, itemErr);
          showToast(`⚠️ <b>Error con ${item.leadName}:</b> ${itemErr.message}`, false);
          failureCount++;
        }
      }

      if (successCount > 0) {
        showToast(`🎉 <b>¡Completado!</b> Se respondieron ${successCount} cliente(s) exitosamente.${failureCount > 0 ? ` (${failureCount} no se pudieron enviar)` : ''}`);
        updateFloatingPill('✅ ¡Todo respondido!');
        setTimeout(() => updateFloatingPill(), 4000);
      } else if (failureCount > 0) {
        updateFloatingPill(`⚠️ ${failureCount} no enviados`, true, `No se pudieron enviar ${failureCount} chats`);
        setTimeout(() => updateFloatingPill(), 6000);
      } else {
        updateFloatingPill('✅ 0 pendientes');
        setTimeout(() => updateFloatingPill(), 3000);
      }
    } catch (err) {
      console.error('[runPendingQueue fatal error]', err);
      const errMsg = err?.message || 'Error desconocido';
      showToast(`⚠️ <b>Error en Auto-Pilot:</b> ${errMsg}`, false);
      updateFloatingPill(`⚠️ ${errMsg.slice(0, 18)}`, true, errMsg);
    } finally {
      queueRunning = false;
    }
  }

  function triggerAutoPilotTick() {
    runPendingQueue();
  }

  // Expose to the floating bar (it lives outside injectSidebar's scope)
  window.__mcRunPendingQueue = runPendingQueue;
  window.__mcFindPending = () => { try { return findPendingCustomerChats(); } catch (e) { console.warn(e); return []; } };
  window.__mcScanFacebookChats = () => { try { scanFacebookChats(); } catch (e) { console.warn(e); } };
  window.__mcShowToast = showToast;

  // Periodic Auto-Pilot loop every 8 seconds
  setInterval(() => {
    if (isAutoPilotActive() && !autoPilotAborted) {
      runPendingQueue();
    } else {
      updateFloatingPill();
    }
  }, 8000);

  // ─── Generate post with AI ────────────────────────────────────────────────────
  document.getElementById('mc-fb-generate-post').addEventListener('click', async () => {
    const product      = document.getElementById('mc-post-product').value;
    const price        = document.getElementById('mc-post-price').value;
    const city         = document.getElementById('mc-post-city').value;
    const postResultsDiv = document.getElementById('mc-post-results');
    if (!product) { alert('Por favor ingresa un producto.'); return; }

    postResultsDiv.innerHTML = `<p style="color:#fbbf24;text-align:center;padding:16px;">⏳ Generando variantes con IA...</p>`;

    let variants = [];
    try {
      const aiRes = await crmFetch('/ai/generate-post', 'POST', { product, price, city });
      if (aiRes.ok && aiRes.data?.data) variants = aiRes.data.data;
      else throw new Error(aiRes.error || 'empty');
    } catch {
      variants = [
        { enfoque: 'precio',   titulo: `🔥 ${product.toUpperCase()} | Directo de Taller ${city}`, descripcion: `Precio de fábrica sin intermediarios en ${city}.\n✔️ Acero inoxidable sanitario\n✔️ Garantía directa\n💰 $${price}\n📲 WhatsApp para coordinar entrega.` },
        { enfoque: 'calidad',  titulo: `✨ ${product} - Fabricantes en ${city}`, descripcion: `Calidad certificada para uso profesional.\n✔️ Apto para restaurantes\n✔️ Fácil limpieza y repuestos\n💰 $${price}\n📲 Escríbenos para fotos y medidas.` },
        { enfoque: 'urgencia', titulo: `⚡ ${product} - Pocas unidades (${city})`, descripcion: `Precio de lote con entrega inmediata en ${city}.\n✔️ Acero inoxidable pesado\n✔️ Quemadores de alta potencia\n💰 Promo: $${price}\n📲 Consulta stock hoy.` },
      ];
    }

    // Save last generated variants
    lsSet('lastVariants', variants);

    let html = '';
    variants.forEach((v, idx) => {
      html += `
        <div style="background:#1e293b;border:1px solid #334155;border-radius:8px;padding:10px;margin-bottom:12px;border-left:3px solid #f59e0b;">
          <div style="font-size:0.68rem;font-weight:bold;color:#fbbf24;text-transform:uppercase;margin-bottom:4px;">Variante ${idx+1} · ${v.enfoque}</div>
          <div style="font-size:0.78rem;font-weight:bold;color:#e2e8f0;margin-bottom:4px;" id="mc-title-${idx}">${v.titulo}</div>
          <textarea id="mc-desc-${idx}" style="width:100%;height:90px;background:#0f172a;color:#cbd5e1;border:1px solid #334155;border-radius:5px;padding:6px;resize:vertical;font-family:inherit;font-size:0.74rem;box-sizing:border-box;">${v.descripcion}</textarea>
          <button class="mc-fb-fill-btn" data-index="${idx}" style="width:100%;padding:8px;margin-top:6px;background:linear-gradient(135deg,#2563eb,#1d4ed8);color:#fff;border:none;border-radius:5px;cursor:pointer;font-weight:bold;font-size:0.78rem;">📝 Rellenar Marketplace + Foto</button>
        </div>
      `;
    });
    postResultsDiv.innerHTML = html;

    document.querySelectorAll('.mc-fb-fill-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const idx   = e.target.getAttribute('data-index');
        const title = document.getElementById(`mc-title-${idx}`).innerText;
        const desc  = document.getElementById(`mc-desc-${idx}`).value;
        const btnEl = e.target;

        btnEl.innerText = '⏳ Rellenando con pausas humanas...'; btnEl.disabled = true;

        const titleInput = document.querySelector('input[aria-label="Title"], input[aria-label="Título"]');
        const priceInput = document.querySelector('input[aria-label="Price"], input[aria-label="Precio"]');
        const descInput  = document.querySelector('textarea[aria-label="Description"], textarea[aria-label="Descripción"]');

        if (!titleInput && !descInput) {
          alert('⚠️ Ve a la pantalla de "Crear nueva publicación" de Marketplace primero.');
          btnEl.innerText = '📝 Rellenar Marketplace + Foto'; btnEl.disabled = false; return;
        }

        await new Promise(r => setTimeout(r, 400 + Math.random() * 300));
        if (titleInput) { titleInput.focus(); titleInput.value = title; titleInput.dispatchEvent(new Event('input', { bubbles: true })); }

        await new Promise(r => setTimeout(r, 600 + Math.random() * 400));
        if (priceInput && price) { priceInput.focus(); priceInput.value = price; priceInput.dispatchEvent(new Event('input', { bubbles: true })); }

        await new Promise(r => setTimeout(r, 800 + Math.random() * 500));
        if (descInput) { descInput.focus(); descInput.value = desc; descInput.dispatchEvent(new Event('input', { bubbles: true })); }

        const photoAttached = await attachPhotoToFacebook();
        btnEl.innerText = photoAttached ? '✅ Texto + Foto Cargados' : '✅ Texto Cargado';
        btnEl.disabled  = false;

        // Toast
        let toast = document.getElementById('mc-safe-toast');
        if (!toast) {
          toast = document.createElement('div');
          toast.id = 'mc-safe-toast';
          Object.assign(toast.style, { position:'fixed', bottom:'80px', right:'20px', zIndex:'9999999', background:'#064e3b', border:'2px solid #10b981', color:'#fff', padding:'12px 16px', borderRadius:'10px', boxShadow:'0 8px 20px rgba(0,0,0,0.5)', fontFamily:'system-ui,sans-serif', fontSize:'12px', maxWidth:'340px', lineHeight:'1.5' });
          document.body.appendChild(toast);
        }
        toast.innerHTML = `<strong>🛡️ Safe Social Publisher:</strong><br>Campos completados.${photoAttached ? ' 📸 Foto adjuntada.' : ' 📸 Adjunta tu foto manualmente.'}<br><strong>Revisa y confirma</strong> antes de publicar.`;
        toast.style.display = 'block';
        setTimeout(() => { if (toast) toast.style.display = 'none'; }, 7000);
      });
    });
  });

  // Restore last generated variants if any
  const lastVariants = lsGet('lastVariants', null);
  if (lastVariants && Array.isArray(lastVariants) && lastVariants.length > 0) {
    // Silently populate — user sees them when switching to post tab
    // (don't auto-click, just restore the button state)
  }
}

// ─── Floating Copilot Widget (Auto-Pilot status & 1-click responder) ──────────
let lastErrorMessage = '';

function updateFloatingPill(customStatus, isError = false, errorDetail = '') {
  const textEl = document.getElementById('mc-fb-pill-text');
  const dotEl = document.getElementById('mc-fb-pill-dot');
  const btnEl = document.getElementById('mc-fb-quick-reply-all-btn');
  const pillStatus = document.getElementById('mc-fb-pill-status');

  if (isError || (customStatus && customStatus.includes('⚠️'))) {
    lastErrorMessage = errorDetail || customStatus || 'Error en Auto-Pilot';
    if (textEl) textEl.innerText = customStatus || '⚠️ Error';
    if (dotEl) {
      dotEl.style.background = '#ef4444';
      dotEl.style.boxShadow = '0 0 10px rgba(239, 68, 68, 0.9)';
    }
    if (pillStatus) {
      pillStatus.title = `⚠️ ${lastErrorMessage} (Haz clic para abrir el CRM)`;
    }
    return;
  }

  // Clear error if back to normal
  lastErrorMessage = '';

  if (customStatus) {
    if (textEl) textEl.innerText = customStatus;
    if (dotEl) {
      dotEl.style.background = '#f59e0b';
      dotEl.style.boxShadow = '0 0 8px rgba(245, 158, 11, 0.7)';
    }
    if (pillStatus) pillStatus.title = customStatus;
    return;
  }

  const pending = typeof window.__mcFindPending === 'function' ? window.__mcFindPending() : [];
  if (pending.length > 0) {
    if (textEl) textEl.innerText = `${pending.length} pendiente${pending.length > 1 ? 's' : ''}`;
    if (dotEl) {
      dotEl.style.background = '#38bdf8';
      dotEl.style.boxShadow = '0 0 8px rgba(56, 189, 248, 0.8)';
    }
    if (pillStatus) pillStatus.title = `${pending.length} cliente(s) con mensajes pendientes`;
    if (btnEl) {
      btnEl.style.display = 'flex';
      btnEl.innerHTML = `<span>⚡ Responder Todos (${pending.length})</span>`;
    }
  } else {
    if (textEl) textEl.innerText = `0 pendientes`;
    if (dotEl) {
      dotEl.style.background = '#10b981';
      dotEl.style.boxShadow = '0 0 8px rgba(16, 185, 129, 0.7)';
    }
    if (pillStatus) pillStatus.title = `Al día (0 clientes pendientes)`;
    if (btnEl) btnEl.style.display = 'none';
  }
}

function makeDraggable(el, storageKey = 'mc_fb_bar_pos', handleEl = null, onDragMove = null, onDragEnd = null) {
  if (!el) return;

  const dragTarget = handleEl || el;

  // Restore saved position if any
  const savedPos = lsGet(storageKey, null);
  if (savedPos && typeof savedPos.left === 'number' && typeof savedPos.top === 'number') {
    const elW = el.offsetWidth || 300;
    const elH = el.offsetHeight || 100;
    const maxX = Math.max(10, window.innerWidth - elW);
    const maxY = Math.max(10, window.innerHeight - elH);
    const clampedX = Math.min(Math.max(10, savedPos.left), maxX);
    const clampedY = Math.min(Math.max(10, savedPos.top), maxY);
    el.style.left = `${clampedX}px`;
    el.style.top = `${clampedY}px`;
    el.style.bottom = 'auto';
    el.style.right = 'auto';
  }

  dragTarget.style.cursor = 'grab';
  dragTarget.style.userSelect = 'none';

  let isDragging = false;
  let startX = 0, startY = 0;
  let initialLeft = 0, initialTop = 0;
  let hasMoved = false;

  const onMouseDown = (e) => {
    // Only drag with left click and ignore clicks directly on buttons, inputs or links
    if (e.button !== 0) return;
    if (e.target.tagName === 'BUTTON' || e.target.tagName === 'INPUT' || e.target.tagName === 'A' || e.target.closest('button, a, input, select')) {
      return;
    }

    isDragging = true;
    hasMoved = false;
    startX = e.clientX;
    startY = e.clientY;

    const rect = el.getBoundingClientRect();
    initialLeft = rect.left;
    initialTop = rect.top;

    dragTarget.style.cursor = 'grabbing';
    el.style.transition = 'none';

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  };

  const onMouseMove = (e) => {
    if (!isDragging) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;

    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
      hasMoved = true;
    }

    const rect = el.getBoundingClientRect();
    let newLeft = initialLeft + dx;
    let newTop = initialTop + dy;

    // Viewport boundaries
    const minX = 8;
    const maxX = window.innerWidth - rect.width - 8;
    const minY = 8;
    const maxY = window.innerHeight - rect.height - 8;

    newLeft = Math.max(minX, Math.min(newLeft, maxX));
    newTop = Math.max(minY, Math.min(newTop, maxY));

    el.style.left = `${newLeft}px`;
    el.style.top = `${newTop}px`;
    el.style.bottom = 'auto';
    el.style.right = 'auto';

    if (typeof onDragMove === 'function') {
      onDragMove(newLeft, newTop);
    }
  };

  const onMouseUp = () => {
    if (!isDragging) return;
    isDragging = false;
    dragTarget.style.cursor = 'grab';

    document.removeEventListener('mousemove', onMouseMove);
    document.removeEventListener('mouseup', onMouseUp);

    if (hasMoved) {
      const rect = el.getBoundingClientRect();
      lsSet(storageKey, { left: Math.round(rect.left), top: Math.round(rect.top) });
      if (typeof onDragEnd === 'function') {
        onDragEnd(rect.left, rect.top);
      }
    }
  };

  // Block click on element if it was dragged
  el.addEventListener('click', (e) => {
    if (hasMoved) {
      e.stopImmediatePropagation();
      e.preventDefault();
      hasMoved = false;
    }
  }, true);

  dragTarget.addEventListener('mousedown', onMouseDown);
}

function injectFloatingButton() {
  if (document.getElementById('mc-fb-floating-bar')) return;

  const bar = document.createElement('div');
  bar.id = 'mc-fb-floating-bar';
  Object.assign(bar.style, {
    position: 'fixed',
    bottom: '24px',
    right: '24px',
    zIndex: '999998',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    background: 'linear-gradient(135deg, rgba(18, 26, 46, 0.96) 0%, rgba(9, 13, 24, 0.98) 100%)',
    backdropFilter: 'blur(28px) saturate(200%)',
    webkitBackdropFilter: 'blur(28px) saturate(200%)',
    border: '1px solid rgba(255, 255, 255, 0.15)',
    padding: '6px 12px 6px 14px',
    borderRadius: '50px',
    boxShadow: '0 20px 48px -8px rgba(0, 0, 0, 0.85), inset 0 1px 0 rgba(255, 255, 255, 0.2), 0 0 28px rgba(37, 99, 235, 0.25)',
    fontFamily: "'Plus Jakarta Sans', system-ui, -apple-system, sans-serif",
    cursor: 'grab',
    transition: 'all 0.2s cubic-bezier(0.16, 1, 0.3, 1)'
  });

  bar.innerHTML = `
    <span style="cursor:grab;color:#64748b;font-size:14px;padding:0 3px;user-select:none;opacity:0.75;" title="Arrastrar barra libremente">⠿</span>
    <div id="mc-fb-pill-status" style="display:flex;align-items:center;gap:7px;font-size:0.75rem;color:#f1f5f9;font-weight:700;cursor:pointer;padding:5px 10px;border-radius:20px;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.1);transition:background 0.2s;" title="Ver prospectos">
      <span id="mc-fb-pill-dot" style="width:8px;height:8px;border-radius:50%;background:#10b981;display:inline-block;animation:mcPulseGreen 2s infinite;box-shadow:0 0 8px rgba(16,185,129,0.7);"></span>
      <span id="mc-fb-pill-text" style="letter-spacing:0.01em;">Escaneando...</span>
    </div>
    <button id="mc-fb-quick-reply-all-btn" class="mc-action-btn" style="display:none;background:linear-gradient(135deg,#059669,#10b981);color:#fff;border:none;border-radius:30px;padding:7px 14px;font-size:0.75rem;font-weight:800;cursor:pointer;align-items:center;gap:6px;box-shadow:0 4px 14px rgba(16,185,129,0.4);" title="Abre y responde automáticamente todos los clientes pendientes">
      <span>⚡ Responder Todos</span>
    </button>
    <button id="mc-fb-toggle-crm-btn" class="mc-action-btn" style="background:linear-gradient(135deg,#1d4ed8,#2563eb);border:1px solid rgba(255,255,255,0.25);color:#ffffff;border-radius:30px;padding:7px 16px;font-size:0.76rem;font-weight:800;cursor:pointer;display:flex;align-items:center;gap:6px;box-shadow:0 4px 16px rgba(37,99,235,0.45);letter-spacing:0.02em;">
      <span>⚡ CRM</span>
    </button>
  `;

  document.body.appendChild(bar);

  // Enable free dragging anywhere on the screen & reposition modal dynamically if open
  makeDraggable(bar, 'mc_fb_bar_pos', null, () => {
    const sb = document.getElementById('metacloser-crm-sidebar');
    if (sb && sb.style.display !== 'none' && !sb._manuallyRepositioned) {
      positionModalNearButton(sb);
    }
  });

  // Event handlers
  const openOrToggleSidebar = () => {
    let sb = document.getElementById('metacloser-crm-sidebar');
    if (!sb) {
      injectSidebar();
      sb = document.getElementById('metacloser-crm-sidebar');
    } else {
      const willShow = sb.style.display === 'none';
      sb.style.display = willShow ? 'flex' : 'none';
      if (willShow && !sb._manuallyRepositioned) {
        positionModalNearButton(sb);
      }
    }
  };

  const crmBtn = document.getElementById('mc-fb-toggle-crm-btn');
  crmBtn.addEventListener('click', openOrToggleSidebar);

  const pillStatus = document.getElementById('mc-fb-pill-status');
  if (pillStatus) {
    pillStatus.addEventListener('click', () => {
      if (typeof window.__mcScanFacebookChats === 'function') {
        window.__mcScanFacebookChats();
      }
      updateFloatingPill();
      if (lastErrorMessage) {
        if (window.__mcShowToast) window.__mcShowToast(`⚠️ <b>Detalle del estado:</b> ${lastErrorMessage}`, false);
        else alert('⚠️ ' + lastErrorMessage);
      }
      openOrToggleSidebar();
    });
  }

  const replyAllBtn = document.getElementById('mc-fb-quick-reply-all-btn');
  replyAllBtn.addEventListener('click', () => {
    if (!window.__mcRunPendingQueue) {
      openOrToggleSidebar();
      setTimeout(() => window.__mcRunPendingQueue && window.__mcRunPendingQueue(), 1500);
      return;
    }
    window.__mcRunPendingQueue();
  });

  setTimeout(() => { updateFloatingPill(); }, 1000);
}

// ─── Init ────────────────────────────────────────────────────────────────────
setTimeout(() => { injectFloatingButton(); }, 2000);
