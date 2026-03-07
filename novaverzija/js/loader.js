// Component loader for HTML fragments in novaverzija/components.
(function () {
  function parseFragment(html) {
    var template = document.createElement('template');
    template.innerHTML = html.trim();
    return template.content;
  }

  function resolveComponentUrl(src) {
    // Resolve relative to the page directory so "components/foo.html" works for
    // .../novaverzija, .../novaverzija/, and .../novaverzija/index.html.
    var path = window.location.pathname;
    var dir = path.match(/^(.*\/)/);
    dir = dir ? dir[1] : (path ? path + '/' : '/');
    var base = window.location.origin + dir;
    return new URL(src, base).toString();
  }

  async function fetchComponentHtml(src) {
    var url = resolveComponentUrl(src);
    var response = await fetch(url, { cache: 'no-cache' });
    if (!response.ok) {
      throw new Error('Failed to load component: ' + src + ' (' + response.status + ')');
    }
    return response.text();
  }

  async function loadComponent(el) {
    var src = el.getAttribute('data-component');
    if (!src) return { ok: true, src: '(empty)' };

    try {
      var html = await fetchComponentHtml(src);
      var mode = el.getAttribute('data-component-mode') || 'inner';
      var fragment = parseFragment(html);

      if (mode === 'replace') {
        if (!fragment.firstElementChild) {
          el.remove();
          return { ok: true, src: src };
        }
        el.replaceWith(fragment);
        return { ok: true, src: src };
      }

      el.innerHTML = '';
      el.appendChild(fragment);
      return { ok: true, src: src };
    } catch (err) {
      console.error('Component loader error for', src, err);
      return { ok: false, src: src, error: err };
    }
  }

  async function loadAllComponents() {
    var placeholders = Array.from(document.querySelectorAll('[data-component]'));
    var results = await Promise.all(placeholders.map(loadComponent));
    var failed = results.filter(function (r) { return !r.ok; });
    if (failed.length) {
      console.error('Some components failed to load:', failed.map(function (r) { return r.src; }));
    }
    return results;
  }

  // Promise resolves only after all components are fetched and injected into the DOM.
  window.mmComponentsReady = loadAllComponents()
    .then(function (results) {
      var ok = results.filter(function (r) { return r.ok; }).length;
      var total = results.length;
      if (ok < total) {
        console.warn('[Loader] Only ' + ok + '/' + total + ' components loaded. Check network and paths.');
      }
      window.dispatchEvent(new CustomEvent('mm:components-ready', { detail: { results: results } }));
      return results;
    })
    .catch(function (err) {
      console.error('Component loader fatal error:', err);
      return [];
    });
})();
