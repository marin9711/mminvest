// Component loader for HTML fragments in novaverzija/components.
(function () {
  function parseFragment(html) {
    var template = document.createElement('template');
    template.innerHTML = html.trim();
    return template.content;
  }

  function fetchComponentHtmlSync(src) {
    var xhr = new XMLHttpRequest();
    xhr.open('GET', src, false);
    xhr.send(null);
    if (xhr.status < 200 || xhr.status >= 300) {
      throw new Error('Failed to load component: ' + src + ' (' + xhr.status + ')');
    }
    return xhr.responseText;
  }

  function loadComponentSync(el) {
    var src = el.getAttribute('data-component');
    if (!src) return;
    var html = fetchComponentHtmlSync(src);
    var mode = el.getAttribute('data-component-mode') || 'inner';
    var fragment = parseFragment(html);

    if (mode === 'replace') {
      var first = fragment.firstElementChild;
      if (!first) {
        el.remove();
        return;
      }
      el.replaceWith(fragment);
      return;
    }

    el.innerHTML = '';
    el.appendChild(fragment);
  }

  function loadAllComponentsSync() {
    var placeholders = Array.from(document.querySelectorAll('[data-component]'));
    placeholders.forEach(loadComponentSync);
  }

  window.mmComponentsReady = new Promise(function (resolve, reject) {
    try {
      loadAllComponentsSync();
      window.dispatchEvent(new CustomEvent('mm:components-ready'));
      resolve();
    } catch (err) {
      console.error('Component loader failed:', err);
      reject(err);
    }
  });
})();
