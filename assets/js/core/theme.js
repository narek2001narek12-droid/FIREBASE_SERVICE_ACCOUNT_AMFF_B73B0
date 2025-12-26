const STORAGE_KEY = 'theme';

export function applyTheme(theme) {
  const t = theme === 'light' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', t);
  document.body.classList.toggle('dark-theme', t === 'dark'); // backwards compatibility
}

export function getStoredTheme() {
  const t = localStorage.getItem(STORAGE_KEY);
  return t === 'light' ? 'light' : 'dark';
}

export function toggleTheme() {
  const next = (document.documentElement.getAttribute('data-theme') || getStoredTheme()) === 'dark'
    ? 'light'
    : 'dark';
  localStorage.setItem(STORAGE_KEY, next);
  applyTheme(next);
  return next;
}

export function bindThemeButton(buttonId = 'toggle-theme') {
  applyTheme(getStoredTheme());
  const btn = document.getElementById(buttonId);
  if (!btn) return;
  btn.addEventListener('click', () => {
    const t = toggleTheme();
    // optional label
    if (btn.hasAttribute('data-label')) {
      btn.textContent = t === 'dark' ? '🌙' : '☀️';
    }
  });
}
