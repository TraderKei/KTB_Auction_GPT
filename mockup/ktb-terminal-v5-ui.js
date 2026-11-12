/* Vue 3.2.41 preferences and localization for the standalone terminal mockup. */
(() => {
  'use strict';
  const rows = window.KTB_UI_TEXT;
  const koToEn = new Map(rows);
  const phrases = [...koToEn.keys()].sort((a, b) => b.length - a.length);
  const textState = new WeakMap();
  const attrState = new WeakMap();
  let language = 'ko';
  let observer;

  function translate(source) {
    if (language === 'ko' || !/[가-힣]/.test(source)) return source;
    const trimmed = source.trim();
    if (koToEn.has(trimmed)) return source.replace(trimmed, koToEn.get(trimmed));
    let output = source;
    for (const ko of phrases) {
      if (ko.length <= 2) {
        const escaped = ko.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        output = output.replace(new RegExp(`(?<![가-힣])${escaped}(?![가-힣])`, 'g'), koToEn.get(ko));
      } else output = output.split(ko).join(koToEn.get(ko));
    }
    return output;
  }

  function updateText(node) {
    const parent = node.parentElement;
    if (!parent || parent.closest('script, style, #uiControls, [data-no-translate], [data-field="bond.name"], [data-field="bond.isin"]')) return;
    const current = node.nodeValue;
    let saved = textState.get(node);
    if (!saved || current !== saved.rendered) saved = { source: current, rendered: current };
    const next = translate(saved.source);
    saved.rendered = next;
    textState.set(node, saved);
    if (current !== next) node.nodeValue = next;
  }

  function updateAttributes(element) {
    if (element.closest('#uiControls, [data-no-translate], [data-field="bond.name"], [data-field="bond.isin"]')) return;
    let saved = attrState.get(element);
    if (!saved) saved = {};
    for (const attr of ['title', 'aria-label', 'placeholder']) {
      if (!element.hasAttribute(attr)) continue;
      const current = element.getAttribute(attr);
      if (!saved[attr] || current !== saved[attr].rendered) saved[attr] = { source: current, rendered: current };
      const next = translate(saved[attr].source);
      saved[attr].rendered = next;
      if (current !== next) element.setAttribute(attr, next);
    }
    attrState.set(element, saved);
  }

  function scan(root) {
    if (root.nodeType === Node.TEXT_NODE) { updateText(root); return; }
    if (root.nodeType !== Node.ELEMENT_NODE || root.matches('script, style, #uiControls')) return;
    updateAttributes(root);
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const node = walker.currentNode;
      if (node.nodeType === Node.TEXT_NODE) updateText(node);
      else updateAttributes(node);
    }
  }

  function setLanguage(value) {
    language = value;
    document.documentElement.lang = value;
    scan(document.body);
  }

  function refreshCharts() {
    if (typeof window.refreshTerminalCharts === 'function') window.refreshTerminalCharts();
  }

  function startTranslation() {
    scan(document.body);
    observer = new MutationObserver(records => {
      for (const record of records) {
        if (record.type === 'characterData') updateText(record.target);
        else if (record.type === 'attributes') updateAttributes(record.target);
        else for (const node of record.addedNodes) scan(node);
      }
    });
    observer.observe(document.body, { subtree: true, childList: true, characterData: true,
      attributes: true, attributeFilter: ['title', 'aria-label', 'placeholder'] });
  }

  function preference(key) {
    try { return localStorage.getItem(key); }
    catch (error) { console.warn('UI preference could not be read', error); return null; }
  }

  function savePreference(key, value) {
    try { localStorage.setItem(key, value); }
    catch (error) { console.warn('UI preference could not be saved', error); }
  }

  const preferences = {
    theme: preference('ktb-terminal-v5-theme') === 'white' ? 'white' : 'dark',
    language: preference('ktb-terminal-v5-language') === 'en' ? 'en' : 'ko'
  };
  document.body.classList.toggle('dark', preferences.theme === 'dark');
  document.body.classList.toggle('white', preferences.theme === 'white');

  Vue.createApp({
    data: () => ({ ...preferences, screen: 'auc' }),
    methods: {
      chooseScreen(value) {
        this.screen = value;
        if (typeof window.switchScreen === 'function') window.switchScreen(value);
      },
      chooseTheme(value) {
        this.theme = value;
        document.body.classList.toggle('dark', value === 'dark');
        document.body.classList.toggle('white', value === 'white');
        savePreference('ktb-terminal-v5-theme', value);
        refreshCharts();
      },
      chooseLanguage(value) {
        this.language = value;
        savePreference('ktb-terminal-v5-language', value);
        setLanguage(value);
        refreshCharts();
      }
    }
  }).mount('#tabbar');
  setLanguage(preferences.language);
  startTranslation();
  window.KTB_UI = { setLanguage, translate: source => translate(source) };
  const canvas = window.CanvasRenderingContext2D?.prototype;
  if (canvas && !canvas.ktbLocalizedFillText) {
    const fillText = canvas.fillText;
    canvas.fillText = function(value, ...args) {
      return fillText.call(this, translate(String(value)), ...args);
    };
    canvas.ktbLocalizedFillText = true;
  }
  refreshCharts();
})();
