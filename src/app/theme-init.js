(function applyTheme() {
  try {
    var t = window.localStorage.getItem('quoin.theme');
    if (t === 'light' || t === 'dark') document.documentElement.setAttribute('data-theme', t);
  } catch (e) {
    void e;
  }
})();
