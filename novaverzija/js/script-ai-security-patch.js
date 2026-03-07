/**
 * MM Invest AI Chat — Security Patch
 * ─────────────────────────────────────
 * Ovaj fajl patch-ira fetch() da:
 *   1. Šalje Cloudflare Turnstile token u zaglavlju X-Turnstile-Token
 *      SAMO za zahtjeve prema marin-marsan.workers.dev s "messages" u tijelu
 *   2. Prikazuje korisniku grešku kada je rate limit prekoračen (HTTP 429)
 *
 * PATCH JE NAMJERNO UZAK — ne hvata Image(), onerror, niti bilo koji
 * drugi zahtjev osim točnog Worker AI poziva.
 */

(function () {
  'use strict';

  // ── 1. Turnstile token helper ────────────────────────────────────────────
  async function getToken() {
    if (typeof window.marsanGetTurnstileToken === 'function') {
      return await window.marsanGetTurnstileToken();
    }
    return null;
  }

  // ── 2. Rate-limit notice helper ──────────────────────────────────────────
  function showRateNotice(msg) {
    const el = document.getElementById('ai-rate-notice');
    if (!el) return;
    el.textContent = msg;
    el.style.display = 'block';
    clearTimeout(el._hideTimer);
    el._hideTimer = setTimeout(() => { el.style.display = 'none'; }, 8000);
  }

  // ── 3. Fetch patch — SAMO za Worker AI pozive ────────────────────────────
  const _originalFetch = window.fetch.bind(window);

  // Prihvaćamo SAMO zahtjeve prema našem Workeru s "messages" u tijelu.
  // Sve ostalo (Image, onerror, Turnstile, Resend, itd.) se propušta netaknuto.
  const WORKER_HOSTNAME = 'marin-marsan.workers.dev';

  window.fetch = async function (input, init) {
    // Normaliziraj init — nikad ne mijenjamo ako nije naš poziv
    const safeInit = init || {};

    let url = '';
    try {
      url = typeof input === 'string' ? input
          : (input instanceof URL ? input.href
          : (input && typeof input.url === 'string' ? input.url : ''));
    } catch (_) {}

    // Strogi uvjeti — mora biti točno naš Worker + POST + messages
    const isAiWorkerCall = (
      url.includes(WORKER_HOSTNAME) &&
      safeInit.method === 'POST' &&
      typeof safeInit.body === 'string' &&
      safeInit.body.includes('"messages"')
    );

    if (!isAiWorkerCall) {
      // Propusti sve ostalo bez ikakve izmjene
      return _originalFetch(input, init);
    }

    // ── Naš Worker AI poziv — dodaj Turnstile token ──
    const token = await getToken();

    if (token) {
      safeInit.headers = {
        ...(safeInit.headers || {}),
        'X-Turnstile-Token': token,
      };
      // Token je jednokratan — resetiraj widget za sljedeću poruku
      try {
        if (typeof turnstile !== 'undefined') {
          turnstile.reset('#ai-turnstile-widget');
        }
      } catch (_) {}
    }

    const response = await _originalFetch(input, safeInit);

    // Provjeri rate limit odgovor
    if (response.status === 429) {
      const clone = response.clone();
      try {
        const data = await clone.json();
        const retryAfter = data.retryAfter || response.headers.get('Retry-After') || 60;
        const mins = Math.ceil(retryAfter / 60);
        showRateNotice(`Dostignut limit poruka. Pokušaj ponovo za ~${mins} min.`);
      } catch (_) {
        showRateNotice('Dostignut limit poruka. Pokušaj ponovo za malo.');
      }
      return response;
    }

    // Osvježi Turnstile za sljedeću poruku
    setTimeout(() => {
      try {
        if (typeof turnstile !== 'undefined') {
          turnstile.reset('#ai-turnstile-widget');
        }
      } catch (_) {}
    }, 500);

    return response;
  };

  console.log('[MM Invest] Security patch ucitan — Turnstile + rate limit aktivan.');
})();
