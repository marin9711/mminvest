/**
 * MarsanInvest AI Chat — Security Patch
 * ─────────────────────────────────────
 * Ovaj fajl patch-ira sendAiMsg() u script.js da:
 *   1. Šalje Cloudflare Turnstile token u zaglavlju X-Turnstile-Token
 *   2. Prikazuje korisniku grešku kada je rate limit prekoračen (HTTP 429)
 *
 * INTEGRACIJA:
 *   Učitaj ovaj fajl NAKON script.js u index.html:
 *     <script src="script.js"></script>
 *     <script src="script-ai-security-patch.js"></script>
 *
 * ALTERNATIVNO:
 *   Direktno integriraj izmjene iz ovog fajla u script.js
 *   prema uputama dole (tražiš fetch poziv na Worker URL).
 * ─────────────────────────────────────
 */

(function () {
  'use strict';

  // ── 1. Turnstile token helper ────────────────────────────────────────────
  // onTurnstileSuccess / onTurnstileError / onTurnstileExpired su definirani
  // u inline <script> u index.html — ovdje ih samo koristimo.
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

  // ── 3. Patching fetchAiResponse / sendAiMsg ──────────────────────────────
  //
  // Tražimo fetch poziv u script.js koji ide prema Cloudflare Worker-u.
  // Najčešći pattern u script.js:
  //
  //   const resp = await fetch(WORKER_URL, {
  //     method: 'POST',
  //     headers: { 'Content-Type': 'application/json' },
  //     body: JSON.stringify({ messages }),
  //   });
  //
  // Patchiramo globalnu fetch funkciju da automatski dodaje Turnstile token
  // za sve zahtjeve prema Worker URL-u koji sadrže "messages" u tijelu.
  // ─────────────────────────────────────────────────────────────────────────

  const _originalFetch = window.fetch.bind(window);

  window.fetch = async function (input, init = {}) {
    const url = typeof input === 'string' ? input : (input instanceof URL ? input.href : input.url);

    // Primjeni patch samo na AI Worker zahtjeve (prepoznati po content-type + body s "messages")
    const isWorkerCall = (
      url &&
      !url.includes('challenges.cloudflare.com') &&
      !url.includes('resend.com') &&
      !url.includes('api.anthropic.com') &&
      init.method === 'POST' &&
      init.body &&
      typeof init.body === 'string' &&
      init.body.includes('"messages"')
    );

    if (isWorkerCall) {
      // Dohvati Turnstile token (async, obično <1s)
      const token = await getToken();

      if (token) {
        init.headers = {
          ...(init.headers || {}),
          'X-Turnstile-Token': token,
        };
        // Nakon korištenja, resetiraj token (single-use)
        window._turnstileToken = null;
        try {
          if (typeof turnstile !== 'undefined') {
            turnstile.reset('#ai-turnstile-widget');
          }
        } catch (_) {}
      }

      // Pozovi originalni fetch
      const response = await _originalFetch(input, init);

      // Provjeri rate limit odgovor
      if (response.status === 429) {
        const clone = response.clone();
        try {
          const data = await clone.json();
          const retryAfter = data.retryAfter || response.headers.get('Retry-After') || 60;
          const mins = Math.ceil(retryAfter / 60);
          showRateNotice(
            `⏳ Dostignut limit poruka. Pokušaj ponovo za ~${mins} min.`
          );
        } catch (_) {
          showRateNotice('⏳ Dostignut limit poruka. Pokušaj ponovo za malo.');
        }
        // Vrati response da ga script.js može obraditi
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
    }

    // Sve ostale fetch pozive propusti netaknute
    return _originalFetch(input, init);
  };

  console.log('[MarsanAI] Security patch učitan — Turnstile + rate limit aktivan.');
})();
