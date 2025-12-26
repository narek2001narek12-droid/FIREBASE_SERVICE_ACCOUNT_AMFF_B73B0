// Public site configuration.
// Priority: localStorage overrides (so the owner can change without redeploy) -> defaults.

const STORAGE_KEY = 'amf_site_config_v1';

const DEFAULTS = {
  instagramUrl: 'https://instagram.com',
  telegramUrl: 'https://t.me',
};

export function getSiteConfig() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULTS };
    const parsed = JSON.parse(raw);
    return { ...DEFAULTS, ...(parsed && typeof parsed === 'object' ? parsed : {}) };
  } catch {
    return { ...DEFAULTS };
  }
}

export function setSiteConfig(partial) {
  const current = getSiteConfig();
  const next = { ...current, ...(partial && typeof partial === 'object' ? partial : {}) };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  return next;
}
