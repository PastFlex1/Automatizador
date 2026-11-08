// ==============================================================================
// MetaCloser CRM - WhatsApp Web Copilot v2.0
// Ultra AI Sales Assistant & Omnichannel CRM (APM Inox & amecocinas.com)
// ==============================================================================

(function () {
  'use strict';

  console.log('[MetaCloser CRM] WhatsApp Web Content Script v2.0 Loaded');

  const CRM_API_BASE = 'http://localhost:3000/api';
  const LS_KEY = 'mc_crm_state';
  let activeAdProduct = '';
  let activeContact = {
    name: 'Esperando chat...',
    phone: '',
    avatar: '',
    stage: 'new_lead',
    lastMessage: '¿Sigue disponible este artículo?'
  };

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

  // Default catalog (base APM Inox / amecocinas.com)
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
      crmFetch('/crm/products', 'POST', {
        products: cat.map((c, idx) => ({
          id: c.id || `prod_ext_${idx}`,
          name: c.name,
          price: parseFloat(c.price) || 0,
          currency: 'USD',
          category: c.category || 'Equipos Gastronómicos',
          description: c.description || 'Acero inoxidable quirúrgico T-304'
        }))
      });
    } catch (e) {}
  }

  function getCustomCampaigns() {
    return lsGet('custom_campaigns', [
      {
        id: 'camp_1',
        name: 'Góndolas Inox Especiales T-304',
        message: 'Buenas tardes, estimada {nombre}. Mucho gusto en saludarle. Es un placer atenderle respecto a nuestras góndolas especiales en acero inoxidable T‑304 de alta durabilidad y garantía directa de taller. Puede ver más modelos en https://amecocinas.com/ o llamarnos al 09920350548. Nuestro taller está en Quito Norte (Calle 25 de Mayo 226, sector Cotocollao, frente al Club de Leones).'
      },
      {
        id: 'camp_2',
        name: 'Cocinas Industriales Directo de Fábrica',
        message: 'Buenas tardes, estimado/a {nombre}. De parte de APM Inox le extendemos un cordial saludo. Le informamos que tenemos disponibilidad de cocinas industriales de 2, 3 y 4 quemadores con precio especial de fábrica. Equipos 100% en acero inoxidable grado alimenticio con garantía directa. ¿En qué medidas requiere su equipo?'
      }
    ]);
  }

  function saveCustomCampaigns(list) {
    lsSet('custom_campaigns', list);
  }

  // ─── WhatsApp Web DOM Helpers ───────────────────────────────────────────────
  function getWhatsAppInput() {
    return (
      document.querySelector('#main footer div[contenteditable="true"]') ||
      document.querySelector('footer div[contenteditable="true"]') ||
      document.querySelector('div[contenteditable="true"][data-tab="10"]') ||
      document.querySelector('div[contenteditable="true"][role="textbox"]')
    );
  }

  function getWhatsAppSendButton() {
    return (
      document.querySelector('button[aria-label="Enviar"]') ||
      document.querySelector('button[aria-label="Send"]') ||
      document.querySelector('button[data-testid="compose-btn-send"]') ||
      document.querySelector('span[data-icon="send"]')?.closest('button') ||
      document.querySelector('span[data-icon="send"]')?.parentElement
    );
  }

  function triggerClick(element) {
    if (!element) return;
    element.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window }));
    element.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, view: window }));
    element.click();
  }

  function insertTextIntoWhatsAppInput(text) {
    const input = getWhatsAppInput();
    if (!input) {
      navigator.clipboard.writeText(text);
      showToast('📋 Copiado al portapapeles. Haz clic en el chat de WhatsApp y presiona Ctrl + V.');
      return false;
    }

    input.focus();
    const inserted = document.execCommand('insertText', false, text);
    if (!inserted) {
      input.textContent = text;
      input.dispatchEvent(new InputEvent('input', { bubbles: true }));
    }
    return true;
  }

  async function sendWhatsAppMessageNow(text) {
    const ok = insertTextIntoWhatsAppInput(text);
    if (!ok) return false;
    await new Promise(r => setTimeout(r, 350));
    const sendBtn = getWhatsAppSendButton();
    if (sendBtn) {
      triggerClick(sendBtn);
      return true;
    } else {
      const input = getWhatsAppInput();
      if (input) {
        input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true }));
        input.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true }));
        return true;
      }
    }
    return false;
  }

  // Toast Notification
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
        padding: '12px 18px',
        borderRadius: '12px',
        boxShadow: '0 12px 30px rgba(0,0,0,0.65)',
        fontFamily: "'Plus Jakarta Sans', system-ui, -apple-system, sans-serif",
        fontSize: '13px',
        maxWidth: '380px',
        lineHeight: '1.5',
        transition: 'opacity 0.3s ease, transform 0.3s ease'
      });
      document.body.appendChild(toast);
    }
    toast.style.background = isSuccess ? 'linear-gradient(135deg, #064e3b, #047857)' : 'linear-gradient(135deg, #7f1d1d, #b91c1c)';
    toast.style.border = isSuccess ? '1.5px solid #10b981' : '1.5px solid #ef4444';
    toast.innerHTML = msg;
    toast.style.display = 'block';
    toast.style.opacity = '1';
    toast.style.transform = 'translateY(0)';
    clearTimeout(toast._timeout);
    toast._timeout = setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(8px)';
      setTimeout(() => { toast.style.display = 'none'; }, 300);
    }, 5500);
  }

  // Detect open chat in WhatsApp Web
  function detectActiveChat() {
    const header = document.querySelector('#main header');
    if (!header) return;

    // Contact name
    const titleEl = header.querySelector('span[dir="auto"], [title]');
    const rawName = (titleEl ? (titleEl.getAttribute('title') || titleEl.innerText) : '').trim();
    if (!rawName) return;

    // Secondary phone or pushname
    let phoneOrInfo = '';
    const spans = Array.from(header.querySelectorAll('span[dir="auto"], span[title]'));
    for (const span of spans) {
      const text = (span.getAttribute('title') || span.innerText || '').trim();
      if (text !== rawName && (text.includes('+') || /\d{6,}/.test(text) || text.startsWith('~'))) {
        phoneOrInfo = text.replace(/^~\s*/, '');
        break;
      }
    }

    // Avatar image
    const imgEl = header.querySelector('img');
    const avatarSrc = imgEl ? imgEl.src : '';

    // Extract recent incoming messages from chat body
    const incomingEls = Array.from(document.querySelectorAll('#main div.message-in, div.message-in'));
    let lastMsgText = '';
    if (incomingEls.length > 0) {
      const lastEl = incomingEls[incomingEls.length - 1];
      const clone = lastEl.cloneNode(true);
      clone.querySelectorAll('span[dir="auto"][class*="time"], span[data-icon], [data-testid="msg-meta"]').forEach(e => e.remove());
      lastMsgText = (clone.innerText || '').trim();
    }

    // Clean product detection based on catalog matches in the incoming query
    const catalog = getCatalog();
    let detectedProd = activeAdProduct || 'Cocina Industrial 2 Quemadores';
    let detectedPrice = '200';

    if (lastMsgText) {
      const lower = lastMsgText.toLowerCase();
      for (const p of catalog) {
        const words = p.name.toLowerCase().split(' ').filter(w => w.length > 3);
        if (words.some(w => lower.includes(w))) {
          detectedProd = p.name;
          detectedPrice = p.price;
          break;
        }
      }
    }

    activeContact.name = rawName;
    activeContact.phone = phoneOrInfo || rawName;
    activeContact.avatar = avatarSrc;
    if (lastMsgText) activeContact.lastMessage = lastMsgText;

    // Update UI Elements if sidebar exists
    const displayNameEl = document.getElementById('mc-lead-display-name');
    const displayProductEl = document.getElementById('mc-lead-display-product');
    const displayPriceEl = document.getElementById('mc-lead-display-price');
    const displayMsgEl = document.getElementById('mc-lead-display-msg');
    const avatarEl = document.getElementById('mc-lead-avatar');

    if (displayNameEl && displayNameEl.dataset.synced !== rawName) {
      displayNameEl.dataset.synced = rawName;
      displayNameEl.innerHTML = `<span>${rawName}</span> <span style="font-size:0.62rem;padding:2px 7px;border-radius:12px;background:rgba(16,185,129,0.18);color:#34d399;font-weight:800;border:1px solid rgba(16,185,129,0.35);">🟢 Chat Activo</span>`;
      
      const inputName = document.getElementById('mc-fb-lead-name');
      if (inputName) inputName.value = rawName;
    }

    if (displayProductEl && !document.getElementById('mc-fb-product-name')?.dataset.userEdited) {
      displayProductEl.innerText = detectedProd;
      const inputProd = document.getElementById('mc-fb-product-name');
      if (inputProd) inputProd.value = detectedProd;
    }

    if (displayPriceEl && !document.getElementById('mc-fb-product-price')?.dataset.userEdited) {
      displayPriceEl.innerText = `$${detectedPrice}`;
      const inputPrice = document.getElementById('mc-fb-product-price');
      if (inputPrice) inputPrice.value = detectedPrice;
    }

    if (displayMsgEl && lastMsgText) {
      displayMsgEl.innerText = `"${lastMsgText}"`;
      const inputMsg = document.getElementById('mc-fb-client-msg');
      if (inputMsg && !inputMsg.dataset.userEdited) inputMsg.value = lastMsgText;
    }

    if (avatarEl) {
      if (avatarSrc) {
        avatarEl.innerHTML = `<img src="${avatarSrc}" style="width:100%;height:100%;border-radius:12px;object-fit:cover;">`;
      } else {
        avatarEl.innerText = (rawName[0] || 'C').toUpperCase();
      }
    }

    updateFloatingPill(`🟢 ${rawName.split(' ')[0]}`);
  }

  // Scan unread chats in left pane (#pane-side)
  function scanUnreadWhatsAppChats() {
    const unreadBadges = Array.from(document.querySelectorAll('#pane-side span[aria-label*="no leído"], #pane-side span[aria-label*="unread"], #pane-side span[aria-label*="mensaje"]'));
    return unreadBadges.map(badge => {
      const row = badge.closest('[role="listitem"], [role="row"], div[data-testid="cell-frame-container"]');
      const nameEl = row?.querySelector('span[dir="auto"], [title]');
      const name = (nameEl ? (nameEl.getAttribute('title') || nameEl.innerText) : 'Cliente').trim();
      return { row, name, badge };
    });
  }

  // ─── Floating Copilot Launcher Widget ───
  function updateFloatingPill(customStatus) {
    const textEl = document.getElementById('mc-wa-pill-text');
    const dotEl = document.getElementById('mc-wa-pill-dot');
    if (!textEl || !dotEl) return;

    if (customStatus) {
      textEl.innerText = customStatus;
      dotEl.style.background = '#10b981';
      dotEl.style.boxShadow = '0 0 10px rgba(16,185,129,0.8)';
      return;
    }

    const unreads = scanUnreadWhatsAppChats();
    if (unreads.length > 0) {
      textEl.innerText = `${unreads.length} pendiente${unreads.length > 1 ? 's' : ''}`;
      dotEl.style.background = '#38bdf8';
      dotEl.style.boxShadow = '0 0 10px rgba(56,189,248,0.8)';
    } else {
      textEl.innerText = activeContact.name !== 'Esperando chat...' ? activeContact.name.split(' ')[0] : 'Al día (0)';
      dotEl.style.background = '#10b981';
      dotEl.style.boxShadow = '0 0 10px rgba(16,185,129,0.8)';
    }
  }

  function makeDraggable(el, storageKey = 'mc_wa_bar_pos', handleEl = null, onDragMove = null, onDragEnd = null) {
    if (!el) return;
    const dragTarget = handleEl || el;

    const savedPos = lsGet(storageKey, null);
    if (savedPos && typeof savedPos.left === 'number' && typeof savedPos.top === 'number') {
      const elW = el.offsetWidth || 300;
      const elH = el.offsetHeight || 100;
      const maxX = Math.max(10, window.innerWidth - elW);
      const maxY = Math.max(10, window.innerHeight - elH);
      el.style.left = `${Math.min(Math.max(10, savedPos.left), maxX)}px`;
      el.style.top = `${Math.min(Math.max(10, savedPos.top), maxY)}px`;
      el.style.bottom = 'auto';
      el.style.right = 'auto';
    }

    dragTarget.style.cursor = 'grab';
    let isDragging = false;
    let startX = 0, startY = 0;
    let initialLeft = 0, initialTop = 0;
    let hasMoved = false;

    const onMouseDown = (e) => {
      if (e.target.closest('button, input, select, textarea, a, .mc-action-btn')) return;
      isDragging = true;
      hasMoved = false;
      dragTarget.style.cursor = 'grabbing';
      startX = e.clientX;
      startY = e.clientY;

      const rect = el.getBoundingClientRect();
      initialLeft = rect.left;
      initialTop = rect.top;

      window.addEventListener('mousemove', onMouseMove);
      window.addEventListener('mouseup', onMouseUp);
      e.preventDefault();
    };

    const onMouseMove = (e) => {
      if (!isDragging) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
        hasMoved = true;
        const newLeft = Math.max(10, Math.min(window.innerWidth - el.offsetWidth - 10, initialLeft + dx));
        const newTop = Math.max(10, Math.min(window.innerHeight - el.offsetHeight - 10, initialTop + dy));
        el.style.left = `${newLeft}px`;
        el.style.top = `${newTop}px`;
        el.style.right = 'auto';
        el.style.bottom = 'auto';
        if (typeof onDragMove === 'function') onDragMove(newLeft, newTop);
      }
    };

    const onMouseUp = () => {
      if (!isDragging) return;
      isDragging = false;
      dragTarget.style.cursor = 'grab';
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);

      if (hasMoved) {
        const rect = el.getBoundingClientRect();
        lsSet(storageKey, { left: rect.left, top: rect.top });
        if (typeof onDragEnd === 'function') onDragEnd();
      }
    };

    el.addEventListener('click', (e) => {
      if (hasMoved) {
        e.stopImmediatePropagation();
        e.preventDefault();
        hasMoved = false;
      }
    }, true);

    dragTarget.addEventListener('mousedown', onMouseDown);
  }

  function positionModalNearButton(sidebar) {
    if (!sidebar) return;
    const bar = document.getElementById('mc-wa-floating-bar');
    if (!bar) return;

    const barRect = bar.getBoundingClientRect();
    const modalW = 500;
    const modalH = Math.min(740, window.innerHeight - 24);

    sidebar.style.width = `${modalW}px`;
    sidebar.style.height = `${modalH}px`;

    let targetLeft, targetTop;
    if (barRect.left + barRect.width / 2 > window.innerWidth / 2) {
      targetLeft = barRect.right - modalW;
    } else {
      targetLeft = barRect.left;
    }

    if (barRect.top > window.innerHeight / 2) {
      targetTop = barRect.top - modalH - 12;
      if (targetTop < 12) targetTop = 12;
    } else {
      targetTop = barRect.bottom + 12;
      if (targetTop + modalH > window.innerHeight - 12) {
        targetTop = window.innerHeight - modalH - 12;
      }
    }

    targetLeft = Math.max(12, Math.min(targetLeft, window.innerWidth - modalW - 12));
    targetTop = Math.max(12, Math.min(targetTop, window.innerHeight - modalH - 12));

    sidebar.style.left = `${Math.round(targetLeft)}px`;
    sidebar.style.top = `${Math.round(targetTop)}px`;
    sidebar.style.right = 'auto';
    sidebar.style.bottom = 'auto';
  }

  // ─── Floating Launcher HTML ────────────────────────────────────────────────
  function injectFloatingButton() {
    if (document.getElementById('mc-wa-floating-bar')) return;

    const bar = document.createElement('div');
    bar.id = 'mc-wa-floating-bar';
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
      padding: '6px 14px 6px 14px',
      borderRadius: '50px',
      boxShadow: '0 20px 48px -8px rgba(0, 0, 0, 0.85), inset 0 1px 0 rgba(255, 255, 255, 0.2), 0 0 28px rgba(37, 99, 235, 0.25)',
      fontFamily: "'Plus Jakarta Sans', system-ui, -apple-system, sans-serif",
      cursor: 'grab',
      userSelect: 'none',
      transition: 'all 0.2s cubic-bezier(0.16, 1, 0.3, 1)'
    });

    bar.innerHTML = `
      <span style="cursor:grab;color:#64748b;font-size:14px;padding:0 3px;opacity:0.75;" title="Arrastrar libremente">⠿</span>
      <div id="mc-wa-pill-status" style="display:flex;align-items:center;gap:7px;font-size:0.75rem;color:#f1f5f9;font-weight:700;cursor:pointer;padding:5px 10px;border-radius:20px;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.1);transition:background 0.2s;" title="Ver prospectos">
        <span id="mc-wa-pill-dot" style="width:8px;height:8px;border-radius:50%;background:#10b981;display:inline-block;animation:mcPulseGreen 2s infinite;box-shadow:0 0 8px rgba(16,185,129,0.7);"></span>
        <span id="mc-wa-pill-text">WhatsApp AI</span>
      </div>
      <button id="mc-wa-toggle-crm-btn" class="mc-action-btn" style="background:linear-gradient(135deg,#1d4ed8,#2563eb);border:1px solid rgba(255,255,255,0.25);color:#ffffff;border-radius:30px;padding:7px 16px;font-size:0.76rem;font-weight:800;cursor:pointer;display:flex;align-items:center;gap:6px;box-shadow:0 4px 16px rgba(37,99,235,0.45);letter-spacing:0.02em;">
        <span>⚡ CRM</span>
      </button>
    `;

    document.body.appendChild(bar);

    makeDraggable(bar, 'mc_wa_bar_pos', null, () => {
      const sb = document.getElementById('metacloser-crm-sidebar');
      if (sb && sb.style.display !== 'none' && !sb._manuallyRepositioned) {
        positionModalNearButton(sb);
      }
    });

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

    document.getElementById('mc-wa-toggle-crm-btn').addEventListener('click', openOrToggleSidebar);
    document.getElementById('mc-wa-pill-status').addEventListener('click', openOrToggleSidebar);

    setTimeout(() => { updateFloatingPill(); }, 1000);
  }

  // ─── Build Catalog HTML ─────────────────────────────────────────────────────
  function buildCatalogHTML(catalog) {
    if (!catalog || catalog.length === 0) {
      return `<div style="text-align:center;padding:24px 10px;color:#94a3b8;font-size:0.75rem;">No tienes productos guardados en el catálogo. ¡Agrega uno o restaura el catálogo por defecto!</div>`;
    }
    return catalog.map((item, i) => `
      <div class="mc-cat-item" style="display:flex;align-items:center;gap:8px;background:linear-gradient(145deg, rgba(22,30,50,0.85), rgba(12,18,32,0.95));border:1px solid rgba(255,255,255,0.1);border-radius:10px;padding:8px 10px;margin-bottom:7px;box-shadow:0 3px 10px rgba(0,0,0,0.3);">
        <img src="${item.img}" style="width:40px;height:40px;border-radius:8px;object-fit:cover;flex-shrink:0;border:1px solid rgba(255,255,255,0.15);" onerror="this.style.display='none'">
        <div style="flex:1;min-width:0;">
          <div style="font-size:0.78rem;font-weight:700;color:#f8fafc;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;" title="${item.name}">${item.emoji || '📦'} ${item.name}</div>
          <div style="font-size:0.75rem;color:#10b981;font-weight:800;margin-top:2px;">$${item.price}</div>
        </div>
        <button type="button" class="mc-cat-select-btn mc-action-btn" data-index="${i}" style="padding:6px 10px;background:linear-gradient(135deg,#1d4ed8,#2563eb);color:#fff;border:none;border-radius:7px;font-size:0.72rem;font-weight:700;cursor:pointer;box-shadow:0 2px 8px rgba(37,99,235,0.35);" title="Insertar cotización completa en el chat de WhatsApp">Usar</button>
        <button type="button" class="mc-cat-edit-btn mc-action-btn" data-index="${i}" style="padding:6px 9px;background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.18);color:#93c5fd;border-radius:7px;font-size:0.72rem;cursor:pointer;font-weight:700;" title="Editar producto">✏️</button>
        <button type="button" class="mc-cat-delete-btn mc-action-btn" data-index="${i}" style="padding:6px 8px;background:rgba(239,68,68,0.15);border:1px solid rgba(239,68,68,0.3);color:#fca5a5;border-radius:7px;font-size:0.72rem;cursor:pointer;" title="Eliminar producto">✕</button>
      </div>
    `).join('');
  }

  // ─── Modal Sidebar Injection ────────────────────────────────────────────────
  function injectSidebar() {
    if (document.getElementById('metacloser-crm-sidebar')) return;

    // Persisted state
    const savedProduct   = lsGet('product', 'Cocina Industrial 2 Quemadores');
    const savedPrice     = lsGet('price', '200');
    const savedCity      = lsGet('city', 'Quito');
    const savedImgUrl    = lsGet('activeImgUrl', 'https://images.unsplash.com/photo-1556911220-e15b29be8c8f?auto=format&fit=crop&w=900&q=80');
    const savedImgBadge  = lsGet('activeImgBadge', '✓ Foto Lista para Catálogo');
    const savedTab       = lsGet('activeTab_wa', 'chat');
    const catalog        = getCatalog();
    const savedCampLeads = lsGet('camp_leads_wa', 'Alex Palma | Cocina Industrial 3 Quemadores\n593982538155 | Campana Pared 2m');
    const savedCampDelay = lsGet('camp_delay_wa', '10');
    const savedCampMsg   = lsGet('camp_message_wa', 'Buenas tardes, estimada/o {nombre}. Mucho gusto en saludarle de parte de APM Inox. Es un verdadero placer atenderle respecto a nuestros equipos en acero inoxidable quirúrgico T‑304 con garantía directa de fábrica. Para detalles y cotización exacta a la medida de su negocio, puede escribirnos o llamarnos al 09920350548. Nuestro taller está ubicado en Calle 25 de Mayo 226, sector Cotocollao, frente al Club de Leones. También puede visitar nuestro catálogo en https://amecocinas.com/ . Quedamos a su entera disposición.');

    // Inject Luxury Styles once
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
      width: '500px',
      height: `${Math.min(740, window.innerHeight - 24)}px`,
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
            <div style="width:40px;height:40px;border-radius:12px;background:linear-gradient(135deg,#059669,#10b981);display:flex;align-items:center;justify-content:center;box-shadow:0 4px 16px rgba(16,185,129,0.45);border:1px solid rgba(255,255,255,0.25);">
              <span style="font-size:1.2rem;">💬</span>
            </div>
            <div>
              <div style="font-weight:900;font-size:1.02rem;color:#ffffff;display:flex;align-items:center;gap:8px;letter-spacing:-0.01em;">
                <span>MetaCloser AI</span>
                <span style="font-size:0.6rem;background:linear-gradient(135deg,rgba(16,185,129,0.35),rgba(5,150,105,0.45));color:#a7f3d0;border:1px solid rgba(16,185,129,0.55);padding:2px 7px;border-radius:20px;font-weight:800;letter-spacing:0.04em;">WHATSAPP</span>
              </div>
              <div style="font-size:0.7rem;color:#94a3b8;font-weight:600;margin-top:2px;">Sales Copilot · APM Inox</div>
            </div>
          </div>
        </div>
        
        <div style="display:flex;align-items:center;gap:8px;">
          <a href="https://web.whatsapp.com/" target="_blank" class="mc-header-icon-btn mc-action-btn" title="WhatsApp Web">
            <span>📱</span>
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

      <!-- PESTAÑA 1: CHAT IA (DETECCIÓN Y RESPUESTAS INTELIGENTES) -->
      <div id="mc-view-chat" style="display:${savedTab==='chat'?'flex':'none'};flex-direction:column;flex:1;overflow:hidden;padding:10px 18px 18px;">
        
        <!-- TOP STATUS & AUTO-PILOT CONTROL -->
        <div style="background:rgba(20,28,48,0.65);border:1px solid rgba(255,255,255,0.07);border-radius:14px;padding:11px 16px;margin-bottom:12px;display:flex;justify-content:space-between;align-items:center;">
          <div style="display:flex;align-items:center;gap:8px;">
            <span style="width:9px;height:9px;border-radius:50%;background:#10b981;box-shadow:0 0 10px rgba(16,185,129,0.8);animation:mcPulseGreen 2s infinite;"></span>
            <span style="font-size:0.72rem;font-weight:800;color:#e2e8f0;letter-spacing:0.04em;text-transform:uppercase;">Prospecto en WhatsApp</span>
          </div>
          
          <label style="display:flex;align-items:center;gap:8px;cursor:pointer;background:rgba(16,185,129,0.15);padding:5px 12px;border-radius:20px;border:1px solid rgba(16,185,129,0.35);user-select:none;transition:all 0.2s;">
            <span style="font-size:0.72rem;font-weight:800;color:#a7f3d0;">⚡ Auto-Pilot</span>
            <input type="checkbox" id="mc-wa-auto-pilot-check" style="cursor:pointer;width:16px;height:16px;accent-color:#10b981;margin:0;">
          </label>
        </div>

        <!-- EXECUTIVE LEAD DOSSIER CARD -->
        <div id="mc-lead-card" style="background:linear-gradient(145deg,rgba(22,31,52,0.75),rgba(13,18,32,0.9));border:1px solid rgba(255,255,255,0.1);border-radius:16px;padding:16px 18px;margin-bottom:12px;box-shadow:0 10px 30px -5px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.1);">
          
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">
            <div style="display:flex;align-items:center;gap:12px;">
              <div id="mc-lead-avatar" style="width:44px;height:44px;border-radius:12px;background:linear-gradient(135deg,#059669,#10b981);display:flex;align-items:center;justify-content:center;font-weight:900;font-size:1.15rem;color:#ffffff;box-shadow:0 4px 14px rgba(16,185,129,0.4);border:1px solid rgba(255,255,255,0.25);">
                👤
              </div>
              <div>
                <div id="mc-lead-display-name" style="font-weight:800;font-size:1rem;color:#ffffff;display:flex;align-items:center;gap:8px;">
                  <span>${activeContact.name}</span>
                  <span id="mc-lead-badge-live" style="font-size:0.62rem;padding:3px 8px;border-radius:14px;background:rgba(16,185,129,0.18);color:#34d399;font-weight:800;border:1px solid rgba(16,185,129,0.35);">🟢 Chat Activo</span>
                </div>
                <div id="mc-lead-display-meta" style="font-size:0.75rem;color:#94a3b8;margin-top:3px;">
                  📦 <span id="mc-lead-display-product" style="color:#93c5fd;font-weight:700;">${savedProduct}</span> · <span id="mc-lead-display-price" style="color:#34d399;font-weight:900;">$${savedPrice}</span>
                </div>
              </div>
            </div>
            <button id="mc-toggle-edit-btn" type="button" class="mc-action-btn" style="font-size:0.72rem;color:#93c5fd;background:rgba(37,99,235,0.15);border:1px solid rgba(37,99,235,0.35);border-radius:8px;cursor:pointer;padding:6px 11px;font-weight:700;">
              ✏️ Ajustar
            </button>
          </div>

          <!-- SPEECH BUBBLE -->
          <div id="mc-lead-bubble" style="margin-top:12px;background:rgba(10,14,25,0.85);border-left:3px solid #10b981;border-radius:10px;padding:12px 16px;font-size:0.82rem;color:#e2e8f0;line-height:1.5;">
            <span style="color:#34d399;font-weight:800;margin-right:6px;">Mensaje de WhatsApp:</span>
            <span id="mc-lead-display-msg">"${activeContact.lastMessage}"</span>
          </div>

          <!-- COLLAPSIBLE FORM FIELDS -->
          <div id="mc-lead-edit-fields" style="display:none;margin-top:12px;padding-top:12px;border-top:1px dashed rgba(255,255,255,0.1);">
            <div style="display:flex;gap:8px;margin-bottom:8px;">
              <div style="flex:1;">
                <label style="font-size:0.65rem;color:#94a3b8;font-weight:700;text-transform:uppercase;margin-bottom:3px;display:block;">Nombre del Contacto</label>
                <input type="text" id="mc-fb-lead-name" class="mc-input-field" placeholder="Nombre..." value="${activeContact.name}" style="width:100%;padding:8px 11px;border-radius:8px;border:1px solid rgba(255,255,255,0.12);background:rgba(15,23,42,0.9);color:#fff;font-size:0.8rem;box-sizing:border-box;">
              </div>
              <div style="width:90px;">
                <label style="font-size:0.65rem;color:#94a3b8;font-weight:700;text-transform:uppercase;margin-bottom:3px;display:block;">Precio</label>
                <input type="text" id="mc-fb-product-price" class="mc-input-field" placeholder="$200" value="${savedPrice}" style="width:100%;padding:8px 11px;border-radius:8px;border:1px solid rgba(255,255,255,0.12);background:rgba(15,23,42,0.9);color:#34d399;font-weight:800;font-size:0.8rem;box-sizing:border-box;">
              </div>
            </div>
            <div style="margin-bottom:8px;">
              <label style="font-size:0.65rem;color:#94a3b8;font-weight:700;text-transform:uppercase;margin-bottom:3px;display:block;">Equipo Solicitado</label>
              <input type="text" id="mc-fb-product-name" class="mc-input-field" placeholder="Cocina, campana, freidora..." value="${savedProduct}" style="width:100%;padding:8px 11px;border-radius:8px;border:1px solid rgba(255,255,255,0.12);background:rgba(15,23,42,0.9);color:#fff;font-size:0.8rem;box-sizing:border-box;">
            </div>
            <div>
              <label style="font-size:0.65rem;color:#94a3b8;font-weight:700;text-transform:uppercase;margin-bottom:3px;display:block;">Último mensaje recibido</label>
              <input type="text" id="mc-fb-client-msg" class="mc-input-field" placeholder="Mensaje..." value="${activeContact.lastMessage}" style="width:100%;padding:8px 11px;border-radius:8px;border:1px solid rgba(255,255,255,0.12);background:rgba(15,23,42,0.9);color:#e2e8f0;font-size:0.8rem;box-sizing:border-box;">
            </div>
          </div>
        </div>

        <!-- PIPELINE STAGES & SAVE LEAD ROW -->
        <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:12px;">
          <div style="display:flex;gap:4px;flex:1;background:rgba(10,14,26,0.85);padding:3px;border-radius:10px;border:1px solid rgba(255,255,255,0.08);">
            <button class="mc-stage-btn mc-action-btn ${activeContact.stage==='new_lead'?'active':''}" data-stage="new_lead" style="flex:1;padding:5px 2px;background:none;border:none;color:#94a3b8;border-radius:7px;font-size:0.68rem;font-weight:700;cursor:pointer;">📥 Nuevo</button>
            <button class="mc-stage-btn mc-action-btn ${activeContact.stage==='quote_sent'?'active':''}" data-stage="quote_sent" style="flex:1;padding:5px 2px;background:none;border:none;color:#94a3b8;border-radius:7px;font-size:0.68rem;font-weight:700;cursor:pointer;">💬 Cotiz.</button>
            <button class="mc-stage-btn mc-action-btn ${activeContact.stage==='closing'?'active':''}" data-stage="closing" style="flex:1;padding:5px 2px;background:none;border:none;color:#94a3b8;border-radius:7px;font-size:0.68rem;font-weight:700;cursor:pointer;">⏳ Cierre</button>
            <button class="mc-stage-btn mc-action-btn ${activeContact.stage==='won'?'active':''}" data-stage="won" style="flex:1;padding:5px 2px;background:none;border:none;color:#94a3b8;border-radius:7px;font-size:0.68rem;font-weight:700;cursor:pointer;">✅ Pagado</button>
          </div>
          <button id="mc-wa-save-lead-btn" class="mc-action-btn" style="padding:7px 12px;background:rgba(30,41,59,0.9);border:1px solid rgba(255,255,255,0.18);color:#cbd5e1;border-radius:10px;font-size:0.72rem;font-weight:800;cursor:pointer;white-space:nowrap;">
            💾 Guardar CRM
          </button>
        </div>

        <!-- HERO ACTION BUTTON (AI REDACTOR) -->
        <div style="display:flex;gap:8px;margin-bottom:12px;">
          <button id="mc-fb-analyze" class="mc-action-btn" style="flex:1;padding:14px 20px;background:linear-gradient(135deg,#059669 0%,#10b981 100%);color:#fff;border:none;border-radius:14px;font-weight:800;cursor:pointer;font-size:0.92rem;display:flex;align-items:center;justify-content:center;gap:8px;box-shadow:0 6px 22px rgba(16,185,129,0.4), inset 0 1px 0 rgba(255,255,255,0.35);letter-spacing:0.02em;">
            <span>✨ Redactar Respuesta con IA</span>
          </button>
        </div>

        <!-- QUICK SMART SNIPPETS ROW -->
        <div style="display:flex;gap:6px;margin-bottom:12px;overflow-x:auto;padding-bottom:2px;">
          <button type="button" class="mc-smart-snip-btn mc-action-btn" data-snip="ubicacion" style="padding:5px 9px;background:rgba(15,23,42,0.9);border:1px solid rgba(245,158,11,0.35);border-radius:8px;color:#fde68a;font-size:0.68rem;font-weight:700;cursor:pointer;white-space:nowrap;">📍 Taller Quito Norte</button>
          <button type="button" class="mc-smart-snip-btn mc-action-btn" data-snip="garantia" style="padding:5px 9px;background:rgba(15,23,42,0.9);border:1px solid rgba(59,130,246,0.35);border-radius:8px;color:#bfdbfe;font-size:0.68rem;font-weight:700;cursor:pointer;white-space:nowrap;">🛡️ Garantía Acero T-304</button>
          <button type="button" class="mc-smart-snip-btn mc-action-btn" data-snip="catalogo" style="padding:5px 9px;background:rgba(15,23,42,0.9);border:1px solid rgba(16,185,129,0.35);border-radius:8px;color:#a7f3d0;font-size:0.68rem;font-weight:700;cursor:pointer;white-space:nowrap;">🌐 Catálogo amecocinas.com</button>
          <button type="button" class="mc-smart-snip-btn mc-action-btn" data-snip="envios" style="padding:5px 9px;background:rgba(15,23,42,0.9);border:1px solid rgba(168,85,247,0.35);border-radius:8px;color:#e9d5ff;font-size:0.68rem;font-weight:700;cursor:pointer;white-space:nowrap;">🚚 Envíos Nacionales</button>
          <button type="button" class="mc-smart-snip-btn mc-action-btn" data-snip="telefono" style="padding:5px 9px;background:rgba(15,23,42,0.9);border:1px solid rgba(239,68,68,0.35);border-radius:8px;color:#fecaca;font-size:0.68rem;font-weight:700;cursor:pointer;white-space:nowrap;">📞 Llamada 09920350548</button>
        </div>

        <!-- AI RESULTS CONTAINER -->
        <div id="mc-fb-ai-results" style="padding:14px 16px;flex:1;overflow-y:auto;background:rgba(11,16,28,0.75);border:1px solid rgba(255,255,255,0.08);border-radius:14px;">
          <div style="text-align:center;padding:26px 10px;color:#64748b;">
            <div style="font-size:2rem;margin-bottom:8px;opacity:0.8;">🤖</div>
            <div style="font-size:0.86rem;color:#cbd5e1;font-weight:700;">Listo para redactar con IA</div>
            <div style="font-size:0.75rem;color:#64748b;margin-top:4px;">Haz clic en "Redactar Respuesta con IA" para formular una respuesta formal con tono de gente fina de APM Inox.</div>
          </div>
        </div>
      </div>

      <!-- PESTAÑA 2: CAMPAÑAS (DIFUSIÓN Y SEGUIMIENTO EN WHATSAPP) -->
      <div id="mc-view-campaigns" style="display:${savedTab==='campaigns'?'flex':'none'};flex-direction:column;flex:1;overflow:hidden;background:rgba(11,15,25,0.95);">
        <div style="padding:14px 18px;overflow-y:auto;flex:1;display:flex;flex-direction:column;gap:12px;">
          
          <div style="background:linear-gradient(135deg,rgba(16,185,129,0.18),rgba(37,99,235,0.18));border:1px solid rgba(16,185,129,0.35);border-radius:14px;padding:12px 14px;display:flex;align-items:center;justify-content:space-between;">
            <div style="display:flex;align-items:center;gap:10px;">
              <div style="width:36px;height:36px;border-radius:10px;background:linear-gradient(135deg,#10b981,#059669);display:flex;align-items:center;justify-content:center;font-size:1.1rem;box-shadow:0 3px 10px rgba(16,185,129,0.4);">
                🚀
              </div>
              <div>
                <div style="font-weight:800;font-size:0.86rem;color:#f8fafc;letter-spacing:-0.01em;">Campañas de WhatsApp</div>
                <div style="font-size:0.68rem;color:#94a3b8;">Difusión Masiva y Seguimiento de Cotizaciones</div>
              </div>
            </div>
            <span id="mc-campaign-status-pill" style="font-size:0.65rem;font-weight:800;padding:3px 9px;border-radius:12px;background:rgba(16,185,129,0.15);color:#34d399;border:1px solid rgba(16,185,129,0.35);">🟢 Listo</span>
          </div>

          <!-- Audiencia / Números -->
          <div style="background:rgba(20,28,48,0.65);border:1px solid rgba(255,255,255,0.08);border-radius:14px;padding:12px 14px;">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
              <div style="font-size:0.75rem;font-weight:800;color:#93c5fd;display:flex;align-items:center;gap:6px;">
                <span>👥 Destinatarios (WhatsApp)</span>
                <span id="mc-camp-count-badge" style="background:rgba(37,99,235,0.35);color:#bfdbfe;font-size:0.62rem;padding:2px 6px;border-radius:10px;font-weight:800;">...</span>
              </div>
              <div style="display:flex;gap:6px;">
                <button type="button" id="mc-camp-extract-btn" class="mc-action-btn" style="padding:5px 10px;background:linear-gradient(135deg,#8b5cf6,#7c3aed);color:#fff;border:none;border-radius:8px;font-size:0.7rem;font-weight:700;cursor:pointer;display:flex;align-items:center;gap:4px;box-shadow:0 2px 8px rgba(139,92,246,0.35);" title="Extraer leads de seguimiento del CRM">
                  ⚡ Extraer Leads CRM
                </button>
                <button type="button" id="mc-camp-clear-leads-btn" class="mc-action-btn" style="padding:5px 8px;background:rgba(239,68,68,0.15);border:1px solid rgba(239,68,68,0.3);color:#fca5a5;border-radius:8px;font-size:0.7rem;cursor:pointer;" title="Limpiar lista">✕</button>
              </div>
            </div>
            <p style="font-size:0.68rem;color:#94a3b8;margin:0 0 8px 0;line-height:1.4;">
              Ingresa un contacto por línea (o extrae automáticamente del CRM). Formato: <code>Nombre | Teléfono o Producto</code>
            </p>
            <textarea id="mc-camp-leads-input" class="mc-input-field" rows="3" placeholder="Alex Palma | 593982538155&#10;Carlos | Cocina Industrial 3 Quemadores" style="width:100%;padding:8px 10px;border-radius:10px;border:1px solid rgba(255,255,255,0.12);background:rgba(15,23,42,0.95);color:#f8fafc;font-size:0.74rem;resize:vertical;box-sizing:border-box;font-family:inherit;line-height:1.4;">${savedCampLeads}</textarea>
          </div>

          <!-- Plantillas Rápidas -->
          <div style="background:rgba(20,28,48,0.65);border:1px solid rgba(255,255,255,0.08);border-radius:14px;padding:12px 14px;">
            <div style="font-size:0.75rem;font-weight:800;color:#fbbf24;margin-bottom:8px;display:flex;align-items:center;gap:6px;">
              <span>📋 Cargar Plantilla de Campaña:</span>
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;">
              <button type="button" class="mc-camp-preset-btn mc-action-btn" data-preset="gondolas" style="padding:7px 9px;background:rgba(15,23,42,0.9);border:1px solid rgba(245,158,11,0.35);border-radius:8px;color:#fde68a;font-size:0.7rem;font-weight:700;cursor:pointer;text-align:left;">
                🌟 Góndolas Inox T-304
              </button>
              <button type="button" class="mc-camp-preset-btn mc-action-btn" data-preset="cocinas" style="padding:7px 9px;background:rgba(15,23,42,0.9);border:1px solid rgba(59,130,246,0.35);border-radius:8px;color:#bfdbfe;font-size:0.7rem;font-weight:700;cursor:pointer;text-align:left;">
                🔥 Cocinas Precio Directo
              </button>
              <button type="button" class="mc-camp-preset-btn mc-action-btn" data-preset="taller" style="padding:7px 9px;background:rgba(15,23,42,0.9);border:1px solid rgba(16,185,129,0.35);border-radius:8px;color:#a7f3d0;font-size:0.7rem;font-weight:700;cursor:pointer;text-align:left;">
                📍 Visita Taller Cotocollao
              </button>
              <button type="button" class="mc-camp-preset-btn mc-action-btn" data-preset="cierre" style="padding:7px 9px;background:rgba(15,23,42,0.9);border:1px solid rgba(239,68,68,0.35);border-radius:8px;color:#fecaca;font-size:0.7rem;font-weight:700;cursor:pointer;text-align:left;">
                ⚡ Cierre de Semana
              </button>
            </div>
          </div>

          <!-- Mis Campañas Guardadas -->
          <div style="background:rgba(20,28,48,0.65);border:1px solid rgba(255,255,255,0.08);border-radius:14px;padding:12px 14px;">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
              <div style="font-size:0.75rem;font-weight:800;color:#38bdf8;display:flex;align-items:center;gap:6px;">
                <span>⭐ Mis Campañas Guardadas</span>
                <span id="mc-custom-camp-count-badge" style="background:rgba(56,189,248,0.2);color:#bae6fd;font-size:0.62rem;padding:2px 6px;border-radius:10px;font-weight:800;">...</span>
              </div>
            </div>
            <div id="mc-custom-campaigns-list" style="display:flex;flex-direction:column;gap:6px;max-height:150px;overflow-y:auto;">
              <!-- Rendered dynamically -->
            </div>
          </div>

          <!-- Redactor de Mensaje -->
          <div style="background:rgba(20,28,48,0.65);border:1px solid rgba(255,255,255,0.08);border-radius:14px;padding:12px 14px;">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
              <span style="font-size:0.75rem;font-weight:800;color:#93c5fd;">✉️ Mensaje de la Campaña:</span>
              <div style="display:flex;gap:6px;">
                <button type="button" id="mc-save-as-custom-camp-btn" class="mc-action-btn" style="padding:4px 9px;background:linear-gradient(135deg,#0284c7,#0369a1);color:#fff;border:none;border-radius:7px;font-size:0.68rem;font-weight:700;cursor:pointer;">
                  💾 Guardar
                </button>
                <button type="button" id="mc-camp-ai-refine-btn" class="mc-action-btn" style="padding:4px 9px;background:linear-gradient(135deg,#10b981,#059669);color:#fff;border:none;border-radius:7px;font-size:0.68rem;font-weight:700;cursor:pointer;">
                  🧠 Pulir IA
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

            <textarea id="mc-camp-message-input" class="mc-input-field" rows="5" placeholder="Escribe el mensaje..." style="width:100%;padding:10px 12px;border-radius:10px;border:1px solid rgba(255,255,255,0.12);background:rgba(15,23,42,0.95);color:#f8fafc;font-size:0.74rem;resize:vertical;box-sizing:border-box;font-family:inherit;line-height:1.5;">${savedCampMsg}</textarea>
          </div>

          <!-- Pausa Anti-Bloqueo -->
          <div style="background:rgba(20,28,48,0.65);border:1px solid rgba(255,255,255,0.08);border-radius:14px;padding:12px 14px;display:flex;align-items:center;justify-content:space-between;gap:12px;">
            <div>
              <div style="font-size:0.74rem;font-weight:800;color:#e2e8f0;display:flex;align-items:center;gap:6px;">
                <span>🛡️ Pausa Anti-Bloqueo:</span>
              </div>
              <div style="font-size:0.66rem;color:#94a3b8;margin-top:2px;">Intervalo humano seguro para proteger tu cuenta de WhatsApp.</div>
            </div>
            <div style="display:flex;align-items:center;gap:6px;">
              <input type="number" id="mc-camp-delay-input" class="mc-input-field" value="${savedCampDelay}" min="6" max="60" style="width:55px;padding:6px 8px;border-radius:8px;border:1px solid rgba(255,255,255,0.15);background:rgba(15,23,42,0.95);color:#34d399;font-weight:800;font-size:0.8rem;text-align:center;">
              <span style="font-size:0.72rem;color:#cbd5e1;font-weight:700;">seg</span>
            </div>
          </div>

          <!-- Progreso -->
          <div id="mc-camp-progress-container" style="display:none;background:rgba(15,23,42,0.9);border:1px solid rgba(37,99,235,0.3);border-radius:12px;padding:12px;">
            <div style="display:flex;justify-content:space-between;font-size:0.72rem;margin-bottom:6px;">
              <span id="mc-camp-progress-label" style="color:#93c5fd;font-weight:700;">Progreso del envío</span>
              <span id="mc-camp-progress-pct" style="color:#34d399;font-weight:800;">0%</span>
            </div>
            <div style="width:100%;height:8px;background:rgba(255,255,255,0.08);border-radius:4px;overflow:hidden;margin-bottom:8px;">
              <div id="mc-camp-progress-bar" style="width:0%;height:100%;background:linear-gradient(90deg,#10b981,#3b82f6);transition:width 0.3s ease;"></div>
            </div>
            <div id="mc-camp-status-detail" style="font-size:0.68rem;color:#cbd5e1;line-height:1.4;"></div>
          </div>

          <!-- Botones Iniciar / Detener -->
          <div style="display:flex;gap:8px;margin-top:4px;">
            <button type="button" id="mc-camp-start-btn" class="mc-action-btn" style="flex:1;padding:12px;background:linear-gradient(135deg,#059669,#10b981);color:#fff;border:none;border-radius:12px;font-size:0.82rem;font-weight:800;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px;box-shadow:0 4px 18px rgba(16,185,129,0.35);">
              <span>🚀 Iniciar Campaña en WhatsApp</span>
            </button>
            <button type="button" id="mc-camp-stop-btn" class="mc-action-btn" style="display:none;flex:1;padding:12px;background:linear-gradient(135deg,#dc2626,#ef4444);color:#fff;border:none;border-radius:12px;font-size:0.82rem;font-weight:800;cursor:pointer;align-items:center;justify-content:center;gap:8px;box-shadow:0 4px 18px rgba(239,68,68,0.35);">
              <span>🛑 Detener Campaña</span>
            </button>
          </div>

          <!-- Log de envíos -->
          <div style="background:rgba(10,14,25,0.7);border:1px solid rgba(255,255,255,0.06);border-radius:12px;padding:10px 12px;max-height:140px;overflow-y:auto;" id="mc-camp-log-box">
            <div style="font-size:0.68rem;font-weight:800;color:#64748b;margin-bottom:4px;text-transform:uppercase;">Registro de envíos:</div>
            <div id="mc-camp-log-list" style="display:flex;flex-direction:column;gap:3px;font-size:0.68rem;color:#94a3b8;">
              <span>Listo para comenzar campaña. Carga tus destinatarios y presiona "Iniciar".</span>
            </div>
          </div>

        </div>
      </div>

      <!-- PESTAÑA 3: BANDEJA CRM (LEADS Y PIPELINE) -->
      <div id="mc-view-crm" style="display:${savedTab==='crm'?'flex':'none'};flex-direction:column;flex:1;overflow:hidden;background:rgba(11,15,25,0.95);">
        <div style="padding:12px 16px;border-bottom:1px solid rgba(255,255,255,0.08);background:rgba(18,24,44,0.7);flex-shrink:0;">
          <div style="display:flex;gap:8px;margin-bottom:8px;">
            <input type="text" id="mc-crm-search-input" class="mc-input-field" placeholder="🔍 Buscar prospecto o mensaje..." style="flex:1;padding:9px 12px;border-radius:10px;border:1px solid rgba(255,255,255,0.1);background:rgba(15,23,42,0.9);color:#fff;font-size:0.8rem;box-sizing:border-box;">
            <button id="mc-crm-sync-btn" type="button" class="mc-action-btn" style="padding:9px 14px;background:linear-gradient(135deg,#059669,#10b981);color:#fff;border:none;border-radius:10px;font-size:0.78rem;font-weight:800;cursor:pointer;display:flex;align-items:center;gap:6px;box-shadow:0 3px 12px rgba(16,185,129,0.4);" title="Sincronizar con el CRM central">
              <span>🔄 Sincronizar</span>
            </button>
          </div>
          <div style="font-size:0.7rem;color:#94a3b8;font-weight:500;">
            Bandeja unificada de prospectos registrados en MetaCloser CRM.
          </div>
        </div>

        <div id="mc-crm-leads-list" style="padding:12px 16px;flex:1;overflow-y:auto;">
          <p style="color:#64748b;text-align:center;margin-top:20px;font-size:0.8rem;">Cargando chats del CRM...</p>
        </div>
      </div>

      <!-- PESTAÑA 4: PUBLICAR / ESTADOS CON IA -->
      <div id="mc-view-post" style="display:${savedTab==='post'?'flex':'none'};flex-direction:column;flex:1;overflow:hidden;background:rgba(11,15,25,0.95);">
        <div style="padding:14px 18px;border-bottom:1px solid rgba(255,255,255,0.08);overflow-y:auto;flex:1;">
          <div style="font-size:0.8rem;font-weight:900;color:#fbbf24;margin-bottom:12px;letter-spacing:0.04em;display:flex;align-items:center;gap:6px;">
            <span>📢 GENERADOR CON FOTOS & ESTADOS DE WHATSAPP</span>
          </div>

          <!-- FOTO ACTIVA -->
          <div style="background:rgba(20,27,45,0.7);border:1px solid rgba(255,255,255,0.1);border-radius:14px;padding:12px;margin-bottom:12px;">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
              <span style="font-size:0.75rem;font-weight:700;color:#93c5fd;">📸 Foto del Equipo:</span>
              <label for="mc-post-file-input" class="mc-action-btn" style="font-size:0.72rem;background:linear-gradient(135deg,#1d4ed8,#2563eb);color:#fff;padding:4px 10px;border-radius:7px;cursor:pointer;font-weight:700;box-shadow:0 2px 8px rgba(37,99,235,0.35);">+ Subir PC</label>
              <input type="file" id="mc-post-file-input" accept="image/*" style="display:none;">
            </div>
            <div style="position:relative;width:100%;height:110px;border-radius:10px;overflow:hidden;border:2px solid rgba(16,185,129,0.5);cursor:pointer;" id="mc-img-preview-wrap">
              <img id="mc-post-img-preview" src="${savedImgUrl}" style="width:100%;height:100%;object-fit:cover;">
              <span id="mc-post-img-badge" style="position:absolute;bottom:6px;left:6px;background:rgba(11,15,25,0.92);color:#34d399;font-size:0.68rem;padding:3px 8px;border-radius:6px;font-weight:bold;border:1px solid rgba(16,185,129,0.3);">${savedImgBadge}</span>
            </div>
          </div>

          <!-- DATOS DEL PRODUCTO -->
          <input type="text" id="mc-post-product" class="mc-input-field" placeholder="Nombre del Equipo..." value="${savedProduct}" style="width:100%;padding:8px 10px;margin-bottom:7px;border-radius:8px;border:1px solid rgba(255,255,255,0.12);background:rgba(15,23,42,0.85);color:#fff;box-sizing:border-box;font-size:0.82rem;">
          <div style="display:flex;gap:6px;margin-bottom:8px;">
            <input type="text" id="mc-post-price" class="mc-input-field" placeholder="Precio $" value="${savedPrice}" style="flex:1;padding:8px 10px;border-radius:8px;border:1px solid rgba(255,255,255,0.12);background:rgba(15,23,42,0.85);color:#34d399;font-weight:bold;box-sizing:border-box;font-size:0.82rem;">
            <input type="text" id="mc-post-city" class="mc-input-field" placeholder="Ciudad" value="${savedCity}" style="flex:1;padding:8px 10px;border-radius:8px;border:1px solid rgba(255,255,255,0.12);background:rgba(15,23,42,0.85);color:#fff;box-sizing:border-box;font-size:0.82rem;">
          </div>
          <button id="mc-wa-generate-post" class="mc-action-btn" style="width:100%;padding:11px;background:linear-gradient(135deg,#f59e0b,#d97706);color:#fff;border:none;border-radius:10px;font-weight:bold;cursor:pointer;font-size:0.84rem;box-shadow:0 4px 16px rgba(245,158,11,0.35);">✨ Generar Post / Estado de WhatsApp con IA</button>
        </div>
        <div id="mc-post-results" style="padding:14px;flex:1;overflow-y:auto;border-top:1px solid rgba(255,255,255,0.08);">
          <p style="color:#64748b;text-align:center;margin-top:16px;font-size:0.8rem;">Genera un texto persuasivo para publicar en estados de WhatsApp o mensajes de difusión.</p>
        </div>
      </div>

      <!-- PESTAÑA 5: CATÁLOGO DE PRODUCTOS -->
      <div id="mc-view-catalog" style="display:${savedTab==='catalog'?'flex':'none'};flex-direction:column;flex:1;overflow:hidden;background:rgba(11,15,25,0.95);">
        <div style="padding:14px 16px;border-bottom:1px solid rgba(255,255,255,0.08);flex-shrink:0;">
          <div style="font-size:0.78rem;font-weight:900;color:#34d399;margin-bottom:10px;">📦 MI CATÁLOGO DE EQUIPOS (APM INOX)</div>
          
          <!-- Agregar nuevo producto -->
          <div style="background:rgba(20,27,45,0.7);border:1px solid rgba(255,255,255,0.1);border-radius:10px;padding:10px;margin-bottom:8px;">
            <div style="font-size:0.7rem;color:#94a3b8;font-weight:bold;margin-bottom:6px;">➕ AGREGAR PRODUCTO AL CATÁLOGO:</div>
            <input type="text" id="mc-cat-new-name" class="mc-input-field" placeholder="Nombre del producto..." style="width:100%;padding:7px 9px;margin-bottom:5px;border-radius:7px;border:1px solid rgba(255,255,255,0.12);background:rgba(15,23,42,0.85);color:#fff;box-sizing:border-box;font-size:0.78rem;">
            <div style="display:flex;gap:5px;margin-bottom:5px;">
              <input type="text" id="mc-cat-new-price" class="mc-input-field" placeholder="Precio $" style="flex:1;padding:7px 9px;border-radius:7px;border:1px solid rgba(255,255,255,0.12);background:rgba(15,23,42,0.85);color:#34d399;font-weight:bold;box-sizing:border-box;font-size:0.78rem;">
              <input type="text" id="mc-cat-new-emoji" class="mc-input-field" placeholder="Emoji" value="🍳" style="width:60px;padding:7px 9px;border-radius:7px;border:1px solid rgba(255,255,255,0.12);background:rgba(15,23,42,0.85);color:#fff;box-sizing:border-box;font-size:0.78rem;text-align:center;">
            </div>
            <div style="display:flex;gap:5px;">
              <label for="mc-cat-new-img-file" class="mc-action-btn" style="flex:1;padding:7px;background:rgba(15,23,42,0.85);border:1px dashed rgba(255,255,255,0.2);border-radius:7px;color:#94a3b8;font-size:0.72rem;cursor:pointer;text-align:center;box-sizing:border-box;">📁 Foto desde PC</label>
              <input type="file" id="mc-cat-new-img-file" accept="image/*" style="display:none;">
              <button type="button" id="mc-cat-add-btn" class="mc-action-btn" style="flex:1;padding:7px;background:linear-gradient(135deg,#059669,#10b981);color:#fff;border:none;border-radius:7px;font-size:0.72rem;font-weight:bold;cursor:pointer;box-shadow:0 2px 8px rgba(16,185,129,0.3);">✅ Guardar</button>
            </div>
          </div>

          <!-- Editar producto modal oculto -->
          <div id="mc-cat-edit-box" style="display:none;background:linear-gradient(145deg, rgba(30,41,59,0.95), rgba(15,23,42,0.95));border:1px solid #3b82f6;border-radius:10px;padding:10px;margin-bottom:8px;box-shadow:0 4px 15px rgba(0,0,0,0.5);">
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;">
              <div style="font-size:0.72rem;color:#60a5fa;font-weight:bold;">✏️ EDITAR EQUIPO:</div>
              <button type="button" id="mc-cat-edit-cancel-x" style="background:none;border:none;color:#94a3b8;cursor:pointer;font-size:0.85rem;padding:0 4px;">✕</button>
            </div>
            <input type="hidden" id="mc-cat-edit-index" value="-1">
            <input type="text" id="mc-cat-edit-name" class="mc-input-field" placeholder="Nombre..." style="width:100%;padding:7px 9px;margin-bottom:5px;border-radius:7px;border:1px solid rgba(255,255,255,0.15);background:rgba(15,23,42,0.9);color:#fff;box-sizing:border-box;font-size:0.78rem;">
            <div style="display:flex;gap:5px;margin-bottom:5px;">
              <input type="text" id="mc-cat-edit-price" class="mc-input-field" placeholder="Precio $" style="flex:1;padding:7px 9px;border-radius:7px;border:1px solid rgba(255,255,255,0.15);background:rgba(15,23,42,0.9);color:#34d399;font-weight:bold;box-sizing:border-box;font-size:0.78rem;">
              <input type="text" id="mc-cat-edit-emoji" class="mc-input-field" placeholder="Emoji" style="width:60px;padding:7px 9px;border-radius:7px;border:1px solid rgba(255,255,255,0.15);background:rgba(15,23,42,0.9);color:#fff;box-sizing:border-box;font-size:0.78rem;text-align:center;">
            </div>
            <div style="display:flex;gap:5px;">
              <button type="button" id="mc-cat-edit-save-btn" class="mc-action-btn" style="flex:2;padding:7px;background:linear-gradient(135deg,#2563eb,#1d4ed8);color:#fff;border:none;border-radius:7px;font-size:0.72rem;font-weight:bold;cursor:pointer;">💾 Guardar Cambios</button>
              <button type="button" id="mc-cat-edit-cancel-btn" class="mc-action-btn" style="flex:1;padding:7px;background:rgba(51,65,85,0.8);color:#cbd5e1;border:none;border-radius:7px;font-size:0.72rem;cursor:pointer;">Cancelar</button>
            </div>
          </div>
        </div>

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
      makeDraggable(sidebar, 'mc_wa_sidebar_pos', sidebarHeader, null, () => {
        sidebar._manuallyRepositioned = true;
      });
    }

    positionModalNearButton(sidebar);

    // Close button
    document.getElementById('mc-close-sidebar').addEventListener('click', () => {
      sidebar.style.display = 'none';
    });

    // ─── Unified Tab Switching ───
    const tabs = [
      { btn: 'mc-tab-chat', view: 'mc-view-chat', id: 'chat' },
      { btn: 'mc-tab-campaigns', view: 'mc-view-campaigns', id: 'campaigns' },
      { btn: 'mc-tab-crm', view: 'mc-view-crm', id: 'crm' },
      { btn: 'mc-tab-post', view: 'mc-view-post', id: 'post' },
      { btn: 'mc-tab-catalog', view: 'mc-view-catalog', id: 'catalog' },
    ];

    tabs.forEach(t => {
      const bEl = document.getElementById(t.btn);
      if (!bEl) return;
      bEl.addEventListener('click', () => {
        tabs.forEach(other => {
          const ob = document.getElementById(other.btn);
          const ov = document.getElementById(other.view);
          if (ob) ob.classList.remove('active');
          if (ov) ov.style.display = 'none';
        });
        bEl.classList.add('active');
        const vEl = document.getElementById(t.view);
        if (vEl) vEl.style.display = 'flex';
        lsSet('activeTab_wa', t.id);

        if (t.id === 'crm') {
          syncCrmState();
        } else if (t.id === 'campaigns') {
          renderCustomCampaigns();
        }
      });
    });

    // ─── Collapsible adjustment form ───
    const toggleEditBtn = document.getElementById('mc-toggle-edit-btn');
    const editFields = document.getElementById('mc-lead-edit-fields');
    if (toggleEditBtn && editFields) {
      toggleEditBtn.addEventListener('click', () => {
        const isHidden = editFields.style.display === 'none';
        editFields.style.display = isHidden ? 'block' : 'none';
        toggleEditBtn.innerText = isHidden ? '✕ Cerrar' : '✏️ Ajustar';
      });
    }

    // Live update dossier when typing in adjustment inputs
    ['mc-fb-lead-name', 'mc-fb-product-name', 'mc-fb-product-price', 'mc-fb-client-msg'].forEach(id => {
      const el = document.getElementById(id);
      if (el) {
        el.addEventListener('input', () => {
          el.dataset.userEdited = 'true';
          const name = document.getElementById('mc-fb-lead-name').value.trim() || 'Prospecto';
          const prod = document.getElementById('mc-fb-product-name').value.trim() || 'Cocina Industrial';
          const price = document.getElementById('mc-fb-product-price').value.trim() || '$200';
          const msg = document.getElementById('mc-fb-client-msg').value.trim() || '¿Sigue disponible este artículo?';

          const nameEl = document.getElementById('mc-lead-display-name');
          const prodEl = document.getElementById('mc-lead-display-product');
          const priceEl = document.getElementById('mc-lead-display-price');
          const msgEl = document.getElementById('mc-lead-display-msg');
          const avatarEl = document.getElementById('mc-lead-avatar');

          if (nameEl) nameEl.innerHTML = `<span>${name}</span> <span style="font-size:0.62rem;padding:2px 7px;border-radius:12px;background:rgba(16,185,129,0.18);color:#34d399;font-weight:800;border:1px solid rgba(16,185,129,0.35);">🟢 Modificado</span>`;
          if (avatarEl && !avatarEl.querySelector('img')) avatarEl.innerText = (name[0] || 'C').toUpperCase();
          if (prodEl) prodEl.innerText = prod;
          if (priceEl) priceEl.innerText = price.startsWith('$') ? price : `$${price}`;
          if (msgEl) msgEl.innerText = `"${msg}"`;
        });
      }
    });

    // ─── Pipeline Stage Buttons ───
    sidebar.querySelectorAll('.mc-stage-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        sidebar.querySelectorAll('.mc-stage-btn').forEach(b => {
          b.classList.remove('active');
          b.style.background = 'none';
          b.style.color = '#94a3b8';
        });
        btn.classList.add('active');
        btn.style.background = 'linear-gradient(135deg, rgba(16,185,129,0.35), rgba(5,150,105,0.45))';
        btn.style.color = '#ffffff';
        activeContact.stage = btn.dataset.stage;
        showToast(`🏷️ Etiqueta de pipeline cambiada a: <b>${btn.innerText.trim()}</b>`);
      });
    });

    // ─── Save Lead to CRM ───
    document.getElementById('mc-wa-save-lead-btn').addEventListener('click', async () => {
      const name = document.getElementById('mc-fb-lead-name')?.value.trim() || activeContact.name;
      const prod = document.getElementById('mc-fb-product-name')?.value.trim() || activeAdProduct || 'Equipo Inox';
      const priceStr = document.getElementById('mc-fb-product-price')?.value.replace(/[^0-9.]/g, '') || '200';
      const lastMsg = document.getElementById('mc-fb-client-msg')?.value.trim() || activeContact.lastMessage;

      if (!name || name === 'Esperando chat...' || name === 'Selecciona un chat') {
        showToast('⚠️ Abre primero una conversación en WhatsApp Web', false);
        return;
      }

      showToast(`💾 Guardando <b>${name}</b> en el CRM...`);
      try {
        const payload = {
          name: name,
          roleCompany: 'Cliente WhatsApp Web',
          handleOrPhone: activeContact.phone || name,
          channel: 'whatsapp',
          status: activeContact.stage || 'new_lead',
          estimatedValue: parseFloat(priceStr) || 200,
          interestProductId: prod,
          tags: ['WhatsApp Web', 'APM Inox', 'Copilot IA'],
          notes: `Último mensaje recibido: "${lastMsg}"`
        };

        const res = await crmFetch('/crm/leads', 'POST', payload);
        if (res.ok && res.data?.success) {
          showToast(`🎉 ¡<b>${name}</b> guardado en MetaCloser CRM con éxito!`);
          syncCrmState();
        } else {
          showToast(`💾 Guardado localmente en caché de la extensión.`);
        }
      } catch (e) {
        showToast(`💾 Guardado localmente en la extensión.`);
      }
    });

    // ─── Quick Smart Snippets (1-Click) ───
    const snippetMap = {
      ubicacion: `📍 NUESTRA UBICACIÓN EN QUITO:\nEstamos ubicados en Calle 25 de Mayo 226, sector Cotocollao, Quito Norte (al frente del Club de Leones).\nAtendemos de lunes a sábado en nuestro taller y sala de exhibición. ¡Puede visitarnos para comprobar la calidad y grosor de nuestros equipos en persona!`,
      garantia: `🛡️ GARANTÍA DE FABRICACIÓN APM INOX:\nTodos nuestros equipos son fabricados en acero inoxidable quirúrgico de grado alimenticio T-304, resistente a la corrosión y diseñado para uso comercial rudo.\nOfrecemos garantía por escrito y servicio técnico directo de fábrica.`,
      catalogo: `🌐 CATÁLOGO DIGITAL Y SITIO WEB:\nPuede apreciar nuestro catálogo completo de equipos gastronómicos en nuestra página oficial:\nhttps://amecocinas.com/\nFabricamos cocinas, campanas, freidoras, hornos, autoservicios y muebles a medida.`,
      envios: `🚚 ENVÍOS Y FORMAS DE PAGO:\nRealizamos envíos 100% seguros y respaldados a cualquier provincia de Ecuador.\nAceptamos transferencias bancarias directas (Banco Pichincha, Guayaquil, Pacífico) y pagos en efectivo en nuestro taller.`,
      telefono: `📞 ATENCIÓN DIRECTA Y LLAMADAS:\nPuede comunicarse con nuestro asesor principal vía llamada o WhatsApp directo al 09920350548 para coordinar su visita o despejar cualquier duda técnica.`
    };

    sidebar.querySelectorAll('.mc-smart-snip-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const key = btn.dataset.snip;
        const text = snippetMap[key];
        if (text) {
          insertTextIntoWhatsAppInput(text);
          showToast(`⚡ Plantilla "<b>${btn.innerText.trim()}</b>" insertada en el chat`);
        }
      });
    });

    // ─── AI CHAT ANALYZE (HERO BUTTON) ───
    document.getElementById('mc-fb-analyze').addEventListener('click', async () => {
      const leadName   = document.getElementById('mc-fb-lead-name')?.value.trim() || activeContact.name || 'Cliente';
      const prodName   = document.getElementById('mc-fb-product-name')?.value.trim() || 'Cocina Industrial';
      const prodPrice  = document.getElementById('mc-fb-product-price')?.value.trim() || '200';
      const clientMsg  = document.getElementById('mc-fb-client-msg')?.value.trim() || activeContact.lastMessage || '¿Sigue disponible este equipo?';
      const resultsDiv = document.getElementById('mc-fb-ai-results');

      resultsDiv.innerHTML = `<p style="color:#fbbf24;text-align:center;padding:16px;">⏳ Consultando IA con catálogo APM Inox y tono de gente fina...</p>`;

      try {
        const aiRes = await crmFetch('/ai/live-chat', 'POST', {
          lead: { name: leadName, channel: 'WhatsApp Web' },
          product: { name: prodName, price: prodPrice },
          products: getCatalog(),
          userMessage: `${prodName ? `[Interés: ${prodName} ${prodPrice ? `a $${prodPrice}` : ''}] ` : ''}${clientMsg}`,
          conversationHistory: [],
          mode: 'customer_reply'
        });

        const aiData = aiRes.data;
        if (aiRes.ok && aiData && aiData.success && aiData.data) {
          const resp = aiData.data;
          resultsDiv.innerHTML = `
            <div style="background:linear-gradient(145deg,rgba(22,31,52,0.85),rgba(13,18,32,0.95));padding:12px 14px;border-radius:12px;margin-bottom:12px;border-left:3px solid #10b981;border:1px solid rgba(255,255,255,0.08);box-shadow:0 4px 14px rgba(0,0,0,0.3);">
              <div style="font-size:0.68rem;color:#94a3b8;margin-bottom:4px;font-weight:bold;letter-spacing:0.04em;">ANÁLISIS IA · ${prodName}</div>
              <strong style="color:#60a5fa;font-size:0.75rem;">Intención:</strong> <span style="font-size:0.75rem;color:#e2e8f0;">${resp.intencion || 'solicita_informacion'}</span> · 
              <strong style="color:#34d399;font-size:0.75rem;">Temperatura:</strong> <span style="font-size:0.75rem;color:#34d399;font-weight:bold;">${resp.temperatura || '🔥 caliente'}</span>
            </div>
            
            <label style="font-size:0.75rem;color:#cbd5e1;display:block;margin-bottom:6px;font-weight:700;">Respuesta sugerida para ${leadName}:</label>
            <textarea id="mc-wa-reply-text" class="mc-input-field" style="width:100%;height:130px;background:rgba(15,23,42,0.95);color:#f8fafc;border:1px solid rgba(255,255,255,0.12);border-radius:10px;padding:12px;resize:vertical;font-family:inherit;font-size:0.84rem;box-sizing:border-box;line-height:1.5;">${resp.replyText}</textarea>
            
            <div style="display:flex;gap:8px;margin-top:12px;">
              <button id="mc-wa-copy-btn" class="mc-action-btn" style="flex:1;padding:10px 8px;background:rgba(30,41,59,0.85);border:1px solid rgba(255,255,255,0.15);color:#cbd5e1;border-radius:10px;cursor:pointer;font-weight:700;font-size:0.78rem;">📋 Copiar</button>
              <button id="mc-wa-paste-btn" class="mc-action-btn" style="flex:1;padding:10px 8px;background:linear-gradient(135deg,#059669,#10b981);color:#fff;border:none;border-radius:10px;cursor:pointer;font-weight:700;font-size:0.78rem;box-shadow:0 3px 10px rgba(16,185,129,0.35);">✍️ Pegar</button>
              <button id="mc-wa-send-btn" class="mc-action-btn" style="flex:1.2;padding:10px 8px;background:linear-gradient(135deg,#1d4ed8,#2563eb);color:#fff;border:none;border-radius:10px;cursor:pointer;font-weight:800;font-size:0.78rem;box-shadow:0 3px 12px rgba(37,99,235,0.4);">🚀 Pegar y Enviar</button>
            </div>
          `;

          document.getElementById('mc-wa-copy-btn').addEventListener('click', () => {
            const text = document.getElementById('mc-wa-reply-text').value;
            navigator.clipboard.writeText(text);
            document.getElementById('mc-wa-copy-btn').innerText = '✅ ¡Copiado!';
            setTimeout(() => { document.getElementById('mc-wa-copy-btn').innerText = '📋 Copiar'; }, 2000);
          });

          document.getElementById('mc-wa-paste-btn').addEventListener('click', () => {
            const text = document.getElementById('mc-wa-reply-text').value;
            if (insertTextIntoWhatsAppInput(text)) {
              document.getElementById('mc-wa-paste-btn').innerText = '✅ ¡Pegado!';
              showToast(`✍️ Mensaje pegado en el chat de <b>${leadName}</b>`);
              setTimeout(() => { document.getElementById('mc-wa-paste-btn').innerText = '✍️ Pegar'; }, 2000);
            }
          });

          const sendBtn = document.getElementById('mc-wa-send-btn');
          sendBtn.addEventListener('click', async () => {
            if (sendBtn.disabled) return;
            const text = document.getElementById('mc-wa-reply-text').value;
            sendBtn.disabled = true;
            sendBtn.innerText = '⏳ Enviando...';
            const sent = await sendWhatsAppMessageNow(text);
            if (sent) {
              sendBtn.innerText = '✅ ¡Enviado!';
              showToast(`🚀 ¡Mensaje enviado con éxito a <b>${leadName}</b>!`);
            } else {
              sendBtn.innerText = '⚠️ Presiona Enter';
              showToast(`⚠️ Mensaje escrito en el chat. Presiona Enter para enviar.`, false);
            }
            setTimeout(() => {
              sendBtn.disabled = false;
              sendBtn.innerText = '🚀 Pegar y Enviar';
            }, 2500);
          });

        } else {
          const err = aiRes.error || (aiRes.offline ? 'Servidor local desconectado (localhost:3000)' : 'No se pudo generar respuesta');
          resultsDiv.innerHTML = `<p style="color:#ef4444;padding:12px;text-align:center;">❌ Error: ${err}</p>`;
        }
      } catch (err) {
        resultsDiv.innerHTML = `<p style="color:#ef4444;padding:12px;text-align:center;">❌ Error: ${err.message}</p>`;
      }
    });

    // ─── ⚡ AUTO-PILOT ENGINE FOR WHATSAPP ───
    const autoPilotCheck = document.getElementById('mc-wa-auto-pilot-check');
    const autoRepliedKeys = new Set(lsGet('autoRepliedKeys_wa', []));
    let autoPilotBusy = false;

    function saveAutoRepliedKeys() {
      lsSet('autoRepliedKeys_wa', Array.from(autoRepliedKeys).slice(-100));
    }

    if (autoPilotCheck) {
      autoPilotCheck.checked = lsGet('autoPilotEnabled_wa', false);
      autoPilotCheck.addEventListener('change', (e) => {
        const active = !!e.target.checked;
        lsSet('autoPilotEnabled_wa', active);
        if (active) {
          showToast('⚡ <b>Auto-Pilot Activado:</b> Responderá los mensajes de WhatsApp en tiempo real.');
          updateFloatingPill('⚡ Auto-Pilot ON');
        } else {
          showToast('⏸️ <b>Auto-Pilot Pausado:</b> Desactivado.');
          updateFloatingPill();
        }
      });
    }

    async function triggerAutoPilotTick() {
      if (!autoPilotCheck?.checked || autoPilotBusy) return;

      const unreads = scanUnreadWhatsAppChats();
      if (unreads.length === 0) return;

      const target = unreads[0];
      if (!target || !target.row) return;

      const chatKey = `${target.name}`;
      if (autoRepliedKeys.has(chatKey)) return;

      autoPilotBusy = true;
      try {
        showToast(`⚡ <b>Auto-Pilot:</b> Atendiendo a <b>${target.name}</b>...`);
        triggerClick(target.row);
        await new Promise(r => setTimeout(r, 1200));

        detectActiveChat();
        await new Promise(r => setTimeout(r, 600));

        const leadName = activeContact.name || target.name;
        const msg = activeContact.lastMessage || '¿Sigue disponible este equipo?';
        const prod = activeAdProduct || 'Cocina Industrial';

        const aiRes = await crmFetch('/ai/live-chat', 'POST', {
          lead: { name: leadName, channel: 'WhatsApp Web' },
          product: { name: prod, price: '200' },
          products: getCatalog(),
          userMessage: msg,
          conversationHistory: [],
          mode: 'customer_reply'
        });

        if (aiRes.ok && aiRes.data?.success && aiRes.data?.data?.replyText) {
          const reply = aiRes.data.data.replyText;
          const sent = await sendWhatsAppMessageNow(reply);
          if (sent) {
            autoRepliedKeys.add(chatKey);
            saveAutoRepliedKeys();
            showToast(`🤖 <b>Auto-Pilot:</b> Respuesta enviada a <b>${leadName}</b>`);
          }
        }
      } catch (e) {
        console.warn('[MetaCloser Auto-Pilot WA] Error:', e);
      } finally {
        autoPilotBusy = false;
      }
    }

    setInterval(triggerAutoPilotTick, 4000);

    // ─── CAMPAIGNS TAB LOGIC ───
    function renderCustomCampaigns() {
      const container = document.getElementById('mc-custom-campaigns-list');
      const badge = document.getElementById('mc-custom-camp-count-badge');
      if (!container) return;

      const list = getCustomCampaigns();
      if (badge) badge.innerText = `${list.length} guardada${list.length === 1 ? '' : 's'}`;

      if (list.length === 0) {
        container.innerHTML = `<div style="text-align:center;padding:12px;color:#64748b;font-size:0.7rem;">No tienes campañas guardadas. Redacta una y haz clic en "💾 Guardar".</div>`;
        return;
      }

      container.innerHTML = list.map(camp => `
        <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;background:linear-gradient(145deg, rgba(22,30,50,0.85), rgba(12,18,32,0.95));border:1px solid rgba(255,255,255,0.08);border-radius:10px;padding:8px 12px;box-shadow:0 2px 6px rgba(0,0,0,0.3);">
          <div style="flex:1;min-width:0;">
            <div style="font-size:0.75rem;font-weight:800;color:#f8fafc;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
              ${camp.name}
            </div>
            <div style="font-size:0.65rem;color:#94a3b8;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:2px;">
              ${(camp.message || '').replace(/[\r\n]+/g, ' ').substring(0, 75)}...
            </div>
          </div>
          <div style="display:flex;gap:4px;flex-shrink:0;">
            <button type="button" class="mc-load-camp-btn mc-action-btn" data-id="${camp.id}" style="padding:4px 8px;background:linear-gradient(135deg,#059669,#10b981);color:#fff;border:none;border-radius:6px;font-size:0.66rem;font-weight:700;cursor:pointer;">⚡ Cargar</button>
            <button type="button" class="mc-del-camp-btn mc-action-btn" data-id="${camp.id}" style="padding:4px 6px;background:rgba(239,68,68,0.15);border:1px solid rgba(239,68,68,0.3);color:#fca5a5;border-radius:6px;font-size:0.66rem;cursor:pointer;">✕</button>
          </div>
        </div>
      `).join('');

      container.querySelectorAll('.mc-load-camp-btn').forEach(b => {
        b.addEventListener('click', () => {
          const c = getCustomCampaigns().find(item => item.id === b.dataset.id);
          if (c) {
            const input = document.getElementById('mc-camp-message-input');
            if (input) {
              input.value = c.message;
              lsSet('camp_message_wa', c.message);
            }
            showToast(`📋 Campaña "<b>${c.name}</b>" cargada en el redactor`);
          }
        });
      });

      container.querySelectorAll('.mc-del-camp-btn').forEach(b => {
        b.addEventListener('click', () => {
          const list = getCustomCampaigns().filter(item => item.id !== b.dataset.id);
          saveCustomCampaigns(list);
          renderCustomCampaigns();
          showToast('🗑️ Campaña eliminada');
        });
      });
    }

    renderCustomCampaigns();

    // Variable insertion chips
    sidebar.querySelectorAll('.mc-var-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        const input = document.getElementById('mc-camp-message-input');
        if (input) {
          const v = chip.dataset.var;
          input.value += (input.value.endsWith(' ') || input.value === '' ? '' : ' ') + v;
          lsSet('camp_message_wa', input.value);
        }
      });
    });

    // Preset buttons
    const presets = {
      gondolas: 'Buenas tardes, estimada/o {nombre}. De parte de APM Inox le extendemos un saludo cordial. Disponemos de góndolas en acero inoxidable T-304 de alta resistencia y acabados sanitarios. Fabricación directa de taller con garantía. Puede ver detalles en https://amecocinas.com/ o comunicarse al 09920350548. Estamos en Cotocollao, Quito Norte.',
      cocinas: 'Buenas tardes, estimada/o {nombre}. Le escribimos de APM Inox para informarle de nuestra promoción en cocinas industriales de 2, 3 y 4 quemadores con precio directo de fábrica. Acero quirúrgico T-304 y quemadores de alta potencia. ¿Desea cotizar con medidas específicas para su negocio?',
      taller: 'Buenas tardes, estimada/o {nombre}. Le hacemos una cordial invitación a visitar nuestra sala de exhibición y taller en Calle 25 de Mayo 226, sector Cotocollao, frente al Club de Leones, Quito Norte. Podrá apreciar el calibre y calidad de nuestros equipos en persona.',
      cierre: 'Buenas tardes, estimada/o {nombre}. Con mucho agrado le contactamos para consultarle si aún requiere su equipo en acero inoxidable. Cerramos cupos de entrega con envío prioritario esta semana. ¿Le gustaría que le reservemos su pedido?'
    };

    sidebar.querySelectorAll('.mc-camp-preset-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const text = presets[btn.dataset.preset];
        if (text) {
          const input = document.getElementById('mc-camp-message-input');
          if (input) {
            input.value = text;
            lsSet('camp_message_wa', text);
          }
          showToast(`📋 Plantilla cargada: <b>${btn.innerText.trim()}</b>`);
        }
      });
    });

    // Extract leads from CRM
    document.getElementById('mc-camp-extract-btn').addEventListener('click', async () => {
      showToast('⏳ Extrayendo leads de seguimiento del CRM...');
      try {
        const res = await crmFetch('/crm/auto-followup');
        if (res.ok && res.data?.success && res.data?.data?.numbers) {
          const numbers = res.data.data.numbers;
          const input = document.getElementById('mc-camp-leads-input');
          if (input) {
            input.value = numbers.map(n => `Lead | ${n}`).join('\n');
            lsSet('camp_leads_wa', input.value);
          }
          showToast(`✅ Se extrajeron <b>${numbers.length}</b> leads para seguimiento.`);
        } else {
          // Fallback to general leads state
          const stateRes = await crmFetch('/crm/state');
          if (stateRes.ok && stateRes.data?.data?.leads) {
            const leads = stateRes.data.data.leads;
            const lines = leads.map(l => `${l.name || 'Cliente'} | ${l.handleOrPhone || '593982538155'}`);
            const input = document.getElementById('mc-camp-leads-input');
            if (input) {
              input.value = lines.join('\n');
              lsSet('camp_leads_wa', input.value);
            }
            showToast(`✅ Se cargaron <b>${lines.length}</b> prospectos del CRM.`);
          }
        }
      } catch (e) {
        showToast('⚠️ No se pudo conectar con el servidor CRM local.', false);
      }
    });

    document.getElementById('mc-camp-clear-leads-btn').addEventListener('click', () => {
      const input = document.getElementById('mc-camp-leads-input');
      if (input) {
        input.value = '';
        lsSet('camp_leads_wa', '');
      }
      showToast('🧹 Lista de destinatarios vaciada');
    });

    // Save custom campaign
    document.getElementById('mc-save-as-custom-camp-btn').addEventListener('click', () => {
      const msg = document.getElementById('mc-camp-message-input')?.value.trim();
      if (!msg) {
        showToast('⚠️ Escribe primero el mensaje de la campaña', false);
        return;
      }
      const name = prompt('Nombre para esta campaña personalizada:', 'Campaña WhatsApp ' + new Date().toLocaleDateString());
      if (name) {
        const list = getCustomCampaigns();
        list.push({ id: `camp_${Date.now()}`, name, message: msg });
        saveCustomCampaigns(list);
        renderCustomCampaigns();
        showToast(`⭐ Campaña "<b>${name}</b>" guardada`);
      }
    });

    // Campaign Runner Machine
    let campaignRunning = false;
    let campaignAborted = false;

    const startCampBtn = document.getElementById('mc-camp-start-btn');
    const stopCampBtn = document.getElementById('mc-camp-stop-btn');
    const progressContainer = document.getElementById('mc-camp-progress-container');
    const progressBar = document.getElementById('mc-camp-progress-bar');
    const progressPct = document.getElementById('mc-camp-progress-pct');
    const statusDetail = document.getElementById('mc-camp-status-detail');
    const logList = document.getElementById('mc-camp-log-list');

    function addCampLog(msg) {
      if (!logList) return;
      const row = document.createElement('div');
      row.style.fontSize = '0.68rem';
      row.style.color = '#cbd5e1';
      row.style.lineHeight = '1.3';
      row.innerHTML = `<span style="color:#64748b;">[${new Date().toLocaleTimeString()}]</span> ${msg}`;
      logList.prepend(row);
    }

    startCampBtn.addEventListener('click', async () => {
      const leadsRaw = document.getElementById('mc-camp-leads-input')?.value.trim();
      const msgTemplate = document.getElementById('mc-camp-message-input')?.value.trim();
      const delaySec = parseInt(document.getElementById('mc-camp-delay-input')?.value, 10) || 10;

      if (!leadsRaw || !msgTemplate) {
        showToast('⚠️ Ingresa destinatarios y mensaje para iniciar', false);
        return;
      }

      const rows = leadsRaw.split('\n').map(l => l.trim()).filter(Boolean);
      if (rows.length === 0) return;

      campaignRunning = true;
      campaignAborted = false;
      startCampBtn.style.display = 'none';
      stopCampBtn.style.display = 'flex';
      progressContainer.style.display = 'block';

      showToast(`🚀 Iniciando campaña con <b>${rows.length}</b> destinatarios...`);
      addCampLog(`Iniciando campaña con ${rows.length} destinatarios...`);

      for (let i = 0; i < rows.length; i++) {
        if (campaignAborted) break;

        const row = rows[i];
        const parts = row.split('|').map(p => p.trim());
        const leadName = parts[0] || 'Cliente';
        const contactOrProd = parts[1] || '';

        // Interpolate variables
        let msg = msgTemplate
          .replace(/{nombre}/gi, leadName)
          .replace(/{producto}/gi, contactOrProd);

        const pct = Math.round(((i + 1) / rows.length) * 100);
        progressBar.style.width = `${pct}%`;
        progressPct.innerText = `${pct}%`;
        statusDetail.innerText = `Enviando a ${leadName} (${i + 1}/${rows.length})...`;

        // Attempt sending via active chat if phone matches, or type into active chat
        const input = getWhatsAppInput();
        if (input) {
          await sendWhatsAppMessageNow(msg);
          addCampLog(`✅ Enviado a: <b>${leadName}</b>`);
        } else {
          // If no chat open, copy text to clipboard as safety
          navigator.clipboard.writeText(msg);
          addCampLog(`⚠️ Sin chat abierto para ${leadName}. Texto copiado al portapapeles.`);
        }

        if (i < rows.length - 1 && !campaignAborted) {
          statusDetail.innerText = `Pausa humana de seguridad (${delaySec}s)...`;
          await new Promise(r => setTimeout(r, delaySec * 1000));
        }
      }

      campaignRunning = false;
      startCampBtn.style.display = 'flex';
      stopCampBtn.style.display = 'none';
      if (!campaignAborted) {
        showToast('🎉 ¡Campaña de WhatsApp finalizada con éxito!');
        addCampLog('🎉 Campaña completada al 100%.');
      } else {
        showToast('🛑 Campaña detenida por el usuario.');
        addCampLog('🛑 Campaña detenida.');
      }
    });

    stopCampBtn.addEventListener('click', () => {
      campaignAborted = true;
      campaignRunning = false;
      startCampBtn.style.display = 'flex';
      stopCampBtn.style.display = 'none';
      showToast('🛑 Deteniendo campaña...');
    });

    // ─── CRM TAB LOGIC ───
    let crmLeadsCache = [];

    async function syncCrmState() {
      const listEl = document.getElementById('mc-crm-leads-list');
      const countEl = document.getElementById('mc-crm-lead-count');
      if (!listEl) return;

      listEl.innerHTML = `<p style="color:#fbbf24;text-align:center;padding:16px;">⏳ Sincronizando con MetaCloser CRM...</p>`;

      try {
        const res = await crmFetch('/crm/state');
        if (res.ok && res.data?.success && res.data?.data) {
          crmLeadsCache = res.data.data.leads || [];
          if (countEl) countEl.innerText = `${crmLeadsCache.length}`;
          renderCrmLeadsList(crmLeadsCache);
        } else {
          listEl.innerHTML = `<p style="color:#ef4444;text-align:center;padding:16px;">❌ Servidor local desconectado (localhost:3000)</p>`;
        }
      } catch (e) {
        listEl.innerHTML = `<p style="color:#ef4444;text-align:center;padding:16px;">❌ Error: ${e.message}</p>`;
      }
    }

    function renderCrmLeadsList(leads) {
      const listEl = document.getElementById('mc-crm-leads-list');
      if (!listEl) return;

      if (!leads || leads.length === 0) {
        listEl.innerHTML = `
          <div style="text-align:center;padding:24px;color:#64748b;font-size:0.75rem;">
            <p style="margin-bottom:8px;">No hay prospectos registrados aún en el CRM.</p>
            <p style="font-size:0.7rem;color:#475569;">Guarda un contacto desde el chat o haz clic en <strong>"🔄 Sincronizar"</strong>.</p>
          </div>
        `;
        return;
      }

      listEl.innerHTML = leads.map((lead, idx) => {
        const name = lead.name || 'Cliente';
        const phone = lead.handleOrPhone || '';
        const stage = lead.status || lead.stage || 'new_lead';
        const val = lead.estimatedValue ? `$${lead.estimatedValue}` : '$200';
        const prod = lead.interestProductId || 'Equipo Inox';
        const notes = lead.notes || '';

        const stageColors = {
          new_lead: { bg: 'rgba(59,130,246,0.2)', text: '#93c5fd', label: 'Nuevo' },
          quote_sent: { bg: 'rgba(245,158,11,0.2)', text: '#fde68a', label: 'Cotización' },
          closing: { bg: 'rgba(168,85,247,0.2)', text: '#e9d5ff', label: 'Cierre' },
          won: { bg: 'rgba(16,185,129,0.2)', text: '#a7f3d0', label: 'Pagado' }
        };
        const sInfo = stageColors[stage] || stageColors.new_lead;

        return `
          <div style="background:rgba(20,27,45,0.7);border:1px solid rgba(255,255,255,0.1);border-radius:12px;padding:10px 12px;margin-bottom:8px;" class="mc-crm-lead-card" data-idx="${idx}">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
              <div style="font-weight:bold;color:#f8fafc;font-size:0.84rem;display:flex;align-items:center;gap:6px;">
                <span>👤 ${name}</span>
                <span style="background:${sInfo.bg};color:${sInfo.text};font-size:0.6rem;padding:2px 6px;border-radius:10px;font-weight:800;">${sInfo.label}</span>
              </div>
              <span style="font-size:0.75rem;color:#10b981;font-weight:800;">${val}</span>
            </div>
            <div style="font-size:0.72rem;color:#94a3b8;margin-bottom:6px;">
              📦 ${prod} · 📱 ${phone}
            </div>
            ${notes ? `<div style="font-size:0.7rem;color:#cbd5e1;background:rgba(10,14,25,0.7);padding:6px 8px;border-radius:6px;border-left:2px solid #3b82f6;margin-bottom:8px;line-height:1.3;">"${notes.substring(0, 80)}"</div>` : ''}
            <div style="display:flex;gap:6px;">
              <button type="button" class="mc-crm-ai-load-btn mc-action-btn" data-idx="${idx}" style="flex:1;padding:6px;background:linear-gradient(135deg,#059669,#10b981);color:#fff;border:none;border-radius:6px;font-size:0.7rem;font-weight:bold;cursor:pointer;">
                🧠 Responder con IA
              </button>
              ${phone ? `<a href="https://web.whatsapp.com/send?phone=${phone.replace(/\D/g, '')}" target="_blank" class="mc-action-btn" style="padding:6px 10px;background:rgba(30,41,59,0.9);border:1px solid rgba(255,255,255,0.15);color:#cbd5e1;border-radius:6px;font-size:0.7rem;font-weight:bold;text-decoration:none;display:flex;align-items:center;">💬 Chat</a>` : ''}
            </div>
          </div>
        `;
      }).join('');

      listEl.querySelectorAll('.mc-crm-ai-load-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const idx = parseInt(btn.dataset.idx, 10);
          const lead = leads[idx];
          if (!lead) return;

          // Switch to Chat IA Tab
          document.getElementById('mc-tab-chat').click();

          const nameIn = document.getElementById('mc-fb-lead-name');
          const prodIn = document.getElementById('mc-fb-product-name');
          const priceIn = document.getElementById('mc-fb-product-price');
          const msgIn = document.getElementById('mc-fb-client-msg');

          if (nameIn) nameIn.value = lead.name || 'Cliente';
          if (prodIn) prodIn.value = lead.interestProductId || 'Cocina Industrial';
          if (priceIn) priceIn.value = lead.estimatedValue ? `${lead.estimatedValue}` : '200';
          if (msgIn) msgIn.value = lead.notes || 'Consulta sobre equipos gastronómicos';

          nameIn?.dispatchEvent(new Event('input'));
          document.getElementById('mc-fb-analyze')?.click();
        });
      });
    }

    document.getElementById('mc-crm-sync-btn').addEventListener('click', syncCrmState);

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
          (l.handleOrPhone && l.handleOrPhone.toLowerCase().includes(q)) ||
          (l.interestProductId && l.interestProductId.toLowerCase().includes(q))
        );
        renderCrmLeadsList(filtered);
      });
    }

    // ─── POST / ESTADOS CON IA TAB ───
    document.getElementById('mc-wa-generate-post').addEventListener('click', async () => {
      const product = document.getElementById('mc-post-product')?.value.trim() || 'Cocina Industrial 3 Quemadores';
      const price = document.getElementById('mc-post-price')?.value.trim() || '295';
      const city = document.getElementById('mc-post-city')?.value.trim() || 'Quito';
      const resultsDiv = document.getElementById('mc-post-results');

      resultsDiv.innerHTML = `<p style="color:#fbbf24;text-align:center;padding:12px;">⏳ Creando publicación de alto impacto con IA...</p>`;

      try {
        const res = await crmFetch('/ai/generate-post', 'POST', { product, price, city });
        let postText = '';
        if (res.ok && res.data?.success && res.data?.data?.postText) {
          postText = res.data.data.postText;
        } else {
          // Smart Fallback Copywriter
          postText = `🔥 ${product.toUpperCase()} DIRECTO DE FÁBRICA 🔥\n\n💰 Precio especial de taller: $${price}\n✔️ Fabricado 100% en Acero Inoxidable Quirúrgico T-304\n✔️ Quemadores industriales de alto rendimiento y bajo consumo\n✔️ Acabado sanitario de fácil limpieza\n🛡️ Garantía directa de taller y servicio técnico\n\n📍 Ubicación: Calle 25 de Mayo 226, sector Cotocollao, Quito Norte (al frente del Club de Leones)\n🚚 Envíos seguros y respaldados a todo el país\n🌐 Conoce más en: https://amecocinas.com/\n📞 Contáctanos por llamada o WhatsApp al 09920350548\n\n¡Comenta o escríbenos para apartar el tuyo hoy mismo! 👨‍🍳🔥`;
        }

        resultsDiv.innerHTML = `
          <div style="background:rgba(20,27,45,0.7);border:1px solid rgba(255,255,255,0.1);border-radius:12px;padding:12px;margin-bottom:10px;">
            <label style="font-size:0.75rem;color:#cbd5e1;display:block;margin-bottom:6px;font-weight:700;">Texto generado para WhatsApp / Redes:</label>
            <textarea id="mc-post-text-out" class="mc-input-field" style="width:100%;height:130px;background:rgba(15,23,42,0.95);color:#f8fafc;border:1px solid rgba(255,255,255,0.12);border-radius:10px;padding:10px;resize:vertical;font-family:inherit;font-size:0.8rem;box-sizing:border-box;line-height:1.45;">${postText}</textarea>
            <div style="display:flex;gap:6px;margin-top:8px;">
              <button type="button" id="mc-copy-post-btn" class="mc-action-btn" style="flex:1;padding:8px;background:linear-gradient(135deg,#059669,#10b981);color:#fff;border:none;border-radius:8px;font-size:0.75rem;font-weight:bold;cursor:pointer;">📋 Copiar Texto</button>
              <button type="button" id="mc-paste-post-btn" class="mc-action-btn" style="flex:1;padding:8px;background:linear-gradient(135deg,#1d4ed8,#2563eb);color:#fff;border:none;border-radius:8px;font-size:0.75rem;font-weight:bold;cursor:pointer;">✍️ Pegar en Chat</button>
            </div>
          </div>
        `;

        document.getElementById('mc-copy-post-btn').addEventListener('click', () => {
          navigator.clipboard.writeText(document.getElementById('mc-post-text-out').value);
          showToast('📋 ¡Texto copiado al portapapeles!');
        });

        document.getElementById('mc-paste-post-btn').addEventListener('click', () => {
          const txt = document.getElementById('mc-post-text-out').value;
          insertTextIntoWhatsAppInput(txt);
          showToast('✍️ ¡Texto pegado en el chat!');
        });

      } catch (e) {
        resultsDiv.innerHTML = `<p style="color:#ef4444;padding:12px;">❌ Error: ${e.message}</p>`;
      }
    });

    // Upload post photo from PC
    const postFileInput = document.getElementById('mc-post-file-input');
    if (postFileInput) {
      postFileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = async (ev) => {
          const base64 = ev.target.result;
          document.getElementById('mc-post-img-preview').src = base64;
          document.getElementById('mc-post-img-badge').innerText = '✓ Foto Subida desde PC';
          lsSet('activeImgUrl', base64);
          lsSet('activeImgBadge', '✓ Foto Subida desde PC');

          try {
            crmFetch('/upload/equipment', 'POST', { filename: file.name, base64Data: base64 });
          } catch (err) {}
          showToast('📸 Foto cargada correctamente');
        };
        reader.readAsDataURL(file);
      });
    }

    // ─── CATALOG TAB LOGIC ───
    function renderCatalog() {
      const container = document.getElementById('mc-catalog-list');
      if (!container) return;
      const cat = getCatalog();
      container.innerHTML = `
        ${buildCatalogHTML(cat)}
        <button type="button" id="mc-cat-reset-btn" class="mc-action-btn" style="width:100%;margin-top:8px;padding:8px;background:rgba(30,41,59,0.7);border:1px solid rgba(255,255,255,0.08);color:#94a3b8;border-radius:8px;font-size:0.72rem;cursor:pointer;">↺ Restaurar catálogo por defecto</button>
      `;

      // Attach "Usar" pitch listeners
      container.querySelectorAll('.mc-cat-select-btn').forEach(b => {
        b.addEventListener('click', () => {
          const idx = parseInt(b.dataset.index, 10);
          const p = cat[idx];
          if (!p) return;

          const pitch = `✨ ${p.name.toUpperCase()} ✨\n\n💰 Precio de fábrica: $${p.price}\n✔️ Fabricación en Acero Inoxidable Quirúrgico T-304 de alta durabilidad\n✔️ Garantía directa de taller y servicio técnico especializado\n📍 Ubicación: Calle 25 de Mayo 226, sector Cotocollao, Quito Norte (al frente del Club de Leones)\n🚚 Envíos seguros y respaldados a todo el país\n🌐 Catálogo digital: https://amecocinas.com/\n📞 Atención directa: 09920350548\n\n¿Desea que le apartemos una unidad o requiere cotización a medida exacta para su negocio?`;

          insertTextIntoWhatsAppInput(pitch);
          showToast(`⚡ Cotización de "<b>${p.name}</b>" insertada en el chat`);
        });
      });

      // Attach Edit
      container.querySelectorAll('.mc-cat-edit-btn').forEach(b => {
        b.addEventListener('click', () => {
          const idx = parseInt(b.dataset.index, 10);
          const p = cat[idx];
          if (!p) return;
          const box = document.getElementById('mc-cat-edit-box');
          if (box) {
            box.style.display = 'block';
            document.getElementById('mc-cat-edit-index').value = idx;
            document.getElementById('mc-cat-edit-name').value = p.name;
            document.getElementById('mc-cat-edit-price').value = p.price;
            document.getElementById('mc-cat-edit-emoji').value = p.emoji || '📦';
            box.scrollIntoView({ behavior: 'smooth' });
          }
        });
      });

      // Attach Delete
      container.querySelectorAll('.mc-cat-delete-btn').forEach(b => {
        b.addEventListener('click', () => {
          const idx = parseInt(b.dataset.index, 10);
          const p = cat[idx];
          if (confirm(`¿Eliminar "${p.name}" del catálogo?`)) {
            cat.splice(idx, 1);
            saveCatalog(cat);
            renderCatalog();
            showToast('🗑️ Producto eliminado del catálogo');
          }
        });
      });

      // Reset
      document.getElementById('mc-cat-reset-btn')?.addEventListener('click', () => {
        if (confirm('¿Restaurar catálogo original de APM Inox?')) {
          saveCatalog(DEFAULT_CATALOG);
          renderCatalog();
          showToast('↺ Catálogo restaurado con éxito');
        }
      });
    }

    renderCatalog();

    // Add new product
    document.getElementById('mc-cat-add-btn')?.addEventListener('click', () => {
      const name = document.getElementById('mc-cat-new-name')?.value.trim();
      const price = document.getElementById('mc-cat-new-price')?.value.trim();
      const emoji = document.getElementById('mc-cat-new-emoji')?.value.trim() || '📦';

      if (!name || !price) {
        showToast('⚠️ Ingresa al menos nombre y precio', false);
        return;
      }

      const cat = getCatalog();
      cat.unshift({
        name,
        price,
        emoji,
        img: 'https://images.unsplash.com/photo-1556911220-e15b29be8c8f?auto=format&fit=crop&w=900&q=80'
      });

      saveCatalog(cat);
      renderCatalog();
      document.getElementById('mc-cat-new-name').value = '';
      document.getElementById('mc-cat-new-price').value = '';
      showToast(`✅ "<b>${name}</b>" agregado al catálogo`);
    });

    // Save Edit Product
    document.getElementById('mc-cat-edit-save-btn')?.addEventListener('click', () => {
      const idx = parseInt(document.getElementById('mc-cat-edit-index')?.value, 10);
      const cat = getCatalog();
      if (idx >= 0 && cat[idx]) {
        cat[idx].name = document.getElementById('mc-cat-edit-name')?.value.trim() || cat[idx].name;
        cat[idx].price = document.getElementById('mc-cat-edit-price')?.value.trim() || cat[idx].price;
        cat[idx].emoji = document.getElementById('mc-cat-edit-emoji')?.value.trim() || cat[idx].emoji;
        saveCatalog(cat);
        renderCatalog();
        document.getElementById('mc-cat-edit-box').style.display = 'none';
        showToast('💾 Cambios guardados en el catálogo');
      }
    });

    document.getElementById('mc-cat-edit-cancel-btn')?.addEventListener('click', () => {
      document.getElementById('mc-cat-edit-box').style.display = 'none';
    });
    document.getElementById('mc-cat-edit-cancel-x')?.addEventListener('click', () => {
      document.getElementById('mc-cat-edit-box').style.display = 'none';
    });
  }

  // ─── Observer & Initialization ──────────────────────────────────────────────
  function startObserver() {
    setInterval(() => {
      detectActiveChat();
    }, 1200);

    setTimeout(() => {
      injectFloatingButton();
    }, 1500);
  }

  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    startObserver();
  } else {
    window.addEventListener('DOMContentLoaded', startObserver);
  }

})();
